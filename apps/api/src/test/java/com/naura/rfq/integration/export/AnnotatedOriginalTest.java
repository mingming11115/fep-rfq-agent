package com.naura.rfq.integration.export;

import static org.assertj.core.api.Assertions.assertThat;

import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.util.List;
import org.apache.pdfbox.Loader;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.PDPage;
import org.apache.poi.xwpf.usermodel.TableRowHeightRule;
import org.apache.poi.xwpf.usermodel.XWPFDocument;
import org.junit.jupiter.api.Test;

class AnnotatedOriginalTest {
    @Test void wordSelectionPlacesTheAnswerInTheSelectedOccurrence() throws Exception {
        var original = new ByteArrayOutputStream();
        try (var document = new XWPFDocument()) {
            document.createParagraph().createRun().setText("提供安全联锁");
            document.createParagraph().createRun().setText("提供安全联锁");
            document.write(original);
        }
        var result = AnnotatedOriginal.wordWithAnswers(original.toByteArray(), List.of(
                new AnnotatedOriginal.Note("selection:word:1:0-1:18", "提供安全联锁", "答复：支持", true)));
        try (var copy = new XWPFDocument(new ByteArrayInputStream(result))) {
            assertThat(copy.getParagraphs()).extracting(paragraph -> paragraph.getText())
                .containsExactly("提供安全联锁", "提供安全联锁\n答复：支持");
        }
    }

    @Test void wordCommentsFollowTheSourceParagraphAndTableRow() throws Exception {
        var original = new ByteArrayOutputStream();
        try (var document = new XWPFDocument()) {
            document.createParagraph().createRun().setText("客户要求");
            var table = document.createTable(4, 2);
            table.getRow(0).getCell(0).setText("编号");
            table.getRow(1).getCell(0).setText("2.1");
            table.getRow(1).getCell(1).setText("安全联锁");
            table.getRow(2).getCell(0).setText("设备：须提供备用电源");
            table.getRow(3).getCell(0).setText("设备");
            table.getRow(3).getCell(1).setText("须提供备用电源");
            document.write(original);
        }
        var result = AnnotatedOriginal.word(original.toByteArray(), List.of(
                new AnnotatedOriginal.Note("body/0", "客户要求", "结论：Comply"),
                new AnnotatedOriginal.Note("body/1", "2.1 | 安全联锁", "答复：支持安全联锁"),
                new AnnotatedOriginal.Note("body/1", "设备：须提供备用电源", "答复：支持备用电源")));
        try (var copy = new XWPFDocument(new ByteArrayInputStream(result))) {
            assertThat(copy.getParagraphs().get(0).getText()).isEqualTo("客户要求");
            assertThat(copy.getComments()).extracting(comment -> comment.getText())
                    .containsExactly("结论：Comply", "答复：支持安全联锁", "答复：支持备用电源");
            assertThat(copy.getParagraphs().get(0).getCTP().getCommentRangeStartList()).hasSize(1);
            assertThat(copy.getTables().get(0).getRow(1).getCell(1).getParagraphs().get(0)
                    .getCTP().getCommentRangeStartList()).hasSize(1);
            assertThat(copy.getTables().get(0).getRow(2).getCell(0).getParagraphs().get(0)
                    .getCTP().getCommentRangeStartList()).hasSize(1);
        }
    }

    @Test void wordBodyKeepsTableAnswersOnTheirSourceRowInOrder() throws Exception {
        var original = new ByteArrayOutputStream();
        try (var document = new XWPFDocument()) {
            var table = document.createTable(2, 3);
            table.getRow(0).getCell(0).setText("编号");
            table.getRow(0).getCell(1).setText("客户要求");
            table.getRow(0).getCell(2).setText("版本");
            table.getRow(1).getCell(0).setText("2.1");
            table.getRow(1).getCell(1).setText("设备须支持安全联锁");
            table.getRow(1).getCell(2).setText("R2");
            table.getRow(1).setHeight(240);
            table.getRow(1).setHeightRule(TableRowHeightRule.EXACT);
            document.write(original);
        }
        var result = AnnotatedOriginal.wordWithAnswers(original.toByteArray(), List.of(
                new AnnotatedOriginal.Note("body/0", "2.1：设备须支持安全联锁：R2", "答复：支持安全联锁"),
                new AnnotatedOriginal.Note("body/0", "2.1 | 设备须支持安全联锁 | R2", "适用条件：选配安全模块")));
        try (var copy = new XWPFDocument(new ByteArrayInputStream(result))) {
            var table = copy.getTables().get(0);
            assertThat(table.getRow(0).getCell(1).getText()).isEqualTo("客户要求");
            assertThat(table.getRow(1).getCell(1).getText())
                    .isEqualTo("设备须支持安全联锁\n答复：支持安全联锁\n适用条件：选配安全模块");
            assertThat(table.getRow(1).getCell(2).getText()).isEqualTo("R2");
            assertThat(table.getRow(1).getHeight()).isEqualTo(240);
            assertThat(table.getRow(1).getHeightRule()).isEqualTo(TableRowHeightRule.AT_LEAST);
        }
    }

    @Test void indexedWordSourceKeepsAnAnswerOnTheReferencedIdenticalRow() throws Exception {
        var original = new ByteArrayOutputStream();
        try (var document = new XWPFDocument()) {
            var table = document.createTable(2, 2);
            for (var row : table.getRows()) {
                row.getCell(0).setText("额定负载");
                row.getCell(1).setText("5 kg");
            }
            document.write(original);
        }
        var result = AnnotatedOriginal.wordWithAnswers(original.toByteArray(), List.of(
                new AnnotatedOriginal.Note("body/0/r1", "额定负载 5 kg", "答复：满足", true)));
        try (var copy = new XWPFDocument(new ByteArrayInputStream(result))) {
            var rows = copy.getTables().get(0).getRows();
            assertThat(rows.get(0).getCell(0).getText()).isEqualTo("额定负载");
            assertThat(rows.get(1).getCell(0).getText()).isEqualTo("额定负载\n答复：满足");
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
