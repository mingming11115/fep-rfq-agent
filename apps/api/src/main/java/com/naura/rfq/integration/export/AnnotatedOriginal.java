package com.naura.rfq.integration.export;

import static com.naura.rfq.integration.parse.DocxBlockReader.nativeParagraphText;

import com.naura.rfq.common.exception.BusinessException;
import com.naura.rfq.integration.parse.DocxBlockReader;
import com.naura.rfq.integration.parse.WordSourceBody;
import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.math.BigInteger;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.regex.Pattern;
import java.util.stream.Collectors;
import org.apache.pdfbox.Loader;
import org.apache.pdfbox.pdmodel.common.PDRectangle;
import org.apache.pdfbox.pdmodel.interactive.annotation.PDAnnotationText;
import org.apache.poi.xwpf.usermodel.IBodyElement;
import org.apache.poi.xwpf.usermodel.TableRowHeightRule;
import org.apache.poi.xwpf.usermodel.XWPFComment;
import org.apache.poi.xwpf.usermodel.XWPFDocument;
import org.apache.poi.xwpf.usermodel.XWPFParagraph;
import org.apache.poi.xwpf.usermodel.XWPFTable;
import org.apache.poi.xwpf.usermodel.XWPFTableCell;
import org.apache.poi.xwpf.usermodel.XWPFTableRow;

/** Writes answers into a copy of the original, using the parser's source anchors. */
public final class AnnotatedOriginal {
    private static final String AUTHOR = "RFQ 正式应答";
    private static final Pattern PDF_PAGE = Pattern.compile("page-(\\d+)(?:/.*)?");
    private static final Pattern WORD_BODY = Pattern.compile("body/(\\d+)(?:/r(\\d+)/c(\\d+)(/table/0)?)?(?:/image-\\d+)?");
    private static final Pattern IMPORTED_PARAGRAPH = Pattern.compile("paragraph:(\\d+)");

    private AnnotatedOriginal() {}

    public record Note(String anchor, String quote, String text, boolean indexedWordSource) {
        public Note(String anchor, String quote, String text) {
            this(anchor, quote, text, false);
        }
    }

    public static byte[] wordWithAnswers(byte[] original, List<Note> notes) throws IOException {
        try (var document = new XWPFDocument(new ByteArrayInputStream(original));
             var output = new ByteArrayOutputStream()) {
            // Resolve every anchor before inserting text changes any table row's quote.
            var paragraphs = notes.stream().map(note -> locateWord(document, note, true)).toList();
            for (int index = 0; index < notes.size(); index++) {
                var paragraph = paragraphs.get(index);
                allowTableRowsToExpand(paragraph);
                var run = paragraph.createRun();
                for (String line : notes.get(index).text().split("\\R", -1)) {
                    run.addBreak();
                    run.setText(line);
                }
            }
            document.write(output);
            return output.toByteArray();
        }
    }

    private static void allowTableRowsToExpand(XWPFParagraph paragraph) {
        var body = paragraph.getBody();
        while (body instanceof XWPFTableCell cell) {
            var row = cell.getTableRow();
            if (row.getHeightRule() == TableRowHeightRule.EXACT) {
                row.setHeightRule(TableRowHeightRule.AT_LEAST);
            }
            body = row.getTable().getBody();
        }
    }

    public static byte[] word(byte[] original, List<Note> notes) throws IOException {
        try (var document = new XWPFDocument(new ByteArrayInputStream(original));
             var output = new ByteArrayOutputStream()) {
            var comments = document.getDocComments();
            if (comments == null) {
                comments = document.createComments();
            }
            BigInteger id = comments.getComments().stream().map(XWPFComment::getId).map(BigInteger::new)
                    .max(BigInteger::compareTo).orElse(BigInteger.valueOf(-1));
            for (var note : notes) {
                var paragraph = locateWord(document, note, false);
                id = id.add(BigInteger.ONE);
                var comment = comments.createComment(id);
                comment.setAuthor(AUTHOR);
                for (String line : note.text().split("\\R", -1)) comment.createParagraph().createRun().setText(line);
                var xml = paragraph.getCTP();
                var rangeStart = xml.addNewCommentRangeStart();
                rangeStart.setId(id);
                try (var start = rangeStart.newCursor(); var target = xml.newCursor()) {
                    if (target.toFirstChild() && (!xml.isSetPPr() || target.toNextSibling())
                            && !start.isAtSamePositionAs(target)) {
                        start.moveXml(target);
                    }
                }
                xml.addNewCommentRangeEnd().setId(id);
                paragraph.createRun().getCTR().addNewCommentReference().setId(id);
            }
            document.write(output);
            return output.toByteArray();
        }
    }

    private static XWPFParagraph locateWord(XWPFDocument document, Note note, boolean acceptRuleQuote) {
        if (note.indexedWordSource()) {
            return locateIndexedWord(document, note);
        }
        var imported = IMPORTED_PARAGRAPH.matcher(note.anchor());
        if (imported.matches()) {
            var element = at(document.getBodyElements(), Integer.parseInt(imported.group(1)), note);
            if (element instanceof XWPFParagraph paragraph && contains(paragraph.getText(), note.quote())) {
                return paragraph;
            }
            throw missingAnchor(note);
        }
        var body = WORD_BODY.matcher(note.anchor());
        if (!body.matches()) {
            throw missingAnchor(note);
        }
        IBodyElement element = at(document.getBodyElements(), Integer.parseInt(body.group(1)), note);
        if (element instanceof XWPFParagraph paragraph) {
            return paragraph;
        }
        if (!(element instanceof XWPFTable table)) {
            throw missingAnchor(note);
        }
        if (body.group(2) != null) {
            var row = at(table.getRows(), Integer.parseInt(body.group(2)), note);
            var cell = at(row.getTableCells(), Integer.parseInt(body.group(3)), note);
            if (body.group(4) == null) {
                var pictures = cell.getParagraphs().stream().filter(p -> p.getRuns().stream()
                        .anyMatch(run -> !run.getEmbeddedPictures().isEmpty())).toList();
                if (pictures.size() == 1) {
                    return pictures.get(0);
                }
                throw missingAnchor(note);
            }
            if (cell.getTables().size() != 1) {
                throw missingAnchor(note);
            }
            table = cell.getTables().get(0);
        }
        var matching = table.getRows().stream().filter(row -> rowContains(row, note.quote(), acceptRuleQuote)).toList();
        if (matching.size() != 1) {
            throw missingAnchor(note);
        }
        return matching.get(0).getTableCells().stream().flatMap(cell -> cell.getParagraphs().stream())
                .filter(paragraph -> !paragraph.getText().isBlank())
                .max(java.util.Comparator.comparingInt(paragraph -> paragraph.getText().length()))
                .orElseThrow(() -> missingAnchor(note));
    }

    private static XWPFParagraph locateIndexedWord(XWPFDocument document, Note note) {
        var parts = note.anchor().split("/");
        int index = 1;
        List<IBodyElement> elements = WordSourceBody.elements(document);
        if ("footnote".equals(parts[0]) || "endnote".equals(parts[0])) {
            var notes = "footnote".equals(parts[0]) ? document.getFootnotes() : document.getEndnotes();
            var normal = notes.stream().filter(item -> {
                var type = item.getCTFtnEdn().getType();
                return type == null || "normal".equals(type.toString());
            }).toList();
            elements = WordSourceBody.elements(at(normal, sourceIndex(parts[index++], "", note), note));
        } else if (!"body".equals(parts[0])) {
            throw missingAnchor(note);
        }
        while (index < parts.length) {
            var element = at(elements, sourceIndex(parts[index++], "", note), note);
            if (element instanceof XWPFParagraph paragraph) {
                if (index == parts.length && contains(nativeParagraphText(paragraph), note.quote())) {
                    return paragraph;
                }
                if (index == parts.length - 1 && parts[index].startsWith("image-")) {
                    int picture = sourceIndex(parts[index], "image-", note);
                    var pictures = paragraph.getRuns().stream().flatMap(run -> run.getEmbeddedPictures().stream()).toList();
                    at(pictures, picture, note);
                    return paragraph;
                }
            }
            if (element instanceof XWPFTable table && index < parts.length) {
                var row = at(table.getRows(), sourceIndex(parts[index++], "r", note), note);
                if (index == parts.length) {
                    var paragraphs = row.getTableCells().stream().flatMap(cell -> WordSourceBody.elements(cell).stream())
                            .filter(XWPFParagraph.class::isInstance).map(XWPFParagraph.class::cast).toList();
                    var quote = paragraphs.stream().map(DocxBlockReader::nativeParagraphText)
                            .collect(Collectors.joining(" "));
                    if (contains(quote, note.quote())) {
                        return paragraphs.stream().filter(p -> !p.getParagraphText().isBlank())
                                .max(java.util.Comparator.comparingInt(p -> p.getParagraphText().length()))
                                .orElseThrow(() -> missingAnchor(note));
                    }
                } else {
                    elements = WordSourceBody.elements(at(row.getTableCells(), sourceIndex(parts[index++], "c", note), note));
                    continue;
                }
            }
            throw missingAnchor(note);
        }
        throw missingAnchor(note);
    }

    private static int sourceIndex(String segment, String prefix, Note note) {
        if (!segment.startsWith(prefix) || !segment.substring(prefix.length()).matches("[0-9]{1,9}")) {
            throw missingAnchor(note);
        }
        return Integer.parseInt(segment.substring(prefix.length()));
    }

    private static boolean rowContains(XWPFTableRow row, String quote, boolean acceptRuleQuote) {
        var cells = row.getTableCells().stream().map(XWPFTableCell::getText).toList();
        return contains(String.join(" ", cells), quote)
                || acceptRuleQuote && contains(cells.stream().filter(cell -> !cell.isBlank()).collect(Collectors.joining("：")), quote);
    }

    private static boolean contains(String text, String quote) {
        String needle = quote.replaceAll("[\\s\\p{Zs}|]+", "");
        return !needle.isEmpty() && text.replaceAll("[\\s\\p{Zs}|]+", "").contains(needle);
    }

    private static <T> T at(List<T> list, int index, Note note) {
        if (index >= list.size()) {
            throw missingAnchor(note);
        }
        return list.get(index);
    }

    public static byte[] pdf(byte[] original, List<Note> notes) throws IOException {
        try (var document = Loader.loadPDF(original); var output = new ByteArrayOutputStream()) {
            Map<Integer, Integer> notesPerPage = new HashMap<>();
            for (var note : notes) {
                var match = PDF_PAGE.matcher(note.anchor());
                if (!match.matches()) {
                    throw missingAnchor(note);
                }
                int pageNumber = Integer.parseInt(match.group(1));
                if (pageNumber < 1 || pageNumber > document.getNumberOfPages()) {
                    throw missingAnchor(note);
                }
                var page = document.getPage(pageNumber - 1);
                var box = page.getCropBox();
                int index = notesPerPage.merge(pageNumber, 1, Integer::sum) - 1;
                int perColumn = Math.max(1, (int) ((box.getHeight() - 12) / 20));
                float x = Math.max(box.getLowerLeftX(), box.getUpperRightX() - 24 - 20 * (index / perColumn));
                float y = Math.max(box.getLowerLeftY(), box.getUpperRightY() - 24 - 20 * (index % perColumn));
                var annotation = new PDAnnotationText();
                annotation.setName(PDAnnotationText.NAME_COMMENT);
                annotation.setTitlePopup(AUTHOR);
                annotation.setContents(note.text() + "\n客户原文：" + note.quote());
                annotation.setRectangle(new PDRectangle(x, y, 18, 18));
                annotation.setPage(page);
                page.getAnnotations().add(annotation);
            }
            document.save(output);
            return output.toByteArray();
        }
    }

    private static BusinessException missingAnchor(Note note) {
        return new BusinessException(409, "无法在原件定位条款：" + note.quote());
    }
}
