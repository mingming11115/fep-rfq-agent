package com.naura.rfq.controller;

import com.jayway.jsonpath.JsonPath;
import com.naura.rfq.service.JwtService;
import java.io.ByteArrayOutputStream;
import java.nio.charset.StandardCharsets;
import java.util.UUID;
import org.apache.poi.xwpf.usermodel.XWPFDocument;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.ResultActions;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;
import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@SpringBootTest(properties = "rfq.demo-data.enabled=false")
@AutoConfigureMockMvc(printOnlyOnFailure = false)
class HistoryRfqPublicationIntegrationTest {
    @Autowired MockMvc mvc;
    @Autowired JwtService jwt;
    @Autowired JdbcTemplate jdbc;

    @Test void persistsOriginalAndDraftAndIndexesOnlyAnIndependentlyApprovedVersion() throws Exception {
        String bu = "HIST-" + UUID.randomUUID().toString().substring(0, 8);
        jdbc.update("insert into business_unit(id,code,name) values (?,?,?)", bu, bu, bu);
        String author = user(bu, "A"), reviewer = user(bu, "B");
        String path = "/api/rfq/business-units/" + bu + "/history-rfq";
        byte[] original = docx();
        var file = new MockMultipartFile("file", "history.docx", "application/octet-stream", original);
        String result = call(multipart(path + "/import").file(file).param("shareWithBu", "true"), author)
                .andExpect(status().isOk()).andExpect(jsonPath("$.data.clauses[0].status").value("草稿"))
                .andExpect(jsonPath("$.data.clauses[0].answer").value("需配置模块 S"))
                .andReturn().getResponse().getContentAsString(StandardCharsets.UTF_8);
        String documentId = JsonPath.read(result, "$.data.document.id");
        String id = JsonPath.read(result, "$.data.clauses[0].id");
        call(multipart(path + "/import").file(file).param("shareWithBu", "true"), author)
                .andExpect(status().isOk()).andExpect(jsonPath("$.data.duplicate").value(true));
        call(get(path + "/documents/" + documentId + "/original"), reviewer)
                .andExpect(status().isOk()).andExpect(content().bytes(original));
        String version = path + "/clauses/" + id + "/versions/1";
        action(version, "submit", author, 0, "").andExpect(status().isOk());
        action(version, "delete", author, 1, "").andExpect(status().isConflict());
        action(version, "publish", author, 1, "").andExpect(status().isForbidden());
        assertThat(jdbc.queryForObject("select count(*) from history_rfq_index_sync where bu_id=?", Integer.class, bu)).isZero();
        action(version, "publish", reviewer, 1, "已核对适用范围").andExpect(status().isOk())
                .andExpect(jsonPath("$.data.status").value("已发布"));
        assertThat(jdbc.queryForObject("select operation from history_rfq_index_sync where bu_id=? and reply_id=?",
                String.class, bu, id)).isEqualTo("upsert");
        action(version, "delete", author, 2, "").andExpect(status().isConflict());
        action(version, "revise", author, 2, "").andExpect(status().isOk());
        String draft = path + "/clauses/" + id + "/versions/2";
        action(draft, "delete", author, 1, "").andExpect(status().isConflict());
        action(draft, "submit", author, 0, "").andExpect(status().isOk());
        action(draft, "return", reviewer, 1, "核对原件").andExpect(status().isOk());
        action(draft, "delete", author, 2, "").andExpect(status().isOk())
                .andExpect(jsonPath("$.data.status").value("已删除"));
        action(draft, "submit", author, 3, "").andExpect(status().isConflict());
        call(get("/api/rfq/business-units/" + bu + "/resources"), author).andExpect(status().isOk())
                .andExpect(jsonPath("$.data.historyDocuments[0].id").value(documentId))
                .andExpect(jsonPath("$.data.historyClauses.length()").value(1))
                .andExpect(jsonPath("$.data.historyClauses[0].validity").value("有效"));
        call(multipart(path + "/import").file(file).param("shareWithBu", "true"), author)
                .andExpect(status().isOk()).andExpect(jsonPath("$.data.clauses.length()").value(1));
        action(version, "revise", author, 2, "").andExpect(status().isOk())
                .andExpect(jsonPath("$.data.version").value(3));
        action(version, "revoke", reviewer, 2, "撤回失效答复").andExpect(status().isOk());
        assertThat(jdbc.queryForObject("select operation from history_rfq_index_sync where bu_id=? and reply_id=?",
                String.class, bu, id)).isEqualTo("delete");
    }

    @Test void approvedSnapshotProducesProjectScopedCandidatesWithoutIndexingThem() throws Exception {
        String bu = "HIST-" + UUID.randomUUID().toString().substring(0, 8);
        jdbc.update("insert into business_unit(id,code,name) values (?,?,?)", bu, bu, bu);
        String author = user(bu, "A"), reviewer = user(bu, "B");
        String outsider = bu + "-C", project = bu + "-P", snapshot = bu + "-S";
        jdbc.update("insert into app_user(id,username,password_hash,display_name) values (?,?,?,?)",
                outsider, outsider, "test", outsider);
        jdbc.update("insert into user_bu_role(user_id,bu_id,role) values (?,?,'SR')", outsider, bu);
        jdbc.update("insert into project(id,code,name,bu_id,owner_id,created_by) values (?,?,?,?,?,?)",
                project, project, "历史候选测试", bu, author, author);
        String path = "/api/rfq/projects/" + project + "/snapshots/" + snapshot + "/history-rfq";
        jdbc.update("insert into response_snapshot(id,project_id,payload) values (?,?,?)", snapshot, project, "{}");
        call(post(path), author).andExpect(status().isConflict());
        jdbc.update("update response_snapshot set payload=? where id=?", """
                {"status":"已批准","stale":false,"approvalFingerprint":"fingerprint",
                 "finalReview":{"policy":"sr-and-technical","technicalMode":"all",
                  "reviewers":{"srId":"sr1","technicalIds":["tech1"]},
                  "decisions":{"sr":{"actorId":"sr1","result":"approved"},
                   "technicalByActorId":{"tech1":{"actorId":"tech1","result":"approved"}}}},
                 "rows":[{"id":"REQ-1","clause":"3.2","original":"支持自动上料","draft":"需配置模块 S",
                  "conclusion":"条件满足","sourceFileId":"DOC-1","sourceVersion":2}]}
                """, snapshot);
        String result = call(post(path), author).andExpect(status().isOk())
                .andExpect(jsonPath("$.data.document.projectId").value(project))
                .andExpect(jsonPath("$.data.document.sourceSnapshotId").value(snapshot))
                .andExpect(jsonPath("$.data.clauses[0].status").value("草稿"))
                .andExpect(jsonPath("$.data.clauses[0].sourceFileVersion").value("2"))
                .andReturn().getResponse().getContentAsString(StandardCharsets.UTF_8);
        call(post(path), author).andExpect(status().isOk()).andExpect(jsonPath("$.data.duplicate").value(true));
        String id = JsonPath.read(result, "$.data.clauses[0].id");
        String version = "/api/rfq/business-units/" + bu + "/history-rfq/clauses/" + id + "/versions/1";
        call(get(version), outsider).andExpect(status().isForbidden());
        action(version, "submit", author, 0, "").andExpect(status().isOk());
        action(version, "publish", reviewer, 1, "").andExpect(status().isOk())
                .andExpect(jsonPath("$.data.status").value("已发布"));
        assertThat(jdbc.queryForObject("select count(*) from history_rfq_index_sync where bu_id=?", Integer.class, bu)).isZero();
    }

    @Test void savesGroupsAndMetadataThenReparsesWithoutChangingOriginalDrafts() throws Exception {
        String bu = "HIST-" + UUID.randomUUID().toString().substring(0, 8);
        jdbc.update("insert into business_unit(id,code,name) values (?,?,?)", bu, bu, bu);
        String actor = user(bu, "M");
        String base = "/api/rfq/business-units/" + bu;
        String catalog = """
                {"buId":"%s","version":1,"schema":{"title":"分组","levels":[{"id":"model","name":"机型"}]},
                 "nodes":[{"id":"group1","name":"原件","levelId":"model","enabled":true}]}
                """.formatted(bu);
        call(put(base + "/knowledge-groups").contentType("application/json").content(catalog), actor)
                .andExpect(status().isOk()).andExpect(jsonPath("$.data.writeRevision").value(1));
        call(put(base + "/knowledge-groups").contentType("application/json").content(catalog), actor).andExpect(status().isConflict());
        String path = base + "/history-rfq";
        byte[] bytes = docx();
        String content = call(multipart(path + "/import").file(new MockMultipartFile("file", "history.docx",
                "application/octet-stream", bytes)).param("shareWithBu", "true"), actor)
                .andExpect(status().isOk()).andReturn().getResponse().getContentAsString(StandardCharsets.UTF_8);
        String id = JsonPath.read(content, "$.data.document.id");
        String document = path + "/documents/" + id;
        call(patch(document).contentType("application/json").content("""
                {"revision":1,"metadata":{"customer":"客户A"},"groupIds":["group1"]}
                """), actor).andExpect(status().isOk()).andExpect(jsonPath("$.data.revision").value(2));
        call(post(document + "/clauses").contentType("application/json").content("""
                {"id":"HK-manual","clauseNo":"M","title":"人工补录","requirement":"要求","answer":"答复"}
                """), actor).andExpect(status().isOk()).andExpect(jsonPath("$.data.status").value("草稿"));
        String result = call(post(document + "/reparse").contentType("application/json").content("{\"revision\":2}"), actor)
                .andExpect(status().isOk()).andExpect(jsonPath("$.data.document.previousDocumentId").value(id))
                .andExpect(jsonPath("$.data.document.version").value("V2"))
                .andExpect(jsonPath("$.data.document.groupIds[0]").value("group1"))
                .andReturn().getResponse().getContentAsString(StandardCharsets.UTF_8);
        String newId = JsonPath.read(result, "$.data.document.id");
        call(get(path + "/documents/" + newId + "/original"), actor).andExpect(status().isOk()).andExpect(content().bytes(bytes));
        call(get(path + "/clauses/HK-manual/versions/1"), actor).andExpect(status().isOk())
                .andExpect(jsonPath("$.data.documentId").value(id));
    }

    private ResultActions action(String path, String action, String actor, long revision, String reason) throws Exception {
        return call(post(path + "/" + action).contentType("application/json")
                .content("{\"revision\":" + revision + ",\"reason\":\"" + reason + "\"}"), actor);
    }

    private ResultActions call(MockHttpServletRequestBuilder request, String actor) throws Exception {
        return mvc.perform(request.header("Authorization", "Bearer " + jwt.issue(actor)));
    }

    private String user(String bu, String suffix) {
        String id = bu + "-" + suffix;
        jdbc.update("insert into app_user(id,username,password_hash,display_name) values (?,?,?,?)", id, id, "test", id);
        jdbc.update("insert into user_bu_role(user_id,bu_id,role) values (?,?,'BU_ADMIN')", id, bu);
        jdbc.update("insert into bu_member_profile(user_id,bu_id,resource_qualifications) values (?,?,'knowledge-publish')", id, bu);
        return id;
    }

    private byte[] docx() throws Exception {
        try (var doc = new XWPFDocument(); var bytes = new ByteArrayOutputStream()) {
            var table = doc.createTable(2, 4);
            String[][] rows = {{"编号", "客户要求", "历史答复", "适用条件"}, {"3.2", "支持自动上料", "需配置模块 S", "硅材料"}};
            for (int r = 0; r < rows.length; r++) {
                for (int c = 0; c < rows[r].length; c++) table.getRow(r).getCell(c).setText(rows[r][c]);
            }
            doc.write(bytes);
            return bytes.toByteArray();
        }
    }
}
