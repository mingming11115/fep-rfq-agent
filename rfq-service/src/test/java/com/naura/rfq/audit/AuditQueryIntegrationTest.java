package com.naura.rfq.audit;

import com.naura.rfq.admin.AdminService;
import com.naura.rfq.auth.SessionService;
import com.naura.rfq.support.AcceptanceSupport;
import java.util.Map;
import java.util.concurrent.atomic.AtomicReference;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.TransactionDefinition;
import org.springframework.transaction.support.TransactionTemplate;
import static org.assertj.core.api.Assertions.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

class AuditQueryIntegrationTest extends AcceptanceSupport {
    @Autowired JdbcTemplate jdbc;
    @Autowired PlatformTransactionManager transactions;
    @Autowired AdminService adminService;
    @Autowired SessionService sessions;

    void event(String bu,String object,String actor,String action) {
        jdbc.update("insert into audit_event(id,bu_id,actor_id,action,object_type,object_id,result,detail) values(?,?,?,?,?,?,?,?)",
                "EVT-"+unique(),bu,actor,action,"acceptance",object,"成功","审计验收");
    }
    @Test void buScopeIsStoredOnEventAndAppliedBeforePaging() throws Exception {
        String id=unique(), other=newBu(token("admin"));
        event("BU-FEP",id,"foreign-actor","验收");
        event(other,id,"demo-bu-admin","验收");
        event(null,id,"demo-bu-admin","验收");
        var visible=ok(auth(get("/api/rfq/audit").param("objectId",id).param("size","1"),token("bu01")));
        assertThat(visible.path("total").asInt()).isEqualTo(1);
        assertThat(visible.path("list").get(0).path("buId").asText()).isEqualTo("BU-FEP");
        assertThat(visible.path("list").get(0).path("actorId").asText()).isEqualTo("foreign-actor");
        assertThat(ok(auth(get("/api/rfq/audit").param("objectId",id),token("admin"))).path("total").asInt()).isEqualTo(3);
    }
    @Test void managementWritesCarryBuAndPasswordsNeverAppearInAudit() throws Exception {
        String admin=token("admin"), bu=newBu(admin);
        var created=ok(auth(get("/api/rfq/audit").param("objectId",bu).param("action","新建事业部"),admin));
        assertThat(created.path("total").asInt()).isEqualTo(1);
        assertThat(created.path("list").get(0).path("buId").asText()).isEqualTo(bu);
        var user=newUser(admin,"BU-FEP","TECH");
        var events=ok(auth(get("/api/rfq/audit").param("objectId",user.path("id").asText()),token("bu01")));
        assertThat(events.path("total").asInt()).isEqualTo(1);
        assertThat(events.toString()).doesNotContain("TestOnly@2026","passwordHash");
    }
    @Test void auditFiltersAreCombinedAndReadsDoNotCreateEvents() throws Exception {
        String id=unique(), bu=token("bu01");
        event("BU-FEP",id,"demo-bu-admin","保留"); event("BU-FEP",id,"demo-sales","其他");
        long before=jdbc.queryForObject("select count(*) from audit_event",Long.class);
        var page=ok(auth(get("/api/rfq/audit").param("objectId",id).param("actorId","demo-bu-admin")
                .param("action","保留").param("objectType","acceptance").param("result","成功")
                .param("createdFrom","2026-01-01T00:00:00Z").param("createdTo","2027-01-01T00:00:00Z"),bu));
        assertThat(page.path("total").asInt()).isEqualTo(1);
        assertThat(jdbc.queryForObject("select count(*) from audit_event",Long.class)).isEqualTo(before);
    }
    @Test void auditRejectsBusinessRoleAndExplicitForeignBu() throws Exception {
        String other=newBu(token("admin"));
        mvc.perform(auth(get("/api/rfq/audit"),token("sr01"))).andExpect(status().isForbidden());
        mvc.perform(auth(get("/api/rfq/audit").param("buId",other),token("bu01"))).andExpect(status().isForbidden());
        mvc.perform(get("/api/rfq/audit")).andExpect(status().isUnauthorized());
    }
    @Test void invalidAuditSortAndTimeRangeReturn400() throws Exception {
        String admin=token("admin");
        mvc.perform(auth(get("/api/rfq/audit").param("sort","detail,desc"),admin)).andExpect(status().isBadRequest());
        mvc.perform(auth(get("/api/rfq/audit").param("createdFrom","2027-01-01T00:00:00Z").param("createdTo","2026-01-01T00:00:00Z"),admin))
                .andExpect(status().isBadRequest());
        mvc.perform(auth(get("/api/rfq/audit").param("result","unknown"),admin)).andExpect(status().isBadRequest());
    }
    @Test void rolledBackManagementOperationDoesNotLeaveSuccessAudit() {
        var actor=sessions.load("demo-system-admin").orElseThrow();
        var tx=new TransactionTemplate(transactions); tx.setPropagationBehavior(TransactionDefinition.PROPAGATION_REQUIRES_NEW);
        var id=new AtomicReference<String>();
        assertThatThrownBy(()->tx.execute(status->{
            id.set(adminService.createBusinessUnit(actor,"RB"+unique(),"回滚验收").getId());
            throw new IllegalStateException("force rollback");
        })).isInstanceOf(IllegalStateException.class);
        var counts=tx.execute(status->java.util.List.of(
                jdbc.queryForObject("select count(*) from business_unit where id=?",Long.class,id.get()),
                jdbc.queryForObject("select count(*) from audit_event where object_id=?",Long.class,id.get())));
        assertThat(counts).containsExactly(0L,0L);
    }
}
