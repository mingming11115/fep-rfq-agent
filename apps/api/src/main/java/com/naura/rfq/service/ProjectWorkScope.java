package com.naura.rfq.service;

import com.naura.rfq.mapper.ProjectWorkMapper;
import com.naura.rfq.mapper.ProjectWorkMapper.Replacement;
import com.naura.rfq.common.exception.BusinessException;
import java.util.HashSet;
import java.util.List;
import java.util.Set;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;

@Component
class ProjectWorkScope {
    @Autowired
    private ProjectWorkMapper workRecords;

    long version(String project) {
        return workRecords.findVersion(project).orElse(1L);
    }

    long advance(String project) {
        long next = version(project) + 1;
        workRecords.upsertVersion(project, next);
        return next;
    }

    List<Replacement> replacements(String project) {
        return workRecords.listReplacements(project);
    }

    Set<String> inactiveDocuments(String project) {
        var excluded = new HashSet<String>();
        for (var row : replacements(project)) {
            if ("active".equals(row.status())) {
                excluded.add(row.oldDocumentId());
            } else {
                excluded.add(row.newDocumentId());
            }
        }
        return excluded;
    }

    boolean retired(String project, String document) {
        return workRecords.countRetired(project, document) > 0;
    }

    void requireEditable(String project, String document) {
        if (retired(project, document)) {
            throw new BusinessException(409, "该原件已退出当前工作范围");
        }
    }
}
