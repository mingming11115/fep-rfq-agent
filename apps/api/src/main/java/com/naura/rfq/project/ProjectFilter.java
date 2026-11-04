package com.naura.rfq.project;

import com.naura.rfq.common.exception.BusinessException;
import com.naura.rfq.domain.ProjectStage;
import lombok.Getter;

@Getter
public final class ProjectFilter {
    private final boolean archived;
    private final String keywordPattern;
    private final String stage;

    public ProjectFilter(boolean archived,String keyword,String stage) {
        this.archived=archived;
        if(keyword!=null && keyword.length()>200)throw new BusinessException(400,"项目搜索最多 200 个字符");
        keywordPattern=keyword==null || keyword.isBlank()?null:keyword.trim().replace("!","!!").replace("%","!%").replace("_","!_");
        this.stage=stage==null || stage.isBlank()?null:stage.trim();
        if(this.stage!=null) {
            try { ProjectStage.valueOf(this.stage); }
            catch(IllegalArgumentException exception) { throw new BusinessException(400,"项目阶段无效"); }
        }
    }
}
