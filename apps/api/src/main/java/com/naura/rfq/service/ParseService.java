package com.naura.rfq.service;

import com.naura.rfq.common.exception.BusinessException;
import com.naura.rfq.common.id.Ids;
import com.naura.rfq.config.properties.ParseProperties;
import com.naura.rfq.integration.parse.DocxBlockReader;
import com.naura.rfq.integration.parse.DocumentBlockReader;
import com.naura.rfq.integration.parse.DocumentReadException;
import com.naura.rfq.integration.parse.HybridRequirementExtractor;
import com.naura.rfq.integration.parse.WordMarkdownExtractor;
import com.naura.rfq.integration.parse.WordMarkdownReader;
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
import com.naura.rfq.model.parse.SourceRef;
import com.naura.rfq.security.AccessGuard;
import com.naura.rfq.storage.DocumentStorage;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.concurrent.TimeUnit;
import java.util.regex.Pattern;
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
    private final WordMarkdownReader wordMarkdownReader;
    private final WordMarkdownExtractor wordMarkdownExtractor;
    private final DocumentStorage storage;
    private final ParseProperties properties;
    private final AuditService audit;
    private final ProjectMapper projects;
    private final AccessGuard access;
    private final RequirementMatchService matches;
    private final ProjectWorkScope work;
    private final HistoryRecallScope historyRecall;
    private final org.springframework.jdbc.core.JdbcTemplate jdbc;

    public record ParseRunView(String id, String documentId, String status, int totalBlocks,
            int processedBlocks, int requirementCount, int issueCount, String message,
            Instant startedAt, Instant finishedAt, String extractor) {
    }

    @Transactional
    public ParseRunView run(String documentId, String actorId, List<String> historyDocumentIds) {
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
                with generated as (
                    select id,project_id from requirement where document_id=?
                    and (parse_run_id is not null or block_id is not null or source_refs_json is null)
                )
                select exists(
                    select 1 from generated r join requirement_response a on a.requirement_id=r.id
                    union all
                    select 1 from generated r join response_confirmation_history h on h.requirement_id=r.id
                    union all
                    select 1 from generated r join response_review v on v.project_id=r.project_id
                        and json_unquote(json_extract(v.payload,'$.requirementId'))=r.id
                    union all
                    select 1 from response_snapshot where project_id=?
                        and json_search(payload,'one',?,null,'$.rows[*].sourceFileId') is not null
                )
                """, Boolean.class, documentId, project.getId(), documentId))) {
            throw new BusinessException(409, "已有应答、评审或定稿记录，请登记新版原件后再解析");
        }

        var recallIds = historyDocumentIds == null ? document.historyRecallIds()
                : historyRecall.validate(project, historyDocumentIds);
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
            DocumentBlockReader reader = readerFor(document);
            WordMarkdownReader.Content wordMarkdown = null;
            if (reader instanceof DocxBlockReader && wordMarkdownExtractor.enabled()) {
                phase = "markitdown";
                try (var lease = storage.open(document.getStorageRef(), document.getSizeBytes(), document.getSha256())) {
                    wordMarkdown = wordMarkdownReader.read(lease.path(), properties.maxBlocks());
                }
            }
            rawBlocks = wordMarkdown == null ? readBlocks(document, reader) : wordMarkdown.blocks();
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
            ExtractionResult result = wordMarkdown != null
                    ? wordMarkdownExtractor.extract(wordMarkdown, run.getId())
                    : reader instanceof DocxBlockReader
                    ? extractor.extractWordWithReport(rawBlocks, run.getId())
                    : extractor.extractWithReport(rawBlocks, run.getId());
            run.setExtractor(truncate(result.extractor(), 250));
            issues.addAll(result.issues());
            phase = "source_review";
            extracted = withSourceReview(result.requirements(), rawBlocks);
            if (extracted.isEmpty() && !previous.isEmpty()) {
                throw new DocumentReadException("未生成新条款，保留上一版解析结果，请人工检查来源文件");
            }
        } catch (Exception exception) {
            if (exception instanceof InterruptedException) {
                Thread.currentThread().interrupt();
            }
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

        boolean recognized = !extracted.isEmpty();
        extracted = omitRetainedSelections(documentId, extracted, rawBlocks);
        requirements.deleteGeneratedByDocumentId(documentId);
        blocks.deleteByDocumentId(documentId);
        Map<Integer, DocumentBlock> sourceBlocks = persistBlocks(documentId, rawBlocks);
        List<Requirement> saved = persistRequirements(document, run.getId(), extracted, sourceBlocks);

        long reviewCount = extracted.stream().filter(ExtractedRequirement::needsReview).count();
        int issueCount = (int) reviewCount + issues.size();

        run.setTotalBlocks(rawBlocks.size());
        run.setProcessedBlocks(rawBlocks.size());
        run.setRequirementCount(saved.size());
        run.setIssueCount(issueCount);
        run.setFinishedAt(Instant.now());

        if (!recognized) {
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
        if (!document.historyRecallIds().equals(recallIds)) {
            document.setHistoryDocumentIds(String.join(",", recallIds));
            documents.updateHistoryRecall(document);
        }
        matches.parsed(project, document, saved);
        audit.successInBu(actorId, project.getBuId(), "解析客户文件", "document", documentId,
                "提取 " + saved.size() + " 条条款，待核对 " + issueCount + " 条，抽取器 " + run.getExtractor());
        log.info("document.parse.result parseRunId={} documentId={} projectId={} status={} blocks={} requirements={} issues={} durationMs={}",
                run.getId(), documentId, project.getId(), run.getStatus(), rawBlocks.size(), saved.size(), issueCount,
                TimeUnit.NANOSECONDS.toMillis(System.nanoTime() - started));
        return view(run);
    }

    private static final Pattern SELECTED_WORD = Pattern.compile("selection:word:([0-9/]+):[0-9]+-([0-9/]+):[0-9]+");
    private static final Pattern WORD_BLOCK = Pattern.compile("body/([0-9]+(?:/[rc]?[0-9]+)*)");

    private List<ExtractedRequirement> omitRetainedSelections(String documentId, List<ExtractedRequirement> extracted,
                                                              List<RawBlock> rawBlocks) {
        var selected = requirements.findByDocumentIdOrderBySource(documentId).stream()
            .filter(row -> row.getParseRunId() == null && row.getBlockId() == null)
            .map(row -> SourceRef.decode(row.getSourceRefsJson()))
            .filter(refs -> refs != null && refs.size() == 1 && refs.get(0).anchor() != null
                && refs.get(0).anchor().startsWith("selection:"))
            .map(refs -> refs.get(0)).toList();
        if (selected.isEmpty()) { return extracted; }
        var sources = new HashMap<Integer, RawBlock>();
        rawBlocks.forEach(block -> sources.put(block.index(), block));
        var covered = new HashSet<ExtractedRequirement>();
        for (SourceRef selection : selected) {
            if (selection.anchor().startsWith("selection:page:")
                    && rawBlocks.stream().filter(block -> selectionCoversBlock(selection, block)).limit(2).count() != 1) {
                continue;
            }
            var matches = extracted.stream().filter(candidate -> selection.quote().equals(candidate.originalText()))
                .filter(candidate -> selectionCoversBlock(selection, sources.get(candidate.blockIndex()))).toList();
            if (matches.size() == 1) { covered.add(matches.get(0)); }
        }
        return extracted.stream().filter(candidate -> !covered.contains(candidate)).toList();
    }

    private static boolean selectionCoversBlock(SourceRef selection, RawBlock block) {
        if (block == null || block.anchor() == null || block.text() == null) {
            return false;
        }
        int offset = block.text().indexOf(selection.quote());
        if (offset < 0 || offset != block.text().lastIndexOf(selection.quote())) { return false; }
        var selectedWord = SELECTED_WORD.matcher(selection.anchor());
        var wordBlock = WORD_BLOCK.matcher(block.anchor());
        if (selectedWord.matches() && wordBlock.matches()) {
            int[] path = sourcePath(wordBlock.group(1));
            return Arrays.compare(sourcePath(selectedWord.group(1)), path) <= 0
                && Arrays.compare(path, sourcePath(selectedWord.group(2))) <= 0;
        }
        if (!selection.anchor().startsWith("selection:page:")) { return false; }
        String page = "page-" + selection.anchor().substring("selection:page:".length());
        return page.equals(block.anchor()) || block.anchor().startsWith(page + "/");
    }

    private static int[] sourcePath(String value) {
        return Arrays.stream(value.split("/")).map(part -> part.replaceFirst("^[rc]", ""))
            .mapToInt(Integer::parseInt).toArray();
    }

    private List<ExtractedRequirement> withSourceReview(List<ExtractedRequirement> candidates, List<RawBlock> source) {
        Map<Integer, RawBlock> byIndex = new HashMap<>(); source.forEach(b -> byIndex.put(b.index(), b));
        List<ExtractedRequirement> reviewed = new ArrayList<>();
        for (var r : candidates) {
            RawBlock block = byIndex.get(r.blockIndex());
            if (block == null) {
                if (r.sourceRefs() != null && r.sourceRefs().isEmpty() && r.needsReview()) {
                    reviewed.add(r);
                    continue;
                }
                throw new IllegalArgumentException("来源块不存在");
            }
            if (block.issue() == null) { reviewed.add(r); continue; }
            reviewed.add(new ExtractedRequirement(r.order(), r.blockIndex(), r.sectionPath(), r.customerClauseNo(),
                r.title(), r.level(), r.parentClauseNo(), r.originalText(), r.requirementText(), r.metricsJson(),
                r.conditionsText(), r.obligation(), ExtractedRequirement.NEEDS_REVIEW,
                (r.reviewReasons() == null ? "" : r.reviewReasons() + "；") + block.issue(), r.sourceRefs()));
        }
        return reviewed;
    }

    private DocumentBlockReader readerFor(CustomerDocument document) throws DocumentReadException {
        return readers.stream()
                .filter(candidate -> candidate.supports(document.getName(), document.getContentType()))
                .findFirst()
                .orElseThrow(() -> new DocumentReadException(
                        "暂不支持该文件格式：" + document.getName() + "（当前支持 DOCX / PDF）"));
    }

    private List<RawBlock> readBlocks(CustomerDocument document, DocumentBlockReader reader) throws Exception {
        try (var lease = storage.open(document.getStorageRef(), document.getSizeBytes(), document.getSha256())) {
            return reader.read(lease.path());
        }
    }

    private Map<Integer, DocumentBlock> persistBlocks(String documentId, List<RawBlock> rawBlocks) {
        Map<Integer, DocumentBlock> sourceBlocks = new HashMap<>();
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
            sourceBlocks.put(raw.index(), block);
        }
        return sourceBlocks;
    }

    private List<Requirement> persistRequirements(CustomerDocument document, String runId,
            List<ExtractedRequirement> extracted, Map<Integer, DocumentBlock> sourceBlocks) {
        List<Requirement> saved = new ArrayList<>();
        for (ExtractedRequirement candidate : extracted) {
            DocumentBlock source = sourceBlocks.get(candidate.blockIndex());
            DocumentBlock excerpt = new DocumentBlock();
            excerpt.setId(Ids.next("BLK"));
            excerpt.setDocumentId(document.getId());
            excerpt.setBlockIndex(candidate.order());
            excerpt.setParentBlockId(source == null ? null : source.getId());
            excerpt.setType(source == null ? RawBlock.PARAGRAPH : source.getType());
            excerpt.setSectionPath(source == null ? null : source.getSectionPath());
            excerpt.setCustomerClauseNo(truncate(candidate.customerClauseNo(), 60));
            excerpt.setContent(candidate.originalText());
            excerpt.setSourceAnchor(source == null ? null : source.getSourceAnchor());
            excerpt.setProvenance(source == null ? "model" : source.getProvenance());
            excerpt.setProcessingStatus(source == null ? "NEEDS_REVIEW" : source.getProcessingStatus());
            blocks.insert(excerpt);

            Requirement requirement = new Requirement();
            requirement.setId(Ids.next("REQ"));
            requirement.setProjectId(document.getProjectId());
            requirement.setDocumentId(document.getId());
            requirement.setParseRunId(runId);
            requirement.setBlockId(excerpt.getId());
            requirement.setSectionPath(truncate(candidate.sectionPath(), 480));
            requirement.setCustomerClauseNo(truncate(candidate.customerClauseNo(), 60));
            requirement.setTitle(truncate(candidate.title(), 280));
            requirement.setOriginalText(candidate.originalText());
            if (candidate.sourceRefs() != null) {
                requirement.setSourceRefsJson(SourceRef.encode(candidate.sourceRefs()));
            }
            requirement.setRequirementText(candidate.requirementText());
            requirement.setMetricsJson(candidate.metricsJson());
            requirement.setExtractionStatus(candidate.extractionStatus());
            requirement.setReviewReasons(truncate(candidate.reviewReasons(), 900));
            requirements.insert(requirement);
            saved.add(requirement);
        }
        return saved;
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

}
