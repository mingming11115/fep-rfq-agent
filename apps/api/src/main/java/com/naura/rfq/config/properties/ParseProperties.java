package com.naura.rfq.config.properties;

import org.springframework.boot.context.properties.ConfigurationProperties;

@ConfigurationProperties(prefix = "rfq.parse")
public record ParseProperties(int maxBlocks, int maxRequirementChars) {
}
