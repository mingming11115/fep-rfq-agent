package com.naura.rfq.integration.export;

import com.naura.rfq.common.exception.BusinessException;
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
import org.apache.poi.xwpf.usermodel.XWPFComment;
import org.apache.poi.xwpf.usermodel.XWPFDocument;
import org.apache.poi.xwpf.usermodel.XWPFParagraph;
import org.apache.poi.xwpf.usermodel.XWPFTable;
import org.apache.poi.xwpf.usermodel.XWPFTableCell;
import org.apache.poi.xwpf.usermodel.XWPFTableRow;

/** Writes a copy of the original with native comments, using the parser's source anchors. */
public final class AnnotatedOriginal {
    private static final String AUTHOR = "RFQ 正式应答";
    private static final Pattern PDF_PAGE = Pattern.compile("page-(\\d+)(?:/.*)?");
    private static final Pattern WORD_BODY = Pattern.compile("body/(\\d+)(?:/r(\\d+)/c(\\d+)(/table/0)?)?(?:/image-\\d+)?");
    private static final Pattern IMPORTED_PARAGRAPH = Pattern.compile("paragraph:(\\d+)");

    private AnnotatedOriginal() {}

    public record Note(String anchor, String quote, String text) {}

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
                var paragraph = locateWord(document, note);
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

    private static XWPFParagraph locateWord(XWPFDocument document, Note note) {
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
        var matching = table.getRows().stream().filter(row -> contains(rowText(row), note.quote())).toList();
        if (matching.size() != 1) {
            throw missingAnchor(note);
        }
        return matching.get(0).getTableCells().stream().flatMap(cell -> cell.getParagraphs().stream())
                .filter(paragraph -> !paragraph.getText().isBlank())
                .max(java.util.Comparator.comparingInt(paragraph -> paragraph.getText().length()))
                .orElseThrow(() -> missingAnchor(note));
    }

    private static String rowText(XWPFTableRow row) {
        return row.getTableCells().stream().map(XWPFTableCell::getText).collect(Collectors.joining(" "));
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
        return new BusinessException(409, "无法在原件定位条款批注：" + note.quote());
    }
}
