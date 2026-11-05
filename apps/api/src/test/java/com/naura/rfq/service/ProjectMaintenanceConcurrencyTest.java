package com.naura.rfq.service;

import com.naura.rfq.mapper.CustomerDocumentMapper;
import com.naura.rfq.mapper.ProjectMapper;
import com.naura.rfq.mapper.RequirementMapper;
import com.naura.rfq.support.AcceptanceSupport;
import java.util.Map;
import java.util.concurrent.*;
import java.util.concurrent.atomic.AtomicBoolean;
import org.apache.ibatis.executor.Executor;
import org.apache.ibatis.mapping.MappedStatement;
import org.apache.ibatis.plugin.*;
import org.apache.ibatis.session.ResultHandler;
import org.apache.ibatis.session.RowBounds;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Import;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.TransactionDefinition;
import org.springframework.transaction.support.TransactionTemplate;
import static org.assertj.core.api.Assertions.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@Import(ProjectMaintenanceConcurrencyTest.Scheduling.class)
class ProjectMaintenanceConcurrencyTest extends AcceptanceSupport {
    @Autowired JdbcTemplate jdbc;
    @Autowired PlatformTransactionManager transactions;
    @Autowired PauseStatement pause;
    record Source(String project,String document,String requirement,long version) {}

    @Test void archiveWaitsForExistingClauseChange() throws Exception { interleave(false,false); }
    @Test void archiveWaitsForExistingParse() throws Exception { interleave(false,true); }
    @Test void clauseChangeWaitsForArchiveThenIsRejected() throws Exception { interleave(true,false); }
    @Test void parseWaitsForArchiveThenIsRejected() throws Exception { interleave(true,true); }

    @Test void parseWaitingForHumanEditMustSeeItsCommittedVersionAndPreserveIt() throws Exception {
        String token=token("sr01");var tx=freshTransaction();
        Source source=tx.execute(status->{try{return fixture(token);}catch(Exception e){throw new RuntimeException(e);}});
        var editor=Executors.newSingleThreadExecutor(r->new Thread(r,"project-maintenance-concurrent-worker"));
        var parser=Executors.newSingleThreadExecutor(r->new Thread(r,"project-maintenance-parse-waiter"));
        pause.arm("RequirementMapper.updateWithVersion");
        try {
            Future<?> edited=editor.submit(()->{
                try { mvc.perform(business(source,token,false)).andExpect(status().isOk()); }
                catch(Exception e){throw new RuntimeException(e);}
            });
            assertThat(pause.waiting.await(60,TimeUnit.SECONDS)).isTrue();
            Future<org.springframework.test.web.servlet.MvcResult> reparsed=parser.submit(()->mvc.perform(business(source,token,true)).andReturn());
            // The parser has read its document and opened an RR snapshot before trying the project lock.
            assertThat(pause.parseProjectAttempt.await(60,TimeUnit.SECONDS)).isTrue();
            pause.release.countDown();edited.get(60,TimeUnit.SECONDS);
            assertThat(reparsed.get(60,TimeUnit.SECONDS).getResponse().getStatus()).isEqualTo(409);
            tx.execute(status->{
                assertThat(jdbc.queryForObject("select version from requirement where id=?",Long.class,source.requirement())).isEqualTo(1L);
                assertThat(jdbc.queryForObject("select requirement_text from requirement where id=?",String.class,source.requirement())).isEqualTo("并发前完成的人工修正");
                assertThat(jdbc.queryForObject("select count(*) from parse_run where document_id=?",Long.class,source.document())).isEqualTo(1L);
                return null;
            });
        } finally {
            pause.release.countDown();editor.shutdownNow();parser.shutdownNow();editor.awaitTermination(60,TimeUnit.SECONDS);parser.awaitTermination(60,TimeUnit.SECONDS);
            cleanup(tx,source);
        }
    }

    TransactionTemplate freshTransaction() {
        var tx=new TransactionTemplate(transactions);tx.setPropagationBehavior(TransactionDefinition.PROPAGATION_REQUIRES_NEW);return tx;
    }
    MockHttpServletRequestBuilder archive(Source source,String token) throws Exception {
        return auth(body(post("/api/rfq/projects/"+source.project()+"/archives"),Map.of("version",source.version(),"reason","并发归档验收")),token);
    }
    MockHttpServletRequestBuilder business(Source source,String token,boolean parse) throws Exception {
        return parse?auth(post("/api/rfq/documents/"+source.document()+"/parse-runs"),token)
                :auth(body(patch("/api/rfq/requirements/"+source.requirement()),Map.of("version",0,"requirementText","并发前完成的人工修正")),token);
    }
    Source fixture(String token) throws Exception {
        String project=newProject(token,"P"+unique());
        String document=ok(auth(post("/api/rfq/projects/"+project+"/documents/sample"),token)).path("id").asText();
        ok(auth(post("/api/rfq/documents/"+document+"/parse-runs"),token));
        String requirement=ok(auth(get("/api/rfq/projects/"+project+"/requirements"),token)).path("list").get(0).path("id").asText();
        return new Source(project,document,requirement,ok(auth(get("/api/rfq/projects/"+project),token)).path("version").asLong());
    }
    void interleave(boolean archiveFirst,boolean parse) throws Exception {
        String token=token("sr01");var tx=freshTransaction();
        Source source=tx.execute(status->{try{return fixture(token);}catch(Exception e){throw new RuntimeException(e);}});
        var worker=Executors.newSingleThreadExecutor(r->new Thread(r,"project-maintenance-concurrent-worker"));
        pause.arm(archiveFirst?"ProjectMapper.updateWithVersion":"CustomerDocumentMapper.findByIdForUpdate");
        try {
            Future<?> first=worker.submit(()->{
                try { mvc.perform(archiveFirst?archive(source,token):business(source,token,parse)).andExpect(status().isOk()); }
                catch(Exception e){throw new RuntimeException(e);}
            });
            assertThat(pause.waiting.await(60,TimeUnit.SECONDS)).isTrue();
            // The database timeout proves contention on a real row lock; no sleep guesses the order.
            tx.execute(status->{
                long previous=jdbc.queryForObject("select @@session.innodb_lock_wait_timeout",Long.class);
                jdbc.execute("set session innodb_lock_wait_timeout=1");
                try {
                    mvc.perform(archiveFirst?business(source,token,parse):archive(source,token)).andExpect(status().isConflict());
                } catch(Exception e){throw new RuntimeException(e);}
                finally { jdbc.execute("set session innodb_lock_wait_timeout="+previous);status.setRollbackOnly(); }
                return null;
            });
            pause.release.countDown();first.get(60,TimeUnit.SECONDS);
            tx.execute(status->{
                try { mvc.perform(archiveFirst?business(source,token,parse):archive(source,token))
                        .andExpect(archiveFirst?org.springframework.test.web.servlet.result.MockMvcResultMatchers.status().isConflict():org.springframework.test.web.servlet.result.MockMvcResultMatchers.status().isOk()); }
                catch(Exception e){throw new RuntimeException(e);}
                finally { if(archiveFirst)status.setRollbackOnly(); }
                return null;
            });
            tx.execute(status->{
                assertThat(jdbc.queryForObject("select stage from project where id=?",String.class,source.project())).isEqualTo("CANCELLED");
                if(parse)assertThat(jdbc.queryForObject("select count(*) from parse_run where document_id=?",Long.class,source.document())).isEqualTo(archiveFirst?1L:2L);
                else assertThat(jdbc.queryForObject("select version from requirement where id=?",Long.class,source.requirement())).isEqualTo(archiveFirst?0L:1L);
                return null;
            });
        } finally {
            pause.release.countDown();worker.shutdownNow();worker.awaitTermination(60,TimeUnit.SECONDS);
            cleanup(tx,source);
        }
    }
    void cleanup(TransactionTemplate tx,Source source) {
        tx.execute(status->{
                jdbc.update("delete from audit_event where object_id in (?, ?, ?)",source.project(),source.document(),source.requirement());
                jdbc.update("delete from requirement where project_id=?",source.project());
                jdbc.update("delete from document_block where document_id=?",source.document());
                jdbc.update("delete from parse_run where document_id=?",source.document());
                jdbc.update("delete from customer_document where project_id=?",source.project());
                jdbc.update("delete from project_member where project_id=?",source.project());
                jdbc.update("delete from project where id=?",source.project());return null;
        });
    }
    @TestConfiguration static class Scheduling { @Bean PauseStatement pauseStatement(){return new PauseStatement();} }
    @Intercepts({@Signature(type=Executor.class,method="update",args={MappedStatement.class,Object.class}),
            @Signature(type=Executor.class,method="query",args={MappedStatement.class,Object.class,RowBounds.class,ResultHandler.class})})
    static class PauseStatement implements Interceptor {
        volatile String target;
        volatile CountDownLatch waiting,release;
        volatile CountDownLatch parseProjectAttempt;
        final AtomicBoolean used=new AtomicBoolean();
        void arm(String target){this.target=target;waiting=new CountDownLatch(1);release=new CountDownLatch(1);parseProjectAttempt=new CountDownLatch(1);used.set(false);}
        @Override public Object intercept(Invocation invocation) throws Throwable {
            String id=((MappedStatement)invocation.getArgs()[0]).getId();
            if(Thread.currentThread().getName().equals("project-maintenance-parse-waiter") && id.endsWith("ProjectMapper.findByIdForUpdate"))parseProjectAttempt.countDown();
            if(Thread.currentThread().getName().equals("project-maintenance-concurrent-worker") && id.endsWith(target) && used.compareAndSet(false,true)) {
                waiting.countDown();if(!release.await(60,TimeUnit.SECONDS))throw new IllegalStateException("scheduler timeout");
            }
            return invocation.proceed();
        }
    }
}
