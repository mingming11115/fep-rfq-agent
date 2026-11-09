package com.naura.rfq.controller;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.naura.rfq.integration.standardreply.StandardReplyIndexClient;
import com.naura.rfq.service.JwtService;
import com.naura.rfq.service.RequirementMatchWorker;
import java.io.ByteArrayOutputStream;
import java.util.List;
import java.util.UUID;
import org.apache.poi.xwpf.usermodel.XWPFDocument;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.test.context.bean.override.mockito.MockitoSpyBean;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;
import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@SpringBootTest(properties = {"rfq.demo-data.enabled=false", "rfq.match.worker-enabled=false"})
@AutoConfigureMockMvc
class RequirementMatchIntegrationTest {
    @Autowired MockMvc mvc;
    @Autowired JdbcTemplate jdbc;
    @Autowired ObjectMapper json;
    @Autowired JwtService jwt;
    @Autowired RequirementMatchWorker worker;
    @MockitoSpyBean StandardReplyIndexClient index;

    @Test void policyIsVersionedAndRealParsingEnqueuesWithItsSnapshot() throws Exception {
        var f = fixture();
        var policy = "/api/rfq/business-units/" + f.bu() + "/match-policy";
        assertThat(request(get(policy), f).path("matchOrder").get(0).asText()).isEqualTo("standard_reply");
        String order = "{\"version\":0,\"matchOrder\":[\"history_rfq\",\"standard_reply\",\"capability\"]}";
        assertThat(request(put(policy).contentType("application/json").content(order), f).path("version").asInt()).isEqualTo(1);
        mvc.perform(put(policy).contentType("application/json").content(order).header("Authorization", f.auth()))
                .andExpect(status().isConflict());
        String doc = uploadAndParse(f);
        var rows = request(get("/api/rfq/projects/" + f.project() + "/match-results").param("documentId", doc), f).path("list");
        assertThat(rows).isNotEmpty();
        assertThat(rows.get(0).path("status").asText()).isEqualTo("queued");
        assertThat(rows.get(0).path("matchOrder").get(0).asText()).isEqualTo("history_rfq");
        String requirement = rows.get(0).path("requirementId").asText();
        var source = json.createObjectNode().put("status", "已发布").put("validity", "有效")
                .put("requirement", jdbc.queryForObject("select requirement_text from requirement where id=?", String.class, requirement))
                .put("answer", "项目历史答复");
        jdbc.update("""
                insert into `history-rfq-record`(bu_id,id,version,project_id,scope,payload) values (?,'H1',1,?,'仅当前项目',?)
                """, f.bu(), f.project(), source.toString());
        worker.runOnce();
        var result = detail(f, requirement, rows.get(0).path("runId").asText()).path("result");
        assertThat(result.path("matchedLibrary").asText()).isEqualTo("history_rfq");
        assertThat(result.at("/stages/history_rfq/candidates/0/answer").asText()).isEqualTo("项目历史答复");
        assertThat(result.at("/stages/standard_reply/status").asText()).isEqualTo("not_run");
        verify(index, never()).search(eq(f.bu()), anyBoolean(), anyString(), anyList());
    }

    @Test void waitsForThePublishedIndexVersionThenUsesLocalAnswerAndHidesItAfterRevocation() throws Exception {
        var f = fixture();
        String doc = uploadAndParse(f);
        var run = firstRun(f, doc);
        String requirement = run.path("requirementId").asText(), runId = run.path("runId").asText();
        String body = jdbc.queryForObject("select requirement_text from requirement where id=?", String.class, requirement);
        var payload = json.createObjectNode().put("status", "已发布").put("validity", "有效")
                .put("requirement", body).put("answer", "测试库标准答复");
        putRecord(f, "`standard-reply-record`", "S1", payload);
        jdbc.update("""
            insert into standard_reply_index_sync(bu_id,reply_id,version,operation,updated_at) values (?,'S1',1,'upsert',utc_timestamp(6))
            """, f.bu());
        worker.runOnce();
        assertThat(detail(f, requirement, runId).at("/stages/standard_reply/reason").asText()).isEqualTo("INDEX_NOT_READY");
        verify(index, never()).search(eq(f.bu()), anyBoolean(), anyString(), anyList());

        jdbc.update("update standard_reply_index_sync set synced_at=utc_timestamp(6) where bu_id=?", f.bu());
        doReturn(new StandardReplyIndexClient.SearchResult(List.of(new StandardReplyIndexClient.SearchHit("S1", 2)), "req-stale", 1))
                .when(index).search(eq(f.bu()), eq(false), anyString(), eq(List.of("S1")));
        makeDue(runId);
        worker.runOnce();
        assertThat(detail(f, requirement, runId).at("/stages/standard_reply/reason").asText()).isEqualTo("INDEX_NOT_READY");

        doReturn(new StandardReplyIndexClient.SearchResult(List.of(new StandardReplyIndexClient.SearchHit("S1", 1)), "req-ok", 2))
                .when(index).search(eq(f.bu()), eq(false), anyString(), eq(List.of("S1")));
        makeDue(runId);
        worker.runOnce();
        var found = detail(f, requirement, runId).path("result");
        assertThat(found.path("draft").asText()).isEqualTo("测试库标准答复");
        assertThat(found.at("/stages/standard_reply/candidates/0/businessSimilarity").asDouble()).isEqualTo(1);
        assertThat(found.at("/stages/history_rfq/status").asText()).isEqualTo("not_run");
        jdbc.update("update `standard-reply-record` set payload=json_set(payload,'$.status','已撤销') where bu_id=?", f.bu());
        assertThat(detail(f, requirement, runId).path("reason").asText()).isEqualTo("MATCH_SCOPE_CHANGED");

        String rerun = "/api/rfq/requirements/" + requirement + "/match-runs";
        var first = retry(f, rerun, "once");
        var duplicate = retry(f, rerun, "once");
        assertThat(first.path("runId").asText()).isEqualTo(duplicate.path("runId").asText()).isNotEqualTo(runId);
        assertThat(detail(f, requirement, runId).path("status").asText()).isEqualTo("superseded");
        request(patch("/api/rfq/requirements/" + requirement).contentType("application/json")
                .content("{\"version\":0,\"requirementText\":\"需要复核安全联锁\"}"), f);
        assertThat(firstRun(f, doc).path("sourceRequirementVersion").asLong()).isEqualTo(1);
        mvc.perform(post(rerun).header("Authorization", f.auth()).contentType("application/json")
                .content("{\"sourceRequirementVersion\":0,\"requestId\":\"stale\"}")).andExpect(status().isConflict());
    }

    @Test void comparesConfirmedDeviceBoundsAcrossUnitsAndRechecksEvidence() throws Exception {
        var f = fixture();
        var run = firstRun(f, uploadAndParse(f));
        String requirement = run.path("requirementId").asText();
        putRecord(f, "model_definition", "M1", json.createObjectNode().put("status", "已发布").put("config", "CFG"));
        putRecord(f, "process_definition", "P1", json.createObjectNode().put("modelId", "M1").put("modelVersion", 1).put("enabled", true));
        putRecord(f, "evidence_record", "E1", json.createObjectNode().put("status", "有效"));
        var cap = json.createObjectNode().put("status", "已发布").put("validity", "有效").put("modelId", "M1")
                .put("modelVersion", 1).put("processId", "P1").put("processVersion", 1).put("config", "CFG")
                .put("metricCode", "position").put("operator", "LE").put("upper", "5").put("unit", "μm")
                .put("value", "≤5 μm").put("valueType", "保证值").put("conditions", "Si / M1");
        cap.putArray("evidenceRefs").addObject().put("id", "E1").put("version", 1).put("location", "第 8 页");
        putRecord(f, "capability_record", "C1", cap);
        String path = "/api/rfq/requirements/" + requirement + "/match-input";
        String id = request(put(path).contentType("application/json").content("""
            {"version":0,"sourceRequirementVersion":0,"context":{"capabilityApplicable":true,"devices":[
             {"deviceId":"D1","modelId":"M1","modelVersion":1,"processId":"P1","processVersion":1,"config":"CFG",
              "conditions":"Si / M1","metrics":[{"metricCode":"position","operator":"LE","upper":"0.005","unit":"mm"}]}]}}
            """), f).path("runId").asText();
        worker.runOnce();
        var found = detail(f, requirement, id).path("result");
        assertThat(found.path("matchedLibrary").asText()).isEqualTo("capability");
        assertThat(found.path("conclusion").asText()).isEqualTo("Comply");
        assertThat(found.at("/stages/capability/checks/0/candidates/0/evidenceRefs/0/version").asInt()).isEqualTo(1);
        jdbc.update("update evidence_record set payload=json_set(payload,'$.status','已撤销') where bu_id=?", f.bu());
        assertThat(detail(f, requirement, id).path("reason").asText()).isEqualTo("MATCH_SCOPE_CHANGED");
    }

    private void putRecord(Fixture f, String table, String id, JsonNode payload) {
        jdbc.update("insert into " + table + "(bu_id,id,version,scope,payload) values (?,?,1,'BU共享',?)",
                f.bu(), id, payload.toString());
    }

    private JsonNode firstRun(Fixture f, String doc) throws Exception {
        return request(get("/api/rfq/projects/" + f.project() + "/match-results").param("documentId", doc), f).path("list").get(0);
    }

    private JsonNode detail(Fixture f, String requirement, String runId) throws Exception {
        return request(get("/api/rfq/requirements/" + requirement + "/match-runs/" + runId), f);
    }

    private void makeDue(String id) {
        jdbc.update("update requirement_match_run set next_attempt_at=utc_timestamp(6) where id=?", id);
    }

    private JsonNode retry(Fixture f, String path, String requestId) throws Exception {
        return json.readTree(mvc.perform(post(path).contentType("application/json").header("Authorization", f.auth())
                .content("{\"sourceRequirementVersion\":0,\"requestId\":\"" + requestId + "\"}")).andExpect(status().isAccepted())
                .andReturn().getResponse().getContentAsByteArray()).path("data");
    }

    Fixture fixture() {
        String bu = "MATCH-" + UUID.randomUUID().toString().substring(0, 8);
        String user = bu + "-A", project = bu + "-P";
        jdbc.update("insert into business_unit(id,code,name) values (?,?,?)", bu, bu, bu);
        jdbc.update("insert into app_user(id,username,password_hash,display_name) values (?,?,?,?)", user, user, "test", user);
        jdbc.update("insert into user_bu_role(user_id,bu_id,role) values (?,?,'BU_ADMIN')", user, bu);
        jdbc.update("insert into project(id,code,name,bu_id,owner_id,created_by) values (?,?,?,?,?,?)", project, project, project, bu, user, user);
        return new Fixture(bu, project, "Bearer " + jwt.issue(user));
    }

    String uploadAndParse(Fixture f) throws Exception {
        byte[] bytes;
        try (var doc = new XWPFDocument(); var out = new ByteArrayOutputStream()) {
            doc.createParagraph().createRun().setText("1.1 设备应支持自动上料并具备安全联锁。");
            doc.write(out);
            bytes = out.toByteArray();
        }
        String id = request(multipart("/api/rfq/projects/" + f.project() + "/documents")
                .file(new MockMultipartFile("file", "rfq.docx", "application/octet-stream", bytes)), f).path("id").asText();
        assertThat(request(post("/api/rfq/documents/" + id + "/parse-runs"), f).path("requirementCount").asInt()).isPositive();
        return id;
    }

    JsonNode request(MockHttpServletRequestBuilder request, Fixture f) throws Exception {
        return json.readTree(mvc.perform(request.header("Authorization", f.auth())).andExpect(status().isOk())
                .andReturn().getResponse().getContentAsByteArray()).path("data");
    }

    record Fixture(String bu, String project, String auth) {}
}
