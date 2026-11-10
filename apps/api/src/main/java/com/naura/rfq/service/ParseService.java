package com.naura.rfq.service;

import com.naura.rfq.common.exception.BusinessException;
import com.naura.rfq.common.id.Ids;
import com.naura.rfq.config.properties.ParseProperties;
import com.naura.rfq.integration.parse.DocumentBlockReader;
import com.naura.rfq.integration.parse.DocumentReadException;
import com.naura.rfq.integration.parse.HybridRequirementExtractor;
import com.naura.rfq.mapper.CustomerDocumentMapper;
import com.naura.rfq.mapper.DocumentBlockMapper;
import com.naura.rfq.mapper.ParseRunMapper;
import com.naura.rfq.mapper.ProjectMapper;
import com.naura.rfq.mapper.RequirementMapper;
import com.naura.rfq.model.entity.CustomerDocument;
import com.naura.rfq.model.entity.DocumentBlock;
import com.naura.rfq.model.entity.ParseRun;
import com.naura.rfq.model.entity.Requirement;
import com.naura.rfq.model.parse.ExtractedRequirement;
import com.naura.rfq.model.parse.ExtractionResult;
import com.naura.rfq.model.parse.RawBlock;
import com.naura.rfq.security.AccessGuard;
import com.naura.rfq.storage.DocumentStorage;
import java.nio.file.Path;
import java.time.Instant;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.TimeUnit;
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
    private final HybridRequirementExtractor extractor;
    private final DocumentStorage storage;
    private final ParseProperties properties;
    private final AuditService audit;
    private final ProjectMapper projects;
    private final AccessGuard access;
    private final RequirementMatchService matches;
    private final ProjectWorkScope work;
    private final org.springframework.jdbc.core.JdbcTemplate jdbc;

    public record ParseRunView(String id, String documentId, String status, int totalBlocks,
            int processedBlocks, int requirementCount, int issueCount, String message,
            Instant startedAt, Instant finishedAt, String extractor) {
    }

    @Transactional
    public ParseRunView run(String documentId, String actorId) {
        CustomerDocument reference = documents.findById(documentId)
                .orElseThrow(() -> new BusinessException(404, "文档不存在"));
        var project = projects.findByIdForUpdate(reference.getProjectId())
                .orElseThrow(() -> new BusinessException(404, "项目不存在"));
        access.requireActiveProject(project);
        work.requireEditable(project.getId(), documentId);
        CustomerDocument document = documents.findByIdForUpdate(documentId)
                .orElseThrow(() -> new BusinessException(404, "文档不存在"));

        List<Requirement> previous = requirements.findByDocumentIdForReparse(documentId);
        if (previous.stream().anyMatch(r -> r.getVersion() != null && r.getVersion() > 0)) {
            throw new BusinessException(409, "已有人工修正的条款，请上传新版本后解析，避免覆盖人工结果");
        }
        if (!previous.isEmpty() && Boolean.TRUE.equals(jdbc.queryForObject("""
                select exists(
                    select 1 from requirement r join requirement_response a on a.requirement_id=r.id where r.document_id=?
                    union all
                    select 1 from requirement r join response_confirmation_history h on h.requirement_id=r.id where r.document_id=?
                    union all
                    select 1 from requirement r join response_review v on v.project_id=r.project_id
                        and json_unquote(json_extract(v.payload,'$.requirementId'))=r.id where r.document_id=?
                    union all
                    select 1 from response_snapshot where project_id=?
                        and json_search(payload,'one',?,null,'$.rows[*].sourceFileId') is not null
                )
                """, Boolean.class, documentId, documentId, documentId, project.getId(), documentId))) {
            throw new BusinessException(409, "已有应答、评审或定稿记录，请登记新版原件后再解析");
        }

        long started = System.nanoTime();
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
        List<ExtractedRequirement> extracted;
        List<String> issues = new ArrayList<>();
        String phase = "read";
        try {
            rawBlocks = readBlocks(document);
            if (rawBlocks.isEmpty()) {
                throw new DocumentReadException("文档没有可读取内容");
            }
            if (rawBlocks.size() > properties.maxBlocks()) {
                issues.add("文档内容块超过上限 " + properties.maxBlocks() + "，仅处理前部分内容");
                rawBlocks = new ArrayList<>(rawBlocks.subList(0, properties.maxBlocks()));
            }
            for (RawBlock block : rawBlocks) {
                if (block.issue() != null) {
                    issues.add(block.anchor() + "：" + block.issue());
                }
            }
            phase = "extract";
            ExtractionResult result = extractor.extractWithReport(rawBlocks, run.getId());
            run.setExtractor(truncate(result.extractor(), 250));
            issues.addAll(result.issues());
            phase = "source_review";
            extracted = withSourceReview(result.requirements(), rawBlocks);
            if (extracted.isEmpty() && !previous.isEmpty()) {
                throw new DocumentReadException("未生成新条款，保留上一版解析结果，请人工检查来源文件");
            }
        } catch (Exception exception) {
            log.error("document.parse.failed parseRunId={} documentId={} projectId={} phase={} errorType={} durationMs={}",
                    run.getId(), documentId, project.getId(), phase, exception.getClass().getSimpleName(),
                    TimeUnit.NANOSECONDS.toMillis(System.nanoTime() - started));
            run.setStatus(ParseRun.FAILED);
            String reason = exception instanceof DocumentReadException ? exception.getMessage() : "解析失败，请检查文档及服务配置；已有结果保留";
            run.setMessage(truncate(reason, 990));
            run.setIssueCount(1);
            run.setFinishedAt(Instant.now());
            runs.update(run);
            document.setStatus(CustomerDocument.STATUS_FAILED);
            documents.update(document);
            audit.failure(actorId, "解析客户文件", "document", documentId, run.getMessage());
            return view(run);
        }

        requirements.deleteByDocumentId(documentId);
        blocks.deleteByDocumentId(documentId);
        Map<Integer, String> blockIds = persistBlocks(documentId, rawBlocks);
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
        run.setMessage(truncate(run.getMessage(), 990));
        runs.update(run);
        documents.update(document);
        matches.parsed(project, document, saved.stream().map(Saved::requirement).toList());
        audit.successInBu(actorId, project.getBuId(), "解析客户文件", "document", documentId,
                "提取 " + saved.size() + " 条条款，待核对 " + issueCount + " 条，抽取器 " + run.getExtractor());
        log.info("document.parse.result parseRunId={} documentId={} projectId={} status={} blocks={} requirements={} issues={} durationMs={}",
                run.getId(), documentId, project.getId(), run.getStatus(), rawBlocks.size(), saved.size(), issueCount,
                TimeUnit.NANOSECONDS.toMillis(System.nanoTime() - started));
        return view(run);
    }

    private List<ExtractedRequirement> withSourceReview(List<ExtractedRequirement> candidates, List<RawBlock> source) {
        Map<Integer, RawBlock> byIndex = new HashMap<>(); source.forEach(b -> byIndex.put(b.index(), b));
        List<ExtractedRequirement> reviewed = new ArrayList<>();
        for (var r : candidates) {
            RawBlock block = byIndex.get(r.blockIndex());
            if (block == null) {
                throw new IllegalArgumentException("来源块不存在");
            }
            if (block.issue() == null) { reviewed.add(r); continue; }
            reviewed.add(new ExtractedRequirement(r.order(), r.blockIndex(), r.sectionPath(), r.customerClauseNo(),
                r.title(), r.level(), r.parentClauseNo(), r.originalText(), r.requirementText(), r.metricsJson(),
                r.conditionsText(), r.obligation(), ExtractedRequirement.NEEDS_REVIEW,
                (r.reviewReasons() == null ? "" : r.reviewReasons() + "；") + block.issue()));
        }
        return reviewed;
    }

    private List<RawBlock> readBlocks(CustomerDocument document) throws Exception {
        try (var lease = storage.open(document.getStorageRef(), document.getSizeBytes(), document.getSha256())) {
        Path file = lease.path();
        DocumentBlockReader reader = readers.stream()
                .filter(candidate -> candidate.supports(document.getName(), document.getContentType()))
                .findFirst()
                .orElseThrow(() -> new DocumentReadException(
                        "暂不支持该文件格式：" + document.getName() + "（当前支持 DOCX / PDF）"));
        return reader.read(file);
        }
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
            block.setContent(raw.text());
            block.setSourceAnchor(raw.anchor());
            block.setProvenance(raw.provenance());
            block.setProcessingStatus(raw.issue() != null ? "NEEDS_REVIEW" : raw.isTable() ? "TABLE" : "READ");
            blocks.insert(block);
            blockIds.put(raw.index(), block.getId());
        }
        return blockIds;
    }

    private List<Saved> persistRequirements(CustomerDocument document, String runId,
            List<ExtractedRequirement> extracted, Map<Integer, String> blockIds) {
        List<Saved> saved = new ArrayList<>();
        for (ExtractedRequirement candidate : extracted) {
            Requirement requirement = new Requirement();
            requirement.setId(Ids.next("REQ"));
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
                run.getStartedAt(), run.getFinishedAt(), run.getExtractor());
    }

    private String join(List<String> issues, String fallback) {
        if (issues.isEmpty()) {
            return fallback;
        }
        return fallback + "；" + String.join("；", issues.stream().limit(8).toList());
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
