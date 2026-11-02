package com.naura.rfq.auth;

import org.springframework.boot.context.properties.ConfigurationProperties;

@ConfigurationProperties(prefix = "rfq.auth")
public record AuthProperties(String jwtSecret, long tokenTtlMinutes) {
}
