package com.naura.rfq.parse;

import java.io.InputStream;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import java.util.stream.Collectors;
import org.apache.poi.xwpf.usermodel.IBodyElement;
import org.apache.poi.xwpf.usermodel.XWPFDocument;
import org.apache.poi.xwpf.usermodel.XWPFParagraph;
import org.apache.poi.xwpf.usermodel.XWPFRun;
import org.apache.poi.xwpf.usermodel.XWPFTable;
import org.apache.poi.xwpf.usermodel.XWPFTableCell;
import org.apache.poi.xwpf.usermodel.XWPFTableRow;
import org.springframework.stereotype.Component;

/**
 * Reads DOCX body content in document order. Paragraph and table anchors are used
 * instead of page numbers because Word pagination depends on the rendering environment.
 */
@Component
@lombok.RequiredArgsConstructor
public class DocxBlockReader implements DocumentBlockReader {

    private final OcrClient ocr;

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
            throw new DocumentReadException("DOCX 读取失败，请确认文件完整且未加密", exception);
        }
    }

    private void readBody(List<IBodyElement> elements, List<RawBlock> blocks, List<String> sections,
            int[] images, String parentAnchor) {
        int elementIndex = 0;
        for (IBodyElement element : elements) {
            String anchor = parentAnchor + "/" + elementIndex++;
            if (element instanceof XWPFParagraph paragraph) {
                String text = clean(paragraph.getText());
                int level = headingLevel(paragraph.getStyle());
                if (level > 0 && !text.isBlank()) applyHeading(sections, level, text);
                if (!text.isBlank()) blocks.add(RawBlock.paragraph(blocks.size(), text, sectionPath(sections), null, anchor));
                readPictures(paragraph, blocks, sections, images, anchor);
            } else if (element instanceof XWPFTable table) {
                List<List<String>> rows = new ArrayList<>();
                for (XWPFTableRow row : table.getRows()) {
                    List<String> cells = row.getTableCells().stream().map(c -> clean(c.getText())).toList();
                    if (cells.stream().anyMatch(c -> !c.isBlank())) rows.add(cells);
                }
                if (!rows.isEmpty()) blocks.add(RawBlock.table(blocks.size(), rows, sectionPath(sections), anchor));
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

    private void readPictures(XWPFParagraph paragraph, List<RawBlock> blocks, List<String> sections,
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
                if (data == null) blocks.add(ocr.pending(blocks.size(), sectionPath(sections), location, "图片数据缺失，待人工核对"));
                else blocks.add(ocr.recognise(blocks.size(), data.getData(), data.getPackagePart().getContentType(), sectionPath(sections), location));
            }
        }
    }

    /** Heading style ids look like "1", "Heading2" or a localized style name containing 标题. */
    private int headingLevel(String style) {
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

    private void applyHeading(List<String> sections, int level, String text) {
        while (sections.size() < level) {
            sections.add("");
        }
        sections.set(level - 1, text);
        while (sections.size() > level) {
            sections.remove(sections.size() - 1);
        }
    }

    private String sectionPath(List<String> sections) {
        String joined = sections.stream().filter(part -> !part.isBlank()).collect(Collectors.joining(" / "));
        return joined.length() > 480 ? joined.substring(0, 480) : joined;
    }

    private String clean(String raw) {
        if (raw == null) {
            return "";
        }
        return raw.replace('\u00a0', ' ')
                .replaceAll("[\\t\\r]+", " ")
                .replaceAll(" ?\\n ?", " ")
                .replaceAll(" {2,}", " ")
                .trim();
    }
}
