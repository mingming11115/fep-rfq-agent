package com.naura.rfq.service;

import com.naura.rfq.common.exception.BusinessException;
import com.naura.rfq.common.id.Ids;
import com.naura.rfq.integration.export.AnnotatedOriginal;
import com.naura.rfq.integration.parse.HybridRequirementExtractor;
import com.naura.rfq.mapper.CustomerDocumentMapper;
import com.naura.rfq.mapper.ProjectMapper;
import com.naura.rfq.mapper.RequirementMapper;
import com.naura.rfq.model.entity.CustomerDocument;
import com.naura.rfq.model.entity.Project;
import com.naura.rfq.model.entity.Requirement;
import com.naura.rfq.model.parse.ExtractedRequirement;
import com.naura.rfq.model.parse.RawBlock;
import com.naura.rfq.model.parse.SourceRef;
import com.naura.rfq.model.vo.RequirementView;
import com.naura.rfq.security.AccessGuard;
import com.naura.rfq.security.CurrentUser;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.io.IOException;
import java.time.Instant;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Locale;
import lombok.extern.slf4j.Slf4j;

@Service
@Slf4j
public class SelectionExtractionService {
    @Autowired
    private ProjectMapper projects;
    @Autowired
    private CustomerDocumentMapper documents;
    @Autowired
    private DocumentService originals;
    @Autowired
    private RequirementMapper requirements;
    @Autowired
    private HybridRequirementExtractor extractor;
    @Autowired
    private AccessGuard access;
    @Autowired
    private ProjectWorkScope work;
    @Autowired
    private RequirementMatchService matches;
    @Autowired
    private AuditService audit;

    public record Selection(String text, Integer page, String wordRange) {}
    public record Candidate(String id, String customerClauseNo, String sectionPath, String title,
                            String originalText, String requirementText, String metricsJson, String conditionsText) {}
    public record Preview(List<Candidate> candidates, List<String> issues) {}
    public record Confirm(Selection selection, List<Candidate> candidates) {}

    public Preview preview(CurrentUser user, String documentId, Selection selection) {
        CustomerDocument document = document(documentId);
        Project project = projects.findById(document.getProjectId()).orElseThrow(this::missingDocument);
        requireSource(user, project, document);
        String anchor = anchor(selection);
        verifySelection(user, document, selection, anchor);
        List<RawBlock> blocks = new ArrayList<>();
        selection.text().lines().filter(line -> !line.isBlank()).forEach(line ->
            blocks.add(new RawBlock(blocks.size(), RawBlock.PARAGRAPH, line.strip(), List.of(), "", null, anchor)));
        var result = extractor.extractWithReport(blocks);
        List<Candidate> candidates = result.requirements().stream()
            .filter(row -> row.originalText() != null && !row.originalText().isBlank()
                && selection.text().contains(row.originalText()))
            .map(this::candidate).toList();
        return new Preview(candidates, result.issues());
    }

    @Transactional
    public List<RequirementView> confirm(CurrentUser user, String documentId, Confirm request) {
        CustomerDocument initial = document(documentId);
        Project project = projects.findByIdForUpdate(initial.getProjectId()).orElseThrow(this::missingDocument);
        CustomerDocument document = documents.findByIdForUpdate(documentId).orElseThrow(this::missingDocument);
        requireSource(user, project, document);
        String anchor = anchor(request.selection());
        if (request.candidates() == null || request.candidates().isEmpty()) {
            throw new BusinessException(400, "请至少选择一条候选条款");
        }
        verifySelection(user, document, request.selection(), anchor);
        var saved = new ArrayList<RequirementView>();
        var ids = new HashSet<String>();
        for (Candidate candidate : request.candidates()) {
            if (candidate == null || candidate.id() == null || !candidate.id().matches("REQ-[a-f0-9]{1,32}")
                    || !ids.add(candidate.id()) || candidate.originalText() == null || candidate.originalText().isBlank()
                    || request.selection().text().lines().noneMatch(line -> line.contains(candidate.originalText()))
                    || candidate.requirementText() == null || candidate.requirementText().isBlank()) {
                throw new BusinessException(400, "候选条款无效，请重新抽取");
            }
            var references = List.of(new SourceRef(anchor, candidate.originalText()));
            var previous = requirements.findByIdForUpdate(candidate.id()).orElse(null);
            if (previous != null) {
                if (!documentId.equals(previous.getDocumentId())
                        || !references.equals(SourceRef.decode(previous.getSourceRefsJson()))) {
                    throw new BusinessException(409, "条款来源已变化，请重新抽取");
                }
                saved.add(RequirementView.of(previous));
                continue;
            }
            var row = new Requirement();
            row.setId(candidate.id());
            row.setProjectId(project.getId());
            row.setDocumentId(documentId);
            row.setCustomerClauseNo(limited(candidate.customerClauseNo(), 64));
            row.setSectionPath(limited(candidate.sectionPath(), 500));
            row.setTitle(limited(candidate.title(), 300));
            row.setOriginalText(candidate.originalText());
            String requirement = candidate.requirementText().strip();
            if (candidate.conditionsText() != null && !candidate.conditionsText().isBlank()
                    && !requirement.contains(candidate.conditionsText())) {
                requirement += "\n适用条件：" + candidate.conditionsText();
            }
            row.setRequirementText(requirement);
            row.setMetricsJson(candidate.metricsJson());
            row.setSourceRefsJson(SourceRef.encode(references));
            row.setExtractionStatus(ExtractedRequirement.VALID);
            row.setVersion(0L);
            row.setCreatedAt(Instant.now());
            requirements.insert(row);
            matches.corrected(project, document, row);
            audit.successInBu(user.id(), project.getBuId(), "从选中原文添加条款", "requirement", row.getId(), documentId);
            saved.add(RequirementView.of(row));
        }
        return saved;
    }

    private Candidate candidate(ExtractedRequirement row) {
        return new Candidate(Ids.next("REQ"), row.customerClauseNo(), row.sectionPath(), row.title(),
            row.originalText(), row.requirementText(), row.metricsJson(), row.conditionsText());
    }

    private CustomerDocument document(String id) {
        return documents.findById(id).orElseThrow(this::missingDocument);
    }

    private BusinessException missingDocument() {
        return new BusinessException(404, "原件不存在");
    }

    private void requireSource(CurrentUser user, Project project, CustomerDocument document) {
        access.requireProject(user, project);
        access.requireSourceManager(user, project.getBuId());
        access.requireActiveProject(project);
        work.requireEditable(project.getId(), document.getId());
        if (CustomerDocument.STATUS_PARSING.equals(document.getStatus())) {
            throw new BusinessException(409, "文件正在解析，请稍后再抽取选区");
        }
    }

    private void verifySelection(CurrentUser user, CustomerDocument document, Selection selection, String anchor) {
        String extension = selection.page() == null ? ".docx" : ".pdf";
        if (!document.getName().toLowerCase(Locale.ROOT).endsWith(extension)) {
            throw new BusinessException(400, "选区位置与文件类型不匹配");
        }
        try {
            var original = originals.download(user, document.getId());
            AnnotatedOriginal.requireSelectedText(original.content(), anchor, selection.text());
        } catch (IOException | BusinessException exception) {
            log.error("校验选中文字与原件内容失败", exception);
            throw new BusinessException(409, "选中文字与当前原件位置不一致，请打开原件重新选择");
        }
    }

    private static String anchor(Selection selection) {
        if (selection == null || selection.text() == null || selection.text().isBlank() || selection.text().length() > 12000) {
            throw new BusinessException(400, "请选择 1 至 12000 字的原文");
        }
        if (selection.page() != null && selection.page() > 0 && selection.wordRange() == null) {
            return "selection:page:" + selection.page();
        }
        if (selection.page() == null && selection.wordRange() != null && selection.wordRange().length() <= 240
                && selection.wordRange().matches("\\d+(?:/\\d+)*:\\d+-\\d+(?:/\\d+)*:\\d+")) {
            return "selection:word:" + selection.wordRange();
        }
        throw new BusinessException(400, "无法定位选中的原文，请重新选择");
    }

    private static String limited(String value, int max) {
        return value == null ? null : value.substring(0, Math.min(value.length(), max));
    }
}
