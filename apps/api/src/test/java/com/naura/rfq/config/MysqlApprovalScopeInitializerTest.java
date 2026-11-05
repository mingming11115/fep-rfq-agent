package com.naura.rfq.config;

import com.fasterxml.jackson.databind.ObjectMapper;
import java.sql.Timestamp;
import java.util.Arrays;
import java.util.List;
import org.junit.jupiter.api.Test;
import org.springframework.core.io.ClassPathResource;
import org.springframework.jdbc.core.JdbcTemplate;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

class MysqlApprovalScopeInitializerTest {
    @Test void onlyRebindsUnchangedImportedSnapshot() throws Exception {
        var jdbc=mock(JdbcTemplate.class);var json=new ObjectMapper();
        var rows=json.readTree(new ClassPathResource("demo/mysql-demo.json").getInputStream()).path("supplement").path("snapshots");
        var edited=rows.get(1).path("migrationSourcePayload").deepCopy();
        ((com.fasterxml.jackson.databind.node.ObjectNode)edited).put("reviewReason","用户后来修改的内容");
        when(jdbc.queryForList(anyString(),eq(Timestamp.class),any(Object[].class))).thenReturn(Arrays.asList((Timestamp)null));
        when(jdbc.queryForList(anyString(),eq(String.class),any(Object[].class))).thenReturn(
            List.of(json.writeValueAsString(rows.get(0).path("migrationSourcePayload"))),List.of(json.writeValueAsString(edited)),List.of());
        new MysqlApprovalScopeInitializer(jdbc,json).run();
        verify(jdbc,times(1)).update(startsWith("update response_snapshot"),any(Object[].class));
        verify(jdbc).update(startsWith("update response_snapshot"),eq(json.writeValueAsString(rows.get(0).path("payload"))),eq(rows.get(0).path("id").asText()));
    }
}
