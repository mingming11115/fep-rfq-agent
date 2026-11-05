package com.naura.rfq.config;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.sql.Timestamp;
import java.util.Map;
import lombok.RequiredArgsConstructor;
import org.springframework.boot.CommandLineRunner;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.core.annotation.Order;
import org.springframework.core.io.ClassPathResource;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

/** Adds the omitted response/review/reference records once, without resetting existing rows. */
@Component
@Order(30)
@ConditionalOnProperty(name="rfq.demo-data.enabled",havingValue="true")
@RequiredArgsConstructor
public class MysqlBusinessDataInitializer implements CommandLineRunner {
    private static final String DATASET="mysql-business-demo-v2", BU="BU-MYSQL-DEMO";
    private final JdbcTemplate jdbc;
    private final ObjectMapper json;
    private final PasswordEncoder passwords;

    @Override @Transactional(rollbackFor=Exception.class)
    public void run(String... args) throws Exception {
        jdbc.update("insert into rfq_demo_seed (id) values (?) on duplicate key update id=id",DATASET);
        if(jdbc.queryForList("select initialized_at from rfq_demo_seed where id=? for update",Timestamp.class,DATASET).get(0)!=null)return;
        JsonNode data;
        try(var input=new ClassPathResource("demo/mysql-demo.json").getInputStream()){data=json.readTree(input).path("supplement");}
        if(!data.path("id").asText().equals(DATASET))throw new IllegalStateException("完整数据库演示集缺失");
        // Existing SR/technical/approver accounts and passwords are preserved.
        for(int i=2;i<=3;i++){
            String id="mysql-demo-technical-"+i, username="mysql_tech"+i;
            if(jdbc.queryForObject("select count(*) from app_user where id=?",Integer.class,id)==0){
                jdbc.update("insert into app_user (id,username,password_hash,display_name) values (?,?,?,?)",id,username,passwords.encode(DemoDataInitializer.DEMO_PASSWORD),i==2?"王工":"陈工");
                jdbc.update("insert into user_bu_role (user_id,bu_id,role) values (?,?,'TECH')",id,BU);
                jdbc.update("insert into bu_member_profile (user_id,bu_id,can_confirm,can_final_review,resource_qualifications) values (?,?,true,true,'')",id,BU);
                for(JsonNode project:data.path("projects"))jdbc.update("insert into project_member (project_id,user_id,granted_by) values (?,?,?)",project.path("id").asText(),id,"mysql-demo-sales");
            }
        }
        for(JsonNode row:data.path("projects"))jdbc.update("insert into project_response_config (project_id,payload) values (?,?) on duplicate key update project_id=project_id",row.path("id").asText(),json.writeValueAsString(row.path("payload")));
        for(JsonNode row:data.path("responses")){
            String id=row.path("id").asText(), projectId=row.path("projectId").asText();
            // A source clause removed or moved by a user must not be resurrected by this extension.
            if(jdbc.queryForObject("select count(*) from requirement where id=? and project_id=?",Integer.class,id,projectId)==0)continue;
            jdbc.update("insert into requirement_response (requirement_id,project_id,payload) values (?,?,?) on duplicate key update requirement_id=requirement_id",id,projectId,json.writeValueAsString(row.path("payload")));
        }
        for(var entry:Map.of("reviews","response_review","snapshots","response_snapshot").entrySet())
            for(JsonNode row:data.path(entry.getKey()))jdbc.update("insert into "+entry.getValue()+" (id,project_id,payload) values (?,?,?) on duplicate key update id=id",row.path("id").asText(),row.path("projectId").asText(),json.writeValueAsString(row.path("payload")));
        for(var entry:Map.of("models","model_definition","processes","process_definition","capabilities","capability_record","knowledge","knowledge_record","evidence","evidence_record","historyDocuments","history_document","historyClauses","history_clause").entrySet())
            for(JsonNode row:data.path("resources").path(entry.getKey()))jdbc.update("insert into "+entry.getValue()+" (bu_id,id,version,project_id,scope,payload) values (?,?,?,?,?,?) on duplicate key update id=id",BU,row.path("id").asText(),row.path("version").asInt(1),row.hasNonNull("projectId")?row.path("projectId").asText():null,row.path("scope").asText(),json.writeValueAsString(row));
        jdbc.update("insert into knowledge_group_catalog (bu_id,payload) values (?,?) on duplicate key update bu_id=bu_id",BU,json.writeValueAsString(data.path("resources").path("catalog")));
        jdbc.update("update rfq_demo_seed set initialized_at=current_timestamp where id=?",DATASET);
    }
}
