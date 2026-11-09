package com.naura.rfq.integration.standardreply;

import java.net.URI;
import java.util.HashSet;
import java.util.Locale;
import java.util.Map;
import java.util.regex.Pattern;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.boot.context.properties.bind.ConstructorBinding;

@ConfigurationProperties("rfq.standard-reply-index")
public record StandardReplyIndexProperties(String baseUrl, String apiKey, Map<String, String> datasets,
        Map<String, String> historyDatasets) {
    private static final Pattern DATASET_KEY = Pattern.compile("[A-Za-z0-9][A-Za-z0-9._-]{0,127}");

    public StandardReplyIndexProperties(String baseUrl, String apiKey, Map<String, String> datasets) {
        this(baseUrl, apiKey, datasets, Map.of());
    }

    @ConstructorBinding
    public StandardReplyIndexProperties {
        datasets = datasets == null ? Map.of() : Map.copyOf(datasets);
        historyDatasets = historyDatasets == null ? Map.of() : Map.copyOf(historyDatasets);
        var unique = new HashSet<String>();
        for (var entry : java.util.stream.Stream.concat(datasets.entrySet().stream(), historyDatasets.entrySet().stream()).toList()) {
            if (entry.getKey().isBlank() || !DATASET_KEY.matcher(entry.getValue()).matches()
                    || !unique.add(entry.getValue().toLowerCase(Locale.ROOT))) {
                throw new IllegalArgumentException("标准回复和历史 RFQ 需要为每个 BU 配置独立数据集");
            }
        }
        if (apiKey != null && apiKey.chars().anyMatch(character -> character < 32 || character > 126)) {
            throw new IllegalArgumentException("知识中台 API Key 格式不合法");
        }
        if (baseUrl != null && !baseUrl.isBlank()) {
            URI uri;
            try {
                uri = URI.create(baseUrl.strip());
            } catch (IllegalArgumentException e) {
                throw new IllegalArgumentException("知识中台地址不合法");
            }
            if (!("http".equals(uri.getScheme()) || "https".equals(uri.getScheme())) || uri.getHost() == null
                    || uri.getUserInfo() != null || uri.getQuery() != null || uri.getFragment() != null) {
                throw new IllegalArgumentException("知识中台地址不合法");
            }
            baseUrl = baseUrl.strip().replaceFirst("/+$", "");
        }
    }

    public boolean enabled() {
        return baseUrl != null && !baseUrl.isBlank() && apiKey != null && !apiKey.isBlank()
                && (!datasets.isEmpty() || !historyDatasets.isEmpty());
    }

    String endpoint(String path) {
        return baseUrl + (baseUrl.endsWith("/api/v1") ? "" : "/api/v1") + path;
    }

    @Override
    public String toString() {
        return "StandardReplyIndexProperties[enabled=" + enabled() + ", BU count=" + datasets.size() + "]";
    }
}
