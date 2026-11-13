package com.naura.rfq.storage;

import com.naura.rfq.mapper.DemoDocumentMapper;
import com.naura.rfq.common.exception.BusinessException;
import jakarta.annotation.PostConstruct;
import java.io.IOException;
import java.io.InputStream;
import java.nio.file.Files;
import java.nio.file.Path;
import java.security.DigestInputStream;
import java.security.MessageDigest;
import java.util.HexFormat;
import lombok.NoArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.apache.pdfbox.Loader;
import org.apache.poi.xwpf.usermodel.XWPFDocument;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;
import org.springframework.web.multipart.MultipartFile;

/** Immutable source storage. Only fully validated files become visible. */
@Component
@Slf4j
@NoArgsConstructor
public class DocumentStorage {
    private static final long MAX_BYTES = 30L * 1024 * 1024;
    private Path root;
    @Value("${rfq.storage-dir:./data/rfq-files}")
    private String directory;
    @Value("${rfq.storage-type:local}")
    private String type;
    @Value("${rfq.minio.bucket:rfq-files}")
    private String bucket;
    @Autowired
    private MinioObjectStore remote;
    @Autowired
    private DemoDocumentMapper demoDocuments;

    public DocumentStorage(String directory) { this(directory, "local", "rfq-files", null); }

    public DocumentStorage(String directory, String type, String bucket, MinioObjectStore remote) {
        this(directory, type, bucket, remote, null);
    }

    public DocumentStorage(String directory, String type, String bucket,
            MinioObjectStore remote, DemoDocumentMapper demoDocuments) {
        this.directory = directory;
        this.type = type;
        this.bucket = bucket;
        this.remote = remote;
        this.demoDocuments = demoDocuments;
        initialize();
    }

    @PostConstruct
    private void initialize() {
        root = Path.of(directory).toAbsolutePath().normalize();
        if (!java.util.List.of("local", "minio").contains(type)) {
            throw new IllegalArgumentException("存储类型必须为 local 或 minio");
        }
        if (!bucket.matches("[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]")) {
            throw new IllegalArgumentException("MinIO bucket 无效");
        }
    }
    public record StoredFile(String storageRef, long size, String sha256) { }

    public StoredFile save(String id, MultipartFile file, String extension) throws IOException {
        if (file.getSize() > MAX_BYTES) {
            throw new BusinessException(413, "文件不能超过 30 MiB");
        }
        try (var input = file.getInputStream()) { return save(id, extension, input); }
    }
    public StoredFile saveBytes(String id, String extension, byte[] bytes) throws IOException {
        try (var input = new java.io.ByteArrayInputStream(bytes)) { return save(id, extension, input); }
    }
    private StoredFile save(String id, String extension, InputStream input) throws IOException {
        if (!id.matches("[A-Za-z0-9_-]+") || !java.util.List.of(".docx", ".pdf").contains(extension)) {
            throw new BusinessException(400, "文件格式或标识不合法");
        }
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
                    if (count > MAX_BYTES) {
                        throw new BusinessException(413, "文件不能超过 30 MiB");
                    }
                    out.write(buffer, 0, length);
                }
                if (count == 0) {
                    throw new BusinessException(400, "请选择要上传的文件");
                }
            }
            validate(pending, extension);
            if ("minio".equals(type)) {
                // A fresh key avoids overwriting an original, even on an upload retry.
                String key = id + "/" + java.util.UUID.randomUUID() + "/source" + extension;
                long size = Files.size(pending);
                try {
                    remote.put(bucket, key, pending);
                    Files.delete(pending); Files.delete(folder);
                } catch (IOException e) {
                    log.error("保存远程原件或清理临时文件失败 errorType={}", e.getClass().getSimpleName());
                    try {
                        remote.delete(bucket, key);
                    } catch (IOException cleanup) {
                        log.error("回滚上传时删除远程原件失败 errorType={}", cleanup.getClass().getSimpleName());
                        e.addSuppressed(cleanup);
                    }
                    throw e;
                }
                return new StoredFile("minio:" + bucket + "/" + key, size, HexFormat.of().formatHex(digest.digest()));
            }
            Files.move(pending, target);
            return new StoredFile(root.relativize(target).toString().replace('\\', '/'),
                Files.size(target), HexFormat.of().formatHex(digest.digest()));
        } catch (IOException | RuntimeException exception) {
            log.error("保存原件失败 errorType={}", exception.getClass().getSimpleName());
            Files.deleteIfExists(pending); Files.deleteIfExists(target); Files.deleteIfExists(folder);
            throw exception;
        }
    }
    private void validate(Path file, String extension) {
        try {
            if (".docx".equals(extension)) {
                try (var input = Files.newInputStream(file); var doc = new XWPFDocument(input)) {
                    if (doc.getDocument().getBody() == null) {
                        throw new IOException("Missing body");
                    }
                }
            } else {
                try (var doc = Loader.loadPDF(file.toFile())) {
                    if (doc.isEncrypted() || doc.getNumberOfPages() == 0) {
                        throw new IOException("Encrypted or empty PDF");
                    }
                }
            }
        } catch (Exception e) {
            log.error("校验原件文件内容失败 errorType={}", e.getClass().getSimpleName());
            throw new BusinessException(400, extension.equals(".docx") ? "DOCX 内容无效，请上传完整的 Word 文件" : "PDF 内容无效、为空或已加密");
        }
    }
    public Path resolve(String ref) {
        if (ref.startsWith("minio:")) {
            throw new IllegalArgumentException("MinIO 原件必须通过 open 读取");
        }
        Path path = root.resolve(ref).normalize();
        if (!path.startsWith(root) || path.equals(root)) {
            throw new IllegalArgumentException("非法的存储路径");
        }
        return path;
    }

    /** Verify the registered original before the existing streaming/range response is opened. */
    public Path verifiedFile(String ref,Long expectedSize,String expectedSha256) throws IOException {
        if(ref==null || ref.isBlank()) {
            throw new BusinessException(409,"原件记录不完整，请联系管理员核对");
        }
        Path file;
        try { file=resolve(ref); }
        catch(IllegalArgumentException exception) {
            log.error("校验原件存储路径失败 errorType={}", exception.getClass().getSimpleName());
            throw new BusinessException(409,"原件记录无效，请联系管理员核对");
        }
        try {
            if(!Files.isRegularFile(file,java.nio.file.LinkOption.NOFOLLOW_LINKS)) {
                throw new BusinessException(404,"原件不存在");
            }
            if(expectedSize==null || expectedSize<=0 || expectedSize>MAX_BYTES || expectedSha256==null || !expectedSha256.matches("(?i)[0-9a-f]{64}")) {
                throw new BusinessException(409,"原件完整性信息缺失，请联系管理员核对");
            }
            if(Files.size(file)!=expectedSize) {
                throw new BusinessException(409,"原件大小校验失败，请联系管理员核对");
            }
            MessageDigest digest=sha256();long count=0;
            try(var input=new DigestInputStream(Files.newInputStream(file),digest)) {
                byte[] buffer=new byte[8192];int read;
                while((read=input.read(buffer))!=-1) {
                    count+=read;if(count>MAX_BYTES) { throw new BusinessException(409,"原件大小校验失败，请联系管理员核对"); }
                }
            }
            if(count!=expectedSize || !expectedSha256.equalsIgnoreCase(HexFormat.of().formatHex(digest.digest()))) {
                throw new BusinessException(409,"原件哈希校验失败，请联系管理员核对");
            }
            return file;
        } catch(java.nio.file.NoSuchFileException exception) {
            log.error("读取本地原件失败", exception);
            throw new BusinessException(404,"原件不存在");
        }
    }
    public void delete(String ref) throws IOException {
        if (ref.startsWith("minio:")) {
            String[] location = remoteLocation(ref);
            remote.delete(location[0], location[1]); return;
        }
        Path file = resolve(ref);
        Files.deleteIfExists(file); Files.deleteIfExists(file.getParent());
    }
    private MessageDigest sha256() {
        try { return MessageDigest.getInstance("SHA-256"); }
        catch (Exception e) {
            log.error("计算原件的 SHA-256 摘要失败", e);
            throw new IllegalStateException("SHA-256 不可用", e);
        }
    }

    public record FileLease(Path path, boolean temporary) implements AutoCloseable {
        @Override public void close() throws IOException { if (temporary) { Files.deleteIfExists(path); } }
    }
    private String[] remoteLocation(String ref) {
        String[] location = ref.substring(6).split("/", 2);
        if (location.length != 2 || !location[0].matches("[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]")
                || !location[1].matches("[A-Za-z0-9_-]+/[a-f0-9-]{36}/source\\.(docx|pdf)")) {
                throw new BusinessException(409, "MinIO 原件记录无效");
                }
        return location;
    }
    public FileLease open(String ref, Long size, String hash) throws IOException {
        if (ref != null && ref.startsWith("demo:")) {
            return openDemoDocument(ref.substring(5), size, hash);
        }
        if (ref == null || !ref.startsWith("minio:")) {
            return new FileLease(verifiedFile(ref, size, hash), false);
        }
        String[] location = remoteLocation(ref);
        if (size == null || size <= 0 || size > MAX_BYTES || hash == null || !hash.matches("(?i)[0-9a-f]{64}")) {
            throw new BusinessException(409, "原件完整性信息缺失");
        }
        Path temp = Files.createTempFile("rfq-original-", location[1].endsWith(".pdf") ? ".pdf" : ".docx");
        try {
            MessageDigest digest = sha256(); long count = 0;
            try (var input = new DigestInputStream(remote.get(location[0], location[1]), digest);
                    var output = Files.newOutputStream(temp)) {
                byte[] buffer = new byte[8192]; int read;
                while ((read = input.read(buffer)) != -1) {
                    count += read;
                    if (count > size) {
                        throw new BusinessException(409, "原件大小校验失败");
                    }
                    output.write(buffer, 0, read);
                }
            }
            if (count != size || !hash.equalsIgnoreCase(HexFormat.of().formatHex(digest.digest()))) {
                throw new BusinessException(409, "原件完整性校验失败");
            }
            return new FileLease(temp, true);
        } catch (IOException | RuntimeException e) {
            log.error("打开远程原件失败 errorType={}", e.getClass().getSimpleName());
            Files.deleteIfExists(temp); throw e;
        }
    }

    private FileLease openDemoDocument(String id, Long size, String hash) throws IOException {
        if (demoDocuments == null || !id.matches("MYSQL-DEMO-\\d{3}-DOC") || size == null || size <= 0
                || size > MAX_BYTES || hash == null || !hash.matches("(?i)[0-9a-f]{64}")) {
                throw new BusinessException(409, "演示原件记录无效");
                }
        byte[] bytes = demoDocuments.findContent(id, size).orElse(null);
        if (bytes == null) {
            throw new BusinessException(404, "演示原件不存在或大小不匹配");
        }
        if (!hash.equalsIgnoreCase(HexFormat.of().formatHex(sha256().digest(bytes)))) {
            throw new BusinessException(409, "演示原件哈希校验失败");
        }
        Path temp = Files.createTempFile("rfq-demo-original-", ".docx");
        try {
            Files.write(temp, bytes);
            return new FileLease(temp, true);
        } catch (IOException | RuntimeException e) {
            log.error("打开示例原件失败", e);
            Files.deleteIfExists(temp);
            throw e;
        }
    }
}
