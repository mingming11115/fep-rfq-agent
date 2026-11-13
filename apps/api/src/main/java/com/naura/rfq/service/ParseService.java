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
import com.naura.rfq.model.entity.Project;
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
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Orchestrates one parse run: read blocks, persist them, extract requirements,
 * validate references, then persist. Blocks and requirements of a previous run on
 * the same document are replaced so a retry never duplicates clauses.
 */
@Service
public class ParseService {

    private static final Logger log = LoggerFactory.getLogger(ParseService.class);
    private static final Pattern SELECTED_WORD = Pattern.compile("selection:word:([0-9/]+):[0-9]+-([0-9/]+):[0-9]+");
    private static final Pattern WORD_BLOCK = Pattern.compile("body/([0-9]+(?:/[rc]?[0-9]+)*)");

    @Autowired
    private CustomerDocumentMapper documents;
    @Autowired
    private DocumentBlockMapper blocks;
    @Autowired
    private RequirementMapper requirements;
    @Autowired
    private ParseRunMapper runs;
    @Autowired
    private List<DocumentBlockReader> readers;
    @Autowired
    private HybridRequirementExtractor extractor;
    @Autowired
    private WordMarkdownReader wordMarkdownReader;
    @Autowired
    private WordMarkdownExtractor wordMarkdownExtractor;
    @Autowired
    private DocumentStorage storage;
    @Autowired
    private ParseProperties properties;
    @Autowired
    private AuditService audit;
    @Autowired
    private ProjectMapper projects;
    @Autowired
    private AccessGuard access;
    @Autowired
    private RequirementMatchService matches;
    @Autowired
    private ProjectWorkScope work;
    @Autowired
    private HistoryRecallScope historyRecall;

    public record ParseRunView(String id, String documentId, String status, int totalBlocks,
            int processedBlocks, int requirementCount, int issueCount, String message,
            Instant startedAt, Instant finishedAt, String extractor) {
    }

    /** 一次解析运行的事务内上下文：项目、文档、解析运行记录及审计信息。 */
    record ParseContext(Project project, CustomerDocument document, ParseRun run,
            List<String> recallIds, boolean hasPreviousResult, String actorId, long started) {
    }

    /** 读取与抽取阶段的产物：原始块与抽取出的条款。 */
    record ParseOutcome(List<RawBlock> rawBlocks, List<ExtractedRequirement> extracted) {
    }

    @Transactional
    public ParseRunView run(String documentId, String actorId, List<String> historyDocumentIds) {
        ParseContext ctx = prepare(documentId, actorId, historyDocumentIds);
        List<String> issues = new ArrayList<>();
        ParseOutcome outcome = readAndExtract(ctx, issues);
        if (outcome == null) {
            // 读取/抽取阶段失败已在 readAndExtract 内记录失败状态并落库
            return view(ctx.run());
        }
        return finalizeRun(ctx, outcome, issues);
    }

    /** 校验访问权限与可重解析条件，锁定文档并创建 RUNNING 状态的解析运行记录。 */
    private ParseContext prepare(String documentId, String actorId, List<String> historyDocumentIds) {
        CustomerDocument reference = documents.findById(documentId)
                .orElseThrow(() -> new BusinessException(404, "文档不存在"));
        Project project = projects.findByIdForUpdate(reference.getProjectId())
                .orElseThrow(() -> new BusinessException(404, "项目不存在"));
        access.requireActiveProject(project);
        work.requireEditable(project.getId(), documentId);
        CustomerDocument document = documents.findByIdForUpdate(documentId)
                .orElseThrow(() -> new BusinessException(404, "文档不存在"));

        List<Requirement> previous = requirements.findByDocumentIdForReparse(documentId);
        if (previous.stream().anyMatch(r -> r.getVersion() != null && r.getVersion() > 0)) {
            throw new BusinessException(409, "已有人工修正的条款，请上传新版本后解析，避免覆盖人工结果");
        }
        if (!previous.isEmpty() && requirements.hasResponseArtifacts(documentId, project.getId())) {
            throw new BusinessException(409, "已有应答、评审或定稿记录，请登记新版原件后再解析");
        }

        List<String> recallIds = historyDocumentIds == null ? document.historyRecallIds()
                : historyRecall.validate(project, historyDocumentIds);
        ParseRun run = new ParseRun();
        run.setId(Ids.next("RUN"));
        run.setDocumentId(documentId);
        run.setStatus(ParseRun.RUNNING);
        run.setStartedAt(Instant.now());
        run.setCreatedBy(actorId);
        runs.insert(run);

        document.setStatus(CustomerDocument.STATUS_PARSING);
        documents.update(document);
        return new ParseContext(project, document, run, recallIds, !previous.isEmpty(), actorId, System.nanoTime());
    }

    /** 读取原始块并抽取条款；失败时记录失败状态并返回 null（由调用方回显失败结果）。 */
    private ParseOutcome readAndExtract(ParseContext ctx, List<String> issues) {
        String phase = "read";
        try {
            DocumentBlockReader reader = readerFor(ctx.document());
            WordMarkdownReader.Content wordMarkdown = null;
            if (reader instanceof DocxBlockReader && wordMarkdownExtractor.enabled()) {
                phase = "markitdown";
                try (var lease = storage.open(ctx.document().getStorageRef(), ctx.document().getSizeBytes(),
                        ctx.document().getSha256())) {
                    wordMarkdown = wordMarkdownReader.read(lease.path(), properties.maxBlocks(), ctx.run().getId());
                }
            }
            List<RawBlock> rawBlocks = wordMarkdown == null ? readBlocks(ctx.document(), reader) : wordMarkdown.blocks();
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
                    ? wordMarkdownExtractor.extract(wordMarkdown, ctx.run().getId())
                    : reader instanceof DocxBlockReader
                    ? extractor.extractWordWithReport(rawBlocks, ctx.run().getId())
                    : extractor.extractWithReport(rawBlocks, ctx.run().getId());
            ctx.run().setExtractor(truncate(result.extractor(), 250));
            issues.addAll(result.issues());
            phase = "source_review";
            List<ExtractedRequirement> extracted = withSourceReview(result.requirements(), rawBlocks);
            if (extracted.isEmpty() && ctx.hasPreviousResult()) {
                throw new DocumentReadException("未生成新条款，保留上一版解析结果，请人工检查来源文件");
            }
            return new ParseOutcome(rawBlocks, extracted);
        } catch (Exception exception) {
            if (exception instanceof InterruptedException) {
                Thread.currentThread().interrupt();
            }
            recordFailure(ctx, phase, exception);
            return null;
        }
    }

    /** 解析失败：落库失败状态与原因，文档标记为失败，并写入审计日志。 */
    private void recordFailure(ParseContext ctx, String phase, Exception exception) {
        log.error("document.parse.failed parseRunId={} documentId={} projectId={} phase={} errorType={} durationMs={}",
                ctx.run().getId(), ctx.document().getId(), ctx.project().getId(), phase,
                exception.getClass().getSimpleName(),
                TimeUnit.NANOSECONDS.toMillis(System.nanoTime() - ctx.started()));
        ParseRun run = ctx.run();
        run.setStatus(ParseRun.FAILED);
        String reason = exception instanceof DocumentReadException ? exception.getMessage()
                : "解析失败，请检查文档及服务配置；已有结果保留";
        run.setMessage(truncate(reason, 990));
        run.setIssueCount(1);
        run.setFinishedAt(Instant.now());
        runs.update(run);
        ctx.document().setStatus(CustomerDocument.STATUS_FAILED);
        documents.update(ctx.document());
        audit.failure(ctx.actorId(), "解析客户文件", "document", ctx.document().getId(), run.getMessage());
    }

    /** 解析成功：替换旧数据并持久化新块与条款，更新运行/文档状态，触发匹配与审计。 */
    private ParseRunView finalizeRun(ParseContext ctx, ParseOutcome outcome, List<String> issues) {
        String documentId = ctx.document().getId();
        boolean recognized = !outcome.extracted().isEmpty();
        List<ExtractedRequirement> extracted =
                omitRetainedSelections(documentId, outcome.extracted(), outcome.rawBlocks());
        requirements.deleteGeneratedByDocumentId(documentId);
        blocks.deleteByDocumentId(documentId);
        Map<Integer, DocumentBlock> sourceBlocks = persistBlocks(documentId, outcome.rawBlocks());
        List<Requirement> saved = persistRequirements(ctx.document(), ctx.run().getId(), extracted, sourceBlocks);

        long reviewCount = extracted.stream().filter(ExtractedRequirement::needsReview).count();
        int issueCount = (int) reviewCount + issues.size();

        ParseRun run = ctx.run();
        run.setTotalBlocks(outcome.rawBlocks().size());
        run.setProcessedBlocks(outcome.rawBlocks().size());
        run.setRequirementCount(saved.size());
        run.setIssueCount(issueCount);
        run.setFinishedAt(Instant.now());

        if (!recognized) {
            run.setStatus(ParseRun.PARTIAL);
            run.setMessage(join(issues, "未识别到可应答条款，请检查文档编号结构或改用人工补录"));
            ctx.document().setStatus(CustomerDocument.STATUS_PARTIAL);
        } else if (issueCount > 0) {
            run.setStatus(ParseRun.PARTIAL);
            run.setMessage(join(issues, reviewCount + " 条条款需要人工核对"));
            ctx.document().setStatus(CustomerDocument.STATUS_PARTIAL);
        } else {
            run.setStatus(ParseRun.COMPLETED);
            run.setMessage(join(issues, "解析完成"));
            ctx.document().setStatus(CustomerDocument.STATUS_PARSED);
        }
        run.setMessage(truncate(run.getMessage(), 990));
        runs.update(run);
        documents.update(ctx.document());
        if (!ctx.document().historyRecallIds().equals(ctx.recallIds())) {
            ctx.document().setHistoryDocumentIds(String.join(",", ctx.recallIds()));
            documents.updateHistoryRecall(ctx.document());
        }
        matches.parsed(ctx.project(), ctx.document(), saved);
        audit.successInBu(ctx.actorId(), ctx.project().getBuId(), "解析客户文件", "document", documentId,
                "提取 " + saved.size() + " 条条款，待核对 " + issueCount + " 条，抽取器 " + run.getExtractor());
        log.info("document.parse.result parseRunId={} documentId={} projectId={} status={} blocks={} requirements={} issues={} durationMs={}",
                run.getId(), documentId, ctx.project().getId(), run.getStatus(), outcome.rawBlocks().size(), saved.size(),
                issueCount, TimeUnit.NANOSECONDS.toMillis(System.nanoTime() - ctx.started()));
        return view(run);
    }

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
