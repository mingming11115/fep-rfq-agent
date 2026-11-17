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
import com.naura.rfq.model.vo.ParseBlockerView;
import com.naura.rfq.security.AccessGuard;
import com.naura.rfq.security.CurrentUser;
import java.util.List;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

@Service
public class ParseQueryService {

    @Autowired
    private ParseService parseService;
    @Autowired
    private ProjectMapper projects;
    @Autowired
    private CustomerDocumentMapper documents;
    @Autowired
    private ParseRunMapper runs;
    @Autowired
    private DocumentBlockMapper blocks;
    @Autowired
    private AccessGuard access;

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

    /**
     * 读取该文档当前会阻断重解析的下游产物明细，供前端在提交前展示。
     *
     * <p>只校验项目可见性：能打开该文件的人就应能看到「哪些条款已被应答」，无需解析权限。
     *
     * @param user       当前登录用户
     * @param documentId 客户文档 ID
     * @return 应答/评审/定稿计数与涉及的条款号样本
     */
    public ParseBlockerView blockers(CurrentUser user, String documentId) {
        CustomerDocument document = requireDocument(documentId);
        Project project = projects.findById(document.getProjectId())
                .orElseThrow(() -> new BusinessException(404, "项目不存在"));
        access.requireProject(user, project);
        return parseService.blockers(documentId, project.getId());
    }

    private CustomerDocument requireDocument(String documentId) {
        return documents.findById(documentId).orElseThrow(() -> new BusinessException(404, "文档不存在"));
    }
}
