package com.naura.rfq.integration.parse;

import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Set;
import java.util.regex.Pattern;

final class WordMarkdownBatches {
    private static final Pattern MARKER = Pattern.compile("\\[S([0-9]{1,9})\\]");
    private static final Pattern TABLE_SEPARATOR = Pattern.compile("\\s*\\|[-: |]+\\|\\s*");

    private final List<Part> parts = new ArrayList<>();
    private final Set<Integer> tableHeaders = new HashSet<>();

    WordMarkdownBatches(String markdown) {
        List<String> lines = markdown.lines().toList();
        var text = new StringBuilder();
        int tableHeader = -1;
        for (int index = 0; index < lines.size(); index++) {
            String line = lines.get(index);
            text.append(line).append('\n');
            if (!line.stripLeading().startsWith("|")) {
                tableHeader = -1;
            }
            var sources = new HashSet<Integer>();
            var markers = MARKER.matcher(line);
            while (markers.find()) {
                sources.add(Integer.parseInt(markers.group(1)));
            }
            if (sources.isEmpty()) {
                continue;
            }
            if (line.stripLeading().startsWith("|") && index + 1 < lines.size()
                    && TABLE_SEPARATOR.matcher(lines.get(index + 1)).matches()) {
                text.append(lines.get(++index)).append('\n');
                tableHeader = parts.size();
                tableHeaders.addAll(sources);
            }
            parts.add(new Part(text.toString(), sources, tableHeader));
            text.setLength(0);
        }
        if (!parts.isEmpty() && !text.isEmpty()) {
            var last = parts.remove(parts.size() - 1);
            parts.add(new Part(last.markdown() + text, last.sources(), last.tableHeader()));
        }
    }

    int size() {
        return parts.size();
    }

    Set<Integer> tableHeaders() {
        return tableHeaders;
    }

    int endOfBatch(int start, int maxChars, int maxBlocks) {
        int end = start;
        int chars = 0;
        // Leave room for adjacent source blocks and the table header.
        int target = maxChars - maxChars / 4;
        do {
            chars += parts.get(end++).markdown().length();
        } while (end < size() && end - start < maxBlocks && chars + parts.get(end).markdown().length() <= target);
        return end;
    }

    Batch batch(int start, int end, int maxChars, boolean overlap) {
        int first = start;
        int last = end;
        int chars = parts.subList(start, end).stream().mapToInt(part -> part.markdown().length()).sum();
        var text = new StringBuilder();
        var visible = new HashSet<Integer>();
        var primary = new HashSet<Integer>();
        if (overlap) {
            int headerIndex = parts.get(start).tableHeader();
            if (headerIndex >= 0 && headerIndex < start) {
                Part header = parts.get(headerIndex);
                if (chars + header.markdown().length() <= maxChars) {
                    chars += header.markdown().length();
                    text.append(header.markdown());
                    visible.addAll(header.sources());
                }
            }
            if (end < size() && chars + parts.get(end).markdown().length() <= maxChars) {
                chars += parts.get(last++).markdown().length();
            }
            if (start > 0 && start - 1 != headerIndex && chars + parts.get(start - 1).markdown().length() <= maxChars) {
                first--;
            }
        }
        for (int index = first; index < last; index++) {
            Part part = parts.get(index);
            text.append(part.markdown());
            visible.addAll(part.sources());
            if (index >= start && index < end) {
                primary.addAll(part.sources());
            }
        }
        return new Batch(text.toString().strip(), visible, primary);
    }

    record Batch(String markdown, Set<Integer> visible, Set<Integer> primary) { }

    private record Part(String markdown, Set<Integer> sources, int tableHeader) { }
}
