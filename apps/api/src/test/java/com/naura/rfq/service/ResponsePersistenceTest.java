package com.naura.rfq.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.naura.rfq.security.CurrentUser;
import java.util.List;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.transaction.annotation.Transactional;
import static org.assertj.core.api.Assertions.*;

/** Opt-in local database verification; all writes and audit rows roll back. */
@SpringBootTest(properties={"rfq.demo-data.enabled=false"})
@Transactional
@org.junit.jupiter.api.condition.EnabledIfSystemProperty(named="rfq.persistence.verify",matches="true")
class ResponsePersistenceTest {
    @Autowired JdbcTemplate jdbc;
    @Autowired ObjectMapper json;
    @Autowired ResponseService service;
    @Autowired BusinessRecordService records;
    @Test void saveConfirmAndReloadFromMysql(){
        var candidates=jdbc.queryForList("select r.id,r.version,p.id as pid,p.owner_id,p.bu_id from requirement r join project p on p.id=r.project_id where p.archived_at is null and not exists(select 1 from response_review v where v.project_id=p.id and json_unquote(json_extract(v.payload,'$.requirementId'))=r.id and json_unquote(json_extract(v.payload,'$.status')) not in ('已关闭','已取消')) order by r.id");
        assertThat(candidates).isNotEmpty();var c=candidates.get(0);
        String id=c.get("id").toString(),pid=c.get("pid").toString(),owner=c.get("owner_id").toString(),bu=c.get("bu_id").toString();
        var user=new CurrentUser(owner,"本机回滚验证",false,List.of(new CurrentUser.RoleGrant(bu,"SR")));
        // Establish a controlled response within this rollback-only transaction.
        jdbc.update("insert into requirement_response(requirement_id,project_id,payload) values(?,?,?) on duplicate key update payload=values(payload)",id,pid,"{\"id\":\""+id+"\",\"version\":1}");
        long source=((Number)c.get("version")).longValue();
        var saved=service.write(user,id,1L,source,json.createObjectNode().put("conclusion","Comply").put("draft","回滚验证答复"),false);
        assertThat(saved.path("version").asLong()).isEqualTo(2);
        service.write(user,id,2L,source,null,true);
        var reloaded=json.valueToTree(records.workflow(user,pid)).path("responses");
        var found=java.util.stream.StreamSupport.stream(reloaded.spliterator(),false).filter(r->r.path("id").asText().equals(id)).findFirst().orElseThrow();
        assertThat(found.path("status").asText()).isEqualTo("已确认");
        assertThat(found.path("draft").asText()).isEqualTo("回滚验证答复");
        assertThat(found.path("version").asLong()).isEqualTo(3);
        assertThatThrownBy(()->service.write(user,id,2L,source,null,true)).hasMessageContaining("版本");
    }
}
