package com.naura.rfq.controller;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.naura.rfq.service.JwtService;
import java.io.ByteArrayOutputStream;
import java.util.UUID;
import org.apache.poi.xssf.usermodel.XSSFWorkbook;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.ResultActions;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;
import org.springframework.test.web.servlet.request.MockMultipartHttpServletRequestBuilder;
import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@SpringBootTest(properties = "rfq.demo-data.enabled=false")
@AutoConfigureMockMvc
class CapabilityLibraryIntegrationTest {
    @Autowired MockMvc mvc;
    @Autowired JwtService jwt;
    @Autowired JdbcTemplate jdbc;
    @Autowired ObjectMapper json;

    @Test void independentPublicationPinsEvidenceAndExcludesItAfterRevocation() throws Exception {
        String bu = "CAP-" + UUID.randomUUID().toString().substring(0, 8);
        jdbc.update("insert into business_unit(id,code,name) values (?,?,?)", bu, bu, bu);
        String author = user(bu, "A", "capability-publish"), reviewer = user(bu, "B", "capability-publish");
        String knowledgeOnly = user(bu, "C", "knowledge-publish");
        String path = "/api/rfq/business-units/" + bu + "/capability-library";
        String model = created(post(path + "/models").content("""
                {"code":"E360","name":"测试设备","modelRevision":"R2","config":"CFG-2"}
                """), author);
        String process = created(post(path + "/processes").content("""
                {"modelId":"%s","modelVersion":1,"code":"Si","name":"硅工艺","enabled":true}
                """.formatted(model)), author);
        String evidence = created(post(path + "/evidence").content("""
                {"name":"定位精度测试报告","source":"实验室记录 TR-18","location":"第 8 页"}
                """), author);
        String id = created(post(path + "/capabilities").content("""
                {"modelId":"%s","modelVersion":1,"processId":"%s","processVersion":1,"config":"CFG-2",
                 "metricCode":"position-accuracy","metric":"定位精度","operator":"LE","upper":5,"unit":"μm",
                 "valueType":"保证值","conditions":"硅材料；方法 M1",
                 "evidence":[{"id":"%s","version":1,"location":"第 8 页，表 2"}]}
                """.formatted(model, process, evidence)), author);
        String version = path + "/capabilities/" + id + "/versions/1";
        String evidenceVersion = path + "/evidence/" + evidence + "/versions/1";
        action(version, "submit", author, 0).andExpect(status().isBadRequest()).andExpect(jsonPath("$.code").value(422));
        action(evidenceVersion, "verify", reviewer, 0).andExpect(status().isOk());
        var workbook = workbook(model, process, evidence);
        call(multipart(path + "/capabilities/import").file(workbook), author).andExpect(status().isOk())
                .andExpect(jsonPath("$.data.items[0].status").value("草稿"))
                .andExpect(jsonPath("$.data.items[0].importSource.row").value(2))
                .andExpect(jsonPath("$.data.items[0].upper").value("5"))
                .andExpect(jsonPath("$.data.errors[0].rowNumber").value(3));
        call(multipart(path + "/capabilities/import").file(workbook), author).andExpect(status().isOk())
                .andExpect(jsonPath("$.data.items").isEmpty()).andExpect(jsonPath("$.data.skippedRows[0]").value(2));
        action(version, "submit", author, 0).andExpect(status().isOk());
        action(version, "publish", knowledgeOnly, 1).andExpect(status().isForbidden());
        action(version, "publish", author, 1).andExpect(status().isForbidden());
        action(version, "publish", reviewer, 1).andExpect(status().isOk()).andExpect(jsonPath("$.data.status").value("已发布"));
        var index = jdbc.queryForMap("select version,operation,payload from capability_index_sync where bu_id=? and reply_id=?", bu, id);
        assertThat(index).containsEntry("version", 1).containsEntry("operation", "upsert");
        var projection = json.readTree(index.get("payload").toString());
        assertThat(projection.path("title").asText()).isEqualTo("定位精度");
        assertThat(projection.path("requirement_text").asText()).contains("≤5 μm", "CFG-2", "硅材料；方法 M1");
        assertThat(projection.has("evidenceRefs")).isFalse();

        var lookup = get(path + "/published").param("modelId", model).param("modelVersion", "1")
                .param("processId", process).param("processVersion", "1").param("config", "CFG-2")
                .param("metricCode", "position-accuracy");
        call(lookup, author).andExpect(status().isOk()).andExpect(jsonPath("$.data[0].id").value(id));
        action(version, "revise", author, 2).andExpect(status().isOk()).andExpect(jsonPath("$.data.version").value(2));
        call(lookup, author).andExpect(status().isOk()).andExpect(jsonPath("$.data[0].version").value(1));
        action(evidenceVersion, "revoke", reviewer, 1).andExpect(status().isOk());
        call(lookup, author).andExpect(status().isOk()).andExpect(jsonPath("$.data").isEmpty());
        call(get(version), author).andExpect(status().isOk()).andExpect(jsonPath("$.data.eligible").value(false));
        action(version, "revoke", reviewer, 2).andExpect(status().isOk());
        assertThat(jdbc.queryForMap("select operation,payload from capability_index_sync where bu_id=? and reply_id=?", bu, id))
                .containsEntry("operation", "delete").containsEntry("payload", null);
    }

    @Test void historicalCandidatesInheritProjectScopeAndDoNotInventAnActualValue() throws Exception {
        String bu = "CAP-" + UUID.randomUUID().toString().substring(0, 8);
        jdbc.update("insert into business_unit(id,code,name) values (?,?,?)", bu, bu, bu);
        String author = user(bu, "A", "capability-publish");
        String project = bu + "-P";
        String outsider = user(bu, "C", "", "TECH");
        jdbc.update("insert into project(id,code,name,bu_id,owner_id,created_by) values (?,?,?,?,?,?)",
                project, project, "能力候选测试", bu, author, author);
        jdbc.update("""
                insert into `history-rfq-record`(bu_id,id,version,project_id,scope,payload) values (?,'HISTORY-1',2,?,'仅当前项目',?)
                """, bu, project, """
                {"status":"已发布","validity":"有效","requirement":"精度小于 5 μm","answer":"需另行测试"}
                """);
        String path = "/api/rfq/business-units/" + bu + "/capability-library";
        String intake = path + "/history/HISTORY-1/versions/2/candidate";
        String privateEvidence = created(post(path + "/evidence").content("""
                {"name":"项目试验记录","source":"项目附件","location":"第 2 页","projectId":"%s"}
                """.formatted(project)), author);
        call(post(path + "/capabilities").content("""
                {"evidence":[{"id":"%s","version":1,"location":"第 2 页"}]}
                """.formatted(privateEvidence)), author).andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value(422));
        call(post(intake).content("{}"), outsider).andExpect(status().isForbidden());
        String id = created(post(intake).content("{}"), author);
        call(post(intake).content("{}"), author).andExpect(status().isOk())
                .andExpect(jsonPath("$.data.duplicate").value(true)).andExpect(jsonPath("$.data.id").value(id));
        String version = path + "/capabilities/" + id + "/versions/1";
        call(get(version), author).andExpect(status().isOk()).andExpect(jsonPath("$.data.projectId").value(project))
                .andExpect(jsonPath("$.data.historySource.version").value(2)).andExpect(jsonPath("$.data.value").value(""));
        call(get(version), outsider).andExpect(status().isForbidden());
        action(version, "submit", author, 0).andExpect(status().isBadRequest()).andExpect(jsonPath("$.code").value(422));
    }

    private MockMultipartFile workbook(String model, String process, String evidence) throws Exception {
        try (var book = new XSSFWorkbook(); var bytes = new ByteArrayOutputStream()) {
            var sheet = book.createSheet("能力边界");
            String[][] values = {
                {"机型ID", "机型版本", "工艺ID", "工艺版本", "配置基线", "指标编码", "指标名称", "运算符",
                    "下限", "上限", "含下限", "含上限", "单位", "值类型", "适用条件", "限制", "证据ID", "证据版本", "证据位置"},
                {model, "1", process, "1", "CFG-2", "imported", "定位精度", "LE",
                    "", "5", "", "", "μm", "典型值", "硅工艺", "", evidence, "1", "第 8 页"},
                {model, "1", process, "1", "CFG-2", "invalid", "定位精度", "LE",
                    "", "五", "", "", "μm", "典型值", "硅工艺", "", evidence, "1", "第 8 页"}
            };
            for (int r = 0; r < values.length; r++) {
                var row = sheet.createRow(r);
                for (int c = 0; c < values[r].length; c++) row.createCell(c).setCellValue(values[r][c]);
            }
            book.write(bytes);
            return new MockMultipartFile("file", "能力.xlsx", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                    bytes.toByteArray());
        }
    }

    private ResultActions action(String path, String action, String actor, int revision) throws Exception {
        return call(post(path + "/" + action).content("{\"revision\":" + revision + ",\"reason\":\"已核对原件\"}"), actor);
    }

    private String created(MockHttpServletRequestBuilder request, String actor) throws Exception {
        byte[] body = call(request, actor).andExpect(status().isOk()).andReturn().getResponse().getContentAsByteArray();
        JsonNode id = json.readTree(body).at("/data/id");
        org.assertj.core.api.Assertions.assertThat(id.asText()).isNotBlank();
        return id.asText();
    }

    private ResultActions call(MockHttpServletRequestBuilder request, String actor) throws Exception {
        if (!(request instanceof MockMultipartHttpServletRequestBuilder)) {
            request.contentType("application/json");
        }
        return mvc.perform(request.header("Authorization", "Bearer " + jwt.issue(actor)));
    }

    private String user(String bu, String suffix, String qualification) {
        return user(bu, suffix, qualification, "BU_ADMIN");
    }

    private String user(String bu, String suffix, String qualification, String role) {
        String id = bu + "-" + suffix;
        jdbc.update("insert into app_user(id,username,password_hash,display_name) values (?,?,?,?)", id, id, "test", id);
        jdbc.update("insert into user_bu_role(user_id,bu_id,role) values (?,?,?)", id, bu, role);
        jdbc.update("insert into bu_member_profile(user_id,bu_id,resource_qualifications) values (?,?,?)", id, bu, qualification);
        return id;
    }
}
