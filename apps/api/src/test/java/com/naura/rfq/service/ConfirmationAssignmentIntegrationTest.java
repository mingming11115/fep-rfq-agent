package com.naura.rfq.service;

import com.naura.rfq.mapper.*;
import com.naura.rfq.model.dto.AssignConfirmationRequest;
import com.naura.rfq.model.entity.*;
import com.naura.rfq.security.*;
import java.util.*;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.transaction.annotation.Transactional;
import static org.assertj.core.api.Assertions.*;

@SpringBootTest
@Transactional
class ConfirmationAssignmentIntegrationTest {
    @Autowired ConfirmationAssignmentService service;
    @Autowired RequirementMapper requirements;
    @Autowired ProjectMapper projects;
    @Autowired CustomerDocumentMapper documents;
    @Autowired AppUserMapper users;
    @Autowired UserBuRoleMapper roles;
    @Autowired ProjectMemberMapper members;
    @Autowired org.apache.ibatis.session.SqlSession sql;

    @Test void databaseRoundtripReassignmentAndConflict(){
        String prefix="ASSIGN-"+UUID.randomUUID().toString().substring(0,8),bu=prefix+"BU",owner=prefix+"SR",target=prefix+"TARGET";
        for(String id:List.of(owner,target)){
            AppUser user=new AppUser();user.setId(id);user.setUsername(id);user.setDisplayName(id);user.setPasswordHash("test-only");users.insert(user);
            UserBuRole role=new UserBuRole();role.setUserId(id);role.setBuId(bu);role.setRole("SR");roles.insert(role);
        }
        Project project=new Project();project.setId(prefix);project.setCode(prefix);project.setName("确认分派验收");project.setBuId(bu);project.setOwnerId(owner);project.setCreatedBy(owner);projects.insert(project);
        ProjectMember member=new ProjectMember();member.setProjectId(prefix);member.setUserId(target);member.setGrantedBy(owner);members.upsert(member);
        CustomerDocument document=new CustomerDocument();document.setId(prefix+"D");document.setProjectId(prefix);document.setName("source.docx");document.setStorageRef("test-only");document.setUploadedBy(owner);documents.insert(document);
        Requirement row=new Requirement();row.setId(prefix+"R");row.setProjectId(prefix);row.setDocumentId(document.getId());row.setOriginalText("客户原文");row.setRequirementText("客户原文");requirements.insert(row);
        CurrentUser actor=new CurrentUser(owner,owner,false,List.of(new CurrentUser.RoleGrant(bu,"SR")));
        assertThat(requirements.findById(row.getId()).orElseThrow().getConfirmationAssigneeId()).isNull();
        var saved=service.assign(actor,row.getId(),new AssignConfirmationRequest(target,0L,"首次指派"));
        sql.clearCache();
        var loaded=requirements.findById(row.getId()).orElseThrow();
        assertThat(loaded.getConfirmationAssigneeId()).isEqualTo(target);assertThat(loaded.getVersion()).isEqualTo(1);
        assertThat(loaded.getConfirmationAssignedBy()).isEqualTo(owner);assertThat(loaded.getConfirmationAssignmentReason()).isEqualTo("首次指派");
        assertThat(loaded.getOriginalText()).isEqualTo("客户原文");
        assertThatThrownBy(()->service.assign(actor,row.getId(),new AssignConfirmationRequest(owner,0L,"过期改派"))).hasMessageContaining("已变化");
        service.assign(actor,row.getId(),new AssignConfirmationRequest(owner,saved.version(),"改派负责人"));
        sql.clearCache();
        assertThat(requirements.findById(row.getId()).orElseThrow().getConfirmationAssigneeId()).isEqualTo(owner);
    }
}
