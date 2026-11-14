package com.naura.rfq.integration.parse;

import com.naura.rfq.model.parse.RawBlock;
import java.io.InputStream;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import java.util.stream.Collectors;
import lombok.AllArgsConstructor;
import lombok.NoArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.apache.poi.xwpf.usermodel.IBodyElement;
import org.apache.poi.xwpf.usermodel.XWPFDocument;
import org.apache.poi.xwpf.usermodel.XWPFParagraph;
import org.apache.poi.xwpf.usermodel.XWPFRun;
import org.apache.poi.xwpf.usermodel.XWPFTable;
import org.apache.poi.xwpf.usermodel.XWPFTableCell;
import org.apache.poi.xwpf.usermodel.XWPFTableRow;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;

/**
 * Reads DOCX body content in document order. Paragraph and table anchors are used
 * instead of page numbers because Word pagination depends on the rendering environment.
 */
@Component
@NoArgsConstructor
@AllArgsConstructor
@Slf4j
public class DocxBlockReader implements DocumentBlockReader {

    @Autowired
    private OcrClient ocr;

    private static final Pattern LEVEL = Pattern.compile("(\\d+)");

    @Override
    public boolean supports(String filename, String contentType) {
        String name = filename == null ? "" : filename.toLowerCase(Locale.ROOT);
        return name.endsWith(".docx") || (contentType != null && contentType.contains("wordprocessingml"));
    }

    @Override
    public List<RawBlock> read(Path file) throws DocumentReadException {
        try (InputStream input = Files.newInputStream(file);
                XWPFDocument document = new XWPFDocument(input)) {
            List<RawBlock> blocks = new ArrayList<>();
            List<String> sections = new ArrayList<>();
            int[] images = {0};
            readBody(document.getBodyElements(), blocks, sections, images, "body");
            return blocks;
        } catch (Exception exception) {
            log.error("读取 DOCX 文档失败 errorType={}", exception.getClass().getSimpleName());
            throw new DocumentReadException("DOCX 读取失败，请确认文件完整且未加密", exception);
        }
    }

    private void readBody(List<IBodyElement> elements, List<RawBlock> blocks, List<String> sections,
            int[] images, String parentAnchor) {
        int elementIndex = 0;
        for (IBodyElement element : elements) {
            String anchor = parentAnchor + "/" + elementIndex++;
            if (element instanceof XWPFParagraph paragraph) {
                String rawText = paragraph.getText();
                String text = clean(rawText);
                var layout = WordParagraphLayout.read(paragraph, rawText, headingLevel(paragraph.getStyle()));
                int level = layout.headingLevel();
                if (level > 0 && !text.isBlank()) {
                    applyHeading(sections, level, text);
                }
                if (!text.isBlank()) {
                    blocks.add(RawBlock.wordParagraph(blocks.size(), text, sectionPath(sections), anchor, layout));
                }
                readPictures(paragraph, blocks, sections, images, anchor);
            } else if (element instanceof XWPFTable table) {
                List<List<String>> rows = new ArrayList<>();
                for (XWPFTableRow row : table.getRows()) {
                    List<String> cells = row.getTableCells().stream().map(c -> clean(c.getText())).toList();
                    if (cells.stream().anyMatch(c -> !c.isBlank())) {
                        rows.add(cells);
                    }
                }
                if (!rows.isEmpty()) {
                    blocks.add(RawBlock.table(blocks.size(), rows, sectionPath(sections), anchor));
                }
                int rowIndex = 0;
                for (XWPFTableRow row : table.getRows()) {
                    int cellIndex = 0;
                    for (XWPFTableCell cell : row.getTableCells()) {
                        String cellAnchor = anchor + "/r" + rowIndex + "/c" + cellIndex++;
                        for (XWPFParagraph paragraph : cell.getParagraphs()) readPictures(paragraph, blocks, sections, images, cellAnchor);
                        for (XWPFTable nested : cell.getTables()) readBody(List.of(nested), blocks, sections, images, cellAnchor + "/table");
                    }
                    rowIndex++;
                }
            }
        }
    }

    void readPictures(XWPFParagraph paragraph, List<RawBlock> blocks, List<String> sections,
            int[] images, String anchor) {
        int pictureIndex = 0;
        for (XWPFRun run : paragraph.getRuns()) {
            for (var picture : run.getEmbeddedPictures()) {
                String location = anchor + "/image-" + pictureIndex++;
                if (++images[0] > ocr.maxImages()) {
                    blocks.add(ocr.pending(blocks.size(), sectionPath(sections), location, "图片超过 OCR 数量上限，待人工核对"));
                    continue;
                }
                var data = picture.getPictureData();
                if (data == null) {
                    blocks.add(ocr.pending(blocks.size(), sectionPath(sections), location, "图片数据缺失，待人工核对"));
                } else {
                    blocks.add(ocr.recognise(blocks.size(), data.getData(), data.getPackagePart().getContentType(), sectionPath(sections), location));
                }
            }
        }
    }

    /** Heading style ids look like "1", "Heading2" or a localized style name containing 标题. */
    static int headingLevel(String style) {
        if (style == null || style.isBlank()) {
            return 0;
        }
        String lower = style.toLowerCase(Locale.ROOT);
        if (!lower.startsWith("heading") && !style.contains("标题") && !lower.equals("title")) {
            return 0;
        }
        Matcher matcher = LEVEL.matcher(lower);
        if (matcher.find()) {
            return Math.min(Integer.parseInt(matcher.group(1)), 6);
        }
        return 1;
    }

    static void applyHeading(List<String> sections, int level, String text) {
        while (sections.size() < level) {
            sections.add("");
        }
        sections.set(level - 1, text);
        while (sections.size() > level) {
            sections.remove(sections.size() - 1);
        }
    }

    static String sectionPath(List<String> sections) {
        String joined = sections.stream().filter(part -> !part.isBlank()).collect(Collectors.joining(" / "));
        return joined.length() > 480 ? joined.substring(0, 480) : joined;
    }

    static String clean(String raw) {
        if (raw == null) {
            return "";
        }
        return raw.replace('\u00a0', ' ')
                .replaceAll("[\\t\\r]+", " ")
                .replaceAll(" ?\\n ?", " ")
                .replaceAll(" {2,}", " ")
                .trim();
    }

    public static String nativeParagraphText(XWPFParagraph paragraph) {
        return paragraph.getParagraphText().replaceAll("\\[(?:footnote|endnote)Ref:-?\\d+]", "");
    }
}
