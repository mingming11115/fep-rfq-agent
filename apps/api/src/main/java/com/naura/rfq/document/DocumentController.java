package com.naura.rfq.document;

import com.naura.rfq.auth.AccessGuard;
import com.naura.rfq.auth.CurrentUser;
import com.naura.rfq.auth.CurrentUserHolder;
import com.naura.rfq.audit.AuditService;
import com.naura.rfq.common.api.ApiResponse;
import com.naura.rfq.common.api.PageQuery;
import com.naura.rfq.common.api.PageView;
import com.naura.rfq.common.exception.BusinessException;
import com.naura.rfq.common.id.Ids;
import com.naura.rfq.domain.CustomerDocument;
import com.naura.rfq.domain.Project;
import com.naura.rfq.parse.ParseService;
import com.naura.rfq.mapper.CustomerDocumentMapper;
import com.naura.rfq.mapper.ProjectMapper;
import java.io.IOException;
import java.time.Instant;
import java.util.List;
import java.util.Locale;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;

@RestController
@RequestMapping("/api/rfq")
@RequiredArgsConstructor
public class DocumentController {

    private static final List<String> SUPPORTED = List.of(".docx", ".pdf");

    private final ProjectMapper projects;
    private final CustomerDocumentMapper documents;
    private final DocumentStorage storage;
    private final AccessGuard access;
    private final AuditService audit;
    private final SampleRfqBuilder sampleBuilder;

    public record DocumentView(String id, String projectId, String name, int version, String purpose,
            long sizeBytes, String sha256, String status, String uploadedBy, Instant createdAt,String contentType) {

        public static DocumentView of(CustomerDocument document) {
            return new DocumentView(document.getId(), document.getProjectId(), document.getName(),
                    document.getVersion(), document.getPurpose(), document.getSizeBytes(),
                    document.getSha256(), document.getStatus(), document.getUploadedBy(),
                    document.getCreatedAt(),document.getContentType());
        }
    }

    @GetMapping("/projects/{projectId}/documents")
    public ApiResponse<PageView<DocumentView>> list(@PathVariable String projectId,
            @RequestParam(defaultValue = "1") int page,
            @RequestParam(defaultValue = "20") int size,
            @RequestParam(required = false) String sort) {
        Project project = requireProject(projectId);
        access.requireProject(CurrentUserHolder.require(), project);
        PageQuery query = PageQuery.of(page, size, sort, List.of("createdAt","version"), "createdAt,desc");
        List<CustomerDocument> data = documents.findPage(projectId, query);
        long total = documents.countByProjectId(projectId);
        return ApiResponse.success(PageView.of(data.stream().map(DocumentView::of).toList(),
                total, query.getPage(), query.getSize()));
    }

    @GetMapping("/documents/{documentId}")
    public ApiResponse<DocumentView> detail(@PathVariable String documentId) {
        CustomerDocument document=documents.findById(documentId).orElseThrow(()->new BusinessException(404,"文档不存在"));
        access.requireProject(CurrentUserHolder.require(),requireProject(document.getProjectId()));
        return ApiResponse.success(DocumentView.of(document));
    }

    @org.springframework.transaction.annotation.Transactional
    @PostMapping("/projects/{projectId}/documents")
    public ApiResponse<DocumentView> upload(@PathVariable String projectId,
            @RequestParam("file") MultipartFile file) throws IOException {
        CurrentUser user = CurrentUserHolder.require();
        Project project = projects.findByIdForUpdate(projectId)
                .orElseThrow(() -> new BusinessException(404, "项目不存在"));
        access.requireProject(user, project);
        access.requireSourceManager(user, project.getBuId());
        access.requireActiveProject(project);

        if (file == null || file.isEmpty()) {
            throw new BusinessException(400, "请选择要上传的文件");
        }
        String name = file.getOriginalFilename() == null ? "unnamed" : file.getOriginalFilename();
        name = name.replace('\\', '/');
        name = name.substring(name.lastIndexOf('/') + 1).replaceAll("[\\p{Cntrl}]", "");
        if (name.isBlank() || name.length() > 255) throw new BusinessException(400, "文件名为空或超过 255 个字符");
        String lower = name.toLowerCase(Locale.ROOT);
        String extension = SUPPORTED.stream().filter(lower::endsWith).findFirst()
                .orElseThrow(() -> new BusinessException(400,
                        "当前仅支持 DOCX / PDF。DOC 请先另存为 DOCX 再上传"));

        int fileVersion=nextVersion(projectId);

        String documentId = Ids.next("DOC");
        DocumentStorage.StoredFile stored = storage.save(documentId, file, extension);
        cleanOnRollback(stored);

        CustomerDocument document = new CustomerDocument();
        document.setId(documentId);
        document.setProjectId(projectId);
        document.setName(name);
        document.setVersion(fileVersion);
        document.setPurpose("REQUIREMENT_SOURCE");
        document.setStorageRef(stored.storageRef());
        document.setContentType(canonicalType(name));
        document.setSizeBytes(stored.size());
        document.setSha256(stored.sha256());
        document.setStatus(CustomerDocument.STATUS_UPLOADED);
        document.setUploadedBy(user.id());
        insertOriginal(document);

        project.setStage("PARSING");
        projects.update(project);
        audit.successInBu(user.id(), project.getBuId(), "上传客户文件", "document", document.getId(),
                name + "（" + stored.size() + " bytes）");
        return ApiResponse.success(DocumentView.of(document));
    }

    @org.springframework.transaction.annotation.Transactional
    @PostMapping("/projects/{projectId}/documents/sample")
    public ApiResponse<DocumentView> uploadSample(@PathVariable String projectId) throws Exception {
        CurrentUser user = CurrentUserHolder.require();
        Project project = projects.findByIdForUpdate(projectId)
                .orElseThrow(() -> new BusinessException(404, "项目不存在"));
        access.requireProject(user, project);
        access.requireSourceManager(user, project.getBuId());
        access.requireActiveProject(project);

        int fileVersion=nextVersion(projectId);

        String documentId = Ids.next("DOC");
        byte[] content = sampleBuilder.build();
        DocumentStorage.StoredFile stored = storage.saveBytes(documentId, ".docx", content);
        cleanOnRollback(stored);

        CustomerDocument document = new CustomerDocument();
        document.setId(documentId);
        document.setProjectId(projectId);
        document.setName("示例RFQ-锅炉给水泵.docx");
        document.setVersion(fileVersion);
        document.setPurpose("REQUIREMENT_SOURCE");
        document.setStorageRef(stored.storageRef());
        document.setContentType("application/vnd.openxmlformats-officedocument.wordprocessingml.document");
        document.setSizeBytes(stored.size());
        document.setSha256(stored.sha256());
        document.setStatus(CustomerDocument.STATUS_UPLOADED);
        document.setUploadedBy(user.id());
        insertOriginal(document);

        project.setStage("PARSING");
        projects.update(project);
        audit.successInBu(user.id(), project.getBuId(), "载入示例RFQ", "document", document.getId(),
                document.getName() + "（" + stored.size() + " bytes）");
        return ApiResponse.success(DocumentView.of(document));
    }

    @GetMapping("/documents/{documentId}/download")
    public org.springframework.http.ResponseEntity<org.springframework.core.io.Resource> download(@PathVariable String documentId) throws IOException {
        CustomerDocument document = documents.findById(documentId).orElseThrow(() -> new BusinessException(404, "文档不存在"));
        access.requireProject(CurrentUserHolder.require(), requireProject(document.getProjectId()));
        byte[] original;
        try (var lease = storage.open(document.getStorageRef(),document.getSizeBytes(),document.getSha256())) {
            original = java.nio.file.Files.readAllBytes(lease.path());
        }
        String type = canonicalType(document.getName());
        return org.springframework.http.ResponseEntity.ok()
            .header("Cache-Control", "no-store")
            .header("X-Content-Type-Options", "nosniff")
            .header("Content-Disposition", org.springframework.http.ContentDisposition.attachment()
                .filename(document.getName(), java.nio.charset.StandardCharsets.UTF_8).build().toString())
            .contentType(org.springframework.http.MediaType.parseMediaType(type))
            .contentLength(document.getSizeBytes())
            .eTag("\""+document.getSha256().toLowerCase(Locale.ROOT)+"\"")
            .body(new org.springframework.core.io.ByteArrayResource(original));
    }

    private void cleanOnRollback(DocumentStorage.StoredFile file) {
        org.springframework.transaction.support.TransactionSynchronizationManager.registerSynchronization(
            new org.springframework.transaction.support.TransactionSynchronization() {
                @Override public void afterCompletion(int status) {
                    if (status != STATUS_COMMITTED) {
                        try { storage.delete(file.storageRef()); }
                        catch (IOException e) { org.slf4j.LoggerFactory.getLogger(DocumentController.class).warn("上传回滚文件清理失败", e); }
                    }
                }
            });
    }

    private int nextVersion(String projectId) {
        Integer latest=documents.findLatestVersionForUpdate(projectId).orElse(null);
        if(latest==null)return 1;
        if(latest<1)throw new BusinessException(409,"原件版本记录无效，请联系管理员核对");
        if(latest==Integer.MAX_VALUE)throw new BusinessException(409,"原件版本已达上限，不能继续上传");
        return latest+1;
    }

    private void insertOriginal(CustomerDocument document) {
        try {documents.insert(document);}
        catch(org.springframework.dao.DuplicateKeyException exception) {throw new BusinessException(409,"原件版本冲突，请刷新后重试");}
    }

    private Project requireProject(String projectId) {
        return projects.findById(projectId).orElseThrow(() -> new BusinessException(404, "项目不存在"));
    }

    private static String canonicalType(String name) {
        String lower=name.toLowerCase(Locale.ROOT);
        if(lower.endsWith(".pdf"))return "application/pdf";
        if(lower.endsWith(".docx"))return "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
        throw new BusinessException(409,"原件格式记录无效，请联系管理员核对");
    }
}
