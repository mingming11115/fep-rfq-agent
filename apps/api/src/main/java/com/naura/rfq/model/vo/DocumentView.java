package com.naura.rfq.model.vo;

import com.naura.rfq.model.entity.CustomerDocument;
import java.time.Instant;

public record DocumentView(String id, String projectId, String name, int version, String purpose,
        long sizeBytes, String sha256, String status, String uploadedBy, Instant createdAt,String contentType) {

    public static DocumentView of(CustomerDocument document) {
        return new DocumentView(document.getId(), document.getProjectId(), document.getName(),
                document.getVersion(), document.getPurpose(), document.getSizeBytes(),
                document.getSha256(), document.getStatus(), document.getUploadedBy(),
                document.getCreatedAt(),document.getContentType());
    }
}
