package com.naura.rfq.office;

import org.springframework.boot.context.properties.ConfigurationProperties;
import java.nio.file.Path;

@ConfigurationProperties("office")
public record OfficeProperties(String publicUrl, String internalUrl, String callbackBaseUrl,
                               String jwtSecret, Path storageDir, long maxFileBytes) {
    public OfficeProperties {
        publicUrl = trim(publicUrl == null ? "http://127.0.0.1:8082" : publicUrl);
        internalUrl = trim(internalUrl == null ? publicUrl : internalUrl);
        callbackBaseUrl = trim(callbackBaseUrl == null ? "http://host.docker.internal:48081" : callbackBaseUrl);
        jwtSecret = jwtSecret == null ? "" : jwtSecret;
        storageDir = storageDir == null ? Path.of("data/onlyoffice") : storageDir;
        maxFileBytes = maxFileBytes <= 0 ? 30L * 1024 * 1024 : maxFileBytes;
    }
    private static String trim(String value) { return value.replaceAll("/+$", ""); }
    public boolean configured() { return jwtSecret.length() >= 32; }
}
