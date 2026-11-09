package com.naura.rfq.model.query;

import com.naura.rfq.common.exception.BusinessException;
import com.naura.rfq.model.entity.ProjectStage;
import lombok.Getter;
import lombok.extern.slf4j.Slf4j;

@Getter
@Slf4j
public final class ProjectFilter {
    private final boolean archived;
    private final String keywordPattern;
    private final String stage;

    public ProjectFilter(boolean archived,String keyword,String stage) {
        this.archived=archived;
        if(keyword!=null && keyword.length()>200) {
            throw new BusinessException(400,"项目搜索最多 200 个字符");
        }
        keywordPattern=keyword==null || keyword.isBlank()?null:keyword.trim().replace("!","!!").replace("%","!%").replace("_","!_");
        this.stage=stage==null || stage.isBlank()?null:stage.trim();
        if(this.stage!=null) {
            try { ProjectStage.valueOf(this.stage); }
            catch(IllegalArgumentException exception) {
                log.error("解析项目阶段筛选条件失败 errorType={}", exception.getClass().getSimpleName());
                throw new BusinessException(400,"项目阶段无效");
            }
        }
    }
}
