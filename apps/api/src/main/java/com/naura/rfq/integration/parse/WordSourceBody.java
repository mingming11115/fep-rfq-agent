package com.naura.rfq.integration.parse;

import java.util.ArrayList;
import java.util.List;
import org.apache.poi.xwpf.usermodel.IBody;
import org.apache.poi.xwpf.usermodel.IBodyElement;
import org.apache.poi.xwpf.usermodel.XWPFAbstractFootnoteEndnote;
import org.apache.poi.xwpf.usermodel.XWPFDocument;
import org.apache.poi.xwpf.usermodel.XWPFParagraph;
import org.apache.poi.xwpf.usermodel.XWPFTable;
import org.apache.poi.xwpf.usermodel.XWPFTableCell;
import org.apache.xmlbeans.XmlObject;
import org.openxmlformats.schemas.wordprocessingml.x2006.main.CTP;
import org.openxmlformats.schemas.wordprocessingml.x2006.main.CTSdtBlock;
import org.openxmlformats.schemas.wordprocessingml.x2006.main.CTTbl;

/** The editor displays block content controls as their constituent paragraphs and tables. */
public final class WordSourceBody {
    private WordSourceBody() { }

    public static List<IBodyElement> elements(IBody body) {
        XmlObject xml;
        if (body instanceof XWPFDocument document) {
            xml = document.getDocument().getBody();
        } else if (body instanceof XWPFTableCell cell) {
            xml = cell.getCTTc();
        } else if (body instanceof XWPFAbstractFootnoteEndnote note) {
            xml = note.getCTFtnEdn();
        } else {
            throw new IllegalArgumentException("Unsupported Word source story");
        }
        var elements = new ArrayList<IBodyElement>();
        readElements(body, xml, elements);
        return elements;
    }

    private static void readElements(IBody body, XmlObject xml, List<IBodyElement> elements) {
        try (var cursor = xml.newCursor()) {
            cursor.selectPath("./*");
            while (cursor.toNextSelection()) {
                var node = cursor.getObject();
                if (node instanceof CTP paragraph) {
                    elements.add(new XWPFParagraph(paragraph, body));
                } else if (node instanceof CTTbl table) {
                    elements.add(new XWPFTable(table, body, false));
                } else if (node instanceof CTSdtBlock control && control.getSdtContent() != null) {
                    readElements(body, control.getSdtContent(), elements);
                }
            }
        }
    }
}
