package com.naura.rfq;

import com.naura.rfq.mapper.AppUserMapper;
import com.naura.rfq.mapper.ProjectMapper;
import com.naura.rfq.mapper.RequirementMapper;
import com.naura.rfq.model.entity.AppUser;
import com.naura.rfq.model.entity.Project;
import com.naura.rfq.model.entity.Requirement;
import com.naura.rfq.model.query.PageQuery;
import java.util.List;
import java.util.Optional;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/**
 * 验证 MyBatis 侧真正容易出错的地方：下划线列名到驼峰字段的映射、分页 SQL、
 * 排序白名单、以及乐观锁更新。全部只读，不写入业务数据。
 */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.NONE)
class MapperIntegrationTest {

    @Autowired
    private AppUserMapper users;

    @Autowired
    private ProjectMapper projects;

    @Autowired
    private RequirementMapper requirements;

    @Test
    void mapsSnakeCaseColumnsToCamelCaseFields() {
        Optional<AppUser> found = users.findByUsername("sr01");

        assertThat(found).isPresent();
        AppUser user = found.get();
        assertThat(user.getId()).isEqualTo("demo-sales");
        assertThat(user.getDisplayName()).isNotBlank();
        assertThat(user.getPasswordHash()).startsWith("$2");
        assertThat(user.getStatus()).isEqualTo("ACTIVE");
        assertThat(user.isSystemAdmin()).isFalse();
        assertThat(user.getCreatedAt()).isNotNull();
    }

    @Test
    void pagesProjectsAndCountsThem() {
        PageQuery query = PageQuery.of(1, 10, null, List.of("createdAt"), "createdAt,desc");

        List<Project> page = projects.findPage(null, query);
        long total = projects.countPage(null);

        assertThat(total).isPositive();
        assertThat(page).isNotEmpty();
        assertThat(page).hasSize((int) Math.min(total, 10));
        assertThat(page.get(0).getBuId()).isNotBlank();
        assertThat(page.get(0).getCreatedAt()).isNotNull();
    }

    @Test
    void scopedPagingFiltersByBusinessUnit() {
        PageQuery query = PageQuery.of(1, 10, null, List.of("createdAt"), "createdAt,desc");

        long matched = projects.countPage(List.of("BU-FEP"));
        long unmatched = projects.countPage(List.of("BU-NOT-EXIST"));

        long expected = projects.findAll().stream().filter(project -> "BU-FEP".equals(project.getBuId())).count();
        assertThat(matched).isPositive().isEqualTo(expected);
        assertThat(projects.findPage(List.of("BU-FEP"), query)).allMatch(project -> "BU-FEP".equals(project.getBuId()));
        assertThat(projects.findPage(List.of("BU-NOT-EXIST"), query)).isEmpty();
        assertThat(unmatched).isZero();
    }

    @Test
    void rejectsSortFieldOutsideWhitelist() {
        assertThatThrownBy(() -> PageQuery.of(1, 10, "id desc, (select 1)",
                List.of("createdAt"), "createdAt,desc"))
                .isInstanceOf(IllegalArgumentException.class);
    }

    @Test
    void optimisticUpdateAffectsNothingWhenVersionIsStale() {
        Requirement ghost = new Requirement();
        ghost.setId("REQ-NOT-EXIST");
        ghost.setVersion(99L);

        assertThat(requirements.updateWithVersion(ghost)).isZero();
    }
}
