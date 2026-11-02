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
public class DocxBlockReader implements DocumentBlockReader {

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
            int index = 0;
            for (IBodyElement element : document.getBodyElements()) {
                if (element instanceof XWPFParagraph paragraph) {
                    String text = clean(paragraph.getText());
                    if (text.isBlank()) {
                        if (hasPicture(paragraph)) {
                            blocks.add(RawBlock.image(index, "（图片，待识别）", sectionPath(sections), "p" + index));
                            index++;
                        }
                        continue;
                    }
                    int level = headingLevel(paragraph.getStyle());
                    if (level > 0) {
                        applyHeading(sections, level, text);
                    }
                    blocks.add(RawBlock.paragraph(index, text, sectionPath(sections), null, "p" + index));
                    index++;
                } else if (element instanceof XWPFTable table) {
                    List<List<String>> rows = new ArrayList<>();
                    for (XWPFTableRow row : table.getRows()) {
                        List<String> cells = row.getTableCells().stream()
                                .map(cell -> clean(cell.getText()))
                                .collect(Collectors.toList());
                        if (cells.stream().anyMatch(cell -> !cell.isBlank())) {
                            rows.add(cells);
                        }
                    }
                    if (!rows.isEmpty()) {
                        blocks.add(RawBlock.table(index, rows, sectionPath(sections), "t" + index));
                        index++;
                    }
                }
            }
            return blocks;
        } catch (Exception exception) {
            throw new DocumentReadException("DOCX 读取失败：" + exception.getMessage(), exception);
        }
    }

    private boolean hasPicture(XWPFParagraph paragraph) {
        for (XWPFRun run : paragraph.getRuns()) {
            if (!run.getEmbeddedPictures().isEmpty()) {
                return true;
            }
        }
        return false;
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
