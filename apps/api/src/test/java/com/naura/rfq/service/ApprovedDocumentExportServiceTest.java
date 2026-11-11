package com.naura.rfq.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.ArgumentMatchers.startsWith;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
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
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.regex.Pattern;
import org.apache.poi.xwpf.usermodel.XWPFDocument;
import org.junit.jupiter.api.Test;
import org.springframework.core.io.ClassPathResource;
import org.springframework.jdbc.core.JdbcTemplate;

class ApprovedDocumentExportServiceTest {
    @Test void importedApprovalsExportNativeCommentsAndRejectChangedResponses() throws Exception {
        var json = new ObjectMapper();
        var sql = new ClassPathResource("db/init.sql").getContentAsString(StandardCharsets.UTF_8);
        var snapshots = rows(sql, "response_snapshot");
        assertThat(snapshots).hasSize(3);
        for (var saved : snapshots) {
            String projectId = saved.get("project_id"), documentId = projectId + "-DOC";
            var snapshot = json.readTree(saved.get("payload"));
            var projectSeed = rows(sql, "project").stream().filter(row -> projectId.equals(row.get("id")))
                    .findFirst().orElseThrow();
            String bu = "BU-MYSQL-DEMO", sr = "mysql-demo-sales";
            var actor = new CurrentUser(sr, "张明", false, List.of(new CurrentUser.RoleGrant(bu, "SR")));
            var project = new Project();
            project.setId(projectId);
            project.setBuId(bu);
            project.setName(projectSeed.get("name"));
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
                    profiles, users, roles, mock(AccessGuard.class), originals, mock(RequirementMatchService.class), mock(ProjectWorkScope.class));
            when(projects.findById(projectId)).thenReturn(Optional.of(project));
            when(documents.findByProjectIdOrderByCreatedAtDesc(projectId)).thenReturn(List.of(document));
            when(jdbc.queryForList(startsWith("select payload from response_snapshot"), eq(String.class), eq(projectId)))
                    .thenReturn(List.of(snapshot.toString()));
            when(jdbc.queryForList(startsWith("select payload from project_response_config"), eq(String.class), eq(projectId)))
                    .thenReturn(rows(sql, "project_response_config").stream()
                            .filter(row -> projectId.equals(row.get("project_id"))).map(row -> row.get("payload")).toList());
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
                var clauses = rows(sql, "requirement").stream().filter(row -> projectId.equals(row.get("project_id")))
                        .sorted(java.util.Comparator.comparingInt(row -> Integer.parseInt(row.get("sort_order")))).toList();
                for (var source : clauses) {
                    int index = sourceRows.size() + 1;
                    var row = new Requirement();
                    row.setId(projectId + "-REQ-" + index);
                    row.setDocumentId(documentId);
                    row.setBlockId("B" + index);
                    row.setTitle(source.get("title"));
                    row.setCustomerClauseNo(source.get("customer_clause_no"));
                    row.setOriginalText(source.get("original_text"));
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
            var responses = rows(sql, "requirement_response").stream()
                    .filter(row -> projectId.equals(row.get("project_id")))
                    .map(row -> row.get("payload")).toList();
            when(jdbc.queryForList(startsWith("select payload from requirement_response"), eq(String.class), eq(projectId)))
                    .thenReturn(responses);
            when(originals.download(actor, documentId)).thenReturn(new DocumentDownload(bytes.toByteArray(), "客户.docx",
                    "application/vnd.openxmlformats-officedocument.wordprocessingml.document", bytes.size(), "unused"));

            String snapshotId = snapshot.path("id").asText();
            var exported = exporter.download(actor, projectId, snapshotId, false);
            assertThat(exported.name()).isEqualTo("客户-正式应答.docx");
            try (var copy = new XWPFDocument(new ByteArrayInputStream(exported.bytes()))) {
                assertThat(copy.getComments()).hasSize(sourceRows.size());
                assertThat(copy.getComments()[0].getText()).contains("答复：" + snapshot.path("rows").get(0).path("draft").asText());
            }
            var tech = new CurrentUser("tech", "李工", false, List.of(new CurrentUser.RoleGrant(bu, "TECH")));
            assertThatThrownBy(() -> exporter.download(tech, projectId, snapshotId, true))
                    .isInstanceOfSatisfying(BusinessException.class, error -> assertThat(error.getCode()).isEqualTo(403));

            var comply = (ObjectNode) snapshot.path("rows").get(0);
            var optionalFields = List.of("draft", "conditions", "evidence");
            comply.put("conclusion", "Comply").remove(optionalFields);
            var currentResponses = new ArrayList<String>();
            for (String payload : responses) {
                var response = (ObjectNode) json.readTree(payload);
                if (response.path("id").equals(comply.path("id"))) {
                    response.put("conclusion", "Comply").remove(optionalFields);
                }
                currentResponses.add(response.toString());
            }
            when(jdbc.queryForList(startsWith("select payload from requirement_response"), eq(String.class), eq(projectId)))
                    .thenReturn(currentResponses);
            var notes = exporter.validateContents(project, snapshot, true);
            assertThat(notes.get(documentId).get(0).text())
                    .isEqualTo("条款 " + comply.path("clause").asText() + "\n结论：Comply");

            when(jdbc.queryForList(startsWith("select payload from requirement_response"), eq(String.class), eq(projectId)))
                    .thenReturn(responses);
            sourceRows.get(0).setOriginalText("已经修改的原文");
            assertThatThrownBy(() -> exporter.download(actor, projectId, snapshotId, true))
                    .isInstanceOfSatisfying(BusinessException.class, error -> assertThat(error.getCode()).isEqualTo(409));
        }
    }

    private static List<Map<String, String>> rows(String sql, String table) {
        // The fixture uses mysqldump's complete INSERT format with one row per line.
        var insert = Pattern.compile("^INSERT INTO `" + table + "` \\((.+)\\) VALUES \\((.+)\\);$");
        var value = Pattern.compile("'((?:\\\\.|[^'\\\\]++)*+)'|([^,]+)");
        var escape = Pattern.compile("\\\\(.)");
        return sql.lines().map(insert::matcher).filter(java.util.regex.Matcher::matches).map(statement -> {
            var columns = statement.group(1).replace("`", "").split(", ");
            var values = value.matcher(statement.group(2));
            Map<String, String> row = new HashMap<>();
            for (String column : columns) {
                if (!values.find()) {
                    throw new IllegalArgumentException("Missing fixture column " + column);
                }
                String quoted = values.group(1);
                row.put(column, quoted == null ? values.group(2) : escape.matcher(quoted).replaceAll(match ->
                    java.util.regex.Matcher.quoteReplacement(switch (match.group(1)) {
                        case "n" -> "\n";
                        case "r" -> "\r";
                        case "t" -> "\t";
                        default -> match.group(1);
                    })));
            }
            return row;
        }).toList();
    }
}
