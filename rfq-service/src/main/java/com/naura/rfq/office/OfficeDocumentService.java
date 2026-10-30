package com.naura.rfq.office;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.web.server.ResponseStatusException;
import java.io.*;
import java.net.URI;
import java.net.http.*;
import java.security.SecureRandom;
import java.time.*;
import java.util.*;
import java.util.concurrent.ConcurrentHashMap;
import java.util.zip.ZipInputStream;
import static java.nio.charset.StandardCharsets.UTF_8;

@Service
@EnableConfigurationProperties(OfficeProperties.class)
public class OfficeDocumentService {
    private final OfficeProperties properties;
    private final OfficeFileStore store;
    private final OfficeJwt jwt;
    private final ObjectMapper json;
    private final HttpClient http = HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(5)).followRedirects(HttpClient.Redirect.NEVER).build();
    private final Map<String, Object> locks = new ConcurrentHashMap<>();
    public OfficeDocumentService(OfficeProperties p, OfficeFileStore s, OfficeJwt j, ObjectMapper json) { properties = p; store = s; jwt = j; this.json = json; }
    public Map<String, Object> upload(String name, byte[] bytes, String project, String file, String version) throws IOException {
        validate(name, bytes);
        String type = name.toLowerCase(Locale.ROOT).endsWith(".pdf") ? "pdf" : "docx";
        var random = new byte[32]; new SecureRandom().nextBytes(random);
        String access = Base64.getUrlEncoder().withoutPadding().encodeToString(random), id = UUID.randomUUID().toString();
        var doc = new OfficeFileStore.Document(id, name, type, text(project), text(file), text(version), OfficeFileStore.hash(access.getBytes(UTF_8)), newKey(), 0, "", "", OfficeFileStore.hash(bytes), "");
        store.create(doc, bytes);
        var response = metadata(doc); response.put("access", access); return response;
    }
    public Map<String, Object> metadata(OfficeFileStore.Document d) {
        var out = new LinkedHashMap<String, Object>();
        out.put("id", d.id()); out.put("name", d.name()); out.put("fileType", d.fileType()); out.put("projectId", d.projectId());
        out.put("fileId", d.fileId()); out.put("sourceVersion", d.sourceVersion()); out.put("revision", d.revision()); out.put("savedAt", d.savedAt()); out.put("lastError", d.lastError());
        return out;
    }
    public Map<String, Object> session(OfficeFileStore.Document doc, boolean readOnly, String userId, String userName) {
        if (!properties.configured()) throw new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE, "文档服务尚未配置，请先启动 ONLYOFFICE 并设置 JWT 密钥");
        var config = new LinkedHashMap<String, Object>();
        config.put("documentType", doc.fileType().equals("pdf") ? "pdf" : "word");
        config.put("width", "100%"); config.put("height", "100%"); config.put("type", "desktop");
        config.put("document", Map.of("fileType", doc.fileType(), "key", doc.key(), "title", doc.name() + " · 批阅副本",
                "url", properties.callbackBaseUrl() + "/api/office/content/" + doc.id() + "?ticket=" + ticket(doc, "review"),
                "permissions", Map.of("edit", !readOnly, "comment", !readOnly, "review", !readOnly, "download", true, "print", true)));
        config.put("editorConfig", Map.of("mode", readOnly ? "view" : "edit", "lang", "zh-CN",
                "callbackUrl", properties.callbackBaseUrl() + "/api/office/callback/" + doc.id(),
                "user", Map.of("id", text(userId).isEmpty() ? "rfq-local" : text(userId), "name", text(userName).isEmpty() ? "RFQ 用户" : text(userName)),
                "customization", Map.of("forcesave", true, "autosave", true, "compactToolbar", true, "help", false)));
        config.put("token", jwt.sign(config));
        return Map.of("config", config, "apiUrl", properties.publicUrl() + "/web-apps/apps/api/documents/api.js", "document", metadata(doc));
    }
    public String ticket(OfficeFileStore.Document doc, String kind) {
        return jwt.sign(Map.of("id", doc.id(), "kind", kind, "revision", doc.revision(), "exp", Instant.now().plusSeconds(3600).getEpochSecond()));
    }
    public OfficeFileStore.Document content(String id, String token) {
        try {
            JsonNode claims = jwt.verify(token);
            if (!id.equals(claims.path("id").asText()) || !claims.has("exp") || !"review".equals(claims.path("kind").asText())) throw new IllegalArgumentException();
            return store.read(id);
        } catch (IllegalArgumentException e) { throw new ResponseStatusException(HttpStatus.FORBIDDEN, "文档下载链接已失效"); }
    }
    public boolean callback(String id, String token) {
        OfficeFileStore.Document before = null;
        synchronized (locks.computeIfAbsent(id, unused -> new Object())) {
            try {
                JsonNode signed = jwt.verify(token), payload = signed.has("payload") ? signed.get("payload") : signed;
                before = store.read(id);
                String key = payload.path("key").asText();
                int status = payload.path("status").asInt();
                String receipt = OfficeFileStore.hash(payload.toString().getBytes(UTF_8));
                if (receipt.equals(before.lastCallback())) return true;
                if (!key.equals(before.key())) return false;
                if (status == 3 || status == 7) throw new IOException("文档服务报告保存失败，请保留编辑器并重试");
                if (status != 2 && status != 6) return true;
                URI url = URI.create(payload.path("url").asText());
                URI base = URI.create(properties.internalUrl());
                URI publicBase = URI.create(properties.publicUrl());
                URI trusted = sameOrigin(url, base) ? base : sameOrigin(url, publicBase) ? publicBase : null;
                if (trusted == null || url.getUserInfo() != null || !url.getPath().startsWith(trusted.getPath() + "/cache/files/") || url.getPath().contains("..")) throw new IOException("保存下载地址不在受信任的文档服务范围内");
                if (!sameOrigin(url, base)) url = URI.create(properties.internalUrl() + url.getRawPath().substring(publicBase.getRawPath().length()) + (url.getRawQuery() == null ? "" : "?" + url.getRawQuery()));
                var request = HttpRequest.newBuilder(url).timeout(Duration.ofSeconds(30)).GET().build();
                byte[] bytes;
                var result = http.send(request, HttpResponse.BodyHandlers.ofInputStream());
                try (var input = result.body()) {
                    if (result.statusCode() != 200) throw new IOException("文档服务未返回可保存的文件");
                    bytes = input.readNBytes((int) properties.maxFileBytes() + 1);
                }
                validate(before.name(), bytes);
                String digest = OfficeFileStore.hash(bytes);
                long revision = before.revision() + (digest.equals(before.digest()) ? 0 : 1);
                var after = new OfficeFileStore.Document(before.id(), before.name(), before.fileType(), before.projectId(), before.fileId(), before.sourceVersion(), before.accessHash(), status == 2 ? newKey() : key, revision, Instant.now().toString(), "", digest, receipt);
                store.save(after, bytes); return true;
            } catch (Exception e) {
                // An unauthenticated request cannot change metadata or poison the displayed save status.
                if (before != null) try {
                    store.write(new OfficeFileStore.Document(before.id(), before.name(), before.fileType(), before.projectId(), before.fileId(), before.sourceVersion(), before.accessHash(), before.key(), before.revision(), before.savedAt(), "保存未完成，请重试或下载编辑器中的文件", before.digest(), before.lastCallback()));
                } catch (IOException ignored) { /* Existing revision is preserved. */ }
                return false;
            }
        }
    }
    public Map<String, Object> forceSave(OfficeFileStore.Document doc) throws Exception {
        var body = new LinkedHashMap<String, Object>(); body.put("c", "forcesave"); body.put("key", doc.key());
        body.put("token", jwt.sign(body));
        var response = http.send(HttpRequest.newBuilder(URI.create(properties.internalUrl() + "/coauthoring/CommandService.ashx"))
                .timeout(Duration.ofSeconds(15)).header("Content-Type", "application/json").POST(HttpRequest.BodyPublishers.ofByteArray(json.writeValueAsBytes(body))).build(), HttpResponse.BodyHandlers.ofString());
        if (response.statusCode() != 200) throw new ResponseStatusException(HttpStatus.BAD_GATEWAY, "文档保存请求失败");
        int error = json.readTree(response.body()).path("error").asInt(-1);
        if (error != 0 && error != 4) throw new ResponseStatusException(HttpStatus.BAD_GATEWAY, "文档服务暂时无法保存，请稍后重试");
        return Map.of("pending", error == 0, "document", metadata(store.read(doc.id())));
    }
    public void validate(String name, byte[] bytes) {
        if (bytes.length > properties.maxFileBytes()) throw new ResponseStatusException(HttpStatus.PAYLOAD_TOO_LARGE, "文件超过允许的上传大小");
        if (bytes.length == 0 || name == null || name.length() > 240 || name.contains("/") || name.contains("\\")) badFormat();
        if (name.toLowerCase(Locale.ROOT).endsWith(".pdf")) {
            if (bytes.length < 8 || !new String(bytes, 0, 5, UTF_8).equals("%PDF-")) badFormat();
        } else if (name.toLowerCase(Locale.ROOT).endsWith(".docx")) {
            boolean types = false, document = false; long expanded = 0;
            try (var zip = new ZipInputStream(new ByteArrayInputStream(bytes))) {
                java.util.zip.ZipEntry entry; byte[] buffer = new byte[8192];
                while ((entry = zip.getNextEntry()) != null) {
                    types |= entry.getName().equals("[Content_Types].xml"); document |= entry.getName().equals("word/document.xml");
                    int count; while ((count = zip.read(buffer)) != -1) { expanded += count; if (expanded > 100L * 1024 * 1024) badFormat(); }
                }
            } catch (IOException e) { badFormat(); }
            if (!types || !document) badFormat();
        } else badFormat();
    }
    private static void badFormat() { throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "请选择有效的 DOCX 或 PDF 原文件；旧 DOC 请先转换为 DOCX"); }
    private static boolean sameOrigin(URI a, URI b) { return Objects.equals(a.getScheme(), b.getScheme()) && Objects.equals(a.getHost(), b.getHost()) && a.getPort() == b.getPort(); }
    private static String text(String value) { return value == null ? "" : value.substring(0, Math.min(value.length(), 200)); }
    private static String newKey() { return "rfq-" + UUID.randomUUID(); }
}
