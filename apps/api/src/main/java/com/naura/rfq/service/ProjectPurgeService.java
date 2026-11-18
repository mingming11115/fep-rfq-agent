package com.naura.rfq.service;

import com.naura.rfq.common.exception.BusinessException;
import com.naura.rfq.mapper.ProjectMapper;
import com.naura.rfq.mapper.ProjectPurgeMapper;
import com.naura.rfq.model.entity.Project;
import com.naura.rfq.security.AccessGuard;
import com.naura.rfq.security.CurrentUser;
import java.time.Duration;
import java.time.Instant;
import java.util.List;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.context.annotation.Lazy;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * 项目彻底删除与保留期管理：已删除（CANCELLED）项目最多保留 7 天，
 * 到期由定时任务自动彻底清除；用户也可在保留期内手动彻底删除。
 */
@Service
@Slf4j
public class ProjectPurgeService {

    private static final long RETENTION_DAYS = 7;
    private static final String PURGE_ACTION = "彻底删除项目";

    @Autowired
    private ProjectMapper projects;
    @Autowired
    private ProjectPurgeMapper purgeMapper;
    @Autowired
    private AccessGuard access;
    @Autowired
    private AuditService audit;
    @Lazy
    @Autowired
    private ProjectPurgeService self;

    @Transactional
    public Project purgeByUser(CurrentUser actor, String id) {
        Project project = projects.findByIdForUpdate(id)
                .orElseThrow(() -> new BusinessException(404, "项目不存在"));
        access.requireProjectManager(actor, project);
        if (!project.isArchived()) {
            throw new BusinessException(409, "仅已删除（归档）的项目可以彻底删除");
        }
        self.purgeData(project);
        audit.successInBu(actor.id(), project.getBuId(), PURGE_ACTION, "project", project.getId(),
                project.getCode() + " · " + project.getName() + "；原删除时间 "
                        + (project.getArchivedAt() == null ? "未知" : project.getArchivedAt()));
        return project;
    }

    /** 保留期（默认 7 天）到期后自动彻底清除已删除项目；单项目失败不影响其余项目。 */
    @Scheduled(fixedDelayString = "${rfq.project.retention-check-interval-ms:3600000}")
    public void purgeExpired() {
        Instant cutoff = Instant.now().minus(Duration.ofDays(RETENTION_DAYS));
        List<Project> expired = projects.findExpiredArchived(cutoff);
        if (expired.isEmpty()) {
            return;
        }
        for (Project project : expired) {
            try {
                self.purgeExpiredProject(project.getId());
            } catch (Exception exception) {
                log.error("project.retention.purge_failed projectId={} errorType={}",
                        project.getId(), exception.getClass().getSimpleName(), exception);
            }
        }
        log.info("project.retention.purged count={} retentionDays={}", expired.size(), RETENTION_DAYS);
    }

    @Transactional
    public void purgeExpiredProject(String id) {
        Project project = projects.findByIdForUpdate(id).orElse(null);
        if (project == null || !project.isArchived()) {
            return;
        }
        self.purgeData(project);
        audit.successInBu(null, project.getBuId(), "保留期到期自动清除", "project", project.getId(),
                project.getCode() + " · " + project.getName() + "；已删除超过 " + RETENTION_DAYS + " 天");
    }

    /** 在当前事务内按依赖顺序清理项目全部业务数据，并删除项目行本身。 */
    public void purgeData(Project project) {
        String id = project.getId();
        purgeMapper.deleteDocumentBlocks(id);
        purgeMapper.deleteParseBatches(id);
        purgeMapper.deleteParseRuns(id);
        purgeMapper.deleteDocumentReplacements(id);
        purgeMapper.deleteDocuments(id);
        purgeMapper.deleteMatchResults(id);
        purgeMapper.deleteMatchRuns(id);
        purgeMapper.deleteMatchInputs(id);
        purgeMapper.deleteRequirements(id);
        purgeMapper.deleteResponses(id);
        purgeMapper.deleteReviews(id);
        purgeMapper.deleteSnapshots(id);
        purgeMapper.deleteResponseConfig(id);
        purgeMapper.deleteMembers(id);
        purgeMapper.deleteWorkVersions(id);
        purgeMapper.deleteMatchPolicies(id);
        purgeMapper.deleteHistoryDocuments(id);
        purgeMapper.deleteHistoryClauses(id);
        purgeMapper.deleteStandardReplies(id);
        if (projects.deleteById(id) != 1) {
            throw new BusinessException(409, "项目已被他人修改，请刷新后重试");
        }
    }
}
