package com.naura.rfq.config;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.naura.rfq.storage.DocumentStorage;
import java.io.ByteArrayOutputStream;
import java.sql.Timestamp;
import java.util.UUID;
import lombok.RequiredArgsConstructor;
import org.apache.poi.xwpf.usermodel.XWPFDocument;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.CommandLineRunner;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.core.annotation.Order;
import org.springframework.core.io.ClassPathResource;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

/** Development fixtures in the real business tables, independent of browser demo state. */
@Component
@Order(20)
@ConditionalOnProperty(name="rfq.demo-data.enabled", havingValue="true")
@RequiredArgsConstructor
public class MysqlDemoDataInitializer implements CommandLineRunner {
    private static final Logger log=LoggerFactory.getLogger(MysqlDemoDataInitializer.class);
    private static final String DATASET="mysql-business-demo-v1", BU="BU-MYSQL-DEMO", OWNER="mysql-demo-sales";
    private final JdbcTemplate jdbc;
    private final PasswordEncoder passwords;
    private final DocumentStorage storage;
    private final ObjectMapper json;

    @Override
    @Transactional(rollbackFor=Exception.class)
    public void run(String... args) throws Exception {
        // Serialize simultaneous startups. A completed seed never resets later edits or permissions.
        jdbc.update("insert into rfq_demo_seed (id) values (?) on duplicate key update id = id",DATASET);
        if(jdbc.queryForList("select initialized_at from rfq_demo_seed where id = ? for update",Timestamp.class,DATASET).get(0)!=null)return;
        if(!exists("business_unit","id",BU))jdbc.update("insert into business_unit (id,code,name) values (?,?,?)",BU,"MYSQL-DEMO","MySQL 数据演示事业部");
        account("sales","mysql_sr","数据库销售","SR");
        account("technical","mysql_tech","数据库技术","TECH");
        account("approver","mysql_appr","数据库评审人","APPROVER");
        account("bu-admin","mysql_bu","数据库 BU 管理员","BU_ADMIN");
        account("observer","mysql_view","未授权对照账号","TECH");
        JsonNode dataset;
        try(var input=new ClassPathResource("demo/mysql-demo.json").getInputStream()){dataset=json.readTree(input);}
        for(JsonNode project:dataset.path("projects"))seedProject(project);
        jdbc.update("update rfq_demo_seed set initialized_at = current_timestamp where id = ?",DATASET);
        log.info("MySQL 演示数据初始化完成：8 个项目、33 条要求；账号 mysql_sr / mysql_tech / mysql_appr / mysql_bu / mysql_view");
    }

    private boolean exists(String table,String column,String id){
        return jdbc.queryForObject("select count(*) from "+table+" where "+column+" = ?",Integer.class,id)>0;
    }

    private void account(String suffix,String username,String name,String role){
        String id="mysql-demo-"+suffix;
        if(exists("app_user","id",id)){
            // Reserved IDs may already have been edited. Do not reset their passwords or grants.
            if(jdbc.queryForObject("select count(*) from app_user where id = ? and username = ?",Integer.class,id,username)!=1)
                throw new IllegalStateException("MySQL 演示账号标识冲突："+username);
            return;
        }
        if(exists("app_user","username",username))throw new IllegalStateException("MySQL 演示账号已被占用："+username);
        jdbc.update("insert into app_user (id,username,password_hash,display_name) values (?,?,?,?)",id,username,passwords.encode(DemoDataInitializer.DEMO_PASSWORD),name);
        jdbc.update("insert into user_bu_role (user_id,bu_id,role) values (?,?,?)",id,BU,role);
        boolean technical=role.equals("TECH")||role.equals("APPROVER");
        jdbc.update("insert into bu_member_profile (user_id,bu_id,can_confirm,can_final_review,resource_qualifications) values (?,?,?,?,?)",
            id,BU,!role.equals("BU_ADMIN"),technical||role.equals("SR"),role.equals("BU_ADMIN")?"knowledge-publish,capability-publish":"");
    }

    private void seedProject(JsonNode project) throws Exception {
        String id=project.path("id").asText();
        if(exists("project","id",id))return;
        jdbc.update("insert into project (id,code,name,customer,bu_id,owner_id,stage,created_by,deadline) values (?,?,?,?,?,?,?,?,?)",
            id,id,project.path("name").asText(),project.path("customer").asText(),BU,OWNER,project.path("stage").asText(),OWNER,project.path("deadline").asText());
        for(String member:new String[]{OWNER,"mysql-demo-technical","mysql-demo-approver"})
            jdbc.update("insert into project_member (project_id,user_id,granted_by) values (?,?,?)",id,member,OWNER);
        if(project.path("stage").asText().equals("DRAFT"))return;
        String documentId=id+"-DOC",runId=id+"-PARSE";
        byte[] bytes=document(project);
        var file=storage.saveBytes(documentId+"-"+UUID.randomUUID(),".docx",bytes);
        int count=project.path("requirements").size();
        // PARSING is a staged demonstration, not a background job left running forever.
        String documentStatus=count==0?"UPLOADED":"PARSED";
        jdbc.update("insert into customer_document (id,project_id,name,storage_ref,content_type,size_bytes,sha256,status,uploaded_by) values (?,?,?,?,?,?,?,?,?)",
            documentId,id,project.path("name").asText()+"_模拟RFQ.docx",file.storageRef(),"application/vnd.openxmlformats-officedocument.wordprocessingml.document",file.size(),file.sha256(),documentStatus,OWNER);
        if(count==0)return;
        jdbc.update("insert into parse_run (id,document_id,status,total_blocks,processed_blocks,requirement_count,started_at,finished_at,created_by) values (?,?,?,?,?,?,current_timestamp,current_timestamp,?)",
            runId,documentId,"completed",count,count,count,OWNER);
        int index=0;
        for(JsonNode row:project.path("requirements")){
            String requirementId=id+"-REQ-"+(++index),blockId=id+"-BLOCK-"+index;
            String path=json.writeValueAsString(row.path("sectionPath"));
            jdbc.update("insert into document_block (id,document_id,block_index,type,section_path,customer_clause_no,content,source_anchor) values (?,?,?,?,?,?,?,?)",
                blockId,documentId,index,"paragraph",path,row.path("clause").asText(),row.path("original").asText(),"paragraph:"+index);
            jdbc.update("insert into requirement (id,project_id,document_id,parse_run_id,block_id,section_path,customer_clause_no,title,original_text,requirement_text,conditions_text,obligation,extraction_status,sort_order) values (?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
                requirementId,id,documentId,runId,blockId,path,row.path("clause").asText(),row.path("title").asText(),row.path("original").asText(),row.path("original").asText(),row.path("conditions").asText(),"mandatory",row.path("extractionStatus").asText(),index);
        }
    }

    private byte[] document(JsonNode project) throws Exception {
        try(var document=new XWPFDocument();var output=new ByteArrayOutputStream()){
            document.createParagraph().createRun().setText(project.path("name").asText()+"（模拟客户文件）");
            if(project.path("requirements").isEmpty())document.createParagraph().createRun().setText("1.1 设备应配置安全防护联锁，并提供接口及验收资料。");
            for(JsonNode row:project.path("requirements"))document.createParagraph().createRun().setText(row.path("clause").asText()+" "+row.path("original").asText());
            document.write(output);return output.toByteArray();
        }
    }
}
