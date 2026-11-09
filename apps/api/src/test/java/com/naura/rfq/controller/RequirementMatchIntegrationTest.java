package com.naura.rfq.controller;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
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
    @Autowired com.naura.rfq.service.RequirementMatchService matches;
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
        jdbc.update("insert into user_bu_role(user_id,bu_id,role) values (?,?,'SR')", f.bu() + "-A", f.bu());
        String response = "/api/rfq/requirements/" + requirement + "/response";
        String runId = rows.get(0).path("runId").asText();
        var adoption = json.createObjectNode().put("version", 1).put("sourceVersion", 0)
                .put("matchRunId", runId).put("candidateId", "H1");
        adoption.putObject("patch").put("draft", "项目历史答复").put("conclusion", "Comply");
        assertThat(request(patch(response).contentType("application/json").content(adoption.toString()), f)
                .at("/matchReference/version").asInt()).isEqualTo(1);
        String reject = "/api/rfq/requirements/" + requirement + "/match-runs/" + runId + "/reject";
        String rejected = "{\"reason\":\"历史条件不适用\"}";
        var item = request(post(reject).contentType("application/json").content(rejected), f);
        assertThat(request(post(reject).contentType("application/json").content(rejected), f)).isEqualTo(item);
        jdbc.update("update `history-rfq-record` set payload=json_set(payload,'$.status','已撤销') where bu_id=? and id='H1'", f.bu());
        matches.recheckAdoption(requirement);
        var checked = request(get("/api/rfq/requirements/" + requirement + "/match-result"), f);
        assertThat(checked.path("referenceInvalid").asBoolean()).isTrue();
        assertThat(checked.at("/deviation/triggers").size()).isEqualTo(2);
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
        String currentPath = "/api/rfq/requirements/" + requirement + "/match-result";
        assertThat(request(get(currentPath), f).path("result")).isEqualTo(found);
        assertThat(found.at("/stages/standard_reply/candidates/0/businessSimilarity").asDouble()).isEqualTo(1);
        assertThat(found.at("/stages/history_rfq/status").asText()).isEqualTo("not_run");
        jdbc.update("update `standard-reply-record` set payload=json_set(payload,'$.status','已撤销') where bu_id=?", f.bu());
        assertThat(detail(f, requirement, runId).path("reason").asText()).isEqualTo("MATCH_SCOPE_CHANGED");

        String rerun = "/api/rfq/requirements/" + requirement + "/match-runs";
        var first = retry(f, rerun, "once");
        var duplicate = retry(f, rerun, "once");
        assertThat(first.path("runId").asText()).isEqualTo(duplicate.path("runId").asText()).isNotEqualTo(runId);
        assertThat(detail(f, requirement, runId).path("status").asText()).isEqualTo("superseded");
        assertThat(request(get(currentPath), f).path("runId")).isEqualTo(first.path("runId"));
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
        jdbc.update("insert into user_bu_role(user_id,bu_id,role) values (?,?,'SR')", f.bu() + "-A", f.bu());
        var adopted = json.createObjectNode().put("version", 1).put("sourceVersion", 0)
                .put("matchRunId", id).put("candidateId", "capability");
        adopted.putObject("patch").put("conclusion", "Comply").put("draft", "能力核对通过").put("evidence", "E1 V1");
        assertThat(request(post("/api/rfq/requirements/" + requirement + "/response/confirm")
                .contentType("application/json").content(adopted.toString()), f).at("/matchReference/sources/0/version").asInt()).isEqualTo(1);
        jdbc.update("update evidence_record set payload=json_set(payload,'$.status','已撤销') where bu_id=?", f.bu());
        assertThat(detail(f, requirement, id).path("reason").asText()).isEqualTo("MATCH_SCOPE_CHANGED");
    }

    private void putRecord(Fixture f, String table, String id, JsonNode payload) {
        jdbc.update("insert into " + table + "(bu_id,id,version,scope,payload) values (?,?,1,'BU共享',?)",
                f.bu(), id, payload.toString());
    }

    @Test void submitsAndApprovesTheLiveScopeThenStagesAndActivatesAReplacement() throws Exception {
        var owner = fixture();
        String actor = owner.bu() + "-A", engineer = owner.bu() + "-T";
        jdbc.update("insert into user_bu_role(user_id,bu_id,role) values (?,?,'SR')", actor, owner.bu());
        jdbc.update("insert into app_user(id,username,password_hash,display_name) values (?,?,?,?)", engineer, engineer, "test", engineer);
        jdbc.update("insert into user_bu_role(user_id,bu_id,role) values (?,?,'TECH')", engineer, owner.bu());
        for (String member : List.of(actor, engineer)) {
            jdbc.update("insert into bu_member_profile(user_id,bu_id,can_confirm,can_final_review) values (?,?,true,true)", member, owner.bu());
        }
        jdbc.update("insert into project_member(project_id,user_id) values (?,?)", owner.project(), engineer);
        var technician = new Fixture(owner.bu(), owner.project(), "Bearer " + jwt.issue(engineer));
        String path = "/api/rfq/projects/" + owner.project();
        var config = request(put(path + "/final-review-config").contentType("application/json").content(json.createObjectNode()
                .put("version", 1).put("technicalMode", "all").put("srId", actor).put("reason", "配置测试评审人员")
                .set("technicalIds", json.valueToTree(List.of(engineer))).toString()), owner);
        String old = uploadAndParse(owner);
        var req = request(get(path + "/requirements"), owner).path("list").get(0);
        String id = req.path("id").asText();
        String responsePath = "/api/rfq/requirements/" + id + "/response";
        String reviewPath = "/api/rfq/requirements/" + id + "/match-deviation";
        request(patch(responsePath).contentType("application/json").content("""
                {"version":1,"sourceVersion":0,"patch":{"conclusion":"不满足","draft":"当前设备无法满足双工位要求","evidence":"测试报告 V1"}}
                """), owner);
        String confirmation = """
                {"version":2,"sourceVersion":0}
                """;
        mvc.perform(post(responsePath + "/confirm").contentType("application/json").content(confirmation)
                .header("Authorization", owner.auth())).andExpect(status().isConflict());
        var reviewInput = json.createObjectNode().put("version", 2).put("deadline", "2026-11-30").put("reason", "核对能力限制");
        reviewInput.putArray("reviewerIds").add(engineer);
        var pendingReview = request(post(reviewPath + "/review").contentType("application/json").content(reviewInput.toString()), owner);
        var voteInput = json.createObjectNode().put("version", pendingReview.path("version").asLong()).put("reason", "技术已核对");
        assertThat(request(post(reviewPath + "/close").contentType("application/json").content(voteInput.toString()), technician)
                .path("status").asText()).isEqualTo("已关闭");
        var response = request(post(responsePath + "/confirm").contentType("application/json").content(confirmation), owner);
        mvc.perform(post("/api/rfq/documents/" + old + "/parse-runs").header("Authorization", owner.auth()))
                .andExpect(status().isConflict());
        var frozen = (ObjectNode) response.deepCopy();
        frozen.put("sourceFileId", old).put("sourceVersion", "V1.0").put("original", req.path("originalText").asText())
                .put("clause", req.path("customerClauseNo").asText()).put("title", req.path("title").asText());
        String snapshotId = "SNAP-" + UUID.randomUUID();
        var snapshot = json.createObjectNode().put("id", snapshotId).put("approvalFingerprint", "fixture-current");
        snapshot.putArray("rows").add(frozen);
        var scope = snapshot.putObject("approvalScope");
        scope.putArray("sourceVersions").add(old + ":V1.0");
        var configuration = scope.putObject("configuration").put("equipment", "");
        configuration.set("approvalConfig", config.path("approvalConfig"));
        configuration.putObject("personnel").set("settings", config.path("technicalReviewSettings"));
        var submitted = request(post(path + "/snapshots").contentType("application/json").content(snapshot.toString()), owner);
        assertThat(submitted.path("status").asText()).isEqualTo("审批中");
        assertThat(submitted.at("/rows/0/sourceAnchor").asText()).isNotBlank();

        String vote = path + "/snapshots/" + snapshotId + "/vote";
        var first = request(post(vote).contentType("application/json").content("{\"version\":1,\"result\":\"approved\"}"), owner);
        assertThat(first.path("status").asText()).isEqualTo("审批中");
        var finalVote = request(post(vote).contentType("application/json").content("{\"version\":2,\"result\":\"approved\"}"), technician);
        assertThat(finalVote.path("status").asText()).isEqualTo("已批准");
        assertThat(finalVote.path("historyCandidateCount").asInt()).isEqualTo(1);
        assertThat(jdbc.queryForObject("select count(*) from history_document where project_id=?", Integer.class, owner.project())).isEqualTo(1);
        mvc.perform(get(path + "/snapshots/" + snapshotId + "/annotated-export").header("Authorization", owner.auth())).andExpect(status().isOk());

        String newFile = request(multipart(path + "/documents/" + old + "/replacement")
                .file(rfqFile("1.1 设备应支持双工位上料并具备安全联锁。")), owner).path("newDocumentId").asText();
        request(post("/api/rfq/documents/" + newFile + "/parse-runs"), owner);
        mvc.perform(get(path + "/snapshots/" + snapshotId + "/annotated-export").header("Authorization", owner.auth())).andExpect(status().isOk());
        String impactPath = path + "/document-replacements/" + newFile;
        var impact = request(get(impactPath), owner);
        assertThat(impact.path("canActivate").asBoolean()).isTrue();
        assertThat(request(post(impactPath + "/activate").contentType("application/json").content(json.createObjectNode()
                .put("fingerprint", impact.path("fingerprint").asText()).put("reason", "已核对原件和影响范围").toString()), owner)
                .path("workVersion").asLong()).isEqualTo(2L);
        mvc.perform(get(path + "/snapshots/" + snapshotId + "/annotated-export").header("Authorization", owner.auth())).andExpect(status().isConflict());
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
        String id = request(multipart("/api/rfq/projects/" + f.project() + "/documents")
                .file(rfqFile("1.1 设备应支持自动上料并具备安全联锁。")), f).path("id").asText();
        assertThat(request(post("/api/rfq/documents/" + id + "/parse-runs"), f).path("requirementCount").asInt()).isPositive();
        return id;
    }

    private MockMultipartFile rfqFile(String line) throws Exception {
        try (var doc = new XWPFDocument(); var out = new ByteArrayOutputStream()) {
            doc.createParagraph().createRun().setText(line);
            doc.write(out);
            return new MockMultipartFile("file", "rfq.docx", "application/octet-stream", out.toByteArray());
        }
    }

    JsonNode request(MockHttpServletRequestBuilder request, Fixture f) throws Exception {
        return json.readTree(mvc.perform(request.header("Authorization", f.auth())).andExpect(status().isOk())
                .andReturn().getResponse().getContentAsByteArray()).path("data");
    }

    record Fixture(String bu, String project, String auth) {}
}
