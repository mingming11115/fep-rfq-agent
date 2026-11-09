package com.naura.rfq.support;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.util.Map;
import java.util.UUID;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.context.jdbc.Sql;
import org.springframework.test.context.jdbc.SqlConfig;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;
import org.springframework.transaction.annotation.Transactional;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@SpringBootTest
@AutoConfigureMockMvc
@Transactional
@Sql(scripts = "/project-groups.sql", config = @SqlConfig(encoding = "UTF-8"))
public abstract class AcceptanceSupport {
    protected static final String PROJECT_GROUP = "TEST-PROCESS";
    @Autowired protected MockMvc mvc;
    @Autowired protected ObjectMapper json;

    protected String unique() { return UUID.randomUUID().toString().replace("-", "").substring(0, 12); }
    protected MockHttpServletRequestBuilder auth(MockHttpServletRequestBuilder request, String token) {
        return request.header("Authorization", "Bearer " + token);
    }
    protected MockHttpServletRequestBuilder body(MockHttpServletRequestBuilder request, Object value) throws Exception {
        return request.contentType("application/json").content(json.writeValueAsString(value));
    }
    protected JsonNode ok(MockHttpServletRequestBuilder request) throws Exception {
        return json.readTree(mvc.perform(request).andExpect(status().isOk()).andExpect(jsonPath("$.code").value(0))
                .andReturn().getResponse().getContentAsString()).path("data");
    }
    protected String login(String username, String password) throws Exception {
        return ok(body(post("/api/rfq/auth/login"), Map.of("username", username, "password", password))).path("token").asText();
    }
    protected String token(String username) throws Exception { return login(username, "Rfq@2026"); }
    protected String newBu(String admin) throws Exception {
        return ok(auth(body(post("/api/rfq/admin/business-units"), Map.of("code", "T"+unique(), "name", "验收BU")), admin)).path("id").asText();
    }
    protected JsonNode newUser(String admin, String buId, String role) throws Exception {
        return ok(auth(body(post("/api/rfq/admin/users"), Map.of("username", "test_"+unique(), "displayName", "验收人员",
                "password", "TestOnly@2026", "buId", buId, "role", role)), admin));
    }
    protected String newProject(String sr, String code) throws Exception {
        return ok(auth(body(post("/api/rfq/projects"), Map.of("code", code, "name", "权限验收项目", "groupId", PROJECT_GROUP)), sr)).path("id").asText();
    }
}
