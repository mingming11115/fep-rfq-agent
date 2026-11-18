package com.naura.rfq.service;

import com.naura.rfq.support.AcceptanceSupport;
import java.sql.Timestamp;
import java.time.Instant;
import java.util.Map;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.JdbcTemplate;
import static org.assertj.core.api.Assertions.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

class ProjectPurgeIntegrationTest extends AcceptanceSupport {
    @Autowired JdbcTemplate jdbc;
    @Autowired ProjectPurgeService purgeService;
    long version(String actor,String project) throws Exception { return ok(auth(get("/api/rfq/projects/"+project),actor)).path("version").asLong(); }
    void archive(String actor,String project,long version) throws Exception {
        ok(auth(body(post("/api/rfq/projects/"+project+"/archives"),Map.of("version",version,"reason","验收：归档")),actor));
    }
    @Test void purgeRemovesArchivedProjectAndAllBusinessData() throws Exception {
        String sr=token("sr01"),project=newProject(sr,"P"+unique());
        String document=ok(auth(post("/api/rfq/projects/"+project+"/documents/sample"),sr)).path("id").asText();
        String run=ok(auth(post("/api/rfq/documents/"+document+"/parse-runs"),sr)).path("id").asText();
        archive(sr,project,version(sr,project));
        assertThat(jdbc.queryForObject("select count(*) from requirement where project_id=?",Long.class,project)).isPositive();
        assertThat(jdbc.queryForObject("select count(*) from customer_document where project_id=?",Long.class,project)).isEqualTo(1);
        ok(auth(body(post("/api/rfq/projects/"+project+"/purgations"),Map.of()),sr));
        assertThat(jdbc.queryForObject("select count(*) from project where id=?",Long.class,project)).isZero();
        assertThat(jdbc.queryForObject("select count(*) from customer_document where project_id=?",Long.class,project)).isZero();
        assertThat(jdbc.queryForObject("select count(*) from document_block where document_id=?",Long.class,document)).isZero();
        assertThat(jdbc.queryForObject("select count(*) from parse_run where id=?",Long.class,run)).isZero();
        assertThat(jdbc.queryForObject("select count(*) from requirement where project_id=?",Long.class,project)).isZero();
        assertThat(jdbc.queryForObject("select count(*) from requirement_response where project_id=?",Long.class,project)).isZero();
        assertThat(jdbc.queryForObject("select count(*) from project_member where project_id=?",Long.class,project)).isZero();
        mvc.perform(auth(get("/api/rfq/projects/"+project),sr)).andExpect(status().isNotFound());
        assertThat(ok(auth(get("/api/rfq/audit").param("objectId",project).param("action","彻底删除项目"),token("bu01"))).path("total").asInt()).isEqualTo(1);
    }
    @Test void purgeRejectsActiveProjectAndNonManagers() throws Exception {
        String sr=token("sr01"),project=newProject(sr,"P"+unique());
        mvc.perform(auth(body(post("/api/rfq/projects/"+project+"/purgations"),Map.of()),sr)).andExpect(status().isConflict());
        archive(sr,project,version(sr,project));
        mvc.perform(auth(body(post("/api/rfq/projects/"+project+"/purgations"),Map.of()),token("tech01"))).andExpect(status().isForbidden());
        assertThat(jdbc.queryForObject("select count(*) from project where id=?",Long.class,project)).isEqualTo(1);
    }
    @Test void retentionPurgeClearsExpiredArchivedProjectsOnly() throws Exception {
        String sr=token("sr01"),expired=newProject(sr,"P"+unique()),recent=newProject(sr,"P"+unique());
        archive(sr,expired,version(sr,expired));
        archive(sr,recent,version(sr,recent));
        jdbc.update("update project set archived_at=? where id=?",Timestamp.from(Instant.now().minus(java.time.Duration.ofDays(8))),expired);
        purgeService.purgeExpired();
        assertThat(jdbc.queryForObject("select count(*) from project where id=?",Long.class,expired)).isZero();
        assertThat(jdbc.queryForObject("select stage from project where id=?",String.class,recent)).isEqualTo("CANCELLED");
        assertThat(ok(auth(get("/api/rfq/audit").param("objectId",expired).param("action","保留期到期自动清除"),token("bu01"))).path("total").asInt()).isEqualTo(1);
    }
}
