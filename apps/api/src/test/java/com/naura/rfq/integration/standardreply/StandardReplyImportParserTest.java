package com.naura.rfq.integration.standardreply;

import com.naura.rfq.common.exception.BusinessException;
import java.io.ByteArrayOutputStream;
import java.nio.charset.StandardCharsets;
import org.apache.poi.hssf.usermodel.HSSFWorkbook;
import org.apache.poi.ss.usermodel.Sheet;
import org.apache.poi.ss.usermodel.Workbook;
import org.apache.poi.xssf.usermodel.XSSFWorkbook;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.mock.web.MockMultipartFile;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class StandardReplyImportParserTest {
    private final StandardReplyImportParser parser = new StandardReplyImportParser();

    @Test
    void csvPreservesQuotedContentAndReportsPhysicalSourceRows() {
        String csv = "\uFEFF回复标题,客户要求,标准回复,适用条件\r\n"
                + "\"支持,模式 A\",必须可配置,\"支持\"\"模式 A\"\"\r\n需启用模块\",限定配置\r\n"
                + ",,,\r\n"
                + "缺少答复,要求,,条件\r\n"
                + "测试标题,要求,答复,条件\r\n";
        var parsed = parser.parse(upload("C:\\fakepath\\回复.csv", csv));
        assertThat(parsed.filename()).isEqualTo("回复.csv");
        assertThat(parsed.sha256()).matches("[0-9a-f]{64}");
        assertThat(parsed.rows()).containsExactly(
                new StandardReplyImportParser.ImportRow(2, "支持,模式 A", "必须可配置", "支持\"模式 A\"\n需启用模块", "限定配置"),
                new StandardReplyImportParser.ImportRow(6, "测试标题", "要求", "答复", "条件"));
        assertThat(parsed.errors()).singleElement().satisfies(error -> {
            assertThat(error.rowNumber()).isEqualTo(5);
            assertThat(error.message()).contains("标准回复");
        });
    }

    @ParameterizedTest
    @ValueSource(strings = {"xls", "xlsx"})
    void excelReadsRealCellsByHeaderAndRejectsFormulaRows(String format) throws Exception {
        try (Workbook workbook = format.equals("xls") ? new HSSFWorkbook() : new XSSFWorkbook()) {
            Sheet sheet = workbook.createSheet("标准回复");
            writeRow(sheet, 0, "conditions", "answer", "title", "requirement");
            writeRow(sheet, 2, "适用条件", "真实答复", "导入条目", "实际要求");
            writeRow(sheet, 3, "条件", "", "公式条目", "实际要求");
            sheet.getRow(3).getCell(1).setCellFormula("1+1");
            var parsed = parser.parse(excel("标准回复." + format, workbook));
            assertThat(parsed.rows()).containsExactly(
                    new StandardReplyImportParser.ImportRow(3, "导入条目", "实际要求", "真实答复", "适用条件"));
            assertThat(parsed.errors()).singleElement().satisfies(error -> {
                assertThat(error.rowNumber()).isEqualTo(4);
                assertThat(error.message()).contains("标准回复", "公式");
            });
        }
    }

    @Test
    void missingHeaderAndMalformedCsvAreRejected() {
        assertThatThrownBy(() -> parser.parse(upload("reply.csv", "回复标题,客户要求,适用条件\n甲,乙,丙")))
                .isInstanceOf(BusinessException.class).hasMessageContaining("标准回复");
        assertThatThrownBy(() -> parser.parse(upload("reply.csv", "回复标题,客户要求,标准回复,适用条件\n甲,乙,\"未结束,丙")))
                .isInstanceOf(BusinessException.class).hasMessageContaining("CSV");
        assertThatThrownBy(() -> parser.parse(new MockMultipartFile("file", "reply.csv", "text/csv", new byte[]{(byte) 0xC3})))
                .isInstanceOf(BusinessException.class).hasMessageContaining("UTF-8");
    }

    @Test
    void limitsRowsAndReportsOverlongFieldWithoutDiscardingValidRows() {
        String header = "回复标题,客户要求,标准回复,适用条件\n";
        assertThatThrownBy(() -> parser.parse(upload("reply.csv", header + "甲,乙,丙,丁\n".repeat(1001))))
                .isInstanceOf(BusinessException.class).hasMessageContaining("1000");
        var parsed = parser.parse(upload("reply.csv", header + "过".repeat(201) + ",乙,丙,丁\n甲,乙,丙,丁"));
        assertThat(parsed.rows()).extracting(StandardReplyImportParser.ImportRow::rowNumber).containsExactly(3);
        assertThat(parsed.errors()).singleElement().satisfies(error -> {
            assertThat(error.rowNumber()).isEqualTo(2);
            assertThat(error.message()).contains("回复标题", "200");
        });
    }

    private static MockMultipartFile upload(String filename, String contents) {
        return new MockMultipartFile("file", filename, "text/csv", contents.getBytes(StandardCharsets.UTF_8));
    }

    private static MockMultipartFile excel(String filename, Workbook workbook) throws Exception {
        ByteArrayOutputStream bytes = new ByteArrayOutputStream();
        workbook.write(bytes);
        return new MockMultipartFile("file", filename, "application/octet-stream", bytes.toByteArray());
    }

    private static void writeRow(Sheet sheet, int rowIndex, String... values) {
        var row = sheet.createRow(rowIndex);
        for (int column = 0; column < values.length; column++) {
            row.createCell(column).setCellValue(values[column]);
        }
    }
}
