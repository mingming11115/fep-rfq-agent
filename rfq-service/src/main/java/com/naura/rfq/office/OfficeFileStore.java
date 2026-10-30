package com.naura.rfq.office;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Component;
import org.springframework.web.server.ResponseStatusException;
import java.nio.file.*;
import java.security.MessageDigest;
import java.util.HexFormat;

@Component
public class OfficeFileStore {
    public record Document(String id, String name, String fileType, String projectId, String fileId,
                           String sourceVersion, String accessHash, String key, long revision,
                           String savedAt, String lastError, String digest, String lastCallback) {}
    private final Path root;
    private final ObjectMapper json;
    public OfficeFileStore(OfficeProperties properties, ObjectMapper json) {
        this.root = properties.storageDir().toAbsolutePath().normalize(); this.json = json;
    }
    public Document read(String id) {
        try { return json.readValue(directory(id).resolve("metadata.json").toFile(), Document.class); }
        catch (java.io.IOException e) { throw new ResponseStatusException(HttpStatus.NOT_FOUND, "原文件尚未上传或已经移除"); }
    }
    public Document authorize(String id, String access) {
        Document doc = read(id);
        if (access == null || !MessageDigest.isEqual(doc.accessHash().getBytes(java.nio.charset.StandardCharsets.UTF_8), hash(access.getBytes(java.nio.charset.StandardCharsets.UTF_8)).getBytes(java.nio.charset.StandardCharsets.UTF_8)))
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "无权访问此文档，请从原上传浏览器打开");
        return doc;
    }
    public Path directory(String id) {
        if (id == null || !id.matches("[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}"))
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "文档不存在");
        return root.resolve(id);
    }
    public Path file(Document doc, boolean original) { return directory(doc.id()).resolve(original ? "original" : "review-" + doc.revision()); }
    public void create(Document doc, byte[] content) throws java.io.IOException {
        Files.createDirectories(directory(doc.id()));
        atomic(directory(doc.id()).resolve("original"), content);
        atomic(file(doc, false), content);
        write(doc);
    }
    public void write(Document doc) throws java.io.IOException { atomic(directory(doc.id()).resolve("metadata.json"), json.writeValueAsBytes(doc)); }
    public void save(Document doc, byte[] content) throws java.io.IOException { atomic(file(doc, false), content); write(doc); }
    private void atomic(Path target, byte[] content) throws java.io.IOException {
        Path temporary = Files.createTempFile(target.getParent(), ".writing-", ".tmp");
        try {
            Files.write(temporary, content);
            try { Files.move(temporary, target, StandardCopyOption.ATOMIC_MOVE, StandardCopyOption.REPLACE_EXISTING); }
            catch (AtomicMoveNotSupportedException e) { Files.move(temporary, target, StandardCopyOption.REPLACE_EXISTING); }
        } finally { Files.deleteIfExists(temporary); }
    }
    public static String hash(byte[] value) {
        try { return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(value)); }
        catch (Exception e) { throw new IllegalStateException(e); }
    }
}
