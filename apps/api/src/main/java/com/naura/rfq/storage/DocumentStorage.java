package com.naura.rfq.storage;

import com.naura.rfq.common.exception.BusinessException;
import java.io.IOException;
import java.io.InputStream;
import java.nio.file.Files;
import java.nio.file.Path;
import java.security.DigestInputStream;
import java.security.MessageDigest;
import java.util.HexFormat;
import org.apache.pdfbox.Loader;
import org.apache.poi.xwpf.usermodel.XWPFDocument;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;
import org.springframework.web.multipart.MultipartFile;

/** Immutable source storage. Only fully validated files become visible. */
@Component
public class DocumentStorage {
    private static final long MAX_BYTES = 30L * 1024 * 1024;
    private final Path root;

    public DocumentStorage(@Value("${rfq.storage-dir:./data/rfq-files}") String directory) {
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

    /** Verify the registered original before the existing streaming/range response is opened. */
    public Path verifiedFile(String ref,Long expectedSize,String expectedSha256) throws IOException {
        if(ref==null || ref.isBlank())throw new BusinessException(409,"原件记录不完整，请联系管理员核对");
        Path file;
        try { file=resolve(ref); }
        catch(IllegalArgumentException exception) { throw new BusinessException(409,"原件记录无效，请联系管理员核对"); }
        try {
            if(!Files.isRegularFile(file,java.nio.file.LinkOption.NOFOLLOW_LINKS))throw new BusinessException(404,"原件不存在");
            if(expectedSize==null || expectedSize<=0 || expectedSize>MAX_BYTES || expectedSha256==null || !expectedSha256.matches("(?i)[0-9a-f]{64}"))
                throw new BusinessException(409,"原件完整性信息缺失，请联系管理员核对");
            if(Files.size(file)!=expectedSize)throw new BusinessException(409,"原件大小校验失败，请联系管理员核对");
            MessageDigest digest=sha256();long count=0;
            try(var input=new DigestInputStream(Files.newInputStream(file),digest)) {
                byte[] buffer=new byte[8192];int read;
                while((read=input.read(buffer))!=-1) {
                    count+=read;if(count>MAX_BYTES)throw new BusinessException(409,"原件大小校验失败，请联系管理员核对");
                }
            }
            if(count!=expectedSize || !expectedSha256.equalsIgnoreCase(HexFormat.of().formatHex(digest.digest())))
                throw new BusinessException(409,"原件哈希校验失败，请联系管理员核对");
            return file;
        } catch(java.nio.file.NoSuchFileException exception) { throw new BusinessException(404,"原件不存在"); }
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
