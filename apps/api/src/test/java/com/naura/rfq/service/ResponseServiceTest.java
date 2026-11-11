package com.naura.rfq.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.naura.rfq.mapper.*;
import com.naura.rfq.model.entity.*;
import com.naura.rfq.security.*;
import java.util.*;
import org.junit.jupiter.api.*;
import org.springframework.jdbc.core.JdbcTemplate;
import static org.mockito.Mockito.*;
import static org.assertj.core.api.Assertions.*;

class ResponseServiceTest {
    final JdbcTemplate jdbc=mock(JdbcTemplate.class,withSettings().mockMaker("mock-maker-subclass"));
    final RequirementMapper requirements=mock(RequirementMapper.class,withSettings().mockMaker("mock-maker-subclass"));
    final ProjectMapper projects=mock(ProjectMapper.class,withSettings().mockMaker("mock-maker-subclass"));
    final CustomerDocumentMapper documents=mock(CustomerDocumentMapper.class,withSettings().mockMaker("mock-maker-subclass"));
    final BuMemberProfileMapper profiles=mock(BuMemberProfileMapper.class,withSettings().mockMaker("mock-maker-subclass"));
    final AccessGuard guard=mock(AccessGuard.class,withSettings().mockMaker("mock-maker-subclass"));
    final AuditService audit=mock(AuditService.class,withSettings().mockMaker("mock-maker-subclass"));
    final ConfirmationAssignmentService confirmationAssignments=mock(ConfirmationAssignmentService.class,withSettings().mockMaker("mock-maker-subclass"));
    final ObjectMapper json=new ObjectMapper();
    final CurrentUser sr=new CurrentUser("sr","张明",false,List.of(new CurrentUser.RoleGrant("BU","SR")));
    ResponseService service;
    @BeforeEach void setup(){
        var p=new Project();p.setId("P");p.setBuId("BU");p.setOwnerId("sr");
        var r=new Requirement();r.setId("R");r.setProjectId("P");r.setDocumentId("D");r.setOriginalText("客户原文");
        when(projects.findByIdForUpdate("P")).thenReturn(Optional.of(p));
        when(requirements.findById("R")).thenReturn(Optional.of(r));
        when(requirements.findByDocumentIdForUpdate("D")).thenReturn(List.of(r));
        when(documents.findByIdForUpdate("D")).thenReturn(Optional.of(new CustomerDocument()));
        when(jdbc.queryForList(anyString(),eq(String.class),any(Object[].class))).thenReturn(List.of());
        when(confirmationAssignments.defaultAssigneeId(p)).thenReturn("sr");
        service=new ResponseService(jdbc,json,requirements,projects,documents,profiles,guard,audit,confirmationAssignments,
                mock(RequirementMatchService.class),mock(ProjectWorkScope.class),mock(MatchDeviationService.class));
    }
    @Test void ownerCanSaveAndConfirm(){
        var saved=service.write(sr,"R",1L,0L,json.createObjectNode().put("conclusion","Comply"),false);
        assertThat(saved.path("version").asLong()).isEqualTo(2);
        assertThat(saved.path("status").asText()).isEqualTo("待确认");
        verify(jdbc).update(contains("insert into requirement_response"),eq("R"),eq("P"),anyString());
        verify(audit).successInBu(eq("sr"),eq("BU"),anyString(),eq("requirement"),eq("R"),anyString());
    }
    @Test void legacyConditionsArePreservedInTheDraftWithoutASeparateField() {
        response("""
                {"id":"R","version":3,"conclusion":"有条件 Comply","draft":"支持该配置","conditions":"限选配 X"}
                """);
        var row = service.write(sr, "R", 3L, 0L, null, false);
        assertThat(row.path("draft").asText()).isEqualTo("支持该配置\n适用条件：限选配 X");
        assertThat(row.has("conditions")).isFalse();
    }
    @Test void savedRemarksUseTheNewKeyAndPreserveLegacyValues() {
        response("""
                {"id":"R","version":3,"conclusion":"不适用","reason":"已有备注"}
                """);
        var saved = service.write(sr, "R", 3L, 0L, null, false);
        assertThat(saved.path("remark").asText()).isEqualTo("已有备注");
        assertThat(saved.has("reason")).isFalse();
        var edited = service.write(sr, "R", 3L, 0L,
                json.createObjectNode().put("remark", "").put("reason", "旧客户端的值"), false);
        assertThat(edited.path("remark").asText()).isEmpty();
        assertThat(edited.has("reason")).isFalse();
    }
    @Test void missingVersionCannotWrite(){assertThatThrownBy(()->service.write(sr,"R",null,0L,null,true)).hasMessageContaining("版本");}
    @Test void staleResponseCannotWrite(){assertThatThrownBy(()->service.write(sr,"R",9L,0L,null,true)).hasMessageContaining("版本");}
    @Test void staleSourceCannotWrite(){assertThatThrownBy(()->service.write(sr,"R",1L,9L,null,true)).hasMessageContaining("来源");}
    @Test void unassignedSalesCannotConfirm(){var other=new CurrentUser("other","其他",false,sr.roles());assertThatThrownBy(()->service.write(other,"R",1L,0L,null,true)).hasMessageContaining("确认人");}
    @Test void adminCannotConfirm(){var admin=new CurrentUser("sr","管理员",true,List.of());assertThatThrownBy(()->service.write(admin,"R",1L,0L,null,true)).hasMessageContaining("业务角色");}
    @Test void unresolvedConclusionCannotConfirm(){assertThatThrownBy(()->service.write(sr,"R",1L,0L,null,true)).hasMessageContaining("结论");}
    @Test void assignmentsCannotBeChangedInDraft(){assertThatThrownBy(()->service.write(sr,"R",1L,0L,json.createObjectNode().put("confirmationAssigneeId","sr"),false)).hasMessageContaining("字段");}
    private void response(String payload){when(jdbc.queryForList(contains("from requirement_response"),eq(String.class),any(Object[].class))).thenReturn(List.of(payload));}
    @Test void confirmationBindsActorAndIncrementsVersion(){
        response("{\"id\":\"R\",\"version\":3,\"conclusion\":\"Comply\"}");
        var row=service.write(sr,"R",3L,0L,null,true);
        assertThat(row.path("status").asText()).isEqualTo("已确认");
        assertThat(row.path("confirmedById").asText()).isEqualTo("sr");
        assertThat(row.path("version").asLong()).isEqualTo(4);
    }
    @Test void explicitAssignmentOverridesOwner(){response("{\"version\":1,\"confirmationAssigneeId\":\"tech\",\"conclusion\":\"Comply\"}");assertThatThrownBy(()->service.write(sr,"R",1L,0L,null,true)).hasMessageContaining("确认人");}
    @Test void confirmationUsesTheProjectDefaultInsteadOfTheOwner() {
        var project=projects.findByIdForUpdate("P").orElseThrow();
        when(confirmationAssignments.defaultAssigneeId(project)).thenReturn("creator");
        var creator=new CurrentUser("creator","创建人",false,sr.roles());
        response("{\"version\":1,\"conclusion\":\"Comply\"}");

        assertThatThrownBy(()->service.write(sr,"R",1L,0L,null,true)).hasMessageContaining("确认人");
        assertThat(service.write(creator,"R",1L,0L,null,true).path("confirmedById").asText()).isEqualTo("creator");
    }
    @Test void persistedAssignmentAllowsTheAssignedTechnicianToConfirm() {
        requirements.findById("R").orElseThrow().setConfirmationAssigneeId("tech");
        var tech=new CurrentUser("tech","李工",false,List.of(new CurrentUser.RoleGrant("BU","TECH")));
        var profile=new BuMemberProfile();profile.setEnabled(true);profile.setCanConfirm(true);
        when(profiles.findByBuIdAndUserId("BU","tech")).thenReturn(profile);
        response("{\"version\":1,\"confirmationAssigneeId\":\"sr\",\"conclusion\":\"Comply\"}");

        var confirmed=service.write(tech,"R",1L,0L,null,true);

        assertThat(confirmed.path("confirmedById").asText()).isEqualTo("tech");
        assertThatThrownBy(()->service.write(sr,"R",1L,0L,null,true)).hasMessageContaining("确认人");
    }
    @Test void openReviewBlocksConfirmation(){
        when(jdbc.queryForList(contains("from response_review"),eq(String.class),any(Object[].class))).thenReturn(List.of("{\"requirementId\":\"R\",\"status\":\"待处理\"}"));
        assertThatThrownBy(()->service.write(sr,"R",1L,0L,null,true)).hasMessageContaining("未关闭");
    }
    @Test void editingConfirmedResponseInvalidatesConfirmation(){
        response("{\"version\":2,\"status\":\"已确认\",\"confirmedBy\":\"张明\",\"confirmedAt\":\"now\"}");
        var row=service.write(sr,"R",2L,0L,json.createObjectNode().put("draft","新答复"),false);
        assertThat(row.path("status").asText()).isEqualTo("待确认");assertThat(row.has("confirmedAt")).isFalse();
    }
}
