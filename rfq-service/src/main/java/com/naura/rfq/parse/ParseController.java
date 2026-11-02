package com.naura.rfq.parse;

import com.naura.rfq.auth.AccessGuard;
import com.naura.rfq.auth.CurrentUser;
import com.naura.rfq.auth.CurrentUserHolder;
import com.naura.rfq.common.api.ApiResponse;
import com.naura.rfq.common.exception.BusinessException;
import com.naura.rfq.domain.CustomerDocument;
import com.naura.rfq.domain.DocumentBlock;
import com.naura.rfq.domain.ParseRun;
import com.naura.rfq.domain.Project;
import com.naura.rfq.mapper.CustomerDocumentMapper;
import com.naura.rfq.mapper.DocumentBlockMapper;
import com.naura.rfq.mapper.ParseRunMapper;
import com.naura.rfq.mapper.ProjectMapper;
import java.util.List;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/rfq")
@RequiredArgsConstructor
public class ParseController {

    private final ParseService parseService;
    private final ProjectMapper projects;
    private final CustomerDocumentMapper documents;
    private final ParseRunMapper runs;
    private final DocumentBlockMapper blocks;
    private final AccessGuard access;

    public record BlockView(String id, int blockIndex, String type, String sectionPath,
            String customerClauseNo, String content, String sourceAnchor, String provenance) {

        public static BlockView of(DocumentBlock block) {
            return new BlockView(block.getId(), block.getBlockIndex(), block.getType(),
                    block.getSectionPath(), block.getCustomerClauseNo(), block.getContent(),
                    block.getSourceAnchor(), block.getProvenance());
        }
    }

    @PostMapping("/documents/{documentId}/parse-runs")
    public ApiResponse<ParseService.ParseRunView> start(@PathVariable String documentId) {
        CurrentUser user = CurrentUserHolder.require();
        CustomerDocument document = requireDocument(documentId);
        Project project = projects.findById(document.getProjectId())
                .orElseThrow(() -> new BusinessException(404, "项目不存在"));
        access.requireProject(user, project);
        access.requireSourceManager(user, project.getBuId());
        return ApiResponse.success(parseService.run(documentId, user.id()));
    }

    @GetMapping("/parse-runs/{runId}")
    public ApiResponse<ParseRun> run(@PathVariable String runId) {
        ParseRun run = runs.findById(runId).orElseThrow(() -> new BusinessException(404, "解析任务不存在"));
        CustomerDocument document = requireDocument(run.getDocumentId());
        Project project = projects.findById(document.getProjectId())
                .orElseThrow(() -> new BusinessException(404, "项目不存在"));
        access.requireProject(CurrentUserHolder.require(), project);
        return ApiResponse.success(run);
    }

    @GetMapping("/documents/{documentId}/blocks")
    public ApiResponse<List<BlockView>> blocks(@PathVariable String documentId) {
        CustomerDocument document = requireDocument(documentId);
        Project project = projects.findById(document.getProjectId())
                .orElseThrow(() -> new BusinessException(404, "项目不存在"));
        access.requireProject(CurrentUserHolder.require(), project);
        return ApiResponse.success(blocks.findByDocumentIdOrderByBlockIndex(documentId).stream()
                .map(BlockView::of).toList());
    }

    private CustomerDocument requireDocument(String documentId) {
        return documents.findById(documentId).orElseThrow(() -> new BusinessException(404, "文档不存在"));
    }
}
