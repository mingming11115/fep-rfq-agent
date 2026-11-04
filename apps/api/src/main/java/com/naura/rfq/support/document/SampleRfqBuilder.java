package com.naura.rfq.support.document;

import java.io.ByteArrayOutputStream;
import org.apache.poi.xwpf.usermodel.XWPFDocument;
import org.apache.poi.xwpf.usermodel.XWPFParagraph;
import org.apache.poi.xwpf.usermodel.XWPFRun;
import org.apache.poi.xwpf.usermodel.XWPFTable;
import org.springframework.stereotype.Component;

/**
 * Builds a representative customer RFQ so the parse chain can be exercised without
 * a real file from the customer. The structure mirrors the prototype sample.
 */
@Component
public class SampleRfqBuilder {

    public byte[] build() throws Exception {
        try (XWPFDocument document = new XWPFDocument();
                ByteArrayOutputStream output = new ByteArrayOutputStream()) {
            heading(document, "1 范围", 1);
            paragraph(document, "1.1 本文件规定了 2×660MW 机组锅炉给水泵的设计、制造、检验和验收要求。");
            paragraph(document, "1.2 本文件适用于电站锅炉给水泵及其驱动汽轮机。");

            heading(document, "2 技术要求", 1);
            heading(document, "2.1 性能参数", 2);
            paragraph(document, "2.1.1 额定工况下，给水泵流量不得低于 1200 m3/h，扬程不低于 2800 m。");
            paragraph(document, "2.1.2 泵体设计压力应不小于 32 MPa。");
            paragraph(document, "2.1.3 冷却水压力应为 0.3～0.5 MPa。");
            paragraph(document, "2.1.4 冷却水流量不得低于 20 L/min。");
            paragraph(document, "2.1.5 机组振动烈度不应大于 4.5 mm/s。");

            heading(document, "2.2 材料与密封", 2);
            paragraph(document, "2.2.1 泵壳材料应为铸钢，须提供材质证明书。");
            paragraph(document, "2.2.2 轴封采用机械密封，泄漏量不超过 5 mL/h。");
            paragraph(document, "2.2.3 噪声限值不应大于 85 dB。");

            paragraph(document, "主要性能参数如下表：");
            table(document);

            heading(document, "3 检验与试验", 1);
            paragraph(document, "3.1 每台泵应进行水力性能试验，试验结果须满足 2.1 条要求。");
            paragraph(document, "3.2 须提供无损检测报告，检测比例不低于 100%。");
            paragraph(document, "3.3 试验数据见附图 3-1。");

            heading(document, "4 交付与文件", 1);
            paragraph(document, "4.1 交货期为合同生效后 10 个月。");
            paragraph(document, "4.2 应提供中英文操作维护手册各 3 套。");
            paragraph(document, "4.3 随机备件清单须在合同签订后 30 天内提交。");

            heading(document, "5 商务条款", 1);
            paragraph(document, "5.1 质保期为最终验收后 24 个月。");
            paragraph(document, "5.2 付款条件为预付款 10%，到货验收后支付 80%，质保金 10%。");

            document.write(output);
            return output.toByteArray();
        }
    }

    private void heading(XWPFDocument document, String text, int level) {
        XWPFParagraph paragraph = document.createParagraph();
        paragraph.setStyle("Heading" + level);
        run(paragraph, text, true);
    }

    private void paragraph(XWPFDocument document, String text) {
        run(document.createParagraph(), text, false);
    }

    private void run(XWPFParagraph paragraph, String text, boolean bold) {
        XWPFRun run = paragraph.createRun();
        run.setText(text);
        run.setFontFamily("宋体");
        run.setBold(bold);
    }

    private void table(XWPFDocument document) {
        String[][] rows = {
                {"序号", "参数名称", "单位", "要求值"},
                {"1", "额定流量", "m3/h", "不低于 1200"},
                {"2", "额定扬程", "m", "不低于 2800"},
                {"3", "设计压力", "MPa", "不小于 32"},
                {"4", "效率", "%", "不低于 82"},
        };
        XWPFTable table = document.createTable(rows.length, 4);
        for (int row = 0; row < rows.length; row++) {
            for (int column = 0; column < rows[row].length; column++) {
                table.getRow(row).getCell(column).setText(rows[row][column]);
            }
        }
    }
}
