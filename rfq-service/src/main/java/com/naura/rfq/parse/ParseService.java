package com.naura.rfq.parse;

import com.naura.rfq.audit.AuditService;
import com.naura.rfq.common.exception.BusinessException;
import com.naura.rfq.common.id.Ids;
import com.naura.rfq.document.DocumentStorage;
import com.naura.rfq.domain.CustomerDocument;
import com.naura.rfq.domain.DocumentBlock;
import com.naura.rfq.domain.ParseRun;
import com.naura.rfq.domain.Requirement;
import com.naura.rfq.mapper.CustomerDocumentMapper;
import com.naura.rfq.mapper.DocumentBlockMapper;
import com.naura.rfq.mapper.ParseRunMapper;
import com.naura.rfq.mapper.RequirementMapper;
import java.nio.file.Path;
import java.time.Instant;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import lombok.RequiredArgsConstructor;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Orchestrates one parse run: read blocks, persist them, extract requirements,
 * validate references, then persist. Blocks and requirements of a previous run on
 * the same document are replaced so a retry never duplicates clauses.
 */
@Service
@RequiredArgsConstructor
public class ParseService {

    private static final Logger log = LoggerFactory.getLogger(ParseService.class);

    private final CustomerDocumentMapper documents;
    private final DocumentBlockMapper blocks;
    private final RequirementMapper requirements;
    private final ParseRunMapper runs;
    private final List<DocumentBlockReader> readers;
    private final RequirementExtractor extractor;
    private final DocumentStorage storage;
    private final ParseProperties properties;
    private final AuditService audit;

    public record ParseRunView(String id, String documentId, String status, int totalBlocks,
            int processedBlocks, int requirementCount, int issueCount, String message,
            Instant startedAt, Instant finishedAt, String extractor) {
    }

    @Transactional
    public ParseRunView run(String documentId, String actorId) {
        CustomerDocument document = documents.findById(documentId)
                .orElseThrow(() -> new BusinessException(404, "文档不存在"));

        ParseRun run = new ParseRun();
        run.setId(Ids.next("RUN"));
        run.setDocumentId(documentId);
        run.setStatus(ParseRun.RUNNING);
        run.setStartedAt(Instant.now());
        run.setCreatedBy(actorId);
        runs.insert(run);

        document.setStatus(CustomerDocument.STATUS_PARSING);
        documents.update(document);

        List<RawBlock> rawBlocks;
        try {
            rawBlocks = readBlocks(document);
        } catch (Exception exception) {
            log.warn("解析失败 document={} reason={}", documentId, exception.getMessage());
            run.setStatus(ParseRun.FAILED);
            run.setMessage(exception.getMessage());
            run.setFinishedAt(Instant.now());
            runs.update(run);
            document.setStatus(CustomerDocument.STATUS_FAILED);
            documents.update(document);
            audit.failure(actorId, "解析客户文件", "document", documentId, exception.getMessage());
            return view(run);
        }

        List<String> issues = new ArrayList<>();
        if (rawBlocks.size() > properties.maxBlocks()) {
            issues.add("文档内容块超过上限 " + properties.maxBlocks() + "，仅处理前部分内容");
            rawBlocks = new ArrayList<>(rawBlocks.subList(0, properties.maxBlocks()));
        }

        blocks.deleteByDocumentId(documentId);
        requirements.deleteByDocumentId(documentId);

        Map<Integer, String> blockIds = persistBlocks(documentId, rawBlocks);
        List<ExtractedRequirement> extracted = extractor.extract(rawBlocks);

        List<Saved> saved = persistRequirements(document, run.getId(), extracted, blockIds);
        linkParents(saved);

        long reviewCount = extracted.stream().filter(ExtractedRequirement::needsReview).count();
        int issueCount = (int) reviewCount + issues.size();

        run.setTotalBlocks(rawBlocks.size());
        run.setProcessedBlocks(rawBlocks.size());
        run.setRequirementCount(saved.size());
        run.setIssueCount(issueCount);
        run.setFinishedAt(Instant.now());

        if (saved.isEmpty()) {
            run.setStatus(ParseRun.PARTIAL);
            run.setMessage(join(issues, "未识别到可应答条款，请检查文档编号结构或改用人工补录"));
            document.setStatus(CustomerDocument.STATUS_PARTIAL);
        } else if (issueCount > 0) {
            run.setStatus(ParseRun.PARTIAL);
            run.setMessage(join(issues, reviewCount + " 条条款需要人工核对"));
            document.setStatus(CustomerDocument.STATUS_PARTIAL);
        } else {
            run.setStatus(ParseRun.COMPLETED);
            run.setMessage(join(issues, "解析完成"));
            document.setStatus(CustomerDocument.STATUS_PARSED);
        }
        runs.update(run);
        documents.update(document);
        audit.success(actorId, "解析客户文件", "document", documentId,
                "提取 " + saved.size() + " 条条款，待核对 " + issueCount + " 条，抽取器 " + extractor.name());
        return view(run);
    }

    private List<RawBlock> readBlocks(CustomerDocument document) throws Exception {
        Path file = storage.resolve(document.getStorageRef());
        DocumentBlockReader reader = readers.stream()
                .filter(candidate -> candidate.supports(document.getName(), document.getContentType()))
                .findFirst()
                .orElseThrow(() -> new DocumentReadException(
                        "暂不支持该文件格式：" + document.getName() + "（当前支持 DOCX / PDF）"));
        return reader.read(file);
    }

    private Map<Integer, String> persistBlocks(String documentId, List<RawBlock> rawBlocks) {
        Map<Integer, String> blockIds = new HashMap<>();
        for (RawBlock raw : rawBlocks) {
            DocumentBlock block = new DocumentBlock();
            block.setId(Ids.next("BLK"));
            block.setDocumentId(documentId);
            block.setBlockIndex(raw.index());
            block.setType(raw.type());
            block.setSectionPath(truncate(raw.sectionPath(), 480));
            block.setCustomerClauseNo(raw.clauseNo());
            block.setContent(truncate(raw.text(), properties.maxRequirementChars() * 2));
            block.setSourceAnchor(raw.anchor());
            block.setProvenance("native");
            block.setProcessingStatus(raw.isTable() ? "TABLE" : "READ");
            blocks.insert(block);
            blockIds.put(raw.index(), block.getId());
        }
        return blockIds;
    }

    private List<Saved> persistRequirements(CustomerDocument document, String runId,
            List<ExtractedRequirement> extracted, Map<Integer, String> blockIds) {
        List<Saved> saved = new ArrayList<>();
        String prefix = "REQ-" + document.getId().replaceAll("[^A-Za-z0-9]", "").substring(Math.max(0,
                document.getId().length() - 4)).toUpperCase();
        int index = 0;
        for (ExtractedRequirement candidate : extracted) {
            Requirement requirement = new Requirement();
            requirement.setId(prefix + "-" + String.format("%04d", ++index));
            requirement.setProjectId(document.getProjectId());
            requirement.setDocumentId(document.getId());
            requirement.setParseRunId(runId);
            requirement.setBlockId(blockIds.get(candidate.blockIndex()));
            requirement.setSectionPath(truncate(candidate.sectionPath(), 480));
            requirement.setCustomerClauseNo(truncate(candidate.customerClauseNo(), 60));
            requirement.setTitle(truncate(candidate.title(), 280));
            requirement.setLevel(Math.max(1, candidate.level()));
            requirement.setOriginalText(candidate.originalText());
            requirement.setRequirementText(candidate.requirementText());
            requirement.setMetricsJson(candidate.metricsJson());
            requirement.setConditionsText(truncate(candidate.conditionsText(), 900));
            requirement.setObligation(candidate.obligation());
            requirement.setExtractionStatus(candidate.extractionStatus());
            requirement.setReviewReasons(truncate(candidate.reviewReasons(), 900));
            requirement.setSortOrder(candidate.order());
            requirements.insert(requirement);
            saved.add(new Saved(requirement, candidate.parentClauseNo()));
        }
        return saved;
    }

    /** Second pass: parent ids only exist after every requirement has been inserted. */
    private void linkParents(List<Saved> saved) {
        Map<String, String> byClause = new HashMap<>();
        for (Saved entry : saved) {
            if (entry.requirement().getCustomerClauseNo() != null) {
                byClause.putIfAbsent(entry.requirement().getCustomerClauseNo(), entry.requirement().getId());
            }
        }
        for (Saved entry : saved) {
            String parentClause = entry.parentClauseNo();
            if (parentClause == null) {
                continue;
            }
            String parentId = byClause.get(parentClause);
            if (parentId != null && !parentId.equals(entry.requirement().getId())) {
                entry.requirement().setParentId(parentId);
                requirements.updateParentId(entry.requirement().getId(), parentId);
            }
        }
    }

    private ParseRunView view(ParseRun run) {
        return new ParseRunView(run.getId(), run.getDocumentId(), run.getStatus(), run.getTotalBlocks(),
                run.getProcessedBlocks(), run.getRequirementCount(), run.getIssueCount(), run.getMessage(),
                run.getStartedAt(), run.getFinishedAt(), extractor.name());
    }

    private String join(List<String> issues, String fallback) {
        if (issues.isEmpty()) {
            return fallback;
        }
        return String.join("；", issues) + "；" + fallback;
    }

    private String truncate(String value, int max) {
        if (value == null) {
            return null;
        }
        return value.length() > max ? value.substring(0, max) : value;
    }

    private record Saved(Requirement requirement, String parentClauseNo) {
    }
}
