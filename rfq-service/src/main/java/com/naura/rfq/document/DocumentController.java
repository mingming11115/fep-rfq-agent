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
    private final ParseService parseService;

    public record DocumentView(String id, String projectId, String name, int version, String purpose,
            long sizeBytes, String sha256, String status, String uploadedBy, Instant createdAt) {

        public static DocumentView of(CustomerDocument document) {
            return new DocumentView(document.getId(), document.getProjectId(), document.getName(),
                    document.getVersion(), document.getPurpose(), document.getSizeBytes(),
                    document.getSha256(), document.getStatus(), document.getUploadedBy(),
                    document.getCreatedAt());
        }
    }

    @GetMapping("/projects/{projectId}/documents")
    public ApiResponse<PageView<DocumentView>> list(@PathVariable String projectId,
            @RequestParam(defaultValue = "1") int page,
            @RequestParam(defaultValue = "20") int size,
            @RequestParam(required = false) String sort) {
        Project project = requireProject(projectId);
        access.requireProject(CurrentUserHolder.require(), project);
        PageQuery query = PageQuery.of(page, size, sort, List.of("createdAt"), "createdAt,desc");
        List<CustomerDocument> data = documents.findPage(projectId, query);
        long total = documents.countByProjectId(projectId);
        return ApiResponse.success(PageView.of(data.stream().map(DocumentView::of).toList(),
                total, query.getPage(), query.getSize()));
    }

    @PostMapping("/projects/{projectId}/documents")
    public ApiResponse<DocumentView> upload(@PathVariable String projectId,
            @RequestParam("file") MultipartFile file) throws IOException {
        CurrentUser user = CurrentUserHolder.require();
        Project project = requireProject(projectId);
        access.requireProject(user, project);
        access.requireSourceManager(user, project.getBuId());

        if (file == null || file.isEmpty()) {
            throw new BusinessException(400, "请选择要上传的文件");
        }
        String name = file.getOriginalFilename() == null ? "unnamed" : file.getOriginalFilename();
        String lower = name.toLowerCase(Locale.ROOT);
        String extension = SUPPORTED.stream().filter(lower::endsWith).findFirst()
                .orElseThrow(() -> new BusinessException(400,
                        "当前仅支持 DOCX / PDF。DOC 请先另存为 DOCX 再上传：" + name));

        String documentId = Ids.next("DOC");
        DocumentStorage.StoredFile stored = storage.save(documentId, file, extension);

        CustomerDocument document = new CustomerDocument();
        document.setId(documentId);
        document.setProjectId(projectId);
        document.setName(name);
        document.setVersion(nextVersion(projectId));
        document.setPurpose("REQUIREMENT_SOURCE");
        document.setStorageRef(stored.storageRef());
        document.setContentType(file.getContentType());
        document.setSizeBytes(stored.size());
        document.setSha256(stored.sha256());
        document.setStatus(CustomerDocument.STATUS_UPLOADED);
        document.setUploadedBy(user.id());
        documents.insert(document);

        project.setStage("PARSING");
        projects.update(project);
        audit.success(user.id(), "上传客户文件", "document", document.getId(),
                name + "（" + stored.size() + " bytes）");
        return ApiResponse.success(DocumentView.of(document));
    }

    @PostMapping("/projects/{projectId}/documents/sample")
    public ApiResponse<DocumentView> uploadSample(@PathVariable String projectId) throws Exception {
        CurrentUser user = CurrentUserHolder.require();
        Project project = requireProject(projectId);
        access.requireProject(user, project);
        access.requireSourceManager(user, project.getBuId());

        String documentId = Ids.next("DOC");
        byte[] content = sampleBuilder.build();
        DocumentStorage.StoredFile stored = storage.saveBytes(documentId, ".docx", content);

        CustomerDocument document = new CustomerDocument();
        document.setId(documentId);
        document.setProjectId(projectId);
        document.setName("示例RFQ-锅炉给水泵.docx");
        document.setVersion(nextVersion(projectId));
        document.setPurpose("REQUIREMENT_SOURCE");
        document.setStorageRef(stored.storageRef());
        document.setContentType("application/vnd.openxmlformats-officedocument.wordprocessingml.document");
        document.setSizeBytes(stored.size());
        document.setSha256(stored.sha256());
        document.setStatus(CustomerDocument.STATUS_UPLOADED);
        document.setUploadedBy(user.id());
        documents.insert(document);

        project.setStage("PARSING");
        projects.update(project);
        audit.success(user.id(), "载入示例RFQ", "document", document.getId(),
                document.getName() + "（" + stored.size() + " bytes）");
        return ApiResponse.success(DocumentView.of(document));
    }

    private int nextVersion(String projectId) {        return documents.findByProjectIdOrderByCreatedAtDesc(projectId).stream()
                .map(CustomerDocument::getVersion)
                .filter(java.util.Objects::nonNull)
                .max(Integer::compareTo)
                .orElse(0) + 1;
    }

    private Project requireProject(String projectId) {
        return projects.findById(projectId).orElseThrow(() -> new BusinessException(404, "项目不存在"));
    }
}
