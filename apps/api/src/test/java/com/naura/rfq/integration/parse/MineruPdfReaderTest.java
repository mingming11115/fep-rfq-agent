package com.naura.rfq.integration.parse;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.naura.rfq.config.properties.ParseIntegrationProperties;
import com.naura.rfq.model.parse.RawBlock;
import com.sun.net.httpserver.HttpExchange;
import com.sun.net.httpserver.HttpServer;
import java.awt.image.BufferedImage;
import java.io.IOException;
import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;
import java.nio.file.Path;
import java.util.List;
import java.util.Map;
import java.util.concurrent.atomic.AtomicReference;
import java.util.function.Consumer;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.PDPage;
import org.apache.pdfbox.pdmodel.PDPageContentStream;
import org.apache.pdfbox.pdmodel.font.PDType1Font;
import org.apache.pdfbox.pdmodel.font.Standard14Fonts;
import org.apache.pdfbox.pdmodel.graphics.image.LosslessFactory;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.boot.test.context.runner.ApplicationContextRunner;
import org.springframework.context.annotation.ComponentScan;
import org.springframework.context.annotation.Configuration;

import static org.assertj.core.api.Assertions.assertThat;

class MineruPdfReaderTest {
    private static final ObjectMapper JSON = new ObjectMapper();
    private static final String NATIVE_TEXT = "The test pressure shall be at least 2 MPa.";

    @TempDir Path tempDir;

    @Test
    void recognisedTableReachesTheRequirementExtractorWithItsColumnsAndSourcePage() throws Exception {
        String content = """
            [
              {"type":"text","text":"技术规格","text_level":1,"page_idx":0},
              {"type":"table","table_body":"<table><tr><th>No</th><th>项目</th><th>规格</th><th>描述</th></tr><tr><td>3</td><td>供电</td><td>220 V / 50 Hz</td><td>控制柜应支持单相 AC 输入。</td></tr></table>","page_idx":1}
            ]
            """;
        Path file = pdf();
        withMineru(true, 200, content, mineru -> mineru.context().run(context -> {
            var blocks = context.getBean(PdfBlockReader.class).read(file);
            assertThat(blocks).extracting(RawBlock::type).containsExactly("paragraph", "table");
            assertThat(blocks.get(1).tableRows()).containsExactly(
                List.of("No", "项目", "规格", "描述"),
                List.of("3", "供电", "220 V / 50 Hz", "控制柜应支持单相 AC 输入。"));
            assertThat(blocks.get(1).anchor()).isEqualTo("page-2/mineru-1");
            assertThat(blocks.get(1).sectionPath()).isEqualTo("技术规格");
            assertThat(blocks.get(1).provenance()).isEqualTo("mineru");
            assertThat(context.getBean(RuleBasedExtractor.class).extract(blocks)).singleElement().satisfies(row -> {
                assertThat(row.title()).isEqualTo("供电");
                assertThat(row.metricsJson()).contains("220 V / 50 Hz");
            });
            assertThat(mineru.request().get()).contains("name=\"files\"; filename=\"rfq.pdf\"", "%PDF",
                "name=\"return_content_list\"\r\n\r\ntrue", "name=\"backend\"\r\n\r\npipeline");
        }));
    }

    @Test
    void mergedTableCellsPreserveColumnAlignmentAndSharedConditions() throws Exception {
        String content = """
            [{"type":"table","page_idx":0,"table_body":"<table><tr><th>条件</th><th colspan='2'>规格</th></tr><tr><td rowspan='2'>额定负载</td><td>≥ 20</td><td>L/min</td></tr><tr><td>≤ 1.6</td><td>MPa</td></tr></table>"}]
            """;
        Path file = pdf();
        withMineru(true, 200, content, mineru -> mineru.context().run(context ->
            assertThat(context.getBean(PdfBlockReader.class).read(file)).singleElement().satisfies(block ->
                assertThat(block.tableRows()).containsExactly(List.of("条件", "规格", ""),
                    List.of("额定负载", "≥ 20", "L/min"), List.of("额定负载", "≤ 1.6", "MPa")))));
    }

    @Test
    void recognisedVisualContentIsAvailableForReviewAndExtraction() throws Exception {
        String content = """
            [{"type":"image","page_idx":0,"content":"回路应能耐受 1.6 MPa。"}]
            """;
        Path file = pdf();
        withMineru(true, 200, content, mineru -> mineru.context().run(context ->
            assertThat(context.getBean(PdfBlockReader.class).read(file)).singleElement().satisfies(block -> {
                assertThat(block.text()).isEqualTo("回路应能耐受 1.6 MPa。");
                assertThat(block.provenance()).isEqualTo("mineru");
                assertThat(block.issue()).contains("核对");
            })));
    }

    @Test
    void existingOcrStillReadsEmbeddedImagesWhenMineruReturnsAPartialResult() throws Exception {
        String content = """
            [
              {"type":"text","text":"项目说明","page_idx":0},
              {"type":"image","img_path":"images/figure.jpg","page_idx":0},
              {"type":"text","text":"后续要求","page_idx":1}
            ]
            """;
        Path file = pdf(true);
        withMineru(true, 200, content, mineru -> mineru.context()
            .withPropertyValues("rfq.parse.integrations.ocr.enabled=true",
                "rfq.parse.integrations.ocr.url=" + mineru.baseUrl() + "/ocr")
            .run(context -> {
                var blocks = context.getBean(PdfBlockReader.class).read(file);
                assertThat(blocks).extracting(RawBlock::provenance).containsExactly("mineru", "mineru", "ocr", "mineru");
                assertThat(blocks).extracting(RawBlock::index).containsExactly(0, 1, 2, 3);
                assertThat(blocks.get(2).text()).isEqualTo("回路应能耐受 1.6 MPa。");
                assertThat(blocks.get(2).anchor()).isEqualTo("page-1/image-1");
            }));
    }

    @ParameterizedTest
    @ValueSource(ints = {200, 503})
    void emptyOrUnavailableMineruFallsBackToNativePdfText(int status) throws Exception {
        Path file = pdf();
        withMineru(true, status, "[]", mineru -> mineru.context().run(context -> {
            var first = context.getBean(PdfBlockReader.class).read(file).get(0);
            assertThat(first.text()).isEqualTo(NATIVE_TEXT);
            assertThat(first.issue()).contains("MinerU 解析失败");
            assertThat(context.getBean(PdfBlockReader.class).readForHistory(file).get(0).anchor())
                .isEqualTo("page-1/line-0");
            assertThat(mineru.request().get()).isNotNull();
        }));
    }

    @Test
    void disabledMineruUsesNativePdfReaderWithoutUploading() throws Exception {
        Path file = pdf();
        withMineru(false, 503, "[]", mineru -> mineru.context().run(context -> {
            assertThat(context.getBean(PdfBlockReader.class).read(file).get(0).text()).isEqualTo(NATIVE_TEXT);
            assertThat(mineru.request().get()).isNull();
        }));
    }

    private Path pdf() throws Exception {
        return pdf(false);
    }

    private Path pdf(boolean includeImage) throws Exception {
        Path path = tempDir.resolve("original.pdf");
        try (var doc = new PDDocument()) {
            var page = new PDPage();
            doc.addPage(page);
            doc.addPage(new PDPage());
            try (var stream = new PDPageContentStream(doc, page)) {
                stream.beginText();
                stream.setFont(new PDType1Font(Standard14Fonts.FontName.HELVETICA), 12);
                stream.newLineAtOffset(30, 700);
                stream.showText(NATIVE_TEXT);
                stream.endText();
                if (includeImage) {
                    var image = new BufferedImage(4, 4, BufferedImage.TYPE_INT_RGB);
                    stream.drawImage(LosslessFactory.createFromImage(doc, image), 30, 550, 40, 40);
                }
            }
            doc.save(path.toFile());
        }
        return path;
    }

    private void withMineru(boolean enabled, int status, String content, Consumer<MineruStub> test) throws Exception {
        var server = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
        var request = new AtomicReference<String>();
        byte[] response = JSON.writeValueAsBytes(Map.of("status", "completed", "version", "3.4.2",
            "results", Map.of("rfq", Map.of("content_list", content))));
        server.createContext("/file_parse", exchange -> {
            request.set(new String(exchange.getRequestBody().readAllBytes(), StandardCharsets.UTF_8));
            respond(exchange, status, response);
        });
        byte[] ocr = JSON.writeValueAsBytes(Map.of("text", "回路应能耐受 1.6 MPa。"));
        server.createContext("/ocr", exchange -> {
            exchange.getRequestBody().readAllBytes();
            respond(exchange, 200, ocr);
        });
        server.start();
        try {
            String baseUrl = "http://127.0.0.1:" + server.getAddress().getPort();
            var context = new ApplicationContextRunner()
                .withUserConfiguration(ParseConfig.class)
                .withBean(ObjectMapper.class, () -> JSON)
                .withPropertyValues("rfq.parse.integrations.mineru.enabled=" + enabled,
                    "rfq.parse.integrations.mineru.url=" + baseUrl + "/file_parse");
            test.accept(new MineruStub(context, request, baseUrl));
        } finally {
            server.stop(0);
        }
    }

    private static void respond(HttpExchange exchange, int status, byte[] response) throws IOException {
        try (exchange) {
            exchange.sendResponseHeaders(status, response.length);
            exchange.getResponseBody().write(response);
        }
    }

    private record MineruStub(ApplicationContextRunner context, AtomicReference<String> request, String baseUrl) { }

    @Configuration(proxyBeanMethods = false)
    @ComponentScan(basePackageClasses = DocumentBlockReader.class)
    @EnableConfigurationProperties(ParseIntegrationProperties.class)
    static class ParseConfig { }
}
