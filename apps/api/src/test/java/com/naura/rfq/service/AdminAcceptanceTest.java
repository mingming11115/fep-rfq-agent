package com.naura.rfq.service;

import com.naura.rfq.support.AcceptanceSupport;
import java.util.Map;
import org.junit.jupiter.api.Test;
import static org.assertj.core.api.Assertions.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

class AdminAcceptanceTest extends AcceptanceSupport {
    @Test void platformCanMaintainBuAndDuplicateCodeIsConflict() throws Exception {
        String admin=token("admin"), code="AC"+unique();
        var request=Map.of("code",code,"name","验收事业部");
        String id=ok(auth(body(post("/api/rfq/admin/business-units"),request),admin)).path("id").asText();
        mvc.perform(auth(body(post("/api/rfq/admin/business-units"),request),admin)).andExpect(status().isConflict());
        ok(auth(body(patch("/api/rfq/admin/business-units/"+id),Map.of("name","新名称")),admin));
        var page=ok(auth(get("/api/rfq/admin/business-units").param("keyword",code),admin));
        assertThat(page.path("total").asInt()).isEqualTo(1);
        assertThat(page.path("list").get(0).path("name").asText()).isEqualTo("新名称");
        mvc.perform(auth(body(post("/api/rfq/admin/business-units"),Map.of("code","X"+unique(),"name","无权")),token("bu01")))
                .andExpect(status().isForbidden());
    }
    @Test void memberQualificationsSurviveReadBackOnFreshSchema() throws Exception {
        String bu=token("bu01");
        var updated=ok(auth(body(patch("/api/rfq/admin/business-units/BU-FEP/members/demo-technical"),
                Map.of("canConfirm",true,"canFinalReview",true,"resourceQualifications",java.util.List.of("knowledge-publish"))),bu));
        assertThat(updated.path("canConfirm").asBoolean()).isTrue();
        assertThat(updated.path("canFinalReview").asBoolean()).isTrue();
        var members=ok(auth(get("/api/rfq/business-units/BU-FEP/members"),token("sr01")));
        assertThat(members.findValuesAsText("userId")).contains("demo-technical");
    }
    @Test void businessDirectoryRejectsOtherBu() throws Exception {
        String other=newBu(token("admin"));
        mvc.perform(auth(get("/api/rfq/business-units/"+other+"/members"),token("sr01"))).andExpect(status().isForbidden());
    }
    @Test void disabledMembershipStaysManageableAndCanBeEnabledAgain() throws Exception {
        String admin=token("admin"), bu=token("bu01");
        var user=newUser(admin,"BU-FEP","TECH"); String id=user.path("id").asText();
        ok(auth(body(patch("/api/rfq/admin/business-units/BU-FEP/members/"+id+"/status"),Map.of("enabled",false)),bu));
        var listed=ok(auth(get("/api/rfq/admin/users").param("buId","BU-FEP").param("keyword",user.path("username").asText()),bu));
        assertThat(listed.path("total").asInt()).isEqualTo(1);
        var enabled=ok(auth(body(patch("/api/rfq/admin/business-units/BU-FEP/members/"+id+"/status"),Map.of("enabled",true)),bu));
        assertThat(enabled.path("enabled").asBoolean()).isTrue();
    }
    @Test void globallyDisabledAccountIsNotAnEligibleMemberAndOldTokenStopsWorking() throws Exception {
        String admin=token("admin"); var user=newUser(admin,"BU-FEP","TECH"); String id=user.path("id").asText();
        String priorToken=login(user.path("username").asText(),"TestOnly@2026");
        ok(auth(body(patch("/api/rfq/admin/users/"+id+"/status"),Map.of("status","DISABLED")),admin));
        var members=ok(auth(get("/api/rfq/business-units/BU-FEP/members"),token("sr01")));
        for(var member:members)if(id.equals(member.path("userId").asText())) { assertThat(member.path("enabled").asBoolean()).isFalse(); }
        mvc.perform(auth(get("/api/rfq/auth/me"),priorToken)).andExpect(status().isUnauthorized());
    }
    @Test void sharedUserGlobalChangesAreDeniedButLocalMembershipChangesWork() throws Exception {
        String admin=token("admin"), bu=token("bu01"), other=newBu(admin);
        var user=newUser(admin,"BU-FEP","TECH"); String id=user.path("id").asText();
        ok(auth(body(post("/api/rfq/admin/users/"+id+"/roles"),Map.of("buId",other,"role","TECH")),admin));
        mvc.perform(auth(body(patch("/api/rfq/admin/users/"+id),Map.of("displayName","跨BU修改")),bu)).andExpect(status().isForbidden());
        mvc.perform(auth(body(post("/api/rfq/admin/users/"+id+"/password"),Map.of("password","OtherTest@2026")),bu)).andExpect(status().isForbidden());
        mvc.perform(auth(body(patch("/api/rfq/admin/users/"+id+"/status"),Map.of("status","DISABLED")),bu)).andExpect(status().isForbidden());
        ok(auth(body(patch("/api/rfq/admin/business-units/BU-FEP/members/"+id+"/status"),Map.of("enabled",false)),bu));
        var listed=ok(auth(get("/api/rfq/admin/users").param("keyword",user.path("username").asText()),bu));
        assertThat(listed.toString()).doesNotContain(other,"passwordHash","TestOnly@2026");
    }
    @Test void buAdminCannotRevokeAnotherAdministratorsRole() throws Exception {
        String admin=token("admin"); var user=newUser(admin,"BU-FEP","BU_ADMIN");
        mvc.perform(auth(delete("/api/rfq/admin/users/"+user.path("id").asText()+"/roles").param("buId","BU-FEP").param("role","BU_ADMIN"),token("bu01")))
                .andExpect(status().isForbidden());
    }
    @Test void invalidSortIs400AndMissingEnabledDoesNotDisableMember() throws Exception {
        String bu=token("bu01");
        mvc.perform(auth(get("/api/rfq/admin/users").param("sort","passwordHash,desc"),bu)).andExpect(status().isBadRequest());
        mvc.perform(auth(body(patch("/api/rfq/admin/business-units/BU-FEP/members/demo-technical/status"),Map.of()),bu)).andExpect(status().isBadRequest());
    }
    @Test void enablingMemberDoesNotRestoreARevokedRole() throws Exception {
        String admin=token("admin"), bu=token("bu01");
        var user=newUser(admin,"BU-FEP","TECH"); String id=user.path("id").asText();
        ok(auth(body(post("/api/rfq/admin/users/"+id+"/roles"),Map.of("buId","BU-FEP","role","SR")),admin));
        ok(auth(delete("/api/rfq/admin/users/"+id+"/roles").param("buId","BU-FEP").param("role","SR"),admin));
        ok(auth(body(patch("/api/rfq/admin/business-units/BU-FEP/members/"+id+"/status"),Map.of("enabled",false)),bu));
        ok(auth(body(patch("/api/rfq/admin/business-units/BU-FEP/members/"+id+"/status"),Map.of("enabled",true)),bu));
        var me=ok(auth(get("/api/rfq/auth/me"),login(user.path("username").asText(),"TestOnly@2026")));
        assertThat(me.path("roles").findValuesAsText("role")).containsExactly("TECH");
    }
    @Test void localAccountProfileAndPasswordCanBeMaintainedWithoutExposingSecrets() throws Exception {
        String bu=token("bu01"); var user=newUser(token("admin"),"BU-FEP","TECH"); String id=user.path("id").asText();
        var updated=ok(auth(body(patch("/api/rfq/admin/users/"+id),Map.of("displayName","维护后的姓名","email","acceptance@example.test")),bu));
        assertThat(updated.path("displayName").asText()).isEqualTo("维护后的姓名");
        assertThat(updated.path("email").asText()).isEqualTo("acceptance@example.test");
        assertThat(updated.toString()).doesNotContain("passwordHash","TestOnly@2026");
        ok(auth(body(post("/api/rfq/admin/users/"+id+"/password"),Map.of("password","ResetOnly@2026")),bu));
        mvc.perform(body(post("/api/rfq/auth/login"),Map.of("username",user.path("username").asText(),"password","TestOnly@2026")))
                .andExpect(status().isUnauthorized());
        assertThat(login(user.path("username").asText(),"ResetOnly@2026")).isNotBlank();
    }
}
