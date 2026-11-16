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

    @Getter @Setter
    public static class History {
        private boolean rulesEnabled = true;
    }

    @Getter @Setter
    public static class WordMarkdown {
        private String python = "python";
        private Duration timeout = Duration.ofSeconds(60);
        private int maxChars;
        /** 保留 markitdown 产出的 Markdown，便于核对“先转 md 再解析”的中间结果。 */
        private boolean savePayload = true;
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
        /** 默认按 26 万 token 窗口的约 1/4 预留输出与 system prompt 余量。 */
        private int batchChars = 60000;
        private int batchBlocks = 20;

        public Llm() {
            // 大批次推理时间更长，默认超时同步放宽。
            setTimeout(Duration.ofSeconds(90));
        }
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
