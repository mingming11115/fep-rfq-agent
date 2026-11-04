package com.naura.rfq.parse;

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
        private int batchChars = 16000;
        private int batchBlocks = 20;
    }
    @Getter @Setter
    public static class Ocr extends Endpoint {
        private int maxImages = 100;
        private long maxImagePixels = 20000000;
        private int maxImageBytes = 10485760;
    }
}
