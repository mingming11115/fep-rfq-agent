package com.naura.rfq.service;

import com.naura.rfq.mapper.*;
import com.naura.rfq.model.dto.AssignConfirmationRequest;
import com.naura.rfq.model.entity.*;
import com.naura.rfq.security.*;
import java.util.*;
import org.junit.jupiter.api.*;
import static org.mockito.Mockito.*;
import static org.assertj.core.api.Assertions.*;

class ConfirmationAssignmentServiceTest {
    RequirementMapper requirements=mock(RequirementMapper.class);
    ProjectMapper projects=mock(ProjectMapper.class);
    CustomerDocumentMapper documents=mock(CustomerDocumentMapper.class);
    AppUserMapper users=mock(AppUserMapper.class);
    UserBuRoleMapper roles=mock(UserBuRoleMapper.class);
    BuMemberProfileMapper profiles=mock(BuMemberProfileMapper.class);
    ProjectMemberMapper members=mock(ProjectMemberMapper.class);
    AuditService audit=mock(AuditService.class);
    ConfirmationAssignmentService service=new ConfirmationAssignmentService(requirements,projects,documents,users,roles,profiles,members,new AccessGuard(members),audit);
    Requirement row=new Requirement(); Project project=new Project();
    CurrentUser owner=actor("owner","SR"),tech=actor("tech","TECH");
    CurrentUser actor(String id,String role){return new CurrentUser(id,id,false,List.of(new CurrentUser.RoleGrant("BU",role)));}
    @BeforeEach void setup(){
        project.setId("P");project.setBuId("BU");project.setOwnerId("owner");
        row.setId("R");row.setProjectId("P");row.setDocumentId("D");
        when(requirements.findById("R")).thenReturn(Optional.of(row));
        when(requirements.findByDocumentIdForUpdate("D")).thenReturn(List.of(row));
        when(projects.findById("P")).thenReturn(Optional.of(project));
        when(projects.findByIdForUpdate("P")).thenReturn(Optional.of(project));
        when(documents.findByIdForUpdate("D")).thenReturn(Optional.of(new CustomerDocument()));
        when(requirements.assignConfirmation(any())).thenReturn(1);
        AppUser user=new AppUser();user.setId("tech");user.setDisplayName("技术人员");
        when(users.findById("tech")).thenReturn(Optional.of(user));
        UserBuRole grant=new UserBuRole();grant.setUserId("tech");grant.setBuId("BU");grant.setRole("TECH");
        when(roles.findByBuId("BU")).thenReturn(List.of(grant));
        when(roles.findByUserIdAndStatus("tech","ACTIVE")).thenReturn(List.of(grant));
        BuMemberProfile profile=new BuMemberProfile();profile.setCanConfirm(true);
        when(profiles.findByBuIdAndUserId("BU","tech")).thenReturn(profile);
        ProjectMember member=new ProjectMember();member.setEnabled(true);
        when(members.find("P","tech")).thenReturn(Optional.of(member));
    }
    AssignConfirmationRequest request(long version){return new AssignConfirmationRequest("tech",version,"  技术分工  ");}
    @Test void assignsWithAuditAndFreshVersion(){
        var saved=service.assign(owner,"R",request(0));
        assertThat(saved.confirmationAssigneeId()).isEqualTo("tech");assertThat(saved.version()).isEqualTo(1);
        assertThat(row.getConfirmationAssignedBy()).isEqualTo("owner");assertThat(row.getConfirmationAssignedAt()).isNotNull();
        assertThat(row.getConfirmationAssignmentReason()).isEqualTo("技术分工");
        verify(audit).successInBu(eq("owner"),eq("BU"),eq("分派条款确认人"),eq("requirement"),eq("R"),contains("tech"));
    }
    @Test void buManagerCanAssign(){service.assign(actor("manager","BU_ADMIN"),"R",request(0));verify(requirements).assignConfirmation(any());}
    @Test void unauthorizedTechnicianCannotAssign(){assertThatThrownBy(()->service.assign(tech,"R",request(0))).hasMessageContaining("项目负责人");verify(requirements,never()).assignConfirmation(any());}
    @Test void staleVersionCannotOverwriteAssignment(){row.setVersion(1L);assertThatThrownBy(()->service.assign(owner,"R",request(0))).hasMessageContaining("已变化");verify(requirements,never()).assignConfirmation(any());}
    @Test void targetNeedsProjectAccess(){when(members.find("P","tech")).thenReturn(Optional.empty());assertThat(service.candidates(owner,"R")).isEmpty();assertThatThrownBy(()->service.assign(owner,"R",request(0))).hasMessageContaining("项目授权");}
    @Test void targetNeedsConfirmationQualification(){when(profiles.findByBuIdAndUserId("BU","tech")).thenReturn(new BuMemberProfile());assertThatThrownBy(()->service.assign(owner,"R",request(0))).hasMessageContaining("确认资格");}
    @Test void disabledUserCannotBeSelected(){AppUser disabled=new AppUser();disabled.setStatus("DISABLED");when(users.findById("tech")).thenReturn(Optional.of(disabled));assertThat(service.candidates(owner,"R")).isEmpty();}
    @Test void candidatesUseServerAuthorization(){assertThat(service.candidates(owner,"R")).extracting(ConfirmationAssignmentService.Candidate::userId).containsExactly("tech");}
    @Test void creatorIsPreferredOnlyWhileQualifiedAndAuthorized() {
        project.setCreatedBy("tech");
        assertThat(service.defaultAssigneeId(project)).isEqualTo("tech");
        when(members.find("P","tech")).thenReturn(Optional.empty());
        assertThat(service.defaultAssigneeId(project)).isEqualTo("owner");
    }
    @Test void optimisticUpdateFailureDoesNotReportSuccess(){when(requirements.assignConfirmation(any())).thenReturn(0);assertThatThrownBy(()->service.assign(owner,"R",request(0))).hasMessageContaining("已变化");verifyNoInteractions(audit);}
}
