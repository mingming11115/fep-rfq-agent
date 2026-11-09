package com.naura.rfq.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.naura.rfq.support.AcceptanceSupport;
import java.util.Map;
import org.junit.jupiter.api.Test;
import static org.assertj.core.api.Assertions.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

class ProjectAccessIntegrationTest extends AcceptanceSupport {
    long version(String admin, String id) throws Exception {
        return ok(auth(get("/api/rfq/projects/"+id+"/access"),admin)).path("version").asLong();
    }
    JsonNode grant(String admin,String project,String user,boolean enabled,long version) throws Exception {
        return ok(auth(body(patch("/api/rfq/projects/"+project+"/members/"+user),
                Map.of("enabled",enabled,"version",version,"reason","验收授权变更")),admin));
    }
    @Test void sameBuMembershipAloneDoesNotOpenProjectsOrAffectVisibleTotals() throws Exception {
        String admin=token("admin"), project=newProject(token("sr01"),"P"+unique());
        var member=newUser(admin,"BU-FEP","TECH"); String technical=login(member.path("username").asText(),"TestOnly@2026");
        mvc.perform(auth(get("/api/rfq/projects/"+project),technical)).andExpect(status().isForbidden());
        var page=ok(auth(get("/api/rfq/projects"),technical));
        assertThat(page.path("total").asInt()).isZero();
        assertThat(page.path("list").size()).isZero();
    }
    @Test void grantAndRevokeApplyToEveryBusinessResourceUsingTheExistingToken() throws Exception {
        String admin=token("admin"), bu=token("bu01"), sr=token("sr01"), project=newProject(sr,"P"+unique());
        var user=newUser(admin,"BU-FEP","TECH"); String id=user.path("id").asText(), technical=login(user.path("username").asText(),"TestOnly@2026");
        String document=ok(auth(post("/api/rfq/projects/"+project+"/documents/sample"),sr)).path("id").asText();
        String run=ok(auth(post("/api/rfq/documents/"+document+"/parse-runs"),sr)).path("id").asText();
        String[] paths={"/projects/"+project,"/projects/"+project+"/requirements","/projects/"+project+"/documents",
                "/documents/"+document+"/download","/documents/"+document+"/blocks","/parse-runs/"+run};
        var changed=grant(bu,project,id,true,version(bu,project));
        for(String path:paths)mvc.perform(auth(get("/api/rfq"+path),technical)).andExpect(status().isOk());
        var page=ok(auth(get("/api/rfq/projects").param("size","1"),technical));
        assertThat(page.path("total").asInt()).isEqualTo(1);
        assertThat(page.path("list").get(0).path("id").asText()).isEqualTo(project);
        grant(bu,project,id,false,changed.path("version").asLong());
        for(String path:paths)mvc.perform(auth(get("/api/rfq"+path),technical)).andExpect(status().isForbidden());
        assertThat(ok(auth(get("/api/rfq/projects"),technical)).path("total").asInt()).isZero();
    }
    @Test void platformCanManageAccessButDoesNotAutomaticallyReadProjectContent() throws Exception {
        String admin=token("admin"), project=newProject(token("sr01"),"P"+unique());
        ok(auth(get("/api/rfq/projects/"+project+"/access"),admin));
        ok(auth(get("/api/rfq/projects/"+project+"/members"),admin));
        mvc.perform(auth(get("/api/rfq/projects/"+project),admin)).andExpect(status().isForbidden());
        assertThat(ok(auth(get("/api/rfq/projects"),admin)).path("total").asInt()).isZero();
        mvc.perform(auth(get("/api/rfq/projects/"+project+"/access"),token("sr01"))).andExpect(status().isForbidden());
    }
    @Test void staleVersionAndMissingReasonCannotChangeAccess() throws Exception {
        String admin=token("admin"), bu=token("bu01"), project=newProject(token("sr01"),"P"+unique());
        var user=newUser(admin,"BU-FEP","TECH"); String id=user.path("id").asText(); long old=version(bu,project);
        grant(bu,project,id,true,old);
        mvc.perform(auth(body(patch("/api/rfq/projects/"+project+"/members/"+id),Map.of("enabled",false,"version",old,"reason","旧版本")),bu))
                .andExpect(status().isConflict());
        mvc.perform(auth(body(patch("/api/rfq/projects/"+project+"/members/"+id),Map.of("enabled",false,"version",old+1,"reason"," ")),bu))
                .andExpect(status().isBadRequest());
        assertThat(version(bu,project)).isEqualTo(old+1);
        mvc.perform(auth(body(patch("/api/rfq/projects/"+project+"/members/demo-sales"),Map.of("enabled",false,"version",old+1,"reason","撤销负责人")),bu))
                .andExpect(status().isConflict());
    }
    @Test void foreignAndInactiveAccountsCannotBeGrantedAndOnlyManagersMayGrant() throws Exception {
        String admin=token("admin"), bu=token("bu01"), sr=token("sr01"), project=newProject(sr,"P"+unique());
        var foreign=newUser(admin,newBu(admin),"TECH"); String id=foreign.path("id").asText();
        mvc.perform(auth(body(patch("/api/rfq/projects/"+project+"/members/"+id),Map.of("enabled",true,"version",version(bu,project),"reason","跨BU")),bu))
                .andExpect(status().isBadRequest());
        mvc.perform(auth(body(patch("/api/rfq/projects/"+project+"/members/demo-technical"),Map.of("enabled",true,"version",version(bu,project),"reason","无管理权限")),sr))
                .andExpect(status().isForbidden());
        mvc.perform(auth(get("/api/rfq/projects/"+project+"/access"),login(foreign.path("username").asText(),"TestOnly@2026"))).andExpect(status().isForbidden());
        var inactive=newUser(admin,"BU-FEP","TECH"); String inactiveId=inactive.path("id").asText();
        ok(auth(body(patch("/api/rfq/admin/users/"+inactiveId+"/status"),Map.of("status","DISABLED")),admin));
        mvc.perform(auth(body(patch("/api/rfq/projects/"+project+"/members/"+inactiveId),Map.of("enabled",true,"version",version(bu,project),"reason","停用人员")),bu))
                .andExpect(status().isBadRequest());
    }
    @Test void ownerMustBeActiveSrInSameBu() throws Exception {
        String sr=token("sr01");
        mvc.perform(auth(body(post("/api/rfq/projects"),Map.of("code","P"+unique(),"name","负责人验收","ownerId","demo-technical","groupId",PROJECT_GROUP)),sr))
                .andExpect(status().isBadRequest());
        mvc.perform(auth(body(post("/api/rfq/projects"),Map.of("code","P"+unique(),"name","负责人验收","ownerId","missing-user","groupId",PROJECT_GROUP)),sr))
                .andExpect(status().isBadRequest());
        String admin=token("admin"); var foreign=newUser(admin,newBu(admin),"SR");
        mvc.perform(auth(body(post("/api/rfq/projects"),Map.of("code","P"+unique(),"name","负责人验收","ownerId",foreign.path("id").asText(),"groupId",PROJECT_GROUP)),sr))
                .andExpect(status().isBadRequest());
        var inactive=newUser(admin,"BU-FEP","SR"); String inactiveId=inactive.path("id").asText();
        ok(auth(body(patch("/api/rfq/admin/users/"+inactiveId+"/status"),Map.of("status","DISABLED")),admin));
        mvc.perform(auth(body(post("/api/rfq/projects"),Map.of("code","P"+unique(),"name","负责人验收","ownerId",inactiveId,"groupId",PROJECT_GROUP)),sr))
                .andExpect(status().isBadRequest());
    }
    @Test void projectCreatorIsTheDefaultConfirmerWhenTheOwnerIsDifferent() throws Exception {
        String creator=token("sr01");
        var owner=newUser(token("admin"),"BU-FEP","SR");
        var project=ok(auth(body(post("/api/rfq/projects"),Map.of("code","P"+unique(),"name","确认人验收",
                "ownerId",owner.path("id").asText(),"groupId",PROJECT_GROUP)),creator));
        String id=project.path("id").asText();
        var workflow=ok(auth(get("/api/rfq/projects/"+id+"/workflow-records"),creator));
        assertThat(workflow.path("defaultConfirmationAssigneeId").asText()).isEqualTo("demo-sales");
    }
    @Test void suspendedMemberImmediatelyLosesAnExistingProjectGrant() throws Exception {
        String admin=token("admin"), bu=token("bu01"), project=newProject(token("sr01"),"P"+unique());
        var user=newUser(admin,"BU-FEP","TECH"); String id=user.path("id").asText(), technical=login(user.path("username").asText(),"TestOnly@2026");
        grant(bu,project,id,true,version(bu,project));
        ok(auth(body(patch("/api/rfq/admin/business-units/BU-FEP/members/"+id+"/status"),Map.of("enabled",false)),bu));
        mvc.perform(auth(get("/api/rfq/projects/"+project),technical)).andExpect(status().isForbidden());
        assertThat(ok(auth(get("/api/rfq/projects"),technical)).path("total").asInt()).isZero();
    }
    @Test void unassignedSalesUserCannotMutateAnotherProjectSource() throws Exception {
        String admin=token("admin"), project=newProject(token("sr01"),"P"+unique());
        var user=newUser(admin,"BU-FEP","SR"); String sr=login(user.path("username").asText(),"TestOnly@2026");
        mvc.perform(auth(post("/api/rfq/projects/"+project+"/documents/sample"),sr)).andExpect(status().isForbidden());
    }
}
