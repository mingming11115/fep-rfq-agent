package com.naura.rfq.model.parse;

import com.fasterxml.jackson.annotation.JsonIgnore;
import java.math.BigInteger;
import java.util.List;
import java.util.stream.Collectors;

/**
 * A readable unit produced by the document readers and shared by every extractor.
 * Paragraph and image blocks carry text; table blocks additionally carry logical rows.
 */
public record RawBlock(
        int index,
        String type,
        String text,
        List<List<String>> tableRows,
        String sectionPath,
        String clauseNo,
        String anchor,
        String provenance,
        String issue,
        @JsonIgnore ParagraphLayout paragraphLayout,
        @JsonIgnore MineruTable mineruTable) {

    public static final String PARAGRAPH = "paragraph";
    public static final String TABLE = "table";
    public static final String IMAGE = "image";

    public record ParagraphLayout(int textStartTwips, int headingLevel, BigInteger listId, int listLevel) { }
    public record MineruTable(String html, int pageIndex, List<Integer> sourceRows, List<List<String>> sourceCells) { }

    public RawBlock(int index, String type, String text, List<List<String>> tableRows,
            String sectionPath, String clauseNo, String anchor, String provenance, String issue,
            ParagraphLayout paragraphLayout) {
        this(index, type, text, tableRows, sectionPath, clauseNo, anchor, provenance, issue, paragraphLayout, null);
    }

    public RawBlock(int index, String type, String text, List<List<String>> tableRows,
            String sectionPath, String clauseNo, String anchor, String provenance, String issue) {
        this(index, type, text, tableRows, sectionPath, clauseNo, anchor, provenance, issue, null);
    }

    public RawBlock(int index, String type, String text, List<List<String>> tableRows,
            String sectionPath, String clauseNo, String anchor) {
        this(index, type, text, tableRows, sectionPath, clauseNo, anchor, "native", null);
    }

    public static RawBlock paragraph(int index, String text, String sectionPath, String clauseNo, String anchor) {
        return new RawBlock(index, PARAGRAPH, text, List.of(), sectionPath, clauseNo, anchor);
    }

    public static RawBlock wordParagraph(int index, String text, String sectionPath, String anchor, ParagraphLayout layout) {
        return new RawBlock(index, PARAGRAPH, text, List.of(), sectionPath, null, anchor, "native", null, layout);
    }

    public static RawBlock table(int index, List<List<String>> rows, String sectionPath, String anchor) {
        String flattened = rows.stream()
                .map(row -> String.join(" | ", row))
                .collect(Collectors.joining("\n"));
        return new RawBlock(index, TABLE, flattened, rows, sectionPath, null, anchor);
    }

    public static RawBlock image(int index, String caption, String sectionPath, String anchor) {
        return new RawBlock(index, IMAGE, caption, List.of(), sectionPath, null, anchor);
    }

    public boolean isTable() {
        return TABLE.equals(type);
    }

    public boolean hasText() {
        return text != null && !text.isBlank();
    }
}
