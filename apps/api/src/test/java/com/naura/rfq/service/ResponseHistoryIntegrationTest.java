package com.naura.rfq.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.naura.rfq.mapper.*;
import com.naura.rfq.model.dto.AssignConfirmationRequest;
import com.naura.rfq.model.entity.*;
import com.naura.rfq.security.CurrentUser;
import java.util.List;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;
import org.springframework.test.web.servlet.ResultActions;
import org.springframework.transaction.annotation.Transactional;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@SpringBootTest(properties = "rfq.demo-data.enabled=false")
@AutoConfigureMockMvc(printOnlyOnFailure = false)
@Transactional
class ResponseHistoryIntegrationTest {
    @Autowired RequirementMapper requirements;
    @Autowired ProjectMapper projects;
    @Autowired CustomerDocumentMapper documents;
    @Autowired AppUserMapper users;
    @Autowired UserBuRoleMapper roles;
    @Autowired ProjectMemberMapper members;
    @Autowired ConfirmationAssignmentService assignments;
    @Autowired JwtService jwt;
    @Autowired ObjectMapper json;
    @Autowired JdbcTemplate jdbc;
    @Autowired MockMvc mvc;

    @Test void aAndBConfirmThenCRestoresOnlyThisClause() throws Exception {
        var fixture = createFixture();
        var a = fixture.a();
        var b = fixture.b();
        var c = fixture.c();
        String path = fixture.path();

        request(get(path + "/history"), a).andExpect(status().isOk())
                .andExpect(jsonPath("$.data.versions.length()").value(0));
        request(get(path + "/history"), fixture.outsider()).andExpect(status().isForbidden());
        request(post(path + "/confirm"), a, write(1, 0, "交期 10 周"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.data.confirmationVersion").value(1));
        assignments.assign(a, fixture.requirementId(), new AssignConfirmationRequest(b.id(), 0L, "调整确认人"));
        request(post(path + "/confirm"), b, write(2, 1, "交期 8 周"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.data.confirmationVersion").value(2));
        request(patch(path), c, write(3, 1, "在编草稿"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.data.version").value(4));

        request(post(path + "/restore"), c, restore(4, 0, "confirmation", 1)).andExpect(status().isConflict());
        request(post(path + "/restore"), c, restore(4, 1, "confirmation", 1))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.draft").value("交期 10 周"))
                .andExpect(jsonPath("$.data.status").value("待确认"))
                .andExpect(jsonPath("$.data.confirmationVersion").value(2))
                .andExpect(jsonPath("$.data.confirmedById").doesNotExist())
                .andExpect(jsonPath("$.data.restoredFromVersion").value(1))
                .andExpect(jsonPath("$.data.restoredById").value(c.id()));
        request(post(path + "/restore"), c, restore(4, 1, "confirmation", 1)).andExpect(status().isConflict());
        request(post(path + "/confirm"), c, write(5, 1, null)).andExpect(status().isForbidden());
        request(post(path + "/confirm"), b, write(5, 1, null))
                .andExpect(status().isOk()).andExpect(jsonPath("$.data.confirmationVersion").value(3));
        request(post(path + "/confirm"), b, write(6, 1, null))
                .andExpect(status().isOk()).andExpect(jsonPath("$.data.confirmationVersion").value(3));

        request(get(path + "/history"), c).andExpect(status().isOk())
                .andExpect(jsonPath("$.data.versions.length()").value(3))
                .andExpect(jsonPath("$.data.versions[0].restoredById").value(c.id()))
                .andExpect(jsonPath("$.data.versions[0].confirmedById").value(b.id()))
                .andExpect(jsonPath("$.data.versions[1].draft").value("交期 8 周"))
                .andExpect(jsonPath("$.data.versions[2].confirmedById").value(a.id()))
                .andExpect(jsonPath("$.data.versions[2].draft").value("交期 10 周"))
                .andExpect(jsonPath("$.data.checkpoints[0].draft").value("在编草稿"));
        request(post(path + "/restore"), c, restore(7, 1, "checkpoint", 4))
                .andExpect(status().isOk()).andExpect(jsonPath("$.data.draft").value("在编草稿"));
    }

    @Test void aLegacyConfirmationRemainsAvailableAfterSavingADraft() throws Exception {
        var fixture = createFixture();
        var payload = json.createObjectNode().put("id", fixture.requirementId()).put("version", 7)
                .put("status", "已确认").put("confirmedBy", "A").put("confirmedById", fixture.a().id())
                .put("confirmedAt", "2026-11-07T04:00:00Z").put("draft", "旧应答正文");
        jdbc.update("insert into requirement_response(requirement_id,project_id,payload) values (?,?,?)",
                fixture.requirementId(), fixture.projectId(), payload.toString());

        request(get(fixture.path() + "/history"), fixture.a()).andExpect(status().isOk())
                .andExpect(jsonPath("$.data.versions[0].confirmationVersion").value(7));
        request(patch(fixture.path()), fixture.a(), write(7, 0, "新草稿")).andExpect(status().isOk());
        request(get(fixture.path() + "/history"), fixture.a()).andExpect(status().isOk())
                .andExpect(jsonPath("$.data.versions[0].draft").value("旧应答正文"));
    }

    private String write(long version, long sourceVersion, String draft) {
        var request = json.createObjectNode().put("version", version).put("sourceVersion", sourceVersion);
        if (draft != null) request.putObject("patch").put("conclusion", "Comply").put("draft", draft);
        return request.toString();
    }

    private String restore(long version, long sourceVersion, String kind, long historyVersion) {
        return json.createObjectNode().put("version", version).put("sourceVersion", sourceVersion)
                .put("kind", kind).put("historyVersion", historyVersion).toString();
    }

    private ResultActions request(MockHttpServletRequestBuilder request, CurrentUser actor, String... body) throws Exception {
        request.header("Authorization", "Bearer " + jwt.issue(actor.id()));
        if (body.length > 0) request.contentType(MediaType.APPLICATION_JSON).content(body[0]);
        return mvc.perform(request);
    }

    private Fixture createFixture() {
        String projectId = "RH-" + UUID.randomUUID().toString().substring(0, 8);
        String bu = projectId + "-BU";
        var a = user(projectId, bu, "A");
        var b = user(projectId, bu, "B");
        var c = user(projectId, bu, "C");
        var outsider = user(projectId, bu, "OUT");
        var project = new Project();
        project.setId(projectId); project.setCode(projectId); project.setName("确认历史测试");
        project.setBuId(bu); project.setOwnerId(a.id()); project.setCreatedBy(a.id());
        projects.insert(project);
        for (var actor : List.of(b, c)) {
            var member = new ProjectMember();
            member.setProjectId(projectId); member.setUserId(actor.id()); member.setGrantedBy(a.id());
            members.upsert(member);
        }
        var doc = new CustomerDocument();
        doc.setId(projectId + "-D"); doc.setProjectId(projectId); doc.setName("source.docx");
        doc.setStorageRef("test-only"); doc.setUploadedBy(a.id()); documents.insert(doc);
        var requirement = new Requirement();
        requirement.setId(projectId + "-R"); requirement.setProjectId(projectId); requirement.setDocumentId(doc.getId());
        requirement.setOriginalText("请说明设备交期"); requirement.setRequirementText("说明交期");
        requirements.insert(requirement);
        return new Fixture(projectId, requirement.getId(), a, b, c, outsider);
    }

    private CurrentUser user(String projectId, String bu, String name) {
        String id = projectId + "-" + name;
        var account = new AppUser();
        account.setId(id); account.setUsername(id); account.setDisplayName(name); account.setPasswordHash("test-only");
        users.insert(account);
        var role = new UserBuRole();
        role.setUserId(id); role.setBuId(bu); role.setRole("SR"); roles.insert(role);
        return new CurrentUser(id, name, false, List.of(new CurrentUser.RoleGrant(bu, "SR")));
    }

    private record Fixture(String projectId, String requirementId, CurrentUser a, CurrentUser b, CurrentUser c, CurrentUser outsider) {
        String path() { return "/api/rfq/requirements/" + requirementId + "/response"; }
    }
}
