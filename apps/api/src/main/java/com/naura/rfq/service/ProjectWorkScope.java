package com.naura.rfq.service;

import com.naura.rfq.common.exception.BusinessException;
import java.util.HashSet;
import java.util.List;
import java.util.Set;
import lombok.RequiredArgsConstructor;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

@Component
@RequiredArgsConstructor
class ProjectWorkScope {
    record Replacement(String oldDocumentId, String newDocumentId, String status, Long workVersion,
            String createdBy, String createdAt, String activatedBy, String activatedAt, String reason) {}

    private final JdbcTemplate jdbc;

    long version(String project) {
        return jdbc.query("select work_version from project_work_version where project_id=?",
                (row, n) -> row.getLong(1), project).stream().findFirst().orElse(1L);
    }

    long advance(String project) {
        long next = version(project) + 1;
        jdbc.update("""
                insert into project_work_version(project_id,work_version) values (?,?) as desired
                on duplicate key update work_version=desired.work_version
                """, project, next);
        return next;
    }

    List<Replacement> replacements(String project) {
        return jdbc.query("""
                select * from rfq_document_replacement where project_id=? order by created_at,new_document_id
                """, (row, n) -> new Replacement(row.getString("old_document_id"), row.getString("new_document_id"),
                row.getString("status"), row.getObject("work_version", Long.class), row.getString("created_by"),
                row.getString("created_at"), row.getString("activated_by"), row.getString("activated_at"),
                row.getString("reason")), project);
    }

    Set<String> inactiveDocuments(String project) {
        var excluded = new HashSet<String>();
        for (var row : replacements(project)) {
            if ("active".equals(row.status())) excluded.add(row.oldDocumentId());
            else excluded.add(row.newDocumentId());
        }
        return excluded;
    }

    boolean retired(String project, String document) {
        return jdbc.queryForObject("""
                select count(*) from rfq_document_replacement where project_id=? and
                    ((old_document_id=? and status='active') or (new_document_id=? and status='cancelled'))
                """, Integer.class, project, document, document) > 0;
    }

    void requireEditable(String project, String document) {
        if (retired(project, document)) throw new BusinessException(409, "该原件已退出当前工作范围");
    }
}
