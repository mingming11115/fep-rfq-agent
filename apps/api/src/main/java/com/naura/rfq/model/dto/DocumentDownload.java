package com.naura.rfq.model.dto;

/** Verified original file and its download metadata; never serialized as JSON. */
public record DocumentDownload(byte[] content, String name, String contentType, long sizeBytes, String sha256) {
}
