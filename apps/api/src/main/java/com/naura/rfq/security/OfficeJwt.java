package com.naura.rfq.security;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.naura.rfq.config.properties.OfficeProperties;
import java.security.MessageDigest;
import java.time.Instant;
import java.util.Base64;
import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import org.springframework.stereotype.Component;
import static java.nio.charset.StandardCharsets.UTF_8;

@Component
public class OfficeJwt {
    private final OfficeProperties properties;
    private final ObjectMapper json;
    private static final Base64.Encoder ENCODER = Base64.getUrlEncoder().withoutPadding();
    public OfficeJwt(OfficeProperties properties, ObjectMapper json) { this.properties = properties; this.json = json; }
    public String sign(Object payload) {
        try {
            if (!properties.configured()) throw new IllegalStateException("请配置 ONLYOFFICE JWT 密钥（至少32字符）");
            String data = ENCODER.encodeToString("{\"alg\":\"HS256\",\"typ\":\"JWT\"}".getBytes(UTF_8)) + "." + ENCODER.encodeToString(json.writeValueAsBytes(payload));
            return data + "." + ENCODER.encodeToString(mac(data));
        } catch (Exception e) { throw new IllegalStateException("无法签名文档会话", e); }
    }
    public JsonNode verify(String token) {
        try {
            if (!properties.configured() || token == null || token.length() > 100000) throw new IllegalArgumentException();
            String[] parts = token.split("\\.");
            if (parts.length != 3) throw new IllegalArgumentException();
            var decoder = Base64.getUrlDecoder();
            if (!"HS256".equals(json.readTree(decoder.decode(parts[0])).path("alg").asText())) throw new IllegalArgumentException();
            if (!MessageDigest.isEqual(mac(parts[0] + "." + parts[1]), decoder.decode(parts[2]))) throw new IllegalArgumentException();
            JsonNode body = json.readTree(decoder.decode(parts[1]));
            if (body.has("exp") && body.path("exp").asLong(0) <= Instant.now().getEpochSecond()) throw new IllegalArgumentException();
            return body;
        } catch (Exception e) { throw new IllegalArgumentException("文档签名无效或已过期"); }
    }
    private byte[] mac(String value) throws Exception {
        Mac mac = Mac.getInstance("HmacSHA256");
        mac.init(new SecretKeySpec(properties.jwtSecret().getBytes(UTF_8), "HmacSHA256"));
        return mac.doFinal(value.getBytes(UTF_8));
    }
}
