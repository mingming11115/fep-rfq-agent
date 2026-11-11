package com.naura.rfq.integration.standardreply;

import com.naura.rfq.integration.standardreply.KnowledgeIndexQueue.Library;
import java.net.URI;
import java.util.HashSet;
import java.util.Locale;
import java.util.Map;
import java.util.regex.Pattern;
import java.util.stream.Stream;
import lombok.extern.slf4j.Slf4j;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.boot.context.properties.bind.ConstructorBinding;

@ConfigurationProperties("rfq.standard-reply-index")
@Slf4j
public record StandardReplyIndexProperties(String baseUrl, String apiKey, Map<String, String> datasets,
        Map<String, String> historyDatasets, Map<String, String> capabilityDatasets) {
    private static final Pattern DATASET_KEY = Pattern.compile("[A-Za-z0-9][A-Za-z0-9._-]{0,127}");

    public StandardReplyIndexProperties(String baseUrl, String apiKey, Map<String, String> datasets) {
        this(baseUrl, apiKey, datasets, Map.of(), Map.of());
    }

    public StandardReplyIndexProperties(String baseUrl, String apiKey, Map<String, String> datasets,
            Map<String, String> historyDatasets) {
        this(baseUrl, apiKey, datasets, historyDatasets, Map.of());
    }

    @ConstructorBinding
    public StandardReplyIndexProperties {
        datasets = datasets == null ? Map.of() : Map.copyOf(datasets);
        historyDatasets = historyDatasets == null ? Map.of() : Map.copyOf(historyDatasets);
        capabilityDatasets = capabilityDatasets == null ? Map.of() : Map.copyOf(capabilityDatasets);
        var unique = new HashSet<String>();
        for (var entry : Stream.of(datasets, historyDatasets, capabilityDatasets).flatMap(map -> map.entrySet().stream()).toList()) {
            if (entry.getKey().isBlank() || !DATASET_KEY.matcher(entry.getValue()).matches()
                    || !unique.add(entry.getValue().toLowerCase(Locale.ROOT))) {
                throw new IllegalArgumentException("各 BU 的标准回复、历史 RFQ 和能力边界需要配置独立数据集");
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
                log.error("解析知识中台地址失败 errorType={}", e.getClass().getSimpleName());
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
                && (!datasets.isEmpty() || !historyDatasets.isEmpty() || !capabilityDatasets.isEmpty());
    }

    Map<String, String> datasets(Library library) {
        return switch (library) {
            case STANDARD_REPLY -> datasets;
            case HISTORY_RFQ -> historyDatasets;
            case CAPABILITY -> capabilityDatasets;
        };
    }

    String endpoint(String path) {
        return baseUrl + (baseUrl.endsWith("/api/v1") ? "" : "/api/v1") + path;
    }

    @Override
    public String toString() {
        return "StandardReplyIndexProperties[enabled=" + enabled() + ", BU count=" + datasets.size() + "]";
    }
}
