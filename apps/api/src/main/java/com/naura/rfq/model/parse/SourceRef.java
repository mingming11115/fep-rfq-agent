package com.naura.rfq.model.parse;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.json.JsonMapper;
import java.util.List;

public record SourceRef(String anchor, String quote) {
    private static final JsonMapper JSON = new JsonMapper();

    public static String encode(List<SourceRef> refs) {
        try {
            return JSON.writeValueAsString(refs);
        } catch (JsonProcessingException exception) {
            throw new IllegalStateException("无法保存原文定位", exception);
        }
    }

    public static List<SourceRef> decode(String stored) {
        if (stored == null) {
            return null;
        }
        try {
            return JSON.readValue(stored, new TypeReference<List<SourceRef>>() { });
        } catch (JsonProcessingException exception) {
            throw new IllegalStateException("无法读取原文定位", exception);
        }
    }
}
