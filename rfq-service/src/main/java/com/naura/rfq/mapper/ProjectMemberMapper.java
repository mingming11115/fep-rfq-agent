package com.naura.rfq.mapper;

import com.naura.rfq.common.api.PageQuery;
import com.naura.rfq.domain.ProjectMember;
import java.util.List;
import java.util.Optional;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

@Mapper
public interface ProjectMemberMapper {
    Optional<ProjectMember> find(@Param("projectId") String projectId, @Param("userId") String userId);
    List<ProjectMember> findPage(@Param("projectId") String projectId, @Param("q") PageQuery query);
    long count(@Param("projectId") String projectId);
    int upsert(ProjectMember member);
}
