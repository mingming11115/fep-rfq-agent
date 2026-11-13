package com.naura.rfq.service;

import com.naura.rfq.common.exception.BusinessException;
import com.naura.rfq.common.id.Ids;
import com.naura.rfq.config.properties.ParseProperties;
import com.naura.rfq.integration.parse.DocxBlockReader;
import com.naura.rfq.integration.parse.DocumentBlockReader;
import com.naura.rfq.integration.parse.DocumentReadException;
import com.naura.rfq.integration.parse.HybridRequirementExtractor;
import com.naura.rfq.integration.parse.ParseHttpClient;
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
 * 客户文件解析编排服务。
 *
 * <p>一次解析运行的完整流程：读取原始块并落库 → 抽取条款 → 复核来源引用 → 持久化条款。
 * 同一文档上一轮运行产生的块与条款会被整体替换，因此重试永远不会产生重复条款；
 * 已有人工修正或应答产物时会拒绝重解析以保护人工结果。
 *
 * <p>整个 {@link #run} 在一个事务内执行：读取/抽取阶段失败时回滚为失败状态并保留上一版结果，
 * 成功时按「完成 / 部分成功」两档更新运行记录与文档状态。
 */
@Service
public class ParseService {

    private static final Logger log = LoggerFactory.getLogger(ParseService.class);
    /** 人工划选锚点格式：selection:word:{起始块路径}:{起始偏移}-{结束块路径}:{结束偏移}。 */
    private static final Pattern SELECTED_WORD = Pattern.compile("selection:word:([0-9/]+):[0-9]+-([0-9/]+):[0-9]+");
    /** Word 原始块锚点格式：body/{块路径}，路径形如 1/r2/c3（表内行/列）。 */
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

    /** 解析运行结果视图：运行 ID、状态、块数、条款数、待核对数及耗时起止等汇总信息。 */
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

    /**
     * 编排一次解析运行的完整流程：准备事务上下文 → 读取并抽取 → 收尾落库。
     *
     * <p>同一文档上一次运行产生的块与条款会被整体替换，因此重试不会产生重复条款；
     * 读取/抽取阶段失败时保留上一版结果并将运行记录置为 FAILED。
     *
     * @param documentId         待解析的客户文档 ID
     * @param actorId            触发解析的操作人 ID，用于审计
     * @param historyDocumentIds 历史召回文档 ID 列表；为 null 时沿用文档上已保存的召回配置
     * @return 解析运行结果视图（成功、部分成功或失败均返回）
     */
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

    /**
     * 解析前的准备阶段：校验访问权限与可重解析条件，锁定项目与文档，创建 RUNNING 状态的解析运行记录。
     *
     * <p>拒绝重解析的两种情况：已存在人工修正过的条款（409，避免覆盖人工结果）；
     * 已有应答、评审或定稿记录（409，需登记新版原件后再解析）。
     *
     * @return 携带项目、文档、运行记录、召回配置及计时的解析上下文
     */
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

    /**
     * 读取阶段：按文档类型选择读取器产出原始块，优先走 markitdown 的 Word Markdown 通道；
     * 随后执行条款抽取并为每条条款标记来源块的问题。
     *
     * <p>块数超过上限时仅处理前部分内容并记录提示；若文档已有上一版结果而本次未抽取到任何条款，
     * 视为读取失败以保留旧结果。
     *
     * @param ctx    解析上下文
     * @param issues 收集解析过程中产生的非致命问题提示（调用方传入的累加列表）
     * @return 抽取产物；任一阶段失败时已调用 {@link #recordFailure} 并返回 null
     */
    private ParseOutcome readAndExtract(ParseContext ctx, List<String> issues) {
        ParsePhase phase = ParsePhase.READ;
        try {
            DocumentBlockReader reader = readerFor(ctx.document());
            WordMarkdownReader.Content wordMarkdown = null;
            if (reader instanceof DocxBlockReader && wordMarkdownExtractor.enabled()) {
                phase = ParsePhase.MARKITDOWN;
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
            phase = ParsePhase.EXTRACT;
            ExtractionResult result = wordMarkdown != null
                    ? wordMarkdownExtractor.extract(wordMarkdown, ctx.run().getId())
                    : reader instanceof DocxBlockReader
                    ? extractor.extractWordWithReport(rawBlocks, ctx.run().getId())
                    : extractor.extractWithReport(rawBlocks, ctx.run().getId());
            ctx.run().setExtractor(truncate(result.extractor(), 250));
            issues.addAll(result.issues());
            phase = ParsePhase.SOURCE_REVIEW;
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

    /**
     * 解析失败收尾：记录结构化错误日志（附带原始异常堆栈），将运行记录置为 FAILED 并落库失败原因，
     * 文档状态置为 FAILED，并写入失败审计事件。已有解析结果保持不变。
     *
     * <p>落库原因不透出第三方异常的原始 message，避免把服务器路径、SQL 与服务配置细节写进
     * 用户可见的运行记录与审计日志；原始异常只保留在本方法输出的日志里。
     */
    private void recordFailure(ParseContext ctx, ParsePhase phase, Exception exception) {
        log.error("document.parse.failed parseRunId={} documentId={} projectId={} phase={} errorType={} durationMs={}",
                ctx.run().getId(), ctx.document().getId(), ctx.project().getId(), phase.label(),
                exception.getClass().getSimpleName(),
                TimeUnit.NANOSECONDS.toMillis(System.nanoTime() - ctx.started()),
                exception);
        ParseRun run = ctx.run();
        run.setStatus(ParseRun.FAILED);
        run.setMessage(truncate(failureReason(phase, exception), 990));
        run.setIssueCount(1);
        run.setFinishedAt(Instant.now());
        runs.update(run);
        ctx.document().setStatus(CustomerDocument.STATUS_FAILED);
        documents.update(ctx.document());
        audit.failure(ctx.actorId(), "解析客户文件", "document", ctx.document().getId(), run.getMessage());
    }

    /**
     * 拼装面向用户的失败原因：项目自定义的受控异常直接沿用其 message，
     * 其余异常映射为「失败阶段 + 可操作描述」，兼顾信息量与内部细节保护。
     *
     * @param phase     失败所处的解析阶段
     * @param exception 读取/抽取阶段抛出的异常
     * @return 可写入运行记录与审计日志的失败原因
     */
    private String failureReason(ParsePhase phase, Exception exception) {
        if (exception instanceof DocumentReadException || exception instanceof BusinessException) {
            return exception.getMessage();
        }
        if (exception instanceof InterruptedException) {
            return "解析已中断，请重新发起解析；已有结果保留";
        }
        return phase.title() + "阶段失败（" + ParseHttpClient.reason(exception) + "），请检查文档及服务配置；已有结果保留";
    }

    /**
     * 解析成功收尾：先剔除人工保留的划选条款，再整体替换旧块与旧条款并持久化本次结果，
     * 按识别情况更新运行记录与文档状态（COMPLETED / PARTIAL），随后触发能力匹配并写审计日志。
     */
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

    /**
     * 剔除与人工保留划选（selection）重复的自动抽取条款：用户在界面上手工划选的条款
     * 不属于任何解析运行，重解析时若新结果与之来源一致则跳过，避免重复或覆盖人工保留项。
     */
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

    /**
     * 判断某划选引用是否覆盖给定原始块：要求块文本中该引文唯一出现，
     * 且块锚点落在划选范围内（Word 划选按块路径区间比较，页面划选按页面前缀比较）。
     */
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

    /** 将 "1/r2/c3" 形式的块路径解析为整数数组，用于 Word 划选区间的路径比较。 */
    private static int[] sourcePath(String value) {
        return Arrays.stream(value.split("/")).map(part -> part.replaceFirst("^[rc]", ""))
            .mapToInt(Integer::parseInt).toArray();
    }

    /**
     * 来源复核：将每条候选条款与其来源块对齐；来源块缺失时仅放行显式标记需复核的条款，
     * 否则视为数据异常抛出；来源块带问题标记时将该问题并入条款的复核原因并强制置为 NEEDS_REVIEW。
     */
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

    /** 按文件名与 MIME 类型挑选支持该文档的读取器；无匹配时抛出格式不支持的读取异常。 */
    private DocumentBlockReader readerFor(CustomerDocument document) throws DocumentReadException {
        return readers.stream()
                .filter(candidate -> candidate.supports(document.getName(), document.getContentType()))
                .findFirst()
                .orElseThrow(() -> new DocumentReadException(
                        "暂不支持该文件格式：" + document.getName() + "（当前支持 DOCX / PDF）"));
    }

    /** 从对象存储打开文档租约，并按租约内的本地文件路径读取全部原始块。 */
    private List<RawBlock> readBlocks(CustomerDocument document, DocumentBlockReader reader) throws Exception {
        try (var lease = storage.open(document.getStorageRef(), document.getSizeBytes(), document.getSha256())) {
            return reader.read(lease.path());
        }
    }

    /** 持久化全部原始块，返回块索引到已落库 DocumentBlock 的映射，供条款落库时挂接来源。 */
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

    /**
     * 持久化抽取出的条款：每条条款先落一条摘录块（excerpt，来源指向对应原始块），
     * 再落 Requirement 记录；来源缺失时摘录标记为 NEEDS_REVIEW、来源记为 model。
     *
     * @return 已落库的 Requirement 列表，顺序与抽取结果一致
     */
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

    /** 将解析运行记录转换为对外返回的结果视图。 */
    private ParseRunView view(ParseRun run) {
        return new ParseRunView(run.getId(), run.getDocumentId(), run.getStatus(), run.getTotalBlocks(),
                run.getProcessedBlocks(), run.getRequirementCount(), run.getIssueCount(), run.getMessage(),
                run.getStartedAt(), run.getFinishedAt(), run.getExtractor());
    }

    /** 拼接问题提示为一条消息：无问题时返回兜底文案，有问题时在兜底文案后追加前 8 条。 */
    private String join(List<String> issues, String fallback) {
        if (issues.isEmpty()) {
            return fallback;
        }
        return fallback + "；" + String.join("；", issues.stream().limit(8).toList());
    }

    /** 按数据库列宽截断文本；null 原样返回。 */
    private String truncate(String value, int max) {
        if (value == null) {
            return null;
        }
        return value.length() > max ? value.substring(0, max) : value;
    }

}
