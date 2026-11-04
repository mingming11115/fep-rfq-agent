package com.naura.rfq.model.dto;

import java.nio.file.Path;

/** Verified original file and its download metadata; never serialized as JSON. */
public record DocumentDownload(Path path, String name, String contentType, long sizeBytes, String sha256) {
}
