package com.naura.rfq.admin;

import com.naura.rfq.auth.CurrentUser;
import com.naura.rfq.auth.SessionService;
import com.naura.rfq.mapper.BuMemberProfileMapper;
import com.naura.rfq.support.AcceptanceSupport;
import java.util.List;
import java.util.concurrent.*;
import java.util.concurrent.atomic.AtomicBoolean;
import org.apache.ibatis.executor.Executor;
import org.apache.ibatis.mapping.MappedStatement;
import org.apache.ibatis.plugin.*;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Import;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.TransactionDefinition;
import org.springframework.transaction.support.TransactionTemplate;
import static org.assertj.core.api.Assertions.*;

@Import(MemberConcurrencyIntegrationTest.Scheduling.class)
class MemberConcurrencyIntegrationTest extends AcceptanceSupport {
    @Autowired AdminService admin;
    @Autowired SessionService sessions;
    @Autowired BuMemberProfileMapper profiles;
    @Autowired PlatformTransactionManager manager;
    @Autowired PauseProfileWrite pause;
    @Autowired JdbcTemplate jdbc;

    @Test void staleQualificationSaveCannotUndoConcurrentMemberSuspension() throws Exception { interleave(0); }
    @Test void staleMemberStatusSaveCannotUndoConcurrentQualifications() throws Exception { interleave(1); }
    @Test void partialQualificationSavePreservesConcurrentChangesToOtherFields() throws Exception { interleave(2); }

    void interleave(int scenario) throws Exception {
        CurrentUser platform=sessions.load("demo-system-admin").orElseThrow();
        CurrentUser bu=sessions.load("demo-bu-admin").orElseThrow();
        TransactionTemplate tx=new TransactionTemplate(manager);
        tx.setPropagationBehavior(TransactionDefinition.PROPAGATION_REQUIRES_NEW);
        String userId=tx.execute(status->admin.createUser(platform,new AdminService.NewUser("race_"+unique(),"TestOnly@2026","并发验收",null,"BU-FEP","TECH")).user().getId());
        // Commit setup so the two independent real database transactions both see it.
        tx.execute(status->admin.updateMemberProfile(bu,"BU-FEP",userId,false,false,List.of()));
        var worker=Executors.newSingleThreadExecutor(r->new Thread(r,"member-concurrency-worker"));
        pause.arm();
        try {
            Future<?> stale=worker.submit(()->{
                if(scenario==0)admin.updateMemberProfile(bu,"BU-FEP",userId,true,true,List.of("knowledge-publish"));
                else if(scenario==1)admin.updateMemberEnabled(bu,"BU-FEP",userId,false);
                else admin.updateMemberProfile(bu,"BU-FEP",userId,null,null,List.of("knowledge-publish"));
            });
            assertThat(pause.waiting.await(10,TimeUnit.SECONDS)).isTrue();
            if(scenario==0)tx.execute(status->admin.updateMemberEnabled(bu,"BU-FEP",userId,false));
            else tx.execute(status->admin.updateMemberProfile(bu,"BU-FEP",userId,true,true,scenario==2?null:List.of("knowledge-publish")));
            pause.release.countDown(); stale.get(10,TimeUnit.SECONDS);
            var stored=tx.execute(status->profiles.findByBuIdAndUserId("BU-FEP",userId));
            assertThat(stored.isEnabled()).isEqualTo(scenario==2);
            assertThat(stored.isCanConfirm()).isTrue();
            assertThat(stored.isCanFinalReview()).isTrue();
            assertThat(stored.getResourceQualifications()).isEqualTo("knowledge-publish");
        } finally {
            pause.release.countDown(); worker.shutdownNow(); worker.awaitTermination(10,TimeUnit.SECONDS);
            tx.execute(status->{
                jdbc.update("delete from audit_event where object_id in (?,?)",userId,"BU-FEP/"+userId);
                jdbc.update("delete from bu_member_profile where user_id=?",userId);
                jdbc.update("delete from user_bu_role where user_id=?",userId);
                jdbc.update("delete from app_user where id=?",userId);
                return null;
            });
        }
    }

    @TestConfiguration
    static class Scheduling {
        @Bean PauseProfileWrite pauseProfileWrite() { return new PauseProfileWrite(); }
    }
    /** Scheduling only: the requests, SQL, transactions and assertions are real. */
    @Intercepts(@Signature(type=Executor.class,method="update",args={MappedStatement.class,Object.class}))
    static class PauseProfileWrite implements Interceptor {
        volatile CountDownLatch waiting=new CountDownLatch(1), release=new CountDownLatch(1);
        final AtomicBoolean used=new AtomicBoolean();
        void arm(){waiting=new CountDownLatch(1);release=new CountDownLatch(1);used.set(false);}
        @Override public Object intercept(Invocation invocation) throws Throwable {
            String id=((MappedStatement)invocation.getArgs()[0]).getId();
            if(Thread.currentThread().getName().equals("member-concurrency-worker") && id.contains("BuMemberProfileMapper.") && used.compareAndSet(false,true)) {
                waiting.countDown(); if(!release.await(10,TimeUnit.SECONDS))throw new IllegalStateException("write scheduler timed out");
            }
            return invocation.proceed();
        }
    }
}
