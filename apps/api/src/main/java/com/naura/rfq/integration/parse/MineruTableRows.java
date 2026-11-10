package com.naura.rfq.integration.parse;

import java.io.IOException;
import java.io.StringReader;
import java.util.ArrayList;
import java.util.List;
import javax.swing.text.MutableAttributeSet;
import javax.swing.text.html.HTML;
import javax.swing.text.html.HTMLEditorKit;
import javax.swing.text.html.parser.ParserDelegator;

/** Reads MinerU's HTML table as text, expanding spans into the RFQ table grid. */
final class MineruTableRows extends HTMLEditorKit.ParserCallback {
    private static final int MAX_COLUMNS = 256;
    private static final int MAX_CELLS = 100_000;
    private final List<List<Cell>> rows = new ArrayList<>();
    private List<Cell> row;
    private Cell cell;

    static List<List<String>> read(String html) throws IOException {
        var parser = new MineruTableRows();
        new ParserDelegator().parse(new StringReader(html), parser, true);
        return parser.grid();
    }

    @Override
    public void handleStartTag(HTML.Tag tag, MutableAttributeSet attributes, int position) {
        if (tag == HTML.Tag.TR) {
            row = new ArrayList<>();
            rows.add(row);
        } else if ((tag == HTML.Tag.TD || tag == HTML.Tag.TH) && row != null) {
            cell = new Cell(span(attributes, HTML.Attribute.ROWSPAN), span(attributes, HTML.Attribute.COLSPAN), new StringBuilder());
            row.add(cell);
        }
    }

    @Override
    public void handleEndTag(HTML.Tag tag, int position) {
        if (tag == HTML.Tag.TD || tag == HTML.Tag.TH) {
            cell = null;
        } else if (tag == HTML.Tag.TR) {
            row = null;
        }
    }

    @Override
    public void handleText(char[] text, int position) {
        if (cell != null) {
            cell.text().append(text);
        }
    }

    @Override
    public void handleSimpleTag(HTML.Tag tag, MutableAttributeSet attributes, int position) {
        if (tag == HTML.Tag.BR && cell != null) {
            cell.text().append(' ');
        }
    }

    private List<List<String>> grid() throws IOException {
        List<List<String>> grid = new ArrayList<>();
        rows.forEach(ignored -> grid.add(new ArrayList<>()));
        long cells = 0;
        for (int y = 0; y < rows.size(); y++) {
            int x = 0;
            List<String> current = grid.get(y);
            for (Cell entry : rows.get(y)) {
                while (x < current.size() && current.get(x) != null) {
                    x++;
                }
                int endColumn = x + entry.columns();
                int height = Math.min(entry.rows(), rows.size() - y);
                cells += (long) height * entry.columns();
                if (endColumn > MAX_COLUMNS || cells > MAX_CELLS) {
                    throw new IOException("MinerU 表格超出可处理范围");
                }
                String value = entry.text().toString().replace('\u00a0', ' ').strip();
                for (int r = y; r < y + height; r++) {
                    List<String> target = grid.get(r);
                    while (target.size() < endColumn) {
                        target.add(null);
                    }
                    for (int c = x; c < endColumn; c++) {
                        if (target.get(c) != null) {
                            throw new IOException("MinerU 表格单元格重叠");
                        }
                        target.set(c, c == x ? value : "");
                    }
                }
                x = endColumn;
            }
        }
        return grid.stream().filter(values -> values.stream().anyMatch(value -> value != null && !value.isBlank()))
            .map(values -> values.stream().map(value -> value == null ? "" : value).toList()).toList();
    }

    private static int span(MutableAttributeSet attributes, HTML.Attribute key) {
        Object value = attributes.getAttribute(key);
        if (value == null) {
            return 1;
        }
        try {
            return Math.max(1, Math.min(MAX_CELLS, Integer.parseInt(value.toString().strip())));
        } catch (NumberFormatException ignored) {
            return 1;
        }
    }

    private record Cell(int rows, int columns, StringBuilder text) { }
}
