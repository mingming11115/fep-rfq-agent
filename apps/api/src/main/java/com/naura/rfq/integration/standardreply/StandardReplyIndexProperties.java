package com.naura.rfq.integration.standardreply;

import com.naura.rfq.integration.standardreply.Library;
import java.net.URI;
import java.util.HashSet;
import java.util.Set;
import java.util.regex.Pattern;
import lombok.extern.slf4j.Slf4j;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.boot.context.properties.bind.ConstructorBinding;

@ConfigurationProperties("rfq.standard-reply-index")
@Slf4j
public record StandardReplyIndexProperties(String baseUrl, String apiKey, String dataset,
        String historyDataset, String capabilityDataset) {
    private static final Pattern DATASET_KEY = Pattern.compile("[A-Za-z0-9][A-Za-z0-9._-]{0,127}");

    public StandardReplyIndexProperties(String baseUrl, String apiKey, String dataset) {
        this(baseUrl, apiKey, dataset, null, null);
    }

    @ConstructorBinding
    public StandardReplyIndexProperties {
        dataset = key(dataset, "标准回复");
        historyDataset = key(historyDataset, "历史 RFQ");
        capabilityDataset = key(capabilityDataset, "机型能力");
        Set<String> unique = new HashSet<>();
        for (String candidate : new String[] {dataset, historyDataset, capabilityDataset}) {
            if (candidate != null && !unique.add(candidate)) {
                throw new IllegalArgumentException("标准回复、历史 RFQ 和能力边界需要使用独立数据集");
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
                && (dataset != null || historyDataset != null || capabilityDataset != null);
    }

    /** 三个库各用固定数据集，跨 BU 共用；BU 隔离靠记录里的 bu_id 字段过滤。 */
    String datasetFor(Library library) {
        return switch (library) {
            case STANDARD_REPLY -> dataset;
            case HISTORY_RFQ -> historyDataset;
            case CAPABILITY -> capabilityDataset;
        };
    }

    String endpoint(String path) {
        return baseUrl + (baseUrl.endsWith("/api/v1") ? "" : "/api/v1") + path;
    }

    @Override
    public String toString() {
        return "StandardReplyIndexProperties[enabled=" + enabled() + ", dataset=" + dataset
                + ", historyDataset=" + historyDataset + ", capabilityDataset=" + capabilityDataset + "]";
    }

    private static String key(String value, String label) {
        if (value == null || value.isBlank()) {
            return null;
        }
        if (!DATASET_KEY.matcher(value).matches()) {
            throw new IllegalArgumentException(label + "数据集标识不合法");
        }
        return value;
    }
}
