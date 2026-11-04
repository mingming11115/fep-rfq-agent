package com.naura.rfq.parse;

import org.springframework.boot.context.properties.ConfigurationProperties;

@ConfigurationProperties(prefix = "rfq.parse")
public record ParseProperties(int maxBlocks, int maxRequirementChars) {
}
