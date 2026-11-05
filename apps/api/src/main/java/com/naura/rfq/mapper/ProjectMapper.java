package com.naura.rfq.mapper;

import com.naura.rfq.model.entity.Project;
import com.naura.rfq.model.query.PageQuery;
import com.naura.rfq.model.query.ProjectFilter;
import java.util.Collection;
import java.util.List;
import java.util.Optional;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

@Mapper
public interface ProjectMapper {

    Optional<Project> findById(@Param("id") String id);

    Optional<Project> findByIdForUpdate(@Param("id") String id);

    List<Project> findAll();

    List<Project> findByIdIn(@Param("ids") Collection<String> ids);

    List<Project> findByBuIdOrderByCreatedAtDesc(@Param("buId") String buId);

    /** buIds 为 null 表示不限制事业部（系统管理员）；空集合不会传进来，调用方需先行拦截。 */
    List<Project> findPage(@Param("buIds") Collection<String> buIds, @Param("q") PageQuery query);

    long countPage(@Param("buIds") Collection<String> buIds);
    List<Project> findAccessiblePage(@Param("userId") String userId, @Param("q") PageQuery query,@Param("f") ProjectFilter filters);
    long countAccessible(@Param("userId") String userId,@Param("f") ProjectFilter filters);

    int insert(Project project);

    int update(Project project);
    int updateWithVersion(Project project);
}
