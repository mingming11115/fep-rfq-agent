package com.naura.rfq.integration.parse;

import com.naura.rfq.config.properties.ParseIntegrationProperties;
import com.naura.rfq.model.parse.RawBlock;
import java.util.Base64;
import java.util.Map;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;

@Component
@RequiredArgsConstructor
@Slf4j
public class OcrClient {
    private final ParseIntegrationProperties properties;
    private final ParseHttpClient http;

    public boolean enabled() { return properties.getOcr().isEnabled(); }
    public int maxImages() { return Math.max(0, properties.getOcr().getMaxImages()); }
    public long maxPixels() { return Math.max(1, properties.getOcr().getMaxImagePixels()); }

    public RawBlock recognise(int index, byte[] image, String mimeType, String section, String anchor) {
        if (!enabled()) {
            return pending(index, section, anchor, "OCR 未启用，图片待人工核对");
        }
        if (image.length > properties.getOcr().getMaxImageBytes()) {
            return pending(index, section, anchor, "图片超过 OCR 大小上限");
        }
        try {
            var response = http.post(properties.getOcr(), Map.of("imageBase64", Base64.getEncoder().encodeToString(image),
                "mimeType", mimeType, "anchor", anchor), null);
            var text = response.path("text");
            if (!text.isTextual() || text.asText().isBlank()) {
                throw new IllegalArgumentException("识别结果为空");
            }
            return new RawBlock(index, RawBlock.PARAGRAPH, text.asText().trim(), java.util.List.of(), section, null,
                anchor, "ocr", "OCR 识别文字，需对照原图核对数值和单位");
        } catch (Exception e) {
            log.error("图片 OCR 失败 errorType={}", e.getClass().getSimpleName());
            return pending(index, section, anchor, "OCR 已降级，图片待人工核对：" + ParseHttpClient.reason(e));
        }
    }
    public RawBlock pending(int index, String section, String anchor, String reason) {
        return new RawBlock(index, RawBlock.IMAGE, "（图片，待识别）", java.util.List.of(), section, null, anchor, "native", reason);
    }
}
