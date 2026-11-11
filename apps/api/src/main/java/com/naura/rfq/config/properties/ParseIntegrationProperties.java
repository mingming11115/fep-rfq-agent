package com.naura.rfq.config.properties;

import java.time.Duration;
import lombok.Getter;
import lombok.Setter;
import org.springframework.boot.context.properties.ConfigurationProperties;

@Getter
@Setter
@ConfigurationProperties(prefix = "rfq.parse.integrations")
public class ParseIntegrationProperties {
    private Llm llm = new Llm();
    private Ocr ocr = new Ocr();
    private Mineru mineru = new Mineru();
    private History history = new History();
    private WordMarkdown wordMarkdown = new WordMarkdown();

    public boolean historyLlmEnabled() {
        return history.llmEnabled == null ? llm.isEnabled() : history.llmEnabled;
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
        private int maxChars = 100000;
    }

    @Getter @Setter
    public static class Endpoint {
        private boolean enabled;
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
        private int maxImages = 100;
        private long maxImagePixels = 20000000;
        private int maxImageBytes = 10485760;
    }
    @Getter @Setter
    public static class Mineru extends Endpoint {
        private String backend = "pipeline";

        public Mineru() {
            setTimeout(Duration.ofMinutes(2));
        }
    }
}
