package com.naura.rfq.config;

import com.fasterxml.jackson.databind.ObjectMapper;
import java.sql.Timestamp;
import lombok.RequiredArgsConstructor;
import org.springframework.boot.CommandLineRunner;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.core.annotation.Order;
import org.springframework.core.io.ClassPathResource;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

/** Rebind unchanged imported approvals to their real source IDs; never approve user edits. */
@Component @Order(40) @RequiredArgsConstructor
@ConditionalOnProperty(name="rfq.demo-data.enabled",havingValue="true")
public class MysqlApprovalScopeInitializer implements CommandLineRunner {
    private final JdbcTemplate jdbc;
    private final ObjectMapper json;
    @Override @Transactional(rollbackFor=Exception.class)
    public void run(String... args) throws Exception {
        String marker="mysql-approval-scope-v3";
        jdbc.update("insert into rfq_demo_seed (id) values (?) on duplicate key update id=id",marker);
        if(jdbc.queryForList("select initialized_at from rfq_demo_seed where id=? for update",Timestamp.class,marker).get(0)!=null)return;
        try(var input=new ClassPathResource("demo/mysql-demo.json").getInputStream()){
            for(var row:json.readTree(input).path("supplement").path("snapshots")){
                var existing=jdbc.queryForList("select payload from response_snapshot where id=? and project_id=? for update",String.class,row.path("id").asText(),row.path("projectId").asText());
                if(existing.size()==1&&json.readTree(existing.get(0)).equals(row.path("migrationSourcePayload")))
                    jdbc.update("update response_snapshot set payload=? where id=?",json.writeValueAsString(row.path("payload")),row.path("id").asText());
            }
        }
        jdbc.update("update rfq_demo_seed set initialized_at=current_timestamp where id=?",marker);
    }
}
