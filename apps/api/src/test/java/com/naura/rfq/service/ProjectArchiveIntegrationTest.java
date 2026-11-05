package com.naura.rfq.service;

import com.naura.rfq.support.AcceptanceSupport;
import java.util.Map;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.mock.web.MockMultipartFile;
import static org.assertj.core.api.Assertions.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

class ProjectArchiveIntegrationTest extends AcceptanceSupport {
    @Autowired JdbcTemplate jdbc;
    long version(String actor,String project) throws Exception { return ok(auth(get("/api/rfq/projects/"+project),actor)).path("version").asLong(); }
    com.fasterxml.jackson.databind.JsonNode action(String actor,String project,String action,long version) throws Exception {
        return ok(auth(body(post("/api/rfq/projects/"+project+"/"+action),Map.of("version",version,"reason","验收："+action)),actor));
    }
    record Source(String project,String document,String run,String requirement,byte[] bytes) {}
    Source source(String sr) throws Exception {
        String project=newProject(sr,"P"+unique());
        String document=ok(auth(post("/api/rfq/projects/"+project+"/documents/sample"),sr)).path("id").asText();
        String run=ok(auth(post("/api/rfq/documents/"+document+"/parse-runs"),sr)).path("id").asText();
        String requirement=ok(auth(get("/api/rfq/projects/"+project+"/requirements"),sr)).path("list").get(0).path("id").asText();
        byte[] bytes=mvc.perform(auth(get("/api/rfq/documents/"+document+"/download"),sr)).andExpect(status().isOk()).andReturn().getResponse().getContentAsByteArray();
        return new Source(project,document,run,requirement,bytes);
    }
    @Test void archiveAndRestoreRetainAllBusinessDataAndOriginalStage() throws Exception {
        String sr=token("sr01"); Source s=source(sr); long before=version(sr,s.project());
        var archived=action(sr,s.project(),"archives",before);
        assertThat(archived.path("stage").asText()).isEqualTo("CANCELLED");
        assertThat(archived.path("archived").asBoolean()).isTrue();
        assertThat(archived.path("archivedFromStage").asText()).isEqualTo("PARSING");
        assertThat(archived.path("archivedAt").isNull()).isFalse();
        assertThat(archived.path("archivedBy").asText()).isEqualTo("demo-sales");
        assertThat(archived.path("archiveReason").asText()).contains("archives");
        mvc.perform(auth(get("/api/rfq/documents/"+s.document()+"/download"),sr)).andExpect(status().isOk()).andExpect(content().bytes(s.bytes()));
        ok(auth(get("/api/rfq/documents/"+s.document()+"/blocks"),sr)); ok(auth(get("/api/rfq/parse-runs/"+s.run()),sr));
        assertThat(ok(auth(get("/api/rfq/projects/"+s.project()+"/requirements"),sr)).path("total").asInt()).isPositive();
        var restored=action(sr,s.project(),"restorations",before+1);
        assertThat(restored.path("stage").asText()).isEqualTo("PARSING"); assertThat(restored.path("archived").asBoolean()).isFalse();
        assertThat(restored.path("archivedFromStage").isNull()).isTrue(); assertThat(restored.path("archivedAt").isNull()).isTrue();
        assertThat(restored.path("version").asLong()).isEqualTo(before+2);
        assertThat(ok(auth(get("/api/rfq/audit").param("objectId",s.project()).param("action","归档项目"),token("bu01"))).path("total").asInt()).isEqualTo(1);
        assertThat(ok(auth(get("/api/rfq/audit").param("objectId",s.project()).param("action","恢复项目"),token("bu01"))).path("total").asInt()).isEqualTo(1);
    }
    @Test void activityAndArchiveListsFilterBeforeCountingAndPaging() throws Exception {
        String sr=token("sr01"), prefix="K"+unique();
        String first=newProject(sr,prefix+"A"),second=newProject(sr,prefix+"B"),third=newProject(sr,prefix+"C");
        action(sr,second,"archives",0);
        var active=ok(auth(get("/api/rfq/projects").param("keyword",prefix).param("size","1"),sr));
        assertThat(active.path("total").asInt()).isEqualTo(2); assertThat(active.path("list").size()).isEqualTo(1);
        assertThat(active.path("list").get(0).path("id").asText()).isIn(first,third);
        var archived=ok(auth(get("/api/rfq/projects").param("keyword",prefix).param("archived","true"),sr));
        assertThat(archived.path("total").asInt()).isEqualTo(1); assertThat(archived.path("list").get(0).path("id").asText()).isEqualTo(second);
        assertThat(ok(auth(get("/api/rfq/projects").param("keyword",prefix).param("archived","true"),token("tech01"))).path("total").asInt()).isZero();
        assertThat(ok(auth(get("/api/rfq/projects").param("keyword",prefix).param("stage","CANCELLED"),sr)).path("total").asInt()).isZero();
        mvc.perform(auth(get("/api/rfq/projects").param("stage","not-a-stage"),sr)).andExpect(status().isBadRequest());
    }
    @Test void everyBusinessWriteIsBlockedWhileArchivedAndLeavesNoNewData() throws Exception {
        String sr=token("sr01"); Source s=source(sr); action(sr,s.project(),"archives",version(sr,s.project())); long archivedVersion=version(sr,s.project());
        long runs=jdbc.queryForObject("select count(*) from parse_run where document_id=?",Long.class,s.document());
        long events=jdbc.queryForObject("select count(*) from audit_event",Long.class);
        mvc.perform(auth(body(patch("/api/rfq/projects/"+s.project()),Map.of("version",archivedVersion,"reason","归档修改","name","不应修改")),sr)).andExpect(status().isConflict());
        mvc.perform(auth(body(post("/api/rfq/projects/"+s.project()+"/handovers"),Map.of("version",archivedVersion,"reason","归档移交","ownerId","demo-sales")),sr)).andExpect(status().isConflict());
        mvc.perform(auth(post("/api/rfq/projects/"+s.project()+"/documents/sample"),sr)).andExpect(status().isConflict());
        mvc.perform(auth(multipart("/api/rfq/projects/"+s.project()+"/documents").file(new MockMultipartFile("file","source.docx","application/vnd.openxmlformats-officedocument.wordprocessingml.document",s.bytes())),sr)).andExpect(status().isConflict());
        mvc.perform(auth(post("/api/rfq/documents/"+s.document()+"/parse-runs"),sr)).andExpect(status().isConflict());
        mvc.perform(auth(body(patch("/api/rfq/requirements/"+s.requirement()),Map.of("version",0,"requirementText","不应修改")),sr)).andExpect(status().isConflict());
        assertThat(ok(auth(get("/api/rfq/projects/"+s.project()+"/documents"),sr)).path("total").asInt()).isEqualTo(1);
        assertThat(jdbc.queryForObject("select count(*) from parse_run where document_id=?",Long.class,s.document())).isEqualTo(runs);
        assertThat(jdbc.queryForObject("select count(*) from audit_event",Long.class)).isEqualTo(events);
        assertThat(version(sr,s.project())).isEqualTo(archivedVersion);
        assertThat(jdbc.queryForObject("select requirement_text from requirement where id=?",String.class,s.requirement())).isNotEqualTo("不应修改");
        action(sr,s.project(),"restorations",archivedVersion);
        ok(auth(post("/api/rfq/projects/"+s.project()+"/documents/sample"),sr));
    }
    @Test void restoreAndArchiveRejectWrongStateOrStaleVersionWithoutDeleting() throws Exception {
        String sr=token("sr01"),project=newProject(sr,"P"+unique());
        mvc.perform(auth(body(post("/api/rfq/projects/"+project+"/restorations"),Map.of("version",0,"reason","未归档")),sr)).andExpect(status().isConflict());
        action(sr,project,"archives",0);
        mvc.perform(auth(body(post("/api/rfq/projects/"+project+"/archives"),Map.of("version",1,"reason","重复归档")),sr)).andExpect(status().isConflict());
        mvc.perform(auth(body(post("/api/rfq/projects/"+project+"/restorations"),Map.of("version",0,"reason","旧版本")),sr)).andExpect(status().isConflict());
        mvc.perform(auth(delete("/api/rfq/projects/"+project),sr)).andExpect(status().isMethodNotAllowed());
        assertThat(jdbc.queryForObject("select count(*) from project where id=?",Long.class,project)).isEqualTo(1);
        jdbc.update("update project set archived_from_stage=null where id=?",project);
        mvc.perform(auth(body(post("/api/rfq/projects/"+project+"/restorations"),Map.of("version",1,"reason","旧未知阶段")),sr)).andExpect(status().isConflict());
    }
    @Test void archiveRequiresProjectManagerAndInputValidation() throws Exception {
        String sr=token("sr01"),project=newProject(sr,"P"+unique());
        for(String actor:new String[]{token("admin"),token("tech01")})mvc.perform(auth(body(post("/api/rfq/projects/"+project+"/archives"),Map.of("version",0,"reason","无权限")),actor)).andExpect(status().isForbidden());
        for(Object invalid:java.util.List.of(Map.of("version",0,"reason"," "),Map.of("reason","缺版本"),Map.of("version",0,"reason","非法","stage","APPROVED")))
            mvc.perform(auth(body(post("/api/rfq/projects/"+project+"/archives"),invalid),sr)).andExpect(status().isBadRequest());
        action(token("bu01"),project,"archives",0);
    }
    @Test void archivedProjectAccessMayStillBeRevokedByAdministrator() throws Exception {
        String sr=token("sr01"),bu=token("bu01"),project=newProject(sr,"P"+unique());
        ok(auth(body(patch("/api/rfq/projects/"+project+"/members/demo-technical"),Map.of("version",0,"enabled",true,"reason","授权")),bu));
        action(sr,project,"archives",1); String tech=token("tech01"); ok(auth(get("/api/rfq/projects/"+project),tech));
        ok(auth(body(patch("/api/rfq/projects/"+project+"/members/demo-technical"),Map.of("version",2,"enabled",false,"reason","归档后撤权")),bu));
        mvc.perform(auth(get("/api/rfq/projects/"+project),tech)).andExpect(status().isForbidden());
        assertThat(version(sr,project)).isEqualTo(3);
    }
}
