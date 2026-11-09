package com.naura.rfq.controller;

import com.jayway.jsonpath.JsonPath;
import com.naura.rfq.service.JwtService;
import java.nio.charset.StandardCharsets;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.ResultActions;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;
import org.springframework.transaction.annotation.Transactional;
import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@SpringBootTest(properties = "rfq.demo-data.enabled=false")
@AutoConfigureMockMvc(printOnlyOnFailure = false)
@Transactional
class StandardReplyIntegrationTest {
    @Autowired MockMvc mvc;
    @Autowired JwtService jwt;
    @Autowired JdbcTemplate jdbc;

    @Test void importsActualRowsOnceAndRequiresIndependentPublishBeforeQueuingTheIndex() throws Exception {
        var fixture = fixture();
        String path = fixture.path();
        var file = csv("回复标题,客户要求,标准回复,适用条件\n现场供电,是否支持 380 V,支持 380 V,标准供电配置\n缺答复,要求,,条件\n");
        String result = call(multipart(path + "/import").file(file), fixture.author())
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.items[0].answer").value("支持 380 V"))
                .andExpect(jsonPath("$.data.items[0].sourceRow").value(2))
                .andExpect(jsonPath("$.data.errors[0].rowNumber").value(3))
                .andReturn().getResponse().getContentAsString(StandardCharsets.UTF_8);
        String id = JsonPath.read(result, "$.data.items[0].id");
        String version = path + "/" + id + "/versions/1";

        call(multipart(path + "/import").file(file), fixture.author()).andExpect(status().isOk())
                .andExpect(jsonPath("$.data.items.length()").value(0))
                .andExpect(jsonPath("$.data.skippedRows[0]").value(2));
        call(get(version), fixture.outsider()).andExpect(status().isForbidden());
        action(version, "submit", fixture.author(), 0, "").andExpect(status().isOk())
                .andExpect(jsonPath("$.data.status").value("待审核"));
        action(version, "publish", fixture.author(), 1, "").andExpect(status().isForbidden());
        assertThat(jdbc.queryForObject("select count(*) from standard_reply_index_sync where bu_id=?", Integer.class,
                fixture.bu())).isZero();
        action(version, "publish", fixture.reviewer(), 0, "").andExpect(status().isConflict());
        action(version, "publish", fixture.reviewer(), 1, "已核对适用范围").andExpect(status().isOk())
                .andExpect(jsonPath("$.data.status").value("已发布"))
                .andExpect(jsonPath("$.data.indexStatus").value("queued"));
        assertThat(jdbc.queryForObject("select operation from standard_reply_index_sync where bu_id=? and reply_id=?",
                String.class, fixture.bu(), id)).isEqualTo("upsert");
        assertThat(jdbc.queryForObject("select json_unquote(json_extract(payload, '$.requirement_text')) "
                + "from standard_reply_index_sync where bu_id=? and reply_id=?", String.class, fixture.bu(), id))
                .isEqualTo("是否支持 380 V");

        action(version, "revise", fixture.author(), 2, "").andExpect(status().isOk())
                .andExpect(jsonPath("$.data.version").value(2))
                .andExpect(jsonPath("$.data.status").value("草稿"));
        String next = path + "/" + id + "/versions/2";
        call(patch(next).contentType(MediaType.APPLICATION_JSON).content("""
                {"revision":0,"title":"现场供电","requirement":"是否支持 400 V","answer":"支持 400 V","conditions":"配置 B"}
                """), fixture.author()).andExpect(status().isOk()).andExpect(jsonPath("$.data.revision").value(1));
        action(next, "submit", fixture.author(), 1, "").andExpect(status().isOk());
        call(get(version), fixture.author()).andExpect(status().isOk())
                .andExpect(jsonPath("$.data.validity").value("有效"));
        action(next, "publish", fixture.reviewer(), 2, "").andExpect(status().isOk());
        call(get(version), fixture.author()).andExpect(status().isOk())
                .andExpect(jsonPath("$.data.validity").value("被替代"));
        action(next, "revoke", fixture.reviewer(), 3, "口径失效").andExpect(status().isOk())
                .andExpect(jsonPath("$.data.status").value("已撤销"));
        assertThat(jdbc.queryForMap("select version, operation from standard_reply_index_sync where bu_id=? and reply_id=?",
                fixture.bu(), id)).containsEntry("version", 2).containsEntry("operation", "delete");
    }

    @Test void legacyReviewCanBeReturnedButRestrictedRecordsCannotBePublishedToABuDataset() throws Exception {
        var fixture = fixture();
        jdbc.update("insert into `standard-reply-record`(bu_id,id,version,scope,payload) values (?,?,1,?,?)",
                fixture.bu(), "LEGACY", "授权专业人员", """
                {"id":"LEGACY","version":1,"type":"standard","title":"供电","requirement":"是否支持 380 V",
                 "answer":"支持 380 V","conditions":"标准配置","status":"待审核"}
                """);
        String version = fixture.path() + "/LEGACY/versions/1";
        action(version, "publish", fixture.reviewer(), 0, "").andExpect(status().isConflict());
        action(version, "return", fixture.reviewer(), 0, "补齐提交人").andExpect(status().isOk())
                .andExpect(jsonPath("$.data.status").value("退回"));
        action(version, "submit", fixture.author(), 1, "").andExpect(status().isOk());
        action(version, "publish", fixture.reviewer(), 2, "").andExpect(status().isConflict());
        assertThat(jdbc.queryForObject("select count(*) from standard_reply_index_sync where bu_id=?", Integer.class,
                fixture.bu())).isZero();
    }

    private ResultActions action(String path, String action, String actor, long revision, String reason) throws Exception {
        return call(post(path + "/" + action).contentType(MediaType.APPLICATION_JSON)
                .content("{\"revision\":" + revision + ",\"reason\":\"" + reason + "\"}"), actor);
    }

    private ResultActions call(MockHttpServletRequestBuilder request, String actor) throws Exception {
        return mvc.perform(request.header("Authorization", "Bearer " + jwt.issue(actor)));
    }

    private MockMultipartFile csv(String text) {
        return new MockMultipartFile("file", "standard.csv", "text/csv", text.getBytes(StandardCharsets.UTF_8));
    }

    private Fixture fixture() {
        String bu = "ST-" + UUID.randomUUID().toString().substring(0, 8);
        jdbc.update("insert into business_unit(id,code,name) values (?,?,?)", bu, bu, bu);
        String other = bu + "-OUT";
        jdbc.update("insert into business_unit(id,code,name) values (?,?,?)", other, other, other);
        return new Fixture(bu, user(bu, "A", "BU_ADMIN"), user(bu, "B", "BU_ADMIN"), user(other, "C", "SR"));
    }

    private String user(String bu, String suffix, String role) {
        String id = bu + "-" + suffix;
        jdbc.update("insert into app_user(id,username,password_hash,display_name) values (?,?,?,?)", id, id, "test", id);
        jdbc.update("insert into user_bu_role(user_id,bu_id,role) values (?,?,?)", id, bu, role);
        jdbc.update("insert into bu_member_profile(user_id,bu_id,resource_qualifications) values (?,?,?)",
                id, bu, "BU_ADMIN".equals(role) ? "knowledge-publish" : "");
        return id;
    }

    private record Fixture(String bu, String author, String reviewer, String outsider) {
        String path() { return "/api/rfq/business-units/" + bu + "/standard-replies"; }
    }
}
