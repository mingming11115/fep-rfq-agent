package com.naura.rfq.integration.parse;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.JsonNode;
import com.naura.rfq.config.properties.ParseIntegrationProperties;
import com.naura.rfq.model.parse.BatchAttempt;
import com.naura.rfq.model.parse.ExtractedRequirement;
import com.naura.rfq.model.parse.ExtractionResult;
import com.naura.rfq.model.parse.RawBlock;
import com.naura.rfq.model.parse.SourceRef;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.TreeSet;
import java.util.regex.Pattern;
import java.util.stream.Collectors;
import lombok.AllArgsConstructor;
import lombok.NoArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;

@Component
@NoArgsConstructor
@AllArgsConstructor
@Slf4j
public class WordMarkdownExtractor {
    private static final Pattern SOURCE_ID = Pattern.compile("S([0-9]{1,9})");
    private static final String PROMPT = RequirementExtractionPrompt.RULES + """

        输入为带 [S数字] 来源标记的 Word Markdown。仅返回 JSON 对象，保留示例中的全部字段。
        requirements 每项包含 customerClauseNo（客户条款号）、title（标题）、requirementText（要求正文）、specification（规格）
        和 sourceRefs（来源 ID 数组）。sourceRefs 第一个 ID 必须是要求所在的正文或数据行，其余是补充来源。只用输入中的 ID，如 "S3"。
        ignoredSourceRefs 列出未被任何条款引用的来源 ID。数组无内容时填 []。
        {"requirements":[{"customerClauseNo":"2.1","title":"额定负载","requirementText":"额定负载至少为 5 kg。","specification":"5 kg","sourceRefs":["S0"]}],"ignoredSourceRefs":[]}
        """;

    /** 单个批次的执行结果：是否成功、主要来源 S 编号、请求字符数与失败原因。 */
    private record Attempt(boolean success, String sources, int chars, String failureReason) {

        Attempt combine(Attempt other, int chars) {
            return new Attempt(success && other.success, mergeSources(sources, other.sources), chars,
                    failureReason != null ? failureReason : other.failureReason);
        }

        private static String mergeSources(String first, String second) {
            var merged = new TreeSet<String>();
            for (String part : new String[] {first, second}) {
                for (String id : part.split(",")) {
                    if (!id.isBlank()) {
                        merged.add(id);
                    }
                }
            }
            return String.join(",", merged);
        }
    }

    @Autowired
    private ParseIntegrationProperties properties;
    @Autowired
    private ParseHttpClient http;
    @Autowired
    private RuleBasedExtractor rules;

    public boolean enabled() {
        return properties.llmEnabled();
    }

    public ExtractionResult extract(WordMarkdownReader.Content content, String runId) throws DocumentReadException {
        var config = properties.getLlm();
        if (config.getModel().isBlank() || config.getUrl().isBlank()) {
            throw new DocumentReadException("Word 模型抽取需要配置模型名称和地址");
        }
        if (content.availableSources().isEmpty()) {
            if (!content.blocks().isEmpty() && content.blocks().stream().allMatch(block -> RawBlock.IMAGE.equals(block.type()))) {
                return new ExtractionResult(List.of(), "markitdown", content.issues());
            }
            throw new DocumentReadException("Markdown 没有可引用的 Word 原文");
        }
        int configuredMax = properties.getWordMarkdown().getMaxChars();
        int maxChars = configuredMax > 0 ? configuredMax : Integer.MAX_VALUE;
        String extractor = "markitdown+llm:" + config.getModel();
        int wholeChars = Math.min(Math.max(1, config.getBatchChars()), maxChars);
        try {
            if (content.markdown().length() > wholeChars) {
                // 文件超过单批上限直接分批，不先发一次注定超限的整文请求。
                log.info("document.parse.word.llm.batching parseRunId={} reason=input_exceeds_batch_chars batchChars={}",
                        runId, wholeChars);
            } else {
                try {
                    var response = request(content.markdown(), PROMPT, config, runId);
                    var attempts = List.of(new BatchAttempt(1, BatchAttempt.SUCCESS,
                            sources(content.availableSources()), content.markdown().length(), null));
                    return validate(response, content, extractor, attempts);
                } catch (LengthLimitException exception) {
                    log.error("Word 模型响应超出长度限制", exception);
                    log.info("document.parse.word.llm.batching parseRunId={} reason={}", runId, exception.getMessage());
                }
            }
            return extractBatches(content, config, runId, maxChars, wholeChars, extractor);
        } catch (DocumentReadException exception) {
            log.error("Word 模型抽取失败", exception);
            log.warn("document.parse.word.llm.failed parseRunId={} errorType={} reason={}",
                    runId, exception.getClass().getSimpleName(), exception.getMessage());
            throw exception;
        } catch (Exception exception) {
            log.error("Word 模型抽取失败", exception);
            if (exception instanceof InterruptedException) {
                Thread.currentThread().interrupt();
            }
            Throwable cause = ParseHttpClient.unwrap(exception);
            String reason = cause instanceof JsonProcessingException ? "模型响应 JSON 无法解析"
                    : ParseHttpClient.reason(exception);
            log.warn("document.parse.word.llm.failed parseRunId={} errorType={} reason={}",
                    runId, cause.getClass().getSimpleName(), reason);
            throw new DocumentReadException("Word 模型抽取失败，请检查模型配置或重试", exception);
        }
    }

    private JsonNode request(String markdown, String prompt, ParseIntegrationProperties.Llm config, String runId) throws Exception {
        var request = Map.of("model", config.getModel(), "stream", false, "messages", List.of(
                Map.of("role", "system", "content", prompt), Map.of("role", "user", "content", markdown)));
        JsonNode response;
        try {
            response = http.post(config, request, runId);
        } catch (Exception exception) {
            log.error("调用 Word 模型接口失败", exception);
            if (ParseHttpClient.requestExceedsLengthLimit(exception)) {
                throw new LengthLimitException("input_length_limit");
            }
            throw exception;
        }
        if ("length".equals(response.path("choices").path(0).path("finish_reason").asText())) {
            throw new LengthLimitException("output_length_limit");
        }
        return http.modelContent(response);
    }

    private ExtractionResult extractBatches(WordMarkdownReader.Content content, ParseIntegrationProperties.Llm config,
            String runId, int maxChars, int batchChars, String extractor) throws Exception {
        var batches = new WordMarkdownBatches(content.markdown());
        if (batches.size() < 2) {
            throw new DocumentReadException("Word 内容块超出模型长度上限，请拆分文档后重试");
        }
        var validation = new Validation(content, batches.tableHeaders());
        // 末批留一个字符余量，避免批次大小恰好等于整文时被当成单批。
        batchChars = Math.min(batchChars, Math.min(maxChars, content.markdown().strip().length() - 1));
        int batchBlocks = Math.min(Math.max(1, config.getBatchBlocks()), (batches.size() + 1) / 2);
        int failed = 0;
        var attempts = new ArrayList<BatchAttempt>();
        String lastFailure = null;
        for (int start = 0; start < batches.size();) {
            int end = batches.endOfBatch(start, batchChars, batchBlocks);
            Attempt attempt = extractBatch(batches, start, end, batchChars, maxChars, config, runId, validation);
            String status = attempt.sources().isEmpty() ? BatchAttempt.SKIPPED
                    : attempt.success() ? BatchAttempt.SUCCESS : BatchAttempt.FAILED;
            attempts.add(new BatchAttempt(attempts.size() + 1, status, attempt.sources(), attempt.chars(),
                    attempt.failureReason()));
            if (!attempt.success() && !attempt.sources().isEmpty()) {
                failed++;
                lastFailure = attempt.failureReason();
            }
            start = end;
        }
        log.info("document.parse.word.llm.batch.summary parseRunId={} batches={} failed={}",
                runId, attempts.size(), failed);
        // 单批失败降级为 issue；全部批次都失败才让整次解析失败。
        if (failed > 0 && validation.isEmpty()) {
            throw new DocumentReadException("Word 模型批次解析全部失败（" + failed + " 批），最后原因：" + lastFailure);
        }
        return validation.result(extractor + "+batched", attempts);
    }

    private static String sources(Set<Integer> ids) {
        return new TreeSet<>(ids).stream().map(id -> "S" + id).collect(Collectors.joining(","));
    }

    /** 执行一个批次并落校验；返回该批执行结果，失败也不抛出（由调用方汇总降级）。 */
    private Attempt extractBatch(WordMarkdownBatches batches, int start, int end, int batchChars, int maxChars,
            ParseIntegrationProperties.Llm config, String runId, Validation validation) throws Exception {
        var batch = batches.batch(start, end, batchChars, true);
        var primary = new TreeSet<>(batch.primary());
        primary.retainAll(validation.content.availableSources());
        if (primary.isEmpty()) {
            return new Attempt(true, "", 0, null);
        }
        String prompt = PROMPT + "\n本批的主要来源为 " + primary.stream().map(id -> "S" + id).collect(Collectors.joining(", "))
                + "。只输出主要来源在此列表内的条款。其他来源可作为表头、条件或相邻正文引用。";
        try {
            if (batch.markdown().length() > maxChars) {
                throw new LengthLimitException("local_length_limit");
            }
            validation.add(request(batch.markdown(), prompt, config, runId), batch.visible(), primary);
            return new Attempt(true, sources(primary), batch.markdown().length(), null);
        } catch (LengthLimitException exception) {
            log.error("Word 模型批次超出模型长度上限", exception);
            if (end - start > 1) {
                int middle = start + (end - start) / 2;
                int smaller = Math.min(batchChars, batch.markdown().length() - 1);
                Attempt first = extractBatch(batches, start, middle, smaller, maxChars, config, runId, validation);
                Attempt second = extractBatch(batches, middle, end, smaller, maxChars, config, runId, validation);
                return first.combine(second, batch.markdown().length());
            }
            var core = batches.batch(start, end, batchChars, false);
            if (core.markdown().length() <= maxChars && !core.markdown().equals(batch.markdown())) {
                try {
                    validation.add(request(core.markdown(), prompt, config, runId), core.visible(), primary);
                    return new Attempt(true, sources(primary), core.markdown().length(), null);
                } catch (LengthLimitException ignored) {
                    log.error("Word 单来源请求仍超出模型长度上限", ignored);
                    // This request already contains just one source unit.
                }
            }
            String reason = "S" + primary.first() + " 超出模型长度上限";
            validation.failed("S" + primary.first(), "超出模型长度上限，请拆分文档后重试");
            return new Attempt(false, sources(primary), batch.markdown().length(), reason);
        } catch (Exception exception) {
            if (exception instanceof InterruptedException) {
                Thread.currentThread().interrupt();
            }
            String reason = exception instanceof DocumentReadException detail
                    ? detail.getMessage() : ParseHttpClient.reason(exception);
            log.warn("document.parse.word.llm.batch.failed parseRunId={} sources={} reason={}", runId, primary, reason);
            validation.failed("S" + primary.first(), reason);
            return new Attempt(false, sources(primary), batch.markdown().length(), "S" + primary.first() + "：" + reason);
        }
    }

    private static class LengthLimitException extends Exception {
        LengthLimitException(String reason) { super(reason); }
    }

    ExtractionResult validate(JsonNode response, WordMarkdownReader.Content content, String extractor,
            List<BatchAttempt> batches) throws DocumentReadException {
        var validation = new Validation(content, new WordMarkdownBatches(content.markdown()).tableHeaders());
        validation.add(response, content.availableSources(), content.availableSources());
        return validation.result(extractor, batches);
    }

    private class Validation {
        private final WordMarkdownReader.Content content;
        private final Set<Integer> tableHeaders;
        private final List<ExtractedRequirement> requirements = new ArrayList<>();
        private final List<String> issues;
        private final Set<Integer> covered = new HashSet<>();
        private final Map<Integer, RawBlock> blocks;

        Validation(WordMarkdownReader.Content content, Set<Integer> tableHeaders) {
            this.content = content;
            this.tableHeaders = tableHeaders;
            this.issues = new ArrayList<>(content.issues());
            this.blocks = content.blocks().stream().collect(Collectors.toMap(RawBlock::index, block -> block));
        }

        void add(JsonNode response, Set<Integer> visible, Set<Integer> primarySources) throws DocumentReadException {
            if (response == null || !response.path("requirements").isArray() || !response.path("ignoredSourceRefs").isArray()) {
                throw new DocumentReadException("Word 模型输出缺少条款或来源覆盖字段");
            }
            for (JsonNode ignored : response.path("ignoredSourceRefs")) {
                int index = sourceIndex(ignored);
                if (primarySources.contains(index)) {
                    covered.add(index);
                } else if (!visible.contains(index) || !content.availableSources().contains(index)) {
                    issues.add("模型返回了无效的忽略来源");
                }
            }
            for (JsonNode candidate : response.path("requirements")) {
                String requirement = candidate.path("requirementText").asText("").strip();
                if (!candidate.path("requirementText").isTextual() || requirement.isEmpty()) {
                    issues.add("模型返回了空条款");
                    continue;
                }
                var sourceIndices = new TreeSet<Integer>();
                var invalid = !candidate.path("sourceRefs").isArray() || candidate.path("sourceRefs").isEmpty();
                for (JsonNode id : candidate.path("sourceRefs")) {
                    int index = sourceIndex(id);
                    if (visible.contains(index) && content.availableSources().contains(index) && blocks.containsKey(index)) {
                        sourceIndices.add(index);
                    } else {
                        invalid = true;
                    }
                }
                var sources = sourceIndices.stream().map(blocks::get).toList();
                logMergedTableRows(sourceIndices);
                int designatedPrimary = sourceIndex(candidate.path("sourceRefs").path(0));
                var ordered = sources.stream().sorted(Comparator.comparingInt(block -> {
                    if (tableHeaders.contains(block.index())) {
                        return 3;
                    }
                    int priority = sourcePriority(block);
                    return block.index() == designatedPrimary && priority < 2 ? -1 : priority;
                }))
                        .toList();
                var primary = ordered.isEmpty() ? null : ordered.get(0);
                if (primary != null && !primarySources.contains(primary.index())) {
                    continue;
                }
                covered.addAll(sourceIndices);
                var refs = ordered.stream().map(block -> new SourceRef(block.anchor(), block.text())).toList();
                String original = sources.stream().map(RawBlock::text).collect(Collectors.joining("\n"));
                String metrics = rules.sourcedMetrics(original, candidate.path("specification").asText("").strip());
                String reason = invalid ? "模型引用缺失或无法定位，请核对原文" : "模型抽取，需核对原文及适用条件";
                requirements.add(new ExtractedRequirement(requirements.size(), primary == null ? -1 : primary.index(),
                        primary == null ? "" : primary.sectionPath(), candidate.path("customerClauseNo").asText(""),
                        candidate.path("title").asText(""), 1, null, original, requirement,
                        metrics, null, null, reason, refs));
            }
        }

        boolean isEmpty() {
            return requirements.isEmpty();
        }

        void failed(String firstSource, String reason) {
            issues.add(firstSource + "：Word 模型批次解析失败，" + reason + "，请核对该部分是否遗漏条款");
        }

        ExtractionResult result(String extractor, List<BatchAttempt> batches) {
            long failedBatches = batches.stream().filter(batch -> BatchAttempt.FAILED.equals(batch.status())).count();
            if (failedBatches > 0) {
                // 置顶保证在 message 截断（前 8 条）内仍能看到批次总数与失败数。
                issues.add(0, "模型分批解析共 " + batches.size() + " 批，其中 " + failedBatches + " 批失败");
            }
            long missing = content.availableSources().stream().filter(index -> !covered.contains(index)).count();
            if (missing > 0) {
                issues.add("模型未交代 " + missing + " 处 Word 来源，请核对是否遗漏条款");
            }
            return new ExtractionResult(requirements, extractor, issues, batches);
        }

        /** 同一表格的多行被并进一条条款时留痕，用于核查提示词的逐行约束是否生效。 */
        private void logMergedTableRows(Set<Integer> sourceIndices) {
            var rowsByTable = sourceIndices.stream()
                    .filter(index -> !tableHeaders.contains(index))
                    .map(blocks::get)
                    .filter(RawBlock::isTable)
                    .map(block -> tableKey(block.anchor()))
                    .filter(key -> !key.isEmpty())
                    .collect(Collectors.groupingBy(key -> key, Collectors.counting()));
            rowsByTable.forEach((table, rows) -> {
                if (rows > 1) {
                    log.warn("document.parse.word.table.merged table={} rows={}", table, rows);
                }
            });
        }
    }

    /** 表格行的锚点形如 body/5/r3，去掉行号后的前缀标识同一张表。 */
    private static String tableKey(String anchor) {
        int row = anchor.lastIndexOf("/r");
        return row < 0 ? "" : anchor.substring(0, row);
    }

    private static int sourceIndex(JsonNode value) {
        var matcher = SOURCE_ID.matcher(value.asText(""));
        return matcher.matches() ? Integer.parseInt(matcher.group(1)) : -1;
    }

    private static int sourcePriority(RawBlock block) {
        if (!block.anchor().startsWith("body/") || block.anchor().contains("/image-")) {
            return 2;
        }
        return block.isTable() ? 1 : 0;
    }
}
