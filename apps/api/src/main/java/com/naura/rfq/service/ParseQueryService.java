package com.naura.rfq.service;

import com.naura.rfq.common.exception.BusinessException;
import com.naura.rfq.mapper.CustomerDocumentMapper;
import com.naura.rfq.mapper.DocumentBlockMapper;
import com.naura.rfq.mapper.ParseRunMapper;
import com.naura.rfq.mapper.ProjectMapper;
import com.naura.rfq.model.entity.CustomerDocument;
import com.naura.rfq.model.entity.ParseRun;
import com.naura.rfq.model.entity.Project;
import com.naura.rfq.model.vo.BlockView;
import com.naura.rfq.security.AccessGuard;
import com.naura.rfq.security.CurrentUser;
import java.util.List;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

@Service
@RequiredArgsConstructor
public class ParseQueryService {

    private final ParseService parseService;
    private final ProjectMapper projects;
    private final CustomerDocumentMapper documents;
    private final ParseRunMapper runs;
    private final DocumentBlockMapper blocks;
    private final AccessGuard access;

    public ParseService.ParseRunView start(CurrentUser user, String documentId, List<String> historyDocumentIds) {
        CustomerDocument document = requireDocument(documentId);
        Project project = projects.findById(document.getProjectId())
                .orElseThrow(() -> new BusinessException(404, "项目不存在"));
        access.requireProject(user, project);
        access.requireSourceManager(user, project.getBuId());
        return parseService.run(documentId, user.id(), historyDocumentIds);
    }

    public ParseRun run(CurrentUser user, String runId) {
        ParseRun run = runs.findById(runId).orElseThrow(() -> new BusinessException(404, "解析任务不存在"));
        CustomerDocument document = requireDocument(run.getDocumentId());
        Project project = projects.findById(document.getProjectId())
                .orElseThrow(() -> new BusinessException(404, "项目不存在"));
        access.requireProject(user, project);
        return run;
    }

    public List<BlockView> blocks(CurrentUser user, String documentId) {
        CustomerDocument document = requireDocument(documentId);
        Project project = projects.findById(document.getProjectId())
                .orElseThrow(() -> new BusinessException(404, "项目不存在"));
        access.requireProject(user, project);
        return blocks.findByDocumentIdOrderByBlockIndex(documentId).stream()
                .filter(block -> block.getParentBlockId() == null)
                .map(BlockView::of).toList();
    }

    private CustomerDocument requireDocument(String documentId) {
        return documents.findById(documentId).orElseThrow(() -> new BusinessException(404, "文档不存在"));
    }
}
