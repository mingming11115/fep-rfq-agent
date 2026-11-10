package com.naura.rfq.integration.parse;

import com.naura.rfq.model.parse.RawBlock.ParagraphLayout;
import java.math.BigInteger;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Objects;
import java.util.TreeSet;
import java.util.function.Function;
import javax.xml.namespace.QName;
import org.apache.poi.xwpf.usermodel.XWPFParagraph;
import org.openxmlformats.schemas.wordprocessingml.x2006.main.CTInd;
import org.openxmlformats.schemas.wordprocessingml.x2006.main.CTLvl;
import org.openxmlformats.schemas.wordprocessingml.x2006.main.CTPPrBase;

final class WordParagraphLayout {
    private static final int DEFAULT_TAB_TWIPS = 720;
    private static final String WORD_NS = "http://schemas.openxmlformats.org/wordprocessingml/2006/main";

    private WordParagraphLayout() { }

    static ParagraphLayout read(XWPFParagraph paragraph, String text, int styleHeadingLevel) {
        var listId = paragraph.getNumID();
        var wordListLevel = paragraph.getNumIlvl();
        int listLevel = wordListLevel == null ? 0 : wordListLevel.intValue();
        var properties = new ArrayList<CTPPrBase>();
        properties.add(paragraph.getCTP().getPPr());
        var numberingLevel = numberingLevel(paragraph, listId, listLevel);
        if (numberingLevel != null) {
            properties.add(numberingLevel.getPPr());
        }
        var styles = paragraph.getDocument().getStyles();
        var visited = new HashSet<String>();
        for (String id = paragraph.getStyle(); styles != null && id != null && visited.add(id);) {
            var style = styles.getStyle(id);
            if (style == null) {
                break;
            }
            properties.add(style.getCTStyle().getPPr());
            id = style.getBasisStyleID();
        }
        properties.removeIf(Objects::isNull);

        var indents = properties.stream().map(CTPPrBase::getInd).filter(Objects::nonNull).toList();
        int position = indent(indents, ind -> ind.getStart() == null ? ind.getLeft() : ind.getStart());
        if (listId == null) {
            position += indent(indents, ind -> ind.getFirstLine() == null
                    ? negate(twips(ind.getHanging())) : ind.getFirstLine());
        }

        var tabs = new TreeSet<Integer>();
        for (int index = properties.size() - 1; index >= 0; index--) {
            var property = properties.get(index);
            if (property.getTabs() == null) {
                continue;
            }
            for (var tab : property.getTabs().getTabList()) {
                Integer stop = twips(tab.getPos());
                String kind = Objects.toString(tab.getVal(), "");
                if (stop == null || "bar".equals(kind)) {
                    continue;
                }
                if ("clear".equals(kind)) {
                    tabs.remove(stop);
                } else {
                    tabs.add(stop);
                }
            }
        }
        int interval = defaultTab(paragraph);
        for (int i = 0; i < text.length(); i++) {
            char character = text.charAt(i);
            if (character == '\t') {
                Integer next = tabs.higher(position);
                position = next == null ? (Math.floorDiv(position, interval) + 1) * interval : next;
            } else if (character != ' ' && character != '\u00a0') {
                break;
            }
        }
        int heading = properties.stream().map(CTPPrBase::getOutlineLvl).filter(Objects::nonNull)
                .map(level -> level.getVal()).filter(Objects::nonNull)
                .mapToInt(level -> level.intValue() < 9 ? level.intValue() + 1 : 0)
                .findFirst().orElse(styleHeadingLevel);
        return new ParagraphLayout(position, heading, listId, listLevel);
    }

    private static int defaultTab(XWPFParagraph paragraph) {
        var settings = paragraph.getDocument().getSettings();
        if (settings != null) {
            try (var cursor = settings.getCTSettings().newCursor()) {
                if (cursor.toChild(new QName(WORD_NS, "defaultTabStop"))) {
                    Integer interval = twips(cursor.getAttributeText(new QName(WORD_NS, "val")));
                    if (interval != null && interval > 0) {
                        return interval;
                    }
                }
            }
        }
        return DEFAULT_TAB_TWIPS;
    }

    private static CTLvl numberingLevel(XWPFParagraph paragraph, BigInteger listId, int level) {
        var numbering = paragraph.getDocument().getNumbering();
        if (numbering == null || listId == null || numbering.getNum(listId) == null) {
            return null;
        }
        var num = numbering.getNum(listId).getCTNum();
        for (var override : num.getLvlOverrideList()) {
            if (BigInteger.valueOf(level).equals(override.getIlvl()) && override.getLvl() != null) {
                return override.getLvl();
            }
        }
        var definition = num.getAbstractNumId() == null ? null : numbering.getAbstractNum(num.getAbstractNumId().getVal());
        if (definition == null) {
            return null;
        }
        return definition.getCTAbstractNum().getLvlList().stream()
                .filter(candidate -> BigInteger.valueOf(level).equals(candidate.getIlvl())).findFirst().orElse(null);
    }

    private static int indent(List<CTInd> indents, Function<CTInd, Object> attribute) {
        return indents.stream().map(attribute).map(WordParagraphLayout::twips)
                .filter(Objects::nonNull).findFirst().orElse(0);
    }

    private static Integer negate(Integer value) {
        return value == null ? null : -value;
    }

    private static Integer twips(Object value) {
        if (value instanceof Number number) {
            return number.intValue();
        }
        try {
            return value instanceof String text ? Integer.valueOf(text) : null;
        } catch (NumberFormatException ignored) {
            return null;
        }
    }
}
