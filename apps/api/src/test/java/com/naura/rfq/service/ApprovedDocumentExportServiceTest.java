package com.naura.rfq.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.ArgumentMatchers.startsWith;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.naura.rfq.common.exception.BusinessException;
import com.naura.rfq.mapper.AppUserMapper;
import com.naura.rfq.mapper.BuMemberProfileMapper;
import com.naura.rfq.mapper.CustomerDocumentMapper;
import com.naura.rfq.mapper.DocumentBlockMapper;
import com.naura.rfq.mapper.ProjectMapper;
import com.naura.rfq.mapper.RequirementMapper;
import com.naura.rfq.mapper.UserBuRoleMapper;
import com.naura.rfq.model.dto.DocumentDownload;
import com.naura.rfq.model.entity.AppUser;
import com.naura.rfq.model.entity.BuMemberProfile;
import com.naura.rfq.model.entity.CustomerDocument;
import com.naura.rfq.model.entity.DocumentBlock;
import com.naura.rfq.model.entity.Project;
import com.naura.rfq.model.entity.Requirement;
import com.naura.rfq.model.entity.UserBuRole;
import com.naura.rfq.security.AccessGuard;
import com.naura.rfq.security.CurrentUser;
import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.util.ArrayList;
import java.util.List;
import java.util.Optional;
import java.util.stream.StreamSupport;
import org.apache.poi.xwpf.usermodel.XWPFDocument;
import org.junit.jupiter.api.Test;
import org.springframework.core.io.ClassPathResource;
import org.springframework.jdbc.core.JdbcTemplate;

class ApprovedDocumentExportServiceTest {
    @Test void importedApprovalsExportNativeCommentsAndRejectChangedResponses() throws Exception {
        var json = new ObjectMapper();
        JsonNode fixture;
        try (var stream = new ClassPathResource("demo/mysql-demo.json").getInputStream()) {
            fixture = json.readTree(stream);
        }
        var supplement = fixture.path("supplement");
        for (var saved : supplement.path("snapshots")) {
            String projectId = saved.path("projectId").asText(), documentId = projectId + "-DOC";
            var snapshot = saved.path("payload");
            var projectSeed = find(fixture.path("projects"), "id", projectId);
            String bu = "BU-MYSQL-DEMO", sr = "mysql-demo-sales";
            var actor = new CurrentUser(sr, "张明", false, List.of(new CurrentUser.RoleGrant(bu, "SR")));
            var project = new Project();
            project.setId(projectId);
            project.setBuId(bu);
            project.setName(projectSeed.path("name").asText());
            var document = new CustomerDocument();
            document.setId(documentId);
            document.setStatus("PARSED");

            var jdbc = mock(JdbcTemplate.class);
            var projects = mock(ProjectMapper.class);
            var documents = mock(CustomerDocumentMapper.class);
            var requirements = mock(RequirementMapper.class);
            var blocks = mock(DocumentBlockMapper.class);
            var profiles = mock(BuMemberProfileMapper.class);
            var users = mock(AppUserMapper.class);
            var roles = mock(UserBuRoleMapper.class);
            var originals = mock(DocumentService.class);
            var exporter = new ApprovedDocumentExportService(jdbc, json, projects, documents, requirements, blocks,
                    profiles, users, roles, mock(AccessGuard.class), originals);
            when(projects.findById(projectId)).thenReturn(Optional.of(project));
            when(documents.findByProjectIdOrderByCreatedAtDesc(projectId)).thenReturn(List.of(document));
            when(jdbc.queryForList(startsWith("select payload from response_snapshot"), eq(String.class), eq(projectId)))
                    .thenReturn(List.of(snapshot.toString()));
            when(jdbc.queryForList(startsWith("select payload from project_response_config"), eq(String.class), eq(projectId)))
                    .thenReturn(List.of(find(supplement.path("projects"), "id", projectId).path("payload").toString()));
            var profile = new BuMemberProfile();
            profile.setCanConfirm(true);
            profile.setCanFinalReview(true);
            profile.setEnabled(true);
            when(profiles.findByBuIdAndUserId(eq(bu), anyString())).thenReturn(profile);
            when(users.findById(anyString())).thenReturn(Optional.of(new AppUser()));
            when(roles.findByUserIdAndStatus(anyString(), eq("ACTIVE"))).thenAnswer(invocation -> {
                var role = new UserBuRole();
                role.setBuId(bu);
                role.setRole(sr.equals(invocation.getArgument(0)) ? "SR" : "TECH");
                return List.of(role);
            });

            List<Requirement> sourceRows = new ArrayList<>();
            List<DocumentBlock> sourceBlocks = new ArrayList<>();
            var bytes = new ByteArrayOutputStream();
            try (var word = new XWPFDocument()) {
                word.createParagraph().createRun().setText("客户原件");
                for (var source : projectSeed.path("requirements")) {
                    int index = sourceRows.size() + 1;
                    var row = new Requirement();
                    row.setId(projectId + "-REQ-" + index);
                    row.setDocumentId(documentId);
                    row.setBlockId("B" + index);
                    row.setTitle(source.path("title").asText());
                    row.setCustomerClauseNo(source.path("clause").asText());
                    row.setOriginalText(source.path("original").asText());
                    sourceRows.add(row);
                    var block = new DocumentBlock();
                    block.setId(row.getBlockId());
                    block.setSourceAnchor("paragraph:" + index);
                    sourceBlocks.add(block);
                    word.createParagraph().createRun().setText(row.getCustomerClauseNo() + " " + row.getOriginalText());
                }
                word.write(bytes);
            }
            when(requirements.findByProjectIdOrderBySortOrder(projectId)).thenReturn(sourceRows);
            when(blocks.findByDocumentIdOrderByBlockIndex(documentId)).thenReturn(sourceBlocks);
            var responses = StreamSupport.stream(supplement.path("responses").spliterator(), false)
                    .filter(row -> projectId.equals(row.path("projectId").asText()))
                    .map(row -> row.path("payload").toString()).toList();
            when(jdbc.queryForList(startsWith("select payload from requirement_response"), eq(String.class), eq(projectId)))
                    .thenReturn(responses);
            when(originals.download(actor, documentId)).thenReturn(new DocumentDownload(bytes.toByteArray(), "客户.docx",
                    "application/vnd.openxmlformats-officedocument.wordprocessingml.document", bytes.size(), "unused"));

            String snapshotId = snapshot.path("id").asText();
            var exported = exporter.download(actor, projectId, snapshotId);
            assertThat(exported.name()).isEqualTo("客户-正式应答.docx");
            try (var copy = new XWPFDocument(new ByteArrayInputStream(exported.bytes()))) {
                assertThat(copy.getComments()).hasSize(sourceRows.size());
                assertThat(copy.getComments()[0].getText()).contains("答复：" + snapshot.path("rows").get(0).path("draft").asText());
            }
            var tech = new CurrentUser("tech", "李工", false, List.of(new CurrentUser.RoleGrant(bu, "TECH")));
            assertThatThrownBy(() -> exporter.download(tech, projectId, snapshotId))
                    .isInstanceOfSatisfying(BusinessException.class, error -> assertThat(error.getCode()).isEqualTo(403));
            sourceRows.get(0).setOriginalText("已经修改的原文");
            assertThatThrownBy(() -> exporter.download(actor, projectId, snapshotId))
                    .isInstanceOfSatisfying(BusinessException.class, error -> assertThat(error.getCode()).isEqualTo(409));
        }
    }

    private static JsonNode find(JsonNode array, String field, String value) {
        return StreamSupport.stream(array.spliterator(), false)
                .filter(row -> value.equals(row.path(field).asText())).findFirst().orElseThrow();
    }
}
