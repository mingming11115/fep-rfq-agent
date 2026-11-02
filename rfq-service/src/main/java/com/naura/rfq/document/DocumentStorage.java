package com.naura.rfq.document;

import com.naura.rfq.common.exception.BusinessException;
import java.io.IOException;
import java.io.InputStream;
import java.nio.file.Files;
import java.nio.file.Path;
import java.security.DigestInputStream;
import java.security.MessageDigest;
import java.util.HexFormat;
import org.apache.poi.xwpf.usermodel.XWPFDocument;
import org.apache.pdfbox.Loader;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;
import org.springframework.web.multipart.MultipartFile;

/** Immutable source storage. Only fully validated files become visible. */
@Component
public class DocumentStorage {
    private static final long MAX_BYTES = 30L * 1024 * 1024;
    private final Path root;

    public DocumentStorage(@Value("${rfq.storage-dir:./rfq-service/data/rfq-files}") String directory) {
        root = Path.of(directory).toAbsolutePath().normalize();
    }
    public record StoredFile(String storageRef, long size, String sha256) { }

    public StoredFile save(String id, MultipartFile file, String extension) throws IOException {
        if (file.getSize() > MAX_BYTES) throw new BusinessException(413, "文件不能超过 30 MiB");
        try (var input = file.getInputStream()) { return save(id, extension, input); }
    }
    public StoredFile saveBytes(String id, String extension, byte[] bytes) throws IOException {
        try (var input = new java.io.ByteArrayInputStream(bytes)) { return save(id, extension, input); }
    }
    private StoredFile save(String id, String extension, InputStream input) throws IOException {
        if (!id.matches("[A-Za-z0-9_-]+") || !java.util.List.of(".docx", ".pdf").contains(extension))
            throw new BusinessException(400, "文件格式或标识不合法");
        Files.createDirectories(root);
        Path folder = root.resolve(id);
        Files.createDirectory(folder); // Never reuse or overwrite an original document.
        Path pending = folder.resolve("upload.part");
        Path target = folder.resolve("source" + extension);
        try {
            MessageDigest digest = sha256();
            try (var source = new DigestInputStream(input, digest); var out = Files.newOutputStream(pending)) {
                byte[] buffer = new byte[8192]; long count = 0; int length;
                while ((length = source.read(buffer)) != -1) {
                    count += length;
                    if (count > MAX_BYTES) throw new BusinessException(413, "文件不能超过 30 MiB");
                    out.write(buffer, 0, length);
                }
                if (count == 0) throw new BusinessException(400, "请选择要上传的文件");
            }
            validate(pending, extension);
            Files.move(pending, target);
            return new StoredFile(root.relativize(target).toString().replace('\\', '/'),
                Files.size(target), HexFormat.of().formatHex(digest.digest()));
        } catch (IOException | RuntimeException exception) {
            Files.deleteIfExists(pending); Files.deleteIfExists(target); Files.deleteIfExists(folder);
            throw exception;
        }
    }
    private void validate(Path file, String extension) {
        try {
            if (".docx".equals(extension)) {
                try (var input = Files.newInputStream(file); var doc = new XWPFDocument(input)) {
                    if (doc.getDocument().getBody() == null) throw new IOException("Missing body");
                }
            } else {
                try (var doc = Loader.loadPDF(file.toFile())) {
                    if (doc.isEncrypted() || doc.getNumberOfPages() == 0) throw new IOException("Encrypted or empty PDF");
                }
            }
        } catch (Exception e) {
            throw new BusinessException(400, extension.equals(".docx") ? "DOCX 内容无效，请上传完整的 Word 文件" : "PDF 内容无效、为空或已加密");
        }
    }
    public Path resolve(String ref) {
        Path path = root.resolve(ref).normalize();
        if (!path.startsWith(root) || path.equals(root)) throw new IllegalArgumentException("非法的存储路径");
        return path;
    }
    public void delete(String ref) throws IOException {
        Path file = resolve(ref);
        Files.deleteIfExists(file); Files.deleteIfExists(file.getParent());
    }
    private MessageDigest sha256() {
        try { return MessageDigest.getInstance("SHA-256"); }
        catch (Exception e) { throw new IllegalStateException("SHA-256 不可用", e); }
    }
}
