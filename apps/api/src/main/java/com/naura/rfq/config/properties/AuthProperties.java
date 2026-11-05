package com.naura.rfq.config.properties;

import org.springframework.boot.context.properties.ConfigurationProperties;

@ConfigurationProperties(prefix = "rfq.auth")
public record AuthProperties(String jwtSecret, long tokenTtlMinutes) {
}
