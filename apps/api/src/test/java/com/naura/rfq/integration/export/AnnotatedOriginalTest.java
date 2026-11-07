package com.naura.rfq.integration.export;

import static org.assertj.core.api.Assertions.assertThat;

import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.util.List;
import org.apache.pdfbox.Loader;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.PDPage;
import org.apache.poi.xwpf.usermodel.XWPFDocument;
import org.junit.jupiter.api.Test;

class AnnotatedOriginalTest {
    @Test void wordCommentsFollowTheSourceParagraphAndTableRow() throws Exception {
        var original = new ByteArrayOutputStream();
        try (var document = new XWPFDocument()) {
            document.createParagraph().createRun().setText("客户要求");
            var table = document.createTable(2, 2);
            table.getRow(0).getCell(0).setText("编号");
            table.getRow(1).getCell(0).setText("2.1");
            table.getRow(1).getCell(1).setText("安全联锁");
            document.write(original);
        }
        var result = AnnotatedOriginal.word(original.toByteArray(), List.of(
                new AnnotatedOriginal.Note("body/0", "客户要求", "结论：Comply"),
                new AnnotatedOriginal.Note("body/1", "2.1 | 安全联锁", "答复：支持安全联锁")));
        try (var copy = new XWPFDocument(new ByteArrayInputStream(result))) {
            assertThat(copy.getParagraphs().get(0).getText()).isEqualTo("客户要求");
            assertThat(copy.getComments()).extracting(comment -> comment.getText())
                    .containsExactly("结论：Comply", "答复：支持安全联锁");
            assertThat(copy.getParagraphs().get(0).getCTP().getCommentRangeStartList()).hasSize(1);
            assertThat(copy.getTables().get(0).getRow(1).getCell(1).getParagraphs().get(0)
                    .getCTP().getCommentRangeStartList()).hasSize(1);
        }
    }

    @Test void pdfKeepsTheOriginalPagesAndAddsTheNoteOnItsSourcePage() throws Exception {
        var original = new ByteArrayOutputStream();
        try (var document = new PDDocument()) {
            document.addPage(new PDPage());
            document.addPage(new PDPage());
            document.save(original);
        }
        var result = AnnotatedOriginal.pdf(original.toByteArray(), List.of(
                new AnnotatedOriginal.Note("page-2", "安全联锁", "结论：有条件 Comply\n适用条件：选配")));
        try (var copy = Loader.loadPDF(result)) {
            assertThat(copy.getNumberOfPages()).isEqualTo(2);
            assertThat(copy.getPage(0).getAnnotations()).isEmpty();
            assertThat(copy.getPage(1).getAnnotations()).singleElement()
                    .satisfies(note -> assertThat(note.getContents()).contains("适用条件：选配"));
        }
    }
}
