package com.naura.rfq.config.properties;

import java.time.Duration;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.Setter;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.context.properties.ConfigurationProperties;

@Getter
@Setter
@ConfigurationProperties(prefix = "rfq.parse.integrations")
public class ParseIntegrationProperties {
    @Getter(AccessLevel.NONE)
    private final boolean llmEnabled;
    private Llm llm = new Llm();
    private Ocr ocr = new Ocr();
    private Mineru mineru = new Mineru();
    private History history = new History();
    private WordMarkdown wordMarkdown = new WordMarkdown();

    @Autowired
    public ParseIntegrationProperties(@Value("${rfq.llm.enabled:}") Boolean llmEnabled) {
        this.llmEnabled = Boolean.TRUE.equals(llmEnabled);
    }

    public boolean llmEnabled() {
        return llmEnabled;
    }

    public boolean historyLlmEnabled() {
        return history.llmEnabled == null ? llmEnabled : history.llmEnabled;
    }

    @Getter @Setter
    public static class History {
        private boolean rulesEnabled = true;
        private Boolean llmEnabled;
    }

    @Getter @Setter
    public static class WordMarkdown {
        private String python = "python";
        private Duration timeout = Duration.ofSeconds(60);
        private int maxChars;
    }

    @Getter @Setter
    public static class Endpoint {
        private String url = "";
        private String apiKey = "";
        private Duration connectTimeout = Duration.ofSeconds(3);
        private Duration timeout = Duration.ofSeconds(30);
    }
    @Getter @Setter
    public static class Llm extends Endpoint {
        private String model = "";
        private boolean logPayload;
        private int batchChars = 16000;
        private int batchBlocks = 20;
    }
    @Getter @Setter
    public static class Ocr extends Endpoint {
        private boolean enabled;
        private int maxImages = 100;
        private long maxImagePixels = 20000000;
        private int maxImageBytes = 10485760;
    }
    @Getter @Setter
    public static class Mineru extends Endpoint {
        private boolean enabled;
        private String backend = "pipeline";

        public Mineru() {
            setTimeout(Duration.ofMinutes(2));
        }
    }
}
