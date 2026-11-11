package com.naura.rfq.integration.parse;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.naura.rfq.config.properties.ParseIntegrationProperties;
import com.naura.rfq.model.parse.RawBlock;
import com.sun.net.httpserver.HttpServer;
import java.net.InetSocketAddress;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Duration;
import java.util.List;
import java.util.Map;
import lombok.extern.slf4j.Slf4j;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.PDPage;
import org.apache.poi.util.Units;
import org.apache.poi.xwpf.usermodel.XWPFDocument;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.junit.jupiter.api.io.TempDir;
import org.springframework.boot.test.system.CapturedOutput;
import org.springframework.boot.test.system.OutputCaptureExtension;
import static org.assertj.core.api.Assertions.*;

@ExtendWith(OutputCaptureExtension.class)
@Slf4j
class ParsingAdaptersTest {
    final ObjectMapper json = new ObjectMapper();
    final String source = "1.1 泵的设计压力应不低于 2 MPa。";
    @TempDir Path dir;

    ParseIntegrationProperties settings(String url, boolean enabled) {
        var p = new ParseIntegrationProperties();
        p.getLlm().setEnabled(enabled); p.getLlm().setUrl(url); p.getLlm().setModel("test-model");
        p.getLlm().setApiKey("test-key"); p.getLlm().setTimeout(Duration.ofMillis(500));
        p.getOcr().setEnabled(enabled); p.getOcr().setUrl(url);
        return p;
    }
    HybridRequirementExtractor extractor(ParseIntegrationProperties p) {
        return new HybridRequirementExtractor(new RuleBasedExtractor(json), p, new ParseHttpClient(json), json);
    }
    PdfBlockReader pdfReader(ParseIntegrationProperties settings) {
        var http = new ParseHttpClient(json);
        return new PdfBlockReader(new OcrClient(settings, http), new MineruPdfReader(settings, http, json));
    }
    List<RawBlock> blocks() { return List.of(RawBlock.paragraph(0, source, "设计", "1.1", "p0")); }

    @Test void wordTableUsesItemColumnForTitleAndRetainsTheSourceRow() throws Exception {
        var table = RawBlock.table(0, List.of(
                List.of("No", "项目 Item", "规格", "Rev", "Description"),
                List.of("3", "供电 Power Supply", "220 V / 50 Hz", "A", "控制柜应支持单相 AC 输入。")),
                "技术规格", "body/1");

        var rows = extractor(settings("", false)).extract(List.of(table));
        assertThat(rows).singleElement().satisfies(row -> {
            assertThat(row.customerClauseNo()).isEqualTo("3");
            assertThat(row.title()).isEqualTo("供电 Power Supply");
            assertThat(row.originalText()).isEqualTo("3：供电 Power Supply：220 V / 50 Hz：A：控制柜应支持单相 AC 输入。");
        });
        var metrics = json.readTree(rows.get(0).metricsJson());
        assertThat(metrics.path("specification").asText()).isEqualTo("220 V / 50 Hz");
        assertThat(metrics.path("metrics").size()).isEqualTo(2);
    }

    @Test void wordRulesKeepShortItemsEvenInAnItemOnlyTable() {
        var table = RawBlock.table(0, List.of(List.of("Item"), List.of("压力"), List.of("Item"), List.of("噪声")),
                "", "body/0");

        var result = extractor(settings("", false)).extractWordWithReport(List.of(table), "RUN-WORD");

        assertThat(result.requirements()).extracting(row -> row.title()).containsExactly("压力", "噪声");
    }

    @Test void wordModelOmittingRowsKeepsEveryItemFromTheRules() throws Exception {
        var config = settings("", true);
        var reader = new DocxBlockReader(new OcrClient(config, new ParseHttpClient(json)));
        var table = reader.read(Path.of("..", "..", "RFQ-中英文表格解析样例.docx")).stream()
                .filter(RawBlock::isTable).findFirst().orElseThrow();
        String summary = "上料模块须支持 300 mm 硅晶圆，并兼容标准 FOUP。";
        String response = envelope(json.writeValueAsString(Map.of("summaries", List.of(Map.of("id", 0, "summary", summary)))));
        var http = new ParseHttpClient(json) {
            @Override public JsonNode post(ParseIntegrationProperties.Endpoint endpoint, Object request, String runId) throws Exception {
                var submitted = json.valueToTree(request).path("messages").path(1).path("content").asText();
                assertThat(json.readTree(submitted)).hasSize(5);
                return json.readTree(response);
            }
        };

        var result = new HybridRequirementExtractor(new RuleBasedExtractor(json), config, http, json)
                .extractWordWithReport(List.of(table), "RUN-WORD");

        assertThat(result.extractor()).isEqualTo("rule-based-v1+llm:test-model");
        assertThat(result.requirements()).extracting(row -> row.title()).containsExactly(
                "晶圆尺寸 Wafer Size", "定位精度 Positioning Accuracy", "供电 Power Supply",
                "噪声 Noise Level", "安全互锁 Safety Interlock");
        var summarized = result.requirements().get(0);
        assertThat(summarized.requirementText()).isEqualTo(summary);
        assertThat(summarized.blockIndex()).isEqualTo(table.index());
        assertThat(summarized.customerClauseNo()).isEqualTo("1");
        assertThat(summarized.originalText()).contains("300 mm", "Comply");
        assertThat(json.readTree(summarized.metricsJson()).path("specification").asText()).isEqualTo("300 mm");
        var missed = result.requirements().get(1);
        assertThat(missed.requirementText()).isEqualTo(missed.originalText());
        assertThat(result.issues()).hasSize(1);
    }

    @Test void wordSummaryFailurePreservesRuleTextAndContinuesWithLaterBatches() throws Exception {
        var table = RawBlock.table(0, List.of(List.of("Item", "Spec"), List.of("压力", "2 MPa"),
                List.of("噪声", "65 dB")), "", "body/0");
        var config = settings("", true);
        config.getLlm().setBatchBlocks(1);
        var http = new ParseHttpClient(json) {
            @Override public JsonNode post(ParseIntegrationProperties.Endpoint endpoint, Object request, String runId) throws Exception {
                var submitted = json.valueToTree(request).path("messages").path(1).path("content").asText();
                int id = json.readTree(submitted).path(0).path("id").asInt();
                if (id == 0) {
                    throw new java.net.http.HttpTimeoutException("test timeout");
                }
                return json.readTree(envelope("""
                        {"summaries":[{"id":1,"summary":"噪声为 65 dB"}]}
                        """));
            }
        };

        var result = new HybridRequirementExtractor(new RuleBasedExtractor(json), config, http, json)
                .extractWordWithReport(List.of(table), "RUN-WORD");

        assertThat(result.requirements()).extracting(row -> row.requirementText()).containsExactly("压力：2 MPa", "噪声为 65 dB");
        assertThat(result.issues()).singleElement().asString().contains("已降级");
    }

    @Test void modelQuoteWithLineBreaksRetainsTheExactSourceText() throws Exception {
        var table = RawBlock.table(0, List.of(
            List.of("项目", "描述"),
            List.of("设计压力", "泵的设计压力 至少 2 MPa"),
            List.of("测试压力", "出厂前验证")), "技术规格", "body/1");
        var s = server(200, envelope(answer(0, "设计压力 | 泵的设计压力\r\n至少 2 MPa")), 0);
        try {
            var result = extractor(settings(url(s), true)).extractWithReport(List.of(table));
            assertThat(result.extractor()).isEqualTo("llm:test-model");
            assertThat(result.requirements()).singleElement().satisfies(row ->
                assertThat(row.originalText()).isEqualTo("设计压力 | 泵的设计压力 至少 2 MPa"));
        } finally { s.stop(0); }
    }
    @Test void modelQuoteWithLineBreaksCannotSelectBetweenRepeatedMatches() throws Exception {
        var table = RawBlock.table(0, List.of(
            List.of("设计压力", "至少 2 MPa"),
            List.of("设计压力", "至少 2 MPa")), "技术规格", "body/1");
        var s = server(200, envelope(answer(0, "设计压力 |\n至少 2 MPa")), 0);
        try {
            var result = extractor(settings(url(s), true)).extractWithReport(List.of(table));
            assertThat(result.extractor()).isEqualTo("rule-based-v1");
            assertThat(result.issues()).hasSize(1);
        } finally { s.stop(0); }
    }
    @Test void trailingEllipsisRecoversTheUniqueTableRow() throws Exception {
        var table = RawBlock.table(0, List.of(
            List.of("设计压力", "≥ 2 MPa", "在常温下适用"),
            List.of("测试压力", "≥ 3 MPa", "出厂前验证")), "技术规格", "body/1");
        var s = server(200, envelope(answer(0, "设计压力|...")), 0);
        try {
            var result = extractor(settings(url(s), true)).extractWithReport(List.of(table));
            assertThat(result.extractor()).isEqualTo("llm:test-model");
            assertThat(result.requirements()).singleElement().satisfies(row ->
                assertThat(row.originalText()).isEqualTo("设计压力 | ≥ 2 MPa | 在常温下适用"));
        } finally { s.stop(0); }
    }
    @Test void trailingEllipsisCannotSelectBetweenTableRowsWithTheSamePrefix() throws Exception {
        var table = RawBlock.table(0, List.of(
            List.of("设计压力", "≥ 2 MPa", "常温"),
            List.of("设计压力", "≥ 3 MPa", "高温")), "技术规格", "body/1");
        var s = server(200, envelope(answer(0, "设计压力 | ...")), 0);
        try {
            var result = extractor(settings(url(s), true)).extractWithReport(List.of(table));
            assertThat(result.extractor()).isEqualTo("rule-based-v1");
            assertThat(result.issues()).hasSize(1);
        } finally { s.stop(0); }
    }
    @Test void bareEllipsisRecoversTheRowFromAnExactItemColumnMatch() throws Exception {
        var table = RawBlock.table(0, List.of(
            List.of("No", "项目 Item", "规格", "Description"),
            List.of("1", "设计压力", "≥ 2 MPa", "在常温下适用"),
            List.of("2", "测试压力", "≥ 3 MPa", "另见设计压力")), "技术规格", "body/1");
        var s = server(200, envelope(answer(0, "...")), 0);
        try {
            var result = extractor(settings(url(s), true)).extractWithReport(List.of(table));
            assertThat(result.extractor()).isEqualTo("llm:test-model");
            assertThat(result.requirements()).singleElement().satisfies(row ->
                assertThat(row.originalText()).isEqualTo("1 | 设计压力 | ≥ 2 MPa | 在常温下适用"));
        } finally { s.stop(0); }
    }
    @Test void bareEllipsisDoesNotSelectBetweenDuplicateItems() throws Exception {
        var table = RawBlock.table(0, List.of(
            List.of("项目 Item", "规格"),
            List.of("设计压力", "≥ 2 MPa"),
            List.of("设计压力", "≥ 3 MPa")), "技术规格", "body/1");
        var s = server(200, envelope(answer(0, "…")), 0);
        try {
            var result = extractor(settings(url(s), true)).extractWithReport(List.of(table));
            assertThat(result.extractor()).isEqualTo("rule-based-v1");
            assertThat(result.issues()).hasSize(1);
        } finally { s.stop(0); }
    }
    String answer(int block, String quote) throws Exception {
        return json.writeValueAsString(Map.of("requirements", List.of(Map.of("blockIndex", block,
            "originalText", quote, "item", "设计压力", "description", "设计压力至少 2 MPa",
            "specification", "≥ 2 MPa")),
            "ignoredBlockIndexes", List.of()));
    }
    HttpServer server(int status, String content, long delay) throws Exception {
        HttpServer s = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
        s.createContext("/", exchange -> {
            try {
                byte[] request = exchange.getRequestBody().readAllBytes();
                assertThat(request.length).isPositive();
                if (delay > 0) {
                    Thread.sleep(delay);
                }
                byte[] bytes = content.getBytes(java.nio.charset.StandardCharsets.UTF_8);
                exchange.sendResponseHeaders(status, bytes.length); exchange.getResponseBody().write(bytes);
            } catch (InterruptedException e) {
                log.error("测试解析服务等待响应时被中断", e);
                Thread.currentThread().interrupt();
            }
            finally { exchange.close(); }
        }); s.start(); return s;
    }
    String url(HttpServer s) { return "http://127.0.0.1:" + s.getAddress().getPort() + "/"; }
    String envelope(String content) throws Exception {
        return json.writeValueAsString(Map.of("choices", List.of(Map.of("finish_reason", "stop", "message", Map.of("content", content)))));
    }

    @Test void disabledModelUsesRulesWithoutWarning(CapturedOutput output) {
        var result = extractor(settings("", false)).extractWithReport(blocks());
        assertThat(result.extractor()).isEqualTo("rule-based-v1");
        assertThat(result.requirements()).hasSize(1); assertThat(result.issues()).isEmpty();
        assertThat(output.getAll()).contains("document.parse.llm.skipped", "reason=disabled")
            .doesNotContain("document.parse.llm.request");
    }
    @Test void modelMayIgnoreDemoNoticeWithoutFallingBack() throws Exception {
        var input = List.of(RawBlock.paragraph(0, DocumentNoticeExtractionTest.NOTICE, "", null, "p0"),
            RawBlock.paragraph(1, source, "设计", "1.1", "p1"));
        var response = json.readTree(answer(1, source));
        ((com.fasterxml.jackson.databind.node.ArrayNode) response.path("ignoredBlockIndexes")).add(0);
        var s = server(200, envelope(json.writeValueAsString(response)), 0);
        try {
            var result = extractor(settings(url(s), true)).extractWithReport(input);
            assertThat(result.extractor()).isEqualTo("llm:test-model");
            assertThat(result.issues()).isEmpty();
            assertThat(result.requirements()).singleElement().satisfies(r -> assertThat(r.originalText()).isEqualTo(source));
        } finally { s.stop(0); }
    }
    @Test void modelCannotTurnDemoNoticeIntoRequirement() throws Exception {
        var response = json.readTree(answer(0, DocumentNoticeExtractionTest.NOTICE));
        ((com.fasterxml.jackson.databind.node.ArrayNode) response.path("requirements"))
            .add(json.readTree(answer(0, "请供应商逐条填写应答，说明满足情况、适用条件、证据及偏离。"))
                .path("requirements").get(0));
        var s = server(200, envelope(json.writeValueAsString(response)), 0);
        try {
            var input = List.of(RawBlock.paragraph(0, DocumentNoticeExtractionTest.NOTICE, "", null, "p0"));
            var result = extractor(settings(url(s), true)).extractWithReport(input);
            assertThat(result.extractor()).isEqualTo("llm:test-model");
            assertThat(result.requirements()).isEmpty();
            assertThat(result.issues()).isEmpty();
        } finally { s.stop(0); }
    }
    @Test void modelOutputKeepsValidatedOriginalSource(CapturedOutput output) throws Exception {
        var content = json.readTree(answer(0, source));
        var requirement = (com.fasterxml.jackson.databind.node.ObjectNode) content.path("requirements").get(0);
        requirement.put("customerClauseNo", "1.1").put("parentClauseNo", "1").put("level", 2)
            .put("obligation", "mandatory");
        var s = server(200, envelope(content.toString()), 0);
        try {
            var result = extractor(settings(url(s), true)).extractWithReport(blocks());
            assertThat(result.extractor()).isEqualTo("llm:test-model");
            assertThat(result.requirements()).singleElement().satisfies(r -> {
                assertThat(r.originalText()).isEqualTo(source);
                assertThat(r.title()).isEqualTo("设计压力");
                assertThat(r.requirementText()).isEqualTo("设计压力至少 2 MPa");
                assertThat(r.metricsJson()).isEqualTo("{\"specification\":\"≥ 2 MPa\"}");
                assertThat(r.customerClauseNo()).isNull();
                assertThat(r.parentClauseNo()).isNull();
                assertThat(r.level()).isEqualTo(1);
                assertThat(r.obligation()).isEqualTo("unknown");
            });
            assertThat(result.issues()).isEmpty();
            assertThat(output.getAll()).contains("document.parse.llm.request", "document.parse.llm.accepted",
                "model=test-model", "acceptedBlockIndexes=[0]", "external.call.request", "external.call.response",
                "service=llm operation=chat_completions", "status=200")
                .doesNotContain("external.call.payload", source, "test-key");
        } finally { s.stop(0); }
    }
    @Test void validModelOutputWithoutFinishReasonIsAccepted() throws Exception {
        var content = json.readTree(answer(0, source));
        ((com.fasterxml.jackson.databind.node.ObjectNode) content.path("requirements").get(0)).putNull("specification");
        var response = json.writeValueAsString(Map.of("choices", List.of(
            Map.of("message", Map.of("content", content.toString())))));
        var s = server(200, response, 0);
        try {
            var result = extractor(settings(url(s), true)).extractWithReport(blocks());
            assertThat(result.extractor()).isEqualTo("llm:test-model");
            assertThat(result.issues()).isEmpty();
            assertThat(result.requirements()).singleElement().satisfies(r -> assertThat(r.metricsJson()).isNull());
        } finally { s.stop(0); }
    }
    @Test void optInLogsModelInputAndOutputWithoutApiKey(CapturedOutput output) throws Exception {
        var reply = (com.fasterxml.jackson.databind.node.ObjectNode) json.readTree(envelope(answer(0, source)));
        reply.put("echo", "test-key");
        var s = server(200, reply.toString(), 0);
        try {
            var config = settings(url(s), true);
            config.getLlm().setLogPayload(true);
            extractor(config).extractWithReport(blocks(), "RUN-test");
            assertThat(output.getAll().lines().toList())
                .anySatisfy(line -> assertThat(line).contains("external.call.payload", "direction=request", source))
                .anySatisfy(line -> assertThat(line).contains("external.call.payload", "direction=response",
                    "设计压力至少 2 MPa", "[REDACTED]"));
            assertThat(output.getAll()).contains("parseRunId=RUN-test").doesNotContain("test-key");
        } finally { s.stop(0); }
    }
    @Test void wrongCitationAndMalformedJsonFallBack(CapturedOutput output) throws Exception {
        for (String bad : List.of(answer(9, source), answer(0, "伪造的客户原文"), "{model-private-content")) {
            var s = server(200, envelope(bad), 0);
            try {
                var result = extractor(settings(url(s), true)).extractWithReport(blocks());
                assertThat(result.extractor()).contains("rule-based-v1");
                assertThat(result.requirements()).hasSize(1); assertThat(result.issues()).isNotEmpty();
            } finally { s.stop(0); }
        }
        var fallbackLogs = output.getAll().lines()
            .filter(line -> line.contains("document.parse.llm.fallback") && line.contains("phase=validation"))
            .toList();
        assertThat(fallbackLogs)
            .anySatisfy(line -> assertThat(line).contains("validationDetail=来源校验失败"))
            .anySatisfy(line -> assertThat(line).contains("validationDetail=模型输出不是有效的 JSON"));
        assertThat(output.getAll()).doesNotContain("伪造的客户原文", "model-private-content", source, "test-key");
    }
    @Test void laterBatchStillUsesModelAfterEarlierBatchFails() throws Exception {
        var input = List.of(RawBlock.paragraph(0, "1.1 设备必须提供独立的安全保护装置。", "设计", "1.1", "p0"),
            RawBlock.paragraph(1, source, "设计", "1.2", "p1"));
        // Only the second batch contains the block referenced by the gateway response.
        var s = server(200, envelope(answer(1, source)), 0);
        try {
            var config = settings(url(s), true);
            config.getLlm().setBatchBlocks(1);
            var result = extractor(config).extractWithReport(input);
            assertThat(result.extractor()).isEqualTo("llm:test-model+rule-based-v1");
            assertThat(result.issues()).singleElement().satisfies(issue -> assertThat(issue).contains("模型批次 0"));
            assertThat(result.requirements()).extracting(r -> r.blockIndex()).containsExactly(0, 1);
        } finally { s.stop(0); }
    }
    @Test void errorsAndTimeoutsFallBackWithoutLeakingResponseBody(CapturedOutput output) throws Exception {
        for (int status : List.of(429, 500, 200)) {
            var s = server(status, "secret-provider-body", status == 200 ? 400 : 0);
            try {
                var result = extractor(settings(url(s), true)).extractWithReport(blocks());
                assertThat(result.requirements()).hasSize(1);
                assertThat(String.join("", result.issues())).doesNotContain("secret-provider-body");
            } finally { s.stop(0); }
        }
        assertThat(output.getAll()).contains("document.parse.llm.fallback", "reason=HTTP 429", "reason=HTTP 500")
            .doesNotContain("secret-provider-body", "test-key", source);
    }
    @Test void unaccountedBlocksCannotSilentlyDisappear() throws Exception {
        var s = server(200, envelope("{\"requirements\":[],\"ignoredBlockIndexes\":[]}"), 0);
        try { assertThat(extractor(settings(url(s), true)).extractWithReport(blocks()).requirements()).hasSize(1); }
        finally { s.stop(0); }
    }
    @Test void modelKeepsExtractedClausesWhenSomeBlockTextIsUnquoted() throws Exception {
        String first = "1.1 泵的设计压力应不低于 2 MPa。";
        var input = List.of(RawBlock.paragraph(0, first + " 1.2 设备必须提供独立的安全保护装置。", "", null, "p0"));
        var s = server(200, envelope(answer(0, first)), 0);
        try {
            var result = extractor(settings(url(s), true)).extractWithReport(input);
            assertThat(result.extractor()).isEqualTo("llm:test-model");
            assertThat(result.issues()).isEmpty();
            assertThat(result.requirements()).singleElement().satisfies(r -> {
                assertThat(r.originalText()).isEqualTo(first);
                assertThat(r.needsReview()).isTrue();
            });
        } finally { s.stop(0); }
    }
    @Test void slowDripResponseCannotExceedWholeRequestDeadline(CapturedOutput output) throws Exception {
        HttpServer s = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
        s.createContext("/", exchange -> {
            try {
                exchange.getRequestBody().readAllBytes(); exchange.sendResponseHeaders(200, 0);
                for (int i = 0; i < 10; i++) {
                    exchange.getResponseBody().write(' '); exchange.getResponseBody().flush(); Thread.sleep(70);
                }
            } catch (Exception e) {
                log.error("测试解析服务发送分段响应时失败", e);
                /* Client cancels on deadline. */
            }
            finally { exchange.close(); }
        }); s.start();
        try {
            long start = System.nanoTime();
            var config = settings(url(s), true); config.getLlm().setTimeout(Duration.ofMillis(150));
            var result = extractor(config).extractWithReport(blocks());
            assertThat(Duration.ofNanos(System.nanoTime() - start)).isLessThan(Duration.ofMillis(600));
            assertThat(result.issues()).isNotEmpty();
            assertThat(output.getAll()).contains("external.call.failed", "TimeoutException");
        } finally { s.stop(0); }
    }
    @Test void ocrDisabledPreservesScanPlaceholder() throws Exception {
        Path pdf = dir.resolve("scan.pdf");
        try (var doc = new PDDocument()) { doc.addPage(new PDPage()); doc.save(pdf.toFile()); }
        var reader = pdfReader(settings("", false));
        assertThat(reader.read(pdf)).singleElement().satisfies(b -> {
            assertThat(b.type()).isEqualTo(RawBlock.IMAGE); assertThat(b.issue()).contains("OCR");
        });
    }
    @Test void inlineImageOnPageWithTextStillProducesReviewPlaceholder() throws Exception {
        Path pdf = dir.resolve("mixed-inline.pdf");
        try (var doc = new PDDocument()) {
            var page = new PDPage(); doc.addPage(page);
            var resources = new org.apache.pdfbox.pdmodel.PDResources();
            resources.put(org.apache.pdfbox.cos.COSName.getPDFName("F1"), new org.apache.pdfbox.pdmodel.font.PDType1Font(
                org.apache.pdfbox.pdmodel.font.Standard14Fonts.FontName.HELVETICA));
            page.setResources(resources);
            var stream = new org.apache.pdfbox.pdmodel.common.PDStream(doc);
            try (var out = stream.createOutputStream()) {
                out.write(("BT /F1 12 Tf 50 700 Td (1.1 Pump must support 2 MPa.) Tj ET\n"
                    + "q 100 0 0 100 50 500 cm BI /W 1 /H 1 /BPC 8 /CS /G ID\n0\nEI Q\n")
                    .getBytes(java.nio.charset.StandardCharsets.US_ASCII));
            }
            page.setContents(stream); doc.save(pdf.toFile());
        }
        var reader = pdfReader(settings("", false));
        assertThat(reader.read(pdf)).hasSize(2).anySatisfy(b -> {
            assertThat(b.type()).isEqualTo(RawBlock.IMAGE); assertThat(b.issue()).isNotBlank();
        });
    }
    @Test void ocrSuccessKeepsProvenanceAndAnchor(CapturedOutput output) throws Exception {
        var s = server(200, json.writeValueAsString(Map.of("text", source)), 0);
        try {
            Path pdf = dir.resolve("scan.pdf");
            try (var doc = new PDDocument()) { doc.addPage(new PDPage()); doc.save(pdf.toFile()); }
            var reader = pdfReader(settings(url(s), true));
            assertThat(reader.read(pdf)).singleElement().satisfies(b -> {
                assertThat(b.text()).isEqualTo(source); assertThat(b.provenance()).isEqualTo("ocr");
                assertThat(b.anchor()).isEqualTo("page-1");
            });
            assertThat(output.getAll()).contains("external.call.request", "external.call.response",
                "service=ocr operation=recognise", "status=200").doesNotContain(source, "imageBase64");
        } finally { s.stop(0); }
    }
    @Test void wordPicturesBesideTextAreNotDropped() throws Exception {
        Path docx = dir.resolve("mixed.docx");
        byte[] png = java.util.Base64.getDecoder().decode("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aPlkAAAAASUVORK5CYII=");
        try (var doc = new XWPFDocument()) {
            var run = doc.createParagraph().createRun(); run.setText(source);
            run.addPicture(new java.io.ByteArrayInputStream(png), XWPFDocument.PICTURE_TYPE_PNG, "pic.png", Units.toEMU(10), Units.toEMU(10));
            try (var out = Files.newOutputStream(docx)) { doc.write(out); }
        }
        var reader = new DocxBlockReader(new OcrClient(settings("", false), new ParseHttpClient(json)));
        assertThat(reader.read(docx)).hasSize(2).anySatisfy(b -> assertThat(b.type()).isEqualTo(RawBlock.IMAGE));
    }
}
