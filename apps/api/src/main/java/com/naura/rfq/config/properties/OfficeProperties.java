package com.naura.rfq.config.properties;

import java.nio.file.Path;
import org.springframework.boot.context.properties.ConfigurationProperties;

@ConfigurationProperties("office")
public record OfficeProperties(String publicUrl, String internalUrl, String callbackBaseUrl,
                               String jwtSecret, Path storageDir, long maxFileBytes, String frontendOrigins) {
    public OfficeProperties {
        publicUrl = trim(publicUrl == null ? "http://127.0.0.1:8082" : publicUrl);
        internalUrl = trim(internalUrl == null ? publicUrl : internalUrl);
        callbackBaseUrl = trim(callbackBaseUrl == null ? "http://host.docker.internal:48081" : callbackBaseUrl);
        jwtSecret = jwtSecret == null ? "" : jwtSecret;
        storageDir = storageDir == null ? Path.of("data/onlyoffice") : storageDir;
        maxFileBytes = maxFileBytes <= 0 ? 30L * 1024 * 1024 : maxFileBytes;
        frontendOrigins = frontendOrigins == null ? "http://127.0.0.1:5173,http://localhost:5173" : frontendOrigins;
    }
    private static String trim(String value) { return value.replaceAll("/+$", ""); }
    public boolean configured() { return jwtSecret.length() >= 32; }
    public boolean allowsFrontend(String origin) { return java.util.Arrays.stream(frontendOrigins.split(",")).map(String::trim).anyMatch(value -> !value.isEmpty() && value.equals(origin)); }
}
