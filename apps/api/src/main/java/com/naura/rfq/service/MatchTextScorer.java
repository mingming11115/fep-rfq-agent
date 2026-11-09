package com.naura.rfq.service;

import java.text.Normalizer;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Locale;
import java.util.Set;
import java.util.regex.Pattern;

/** Local second-pass score. Platform recall scores never become business scores. */
final class MatchTextScorer {
    static final String VERSION = "rfq-text-bigram-v1";
    private static final Pattern CRITICAL = Pattern.compile(
            "[+−-]?\\d+(?:[.,]\\d+)?(?:\\s*(?:[%°℃]|[μµa-zA-Z]+(?:/[μµa-zA-Z]+)*)(?![A-Za-z]))?"
            + "|[≤≥≠<>=]=?|不低于|不少于|不超过|不大于|禁止|必须|[不无未]"
            + "|\\b(?:cannot|can['’]t|no|not|never|without|exclude|must|shall)\\b",
            Pattern.CASE_INSENSITIVE);

    double score(String current, String candidate) {
        String left = canonical(current), right = canonical(candidate);
        if (left.isEmpty() || right.isEmpty() || !critical(current).equals(critical(candidate))) return 0;
        if (left.equals(right)) return 1;
        Set<String> a = bigrams(left), b = bigrams(right);
        int total = a.size() + b.size();
        if (total == 0) return 0;
        a.retainAll(b);
        return 2.0 * a.size() / total;
    }

    static String canonical(String value) {
        return Normalizer.normalize(value, Normalizer.Form.NFKC).toLowerCase(Locale.ROOT)
                .replaceAll("[\\p{Z}\\p{P}\\s]+", "");
    }

    private List<String> critical(String value) {
        var matcher = CRITICAL.matcher(Normalizer.normalize(value, Normalizer.Form.NFKC));
        var result = new ArrayList<String>();
        while (matcher.find()) result.add(matcher.group().replaceAll("\\s+", ""));
        return result;
    }

    private Set<String> bigrams(String value) {
        var result = new HashSet<String>();
        int[] points = value.codePoints().toArray();
        for (int i = 1; i < points.length; i++) result.add(new String(points, i - 1, 2));
        return result;
    }
}
