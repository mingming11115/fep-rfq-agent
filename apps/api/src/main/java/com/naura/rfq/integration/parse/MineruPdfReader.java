package com.naura.rfq.integration.parse;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.naura.rfq.config.properties.ParseIntegrationProperties;
import com.naura.rfq.model.parse.RawBlock;
import java.io.IOException;
import java.net.http.HttpRequest.BodyPublishers;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Component;

/** Adapts the self-hosted MinerU 3.4.x content_list to the RFQ extraction contract. */
@Component
@RequiredArgsConstructor
class MineruPdfReader {
    private static final String PROVENANCE = "mineru";
    private static final String REVIEW = "MinerU 识别内容，需核对原文、数值及单位";
    private final ParseIntegrationProperties properties;
    private final ParseHttpClient http;
    private final ObjectMapper json;

    boolean enabled() {
        return properties.getMineru().isEnabled();
    }

    List<RawBlock> read(Path file) throws Exception {
        var settings = properties.getMineru();
        String boundary = "rfq-" + UUID.randomUUID();
        String fields = field(boundary, "backend", settings.getBackend())
            + field(boundary, "return_content_list", "true")
            + field(boundary, "return_md", "false")
            + field(boundary, "table_enable", "true")
            + "--" + boundary + "\r\nContent-Disposition: form-data; name=\"files\"; filename=\"rfq.pdf\"\r\n"
            + "Content-Type: application/pdf\r\n\r\n";
        var upload = BodyPublishers.concat(BodyPublishers.ofString(fields), BodyPublishers.ofFile(file),
            BodyPublishers.ofString("\r\n--" + boundary + "--\r\n"));
        JsonNode content = http.postMineru(settings, boundary, upload).path("results").path("rfq").path("content_list");
        if (!content.isTextual()) {
            throw new DocumentReadException("MinerU 响应缺少内容列表");
        }
        JsonNode entries = json.readTree(content.textValue());
        if (entries == null || !entries.isArray()) {
            throw new DocumentReadException("MinerU 内容列表格式异常");
        }

        List<RawBlock> blocks = new ArrayList<>();
        List<String> headings = new ArrayList<>();
        for (JsonNode entry : entries) {
            var page = entry.path("page_idx");
            if (!page.isIntegralNumber() || !page.canConvertToInt() || page.intValue() < 0 || page.intValue() == Integer.MAX_VALUE) {
                throw new DocumentReadException("MinerU 内容页码异常");
            }
            int pageNumber = page.intValue() + 1;
            String type = entry.path("type").asText();
            String text = entry.path("text").asText().strip();
            if ("text".equals(type) && !text.isBlank()) {
                updateHeadings(headings, entry.path("text_level").asInt(), text);
            }
            String section = String.join(" / ", headings.stream().filter(heading -> !heading.isBlank()).toList());
            switch (type) {
                case "text", "equation", "aside_text", "page_footnote" -> addText(blocks, text, section, pageNumber);
                case "list" -> addTextList(blocks, entry.path("list_items"), section, pageNumber);
                case "table" -> addTable(blocks, entry, section, pageNumber);
                case "image", "chart" -> {
                    addTextList(blocks, entry.path(type + "_caption"), section, pageNumber);
                    String visualContent = entry.path("content").asText();
                    if (visualContent.isBlank()) {
                        addBlock(blocks, RawBlock.IMAGE, "（图片或图表，待核对）", List.of(), section, pageNumber,
                            "MinerU 未提供图片或图表内部文字，请对照原件");
                    } else {
                        addText(blocks, visualContent, section, pageNumber);
                    }
                    addTextList(blocks, entry.path(type + "_footnote"), section, pageNumber);
                }
                case "code" -> addText(blocks, entry.path("code_body").asText(), section, pageNumber);
                default -> { }
            }
        }
        if (blocks.stream().noneMatch(block -> !RawBlock.IMAGE.equals(block.type()) && block.hasText())) {
            throw new DocumentReadException("MinerU 未返回可读取的正文或表格");
        }
        return blocks;
    }

    private static void addTable(List<RawBlock> blocks, JsonNode entry, String section, int page) throws IOException {
        addTextList(blocks, entry.path("table_caption"), section, page);
        var rows = MineruTableRows.read(entry.path("table_body").asText());
        if (rows.isEmpty()) {
            addBlock(blocks, RawBlock.IMAGE, "（表格，待核对）", List.of(), section, page,
                "MinerU 未识别到表格内容，请对照原件");
        } else {
            var table = RawBlock.table(blocks.size(), rows, section, anchor(page, blocks.size()));
            addBlock(blocks, table.type(), table.text(), rows, section, page, REVIEW);
        }
        addTextList(blocks, entry.path("table_footnote"), section, page);
    }

    private static void addTextList(List<RawBlock> blocks, JsonNode entries, String section, int page) {
        for (JsonNode entry : entries) {
            addText(blocks, entry.asText(), section, page);
        }
    }

    private static void addText(List<RawBlock> blocks, String text, String section, int page) {
        if (!text.isBlank()) {
            addBlock(blocks, RawBlock.PARAGRAPH, text.strip(), List.of(), section, page, REVIEW);
        }
    }

    private static void addBlock(List<RawBlock> blocks, String type, String text, List<List<String>> rows,
            String section, int page, String issue) {
        int index = blocks.size();
        blocks.add(new RawBlock(index, type, text, rows, section, null, anchor(page, index), PROVENANCE, issue));
    }

    private static void updateHeadings(List<String> headings, int level, String text) {
        if (level < 1 || level > 6) {
            return;
        }
        while (headings.size() >= level) {
            headings.remove(headings.size() - 1);
        }
        while (headings.size() < level - 1) {
            headings.add("");
        }
        headings.add(text);
    }

    private static String anchor(int page, int index) {
        return "page-" + page + "/mineru-" + index;
    }

    private static String field(String boundary, String name, String value) {
        return "--" + boundary + "\r\nContent-Disposition: form-data; name=\"" + name + "\"\r\n\r\n" + value + "\r\n";
    }
}
