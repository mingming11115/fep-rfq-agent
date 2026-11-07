package com.naura.rfq.integration.parse;

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
import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.PDPage;
import org.apache.poi.util.Units;
import org.apache.poi.xwpf.usermodel.XWPFDocument;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import static org.assertj.core.api.Assertions.*;

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
    List<RawBlock> blocks() { return List.of(RawBlock.paragraph(0, source, "设计", "1.1", "p0")); }
    String answer(int block, String quote) throws Exception {
        return json.writeValueAsString(Map.of("requirements", List.of(Map.of("blockIndex", block,
            "originalText", quote, "requirementText", "设计压力至少 2 MPa", "title", "设计压力")),
            "ignoredBlockIndexes", List.of()));
    }
    HttpServer server(int status, String content, long delay) throws Exception {
        HttpServer s = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
        s.createContext("/", exchange -> {
            try {
                byte[] request = exchange.getRequestBody().readAllBytes();
                assertThat(request.length).isPositive();
                if (delay > 0) Thread.sleep(delay);
                byte[] bytes = content.getBytes(java.nio.charset.StandardCharsets.UTF_8);
                exchange.sendResponseHeaders(status, bytes.length); exchange.getResponseBody().write(bytes);
            } catch (InterruptedException e) { Thread.currentThread().interrupt(); }
            finally { exchange.close(); }
        }); s.start(); return s;
    }
    String url(HttpServer s) { return "http://127.0.0.1:" + s.getAddress().getPort() + "/"; }
    String envelope(String content) throws Exception {
        return json.writeValueAsString(Map.of("choices", List.of(Map.of("finish_reason", "stop", "message", Map.of("content", content)))));
    }

    @Test void disabledModelUsesRulesWithoutWarning() {
        var result = extractor(settings("", false)).extractWithReport(blocks());
        assertThat(result.extractor()).isEqualTo("rule-based-v1");
        assertThat(result.requirements()).hasSize(1); assertThat(result.issues()).isEmpty();
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
    @Test void modelOutputKeepsValidatedOriginalSource() throws Exception {
        var s = server(200, envelope(answer(0, source)), 0);
        try {
            var result = extractor(settings(url(s), true)).extractWithReport(blocks());
            assertThat(result.extractor()).isEqualTo("llm:test-model");
            assertThat(result.requirements()).singleElement().satisfies(r -> assertThat(r.originalText()).isEqualTo(source));
            assertThat(result.issues()).isEmpty();
        } finally { s.stop(0); }
    }
    @Test void wrongCitationAndMalformedJsonFallBack() throws Exception {
        for (String bad : List.of(answer(9, source), answer(0, "伪造的客户原文"), "{bad")) {
            var s = server(200, envelope(bad), 0);
            try {
                var result = extractor(settings(url(s), true)).extractWithReport(blocks());
                assertThat(result.extractor()).contains("rule-based-v1");
                assertThat(result.requirements()).hasSize(1); assertThat(result.issues()).isNotEmpty();
            } finally { s.stop(0); }
        }
    }
    @Test void errorsAndTimeoutsFallBackWithoutLeakingResponseBody() throws Exception {
        for (int status : List.of(429, 500, 200)) {
            var s = server(status, "secret-provider-body", status == 200 ? 400 : 0);
            try {
                var result = extractor(settings(url(s), true)).extractWithReport(blocks());
                assertThat(result.requirements()).hasSize(1);
                assertThat(String.join("", result.issues())).doesNotContain("secret-provider-body");
            } finally { s.stop(0); }
        }
    }
    @Test void unaccountedBlocksCannotSilentlyDisappear() throws Exception {
        var s = server(200, envelope("{\"requirements\":[],\"ignoredBlockIndexes\":[]}"), 0);
        try { assertThat(extractor(settings(url(s), true)).extractWithReport(blocks()).requirements()).hasSize(1); }
        finally { s.stop(0); }
    }
    @Test void modelCannotQuoteOnlyFirstClauseAndDropRemainingConditions() throws Exception {
        String first = "1.1 泵的设计压力应不低于 2 MPa。";
        var input = List.of(RawBlock.paragraph(0, first + " 1.2 设备必须提供独立的安全保护装置。", "", null, "p0"));
        var s = server(200, envelope(answer(0, first)), 0);
        try {
            var result = extractor(settings(url(s), true)).extractWithReport(input);
            assertThat(result.extractor()).isEqualTo("rule-based-v1");
            assertThat(result.issues()).isNotEmpty();
            assertThat(result.requirements().get(0).originalText()).contains("安全保护装置");
        } finally { s.stop(0); }
    }
    @Test void slowDripResponseCannotExceedWholeRequestDeadline() throws Exception {
        HttpServer s = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
        s.createContext("/", exchange -> {
            try {
                exchange.getRequestBody().readAllBytes(); exchange.sendResponseHeaders(200, 0);
                for (int i = 0; i < 10; i++) {
                    exchange.getResponseBody().write(' '); exchange.getResponseBody().flush(); Thread.sleep(70);
                }
            } catch (Exception e) { /* Client cancels on deadline. */ }
            finally { exchange.close(); }
        }); s.start();
        try {
            long start = System.nanoTime();
            var config = settings(url(s), true); config.getLlm().setTimeout(Duration.ofMillis(150));
            var result = extractor(config).extractWithReport(blocks());
            assertThat(Duration.ofNanos(System.nanoTime() - start)).isLessThan(Duration.ofMillis(600));
            assertThat(result.issues()).isNotEmpty();
        } finally { s.stop(0); }
    }
    @Test void ocrDisabledPreservesScanPlaceholder() throws Exception {
        Path pdf = dir.resolve("scan.pdf");
        try (var doc = new PDDocument()) { doc.addPage(new PDPage()); doc.save(pdf.toFile()); }
        var reader = new PdfBlockReader(new OcrClient(settings("", false), new ParseHttpClient(json)));
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
        var reader = new PdfBlockReader(new OcrClient(settings("", false), new ParseHttpClient(json)));
        assertThat(reader.read(pdf)).hasSize(2).anySatisfy(b -> {
            assertThat(b.type()).isEqualTo(RawBlock.IMAGE); assertThat(b.issue()).isNotBlank();
        });
    }
    @Test void ocrSuccessKeepsProvenanceAndAnchor() throws Exception {
        var s = server(200, json.writeValueAsString(Map.of("text", source)), 0);
        try {
            Path pdf = dir.resolve("scan.pdf");
            try (var doc = new PDDocument()) { doc.addPage(new PDPage()); doc.save(pdf.toFile()); }
            var reader = new PdfBlockReader(new OcrClient(settings(url(s), true), new ParseHttpClient(json)));
            assertThat(reader.read(pdf)).singleElement().satisfies(b -> {
                assertThat(b.text()).isEqualTo(source); assertThat(b.provenance()).isEqualTo("ocr");
                assertThat(b.anchor()).isEqualTo("page-1");
            });
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
