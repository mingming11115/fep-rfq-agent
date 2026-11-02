package com.naura.rfq.document;

import java.io.IOException;
import java.io.InputStream;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardCopyOption;
import java.security.DigestInputStream;
import java.security.MessageDigest;
import java.util.HexFormat;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;
import org.springframework.web.multipart.MultipartFile;

/** Stores original customer files outside the database and returns a portable relative ref. */
@Component
public class DocumentStorage {

    private final Path root;

    public DocumentStorage(@Value("${rfq.storage-dir:./rfq-service/data/rfq-files}") String directory) {
        this.root = Path.of(directory).toAbsolutePath().normalize();
    }

    public record StoredFile(String storageRef, long size, String sha256) {
    }

    public StoredFile save(String documentId, MultipartFile file, String extension) throws IOException {
        Path folder = root.resolve(documentId);
        Files.createDirectories(folder);
        Path target = folder.resolve("source" + extension);
        MessageDigest digest = sha256();
        try (InputStream input = new DigestInputStream(file.getInputStream(), digest)) {
            Files.copy(input, target, StandardCopyOption.REPLACE_EXISTING);
        }
        return new StoredFile(root.relativize(target).toString().replace('\\', '/'),
                Files.size(target), HexFormat.of().formatHex(digest.digest()));
    }

    public Path resolve(String storageRef) {
        Path path = root.resolve(storageRef).normalize();
        if (!path.startsWith(root)) {
            throw new IllegalArgumentException("非法的存储路径");
        }
        return path;
    }

    /** Stores generated content (for example the demo RFQ) and returns the same ref shape. */
    public StoredFile saveBytes(String documentId, String extension, byte[] content) throws IOException {
        Path folder = root.resolve(documentId);
        Files.createDirectories(folder);
        Path target = folder.resolve("source" + extension);
        Files.write(target, content);
        MessageDigest digest = sha256();
        digest.update(content);
        return new StoredFile(root.relativize(target).toString().replace('\\', '/'),
                (long) content.length, HexFormat.of().formatHex(digest.digest()));
    }

    private MessageDigest sha256() {
        try {
            return MessageDigest.getInstance("SHA-256");
        } catch (Exception exception) {
            throw new IllegalStateException("SHA-256 不可用", exception);
        }
    }
}
