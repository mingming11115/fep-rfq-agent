package com.naura.rfq.project;

import com.naura.rfq.support.AcceptanceSupport;
import com.fasterxml.jackson.databind.JsonNode;
import java.util.HashMap;
import java.util.Map;
import org.junit.jupiter.api.Test;
import static org.assertj.core.api.Assertions.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

class ProjectMaintenanceIntegrationTest extends AcceptanceSupport {
    JsonNode patchProject(String actor,String id,Object patch) throws Exception {
        return ok(auth(body(patch("/api/rfq/projects/"+id),patch),actor));
    }
    long version(String actor,String id) throws Exception {
        return ok(auth(get("/api/rfq/projects/"+id),actor)).path("version").asLong();
    }
    void grant(String bu,String project,String user,long version) throws Exception {
        ok(auth(body(patch("/api/rfq/projects/"+project+"/members/"+user),Map.of("version",version,"enabled",true,"reason","项目移交候选")),bu));
    }
    @Test void metadataPatchPreservesOmittedFieldsAndSupportsExplicitClearing() throws Exception {
        String sr=token("sr01"), project=newProject(sr,"P"+unique());
        var first=patchProject(sr,project,Map.of("version",0,"reason","补齐信息","name","项目新名称","customer","ACME","deadline","2026-12-31"));
        assertThat(first.path("version").asLong()).isEqualTo(1);
        assertThat(first.path("deadline").asText()).isEqualTo("2026-12-31");
        var second=patchProject(sr,project,Map.of("version",1,"reason","只改名称","name","再次命名"));
        assertThat(second.path("customer").asText()).isEqualTo("ACME");
        assertThat(second.path("deadline").asText()).isEqualTo("2026-12-31");
        var clearing=new HashMap<String,Object>(); clearing.put("version",2);clearing.put("reason","清空选填项");clearing.put("customer",null);clearing.put("deadline",null);
        var third=patchProject(sr,project,clearing);
        assertThat(third.path("customer").isNull()).isTrue(); assertThat(third.path("deadline").isNull()).isTrue();
        assertThat(third.path("name").asText()).isEqualTo("再次命名");
        assertThat(version(sr,project)).isEqualTo(3);
    }
    @Test void projectCreationPersistsDeadlineAndRejectsOverlongMetadata() throws Exception {
        String sr=token("sr01");
        var created=ok(auth(body(post("/api/rfq/projects"),Map.of("code","P"+unique(),"name","日期验收","deadline","2027-01-20")),sr));
        assertThat(created.path("deadline").asText()).isEqualTo("2027-01-20");
        mvc.perform(auth(body(post("/api/rfq/projects"),Map.of("code","P"+unique(),"name","长".repeat(201))),sr)).andExpect(status().isBadRequest());
    }
    @Test void metadataRejectsPrivateFieldsWithoutPartialSideEffects() throws Exception {
        String sr=token("sr01"), project=newProject(sr,"P"+unique());
        for(String field:new String[]{"stage","ownerId","buId","code","archivedFromStage"}) {
            mvc.perform(auth(body(patch("/api/rfq/projects/"+project),Map.of("version",0,"reason","非法字段","name","不应保存",field,"APPROVED")),sr))
                    .andExpect(status().isBadRequest());
        }
        var current=ok(auth(get("/api/rfq/projects/"+project),sr));
        assertThat(current.path("name").asText()).isEqualTo("权限验收项目");
        assertThat(current.path("stage").asText()).isEqualTo("DRAFT"); assertThat(current.path("version").asLong()).isZero();
    }
    @Test void metadataRequiresCurrentVersionReasonAndValidValues() throws Exception {
        String sr=token("sr01"), project=newProject(sr,"P"+unique());
        patchProject(sr,project,Map.of("version",0,"reason","先更新","name","新名称"));
        mvc.perform(auth(body(patch("/api/rfq/projects/"+project),Map.of("version",0,"reason","旧页面","name","覆盖")),sr)).andExpect(status().isConflict());
        for(Object invalid:java.util.List.of(
                Map.of("reason","缺版本","name","X"),Map.of("version",1,"name","X"),
                Map.of("version",1,"reason","空名称","name"," "),Map.of("version",1,"reason","长度","customer","x".repeat(201)),
                Map.of("version",1,"reason","日期","deadline","2026-02-30"),Map.of("version",1.1,"reason","小数版本","name","X"),
                Map.of("version",1,"reason","无修改"))) {
            mvc.perform(auth(body(patch("/api/rfq/projects/"+project),invalid),sr)).andExpect(status().isBadRequest());
        }
        assertThat(version(sr,project)).isEqualTo(1);
    }
    @Test void onlyOwnerOrBuManagerCanMaintainMetadata() throws Exception {
        String admin=token("admin"), bu=token("bu01"), sr=token("sr01"), project=newProject(sr,"P"+unique());
        var participant=newUser(admin,"BU-FEP","SR"); String participantId=participant.path("id").asText();
        grant(bu,project,participantId,0);
        for(String actor:new String[]{admin,token("tech01"),login(participant.path("username").asText(),"TestOnly@2026")}) {
            mvc.perform(auth(body(patch("/api/rfq/projects/"+project),Map.of("version",1,"reason","越权","name","越权修改")),actor)).andExpect(status().isForbidden());
        }
        assertThat(patchProject(bu,project,Map.of("version",1,"reason","BU维护","name","BU修改")).path("name").asText()).isEqualTo("BU修改");
    }
    @Test void handoverRequiresExistingAccessAndTransfersManagementButKeepsReadAccess() throws Exception {
        String admin=token("admin"), bu=token("bu01"), sr=token("sr01"), project=newProject(sr,"P"+unique());
        var recipient=newUser(admin,"BU-FEP","SR"); String id=recipient.path("id").asText();
        mvc.perform(auth(body(post("/api/rfq/projects/"+project+"/handovers"),Map.of("version",0,"reason","未授权","ownerId",id)),sr)).andExpect(status().isBadRequest());
        grant(bu,project,id,0);
        var handed=ok(auth(body(post("/api/rfq/projects/"+project+"/handovers"),Map.of("version",1,"reason","正式移交","ownerId",id)),sr));
        assertThat(handed.path("ownerId").asText()).isEqualTo(id); assertThat(handed.path("version").asLong()).isEqualTo(2);
        mvc.perform(auth(body(patch("/api/rfq/projects/"+project),Map.of("version",2,"reason","旧负责人","name","无权")),sr)).andExpect(status().isForbidden());
        ok(auth(get("/api/rfq/projects/"+project),sr));
        String recipientToken=login(recipient.path("username").asText(),"TestOnly@2026");
        assertThat(patchProject(recipientToken,project,Map.of("version",2,"reason","接任维护","name","新负责人维护")).path("version").asLong()).isEqualTo(3);
        var events=ok(auth(get("/api/rfq/audit").param("objectId",project).param("action","移交项目负责人"),bu));
        assertThat(events.path("total").asInt()).isEqualTo(1);
        assertThat(events.path("list").get(0).path("detail").asText()).contains("demo-sales",id,"正式移交");
    }
    @Test void invalidHandoverTargetsAndStaleRequestsCannotChangeOwner() throws Exception {
        String admin=token("admin"), bu=token("bu01"), sr=token("sr01"), project=newProject(sr,"P"+unique());
        var technical=newUser(admin,"BU-FEP","TECH"); String tech=technical.path("id").asText(); grant(bu,project,tech,0);
        mvc.perform(auth(body(post("/api/rfq/projects/"+project+"/handovers"),Map.of("version",1,"reason","技术不是SR","ownerId",tech)),sr)).andExpect(status().isBadRequest());
        mvc.perform(auth(body(post("/api/rfq/projects/"+project+"/handovers"),Map.of("version",1,"reason","重复移交","ownerId","demo-sales")),sr)).andExpect(status().isConflict());
        var next=newUser(admin,"BU-FEP","SR"); String nextId=next.path("id").asText(); grant(bu,project,nextId,1);
        mvc.perform(auth(body(post("/api/rfq/projects/"+project+"/handovers"),Map.of("version",1,"reason","旧版本","ownerId",nextId)),sr)).andExpect(status().isConflict());
        ok(auth(body(patch("/api/rfq/admin/users/"+nextId+"/status"),Map.of("status","DISABLED")),admin));
        mvc.perform(auth(body(post("/api/rfq/projects/"+project+"/handovers"),Map.of("version",2,"reason","停用接收人","ownerId",nextId)),sr)).andExpect(status().isBadRequest());
        assertThat(ok(auth(get("/api/rfq/projects/"+project),sr)).path("ownerId").asText()).isEqualTo("demo-sales");
    }
}
