package com.naura.rfq.integration.parse;

/**
 * 模型回复的 JSON 文本修复：模型常写出 {@code \*} 这类非法转义、把换行直接裸写在字符串里，
 * 或在 JSON 前后附带说明文字，严格解析会报错，这里先修成合法 JSON 再交给 Jackson。
 */
final class ModelJsonText {
    /** JSON 合法的一字节转义字符。 */
    private static final String VALID_ESCAPES = "\"\\/bfnrt";
    /** 模型对 Markdown 符号习惯性加的转义，去掉反斜杠即原字符。 */
    private static final String MARKDOWN_ESCAPES = "*_#+-.!?()[]{}<>|~=`'";

    private ModelJsonText() {
    }

    static String repair(String content) {
        String text = jsonPart(content.strip());
        var repaired = new StringBuilder(text.length() + 16);
        boolean quoted = false;
        for (int index = 0; index < text.length(); index++) {
            char current = text.charAt(index);
            if (!quoted) {
                quoted = current == '"';
                repaired.append(current);
                continue;
            }
            if (current == '"') {
                quoted = false;
                repaired.append(current);
                continue;
            }
            if (current == '\\') {
                index = escape(text, index, repaired);
                continue;
            }
            if (current < 0x20) {
                appendControl(repaired, current);
                continue;
            }
            repaired.append(current);
        }
        return repaired.toString();
    }

    private static int escape(String text, int index, StringBuilder repaired) {
        if (index + 1 >= text.length()) {
            repaired.append("\\\\");
            return index;
        }
        char next = text.charAt(index + 1);
        if (VALID_ESCAPES.indexOf(next) >= 0) {
            repaired.append('\\').append(next);
            return index + 1;
        }
        if (next == 'u' && unicode(text, index)) {
            repaired.append(text, index, index + 6);
            return index + 5;
        }
        if (MARKDOWN_ESCAPES.indexOf(next) >= 0) {
            repaired.append(next);
            return index + 1;
        }
        // \mu、\times 这类命令原样保留，只是补成 JSON 合法转义
        repaired.append("\\\\").append(next);
        return index + 1;
    }

    private static boolean unicode(String text, int index) {
        if (index + 6 > text.length()) {
            return false;
        }
        for (int offset = index + 2; offset < index + 6; offset++) {
            if (Character.digit(text.charAt(offset), 16) < 0) {
                return false;
            }
        }
        return true;
    }

    private static void appendControl(StringBuilder repaired, char current) {
        switch (current) {
            case '\n' -> repaired.append("\\n");
            case '\r' -> repaired.append("\\r");
            case '\t' -> repaired.append("\\t");
            default -> repaired.append(String.format("\\u%04x", (int) current));
        }
    }

    private static String jsonPart(String content) {
        int start = openingIndex(content);
        int end = Math.max(content.lastIndexOf('}'), content.lastIndexOf(']'));
        if (start < 0 || end <= start) {
            return content;
        }
        return content.substring(start, end + 1);
    }

    private static int openingIndex(String text) {
        int brace = text.indexOf('{');
        int bracket = text.indexOf('[');
        if (brace < 0) {
            return bracket;
        }
        if (bracket < 0) {
            return brace;
        }
        return Math.min(brace, bracket);
    }
}
