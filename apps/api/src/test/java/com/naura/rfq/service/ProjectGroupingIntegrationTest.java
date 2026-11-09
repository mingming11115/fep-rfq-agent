package com.naura.rfq.service;

import com.naura.rfq.support.AcceptanceSupport;
import java.util.Map;
import org.junit.jupiter.api.Test;
import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

class ProjectGroupingIntegrationTest extends AcceptanceSupport {
    @Test
    void selectedGroupIsReturnedByCreateAndRead() throws Exception {
        String sr = token("sr01");
        String code = "G" + unique();
        var created = ok(auth(body(post("/api/rfq/projects"),
                Map.of("code", code, "name", "分组验收", "groupId", "TEST-PROCESS")), sr));
        assertThat(created.path("groupId").asText()).isEqualTo("TEST-PROCESS");
        assertThat(created.path("groupPath").asText()).isEqualTo("设备 / 工艺");
        assertThat(created.path("groupCatalogVersion").asLong()).isEqualTo(3);
        assertThat(created.path("groupValues").path("code").asText()).isEqualTo("Si");
        var detail = ok(auth(get("/api/rfq/projects/" + created.path("id").asText()), sr));
        assertThat(detail.path("groupPath")).isEqualTo(created.path("groupPath"));
        var list = ok(auth(get("/api/rfq/projects").param("keyword", code), sr));
        assertThat(list.path("list").get(0).path("groupId")).isEqualTo(created.path("groupId"));
    }

    @Test
    void missingDisabledAndForeignGroupsCannotCreateProjects() throws Exception {
        String sr = token("sr01");
        String code = "G" + unique();
        var request = new java.util.HashMap<>(Map.of("code", code, "name", "分组验收"));
        mvc.perform(auth(body(post("/api/rfq/projects"), request), sr)).andExpect(status().isBadRequest());
        request.put("groupId", "TEST-DISABLED-CHILD");
        mvc.perform(auth(body(post("/api/rfq/projects"), request), sr)).andExpect(status().isConflict());
        request.put("groupId", "MOD-A-R2");
        mvc.perform(auth(body(post("/api/rfq/projects"), request), sr)).andExpect(status().isBadRequest());
        assertThat(ok(auth(get("/api/rfq/projects").param("keyword", code), sr)).path("total").asInt()).isZero();
    }
}
