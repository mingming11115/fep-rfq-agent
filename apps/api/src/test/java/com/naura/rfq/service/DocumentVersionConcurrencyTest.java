package com.naura.rfq.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.naura.rfq.mapper.CustomerDocumentMapper;
import com.naura.rfq.storage.DocumentStorage;
import com.naura.rfq.support.AcceptanceSupport;
import com.naura.rfq.support.document.SampleRfqBuilder;
import java.util.concurrent.*;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.transaction.*;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionTemplate;
import static org.assertj.core.api.Assertions.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@Transactional(propagation=Propagation.NOT_SUPPORTED)
class DocumentVersionConcurrencyTest extends AcceptanceSupport {
    @Autowired CustomerDocumentMapper documents;
    @Autowired DocumentStorage storage;
    @Autowired SampleRfqBuilder samples;
    @Autowired JdbcTemplate jdbc;
    @Autowired PlatformTransactionManager transactions;
    JsonNode upload(String token,String project,byte[] bytes) throws Exception {
        return ok(auth(multipart("/api/rfq/projects/"+project+"/documents").file(new MockMultipartFile("file","source.docx","application/vnd.openxmlformats-officedocument.wordprocessingml.document",bytes)),token));
    }
    TransactionTemplate tx(){var tx=new TransactionTemplate(transactions);tx.setPropagationBehavior(TransactionDefinition.PROPAGATION_REQUIRES_NEW);return tx;}
    void clean(String project) throws Exception {
        var rows=documents.findByProjectIdOrderByCreatedAtDesc(project);
        for(var row:rows){jdbc.update("delete from audit_event where object_id=?",row.getId());storage.delete(row.getStorageRef());}
        jdbc.update("delete from customer_document where project_id=?",project);jdbc.update("delete from audit_event where object_id=?",project);
        jdbc.update("delete from project_member where project_id=?",project);jdbc.update("delete from project where id=?",project);
    }
    @Test void staleReadSnapshotStillAllocatesTheNextCommittedVersion() throws Exception {
        String token=token("sr01"), project=newProject(token,"P"+unique());byte[] bytes=samples.build();
        try {
            tx().execute(status->{
                assertThat(jdbc.queryForObject("select count(*) from customer_document where project_id=?",Long.class,project)).isZero();
                tx().execute(other->{try{assertThat(upload(token,project,bytes).path("version").asInt()).isEqualTo(1);}catch(Exception e){throw new RuntimeException(e);}return null;});
                try { assertThat(upload(token,project,bytes).path("version").asInt()).isEqualTo(2); }catch(Exception e){throw new RuntimeException(e);}
                return null;
            });
            assertThat(jdbc.queryForObject("select count(distinct version) from customer_document where project_id=?",Long.class,project)).isEqualTo(2);
        } finally {clean(project);}
    }
    @Test void concurrentUploadsHaveDistinctMonotonicVersionsAndKeepBothOriginals() throws Exception {
        String token=token("sr01"), project=newProject(token,"P"+unique());byte[] bytes=samples.build();
        var workers=Executors.newFixedThreadPool(2);var start=new CyclicBarrier(2);
        try {
            Callable<JsonNode> request=()->{start.await(30,TimeUnit.SECONDS);return upload(token,project,bytes);};
            Future<JsonNode> one=workers.submit(request),two=workers.submit(request);
            var first=one.get(60,TimeUnit.SECONDS);var second=two.get(60,TimeUnit.SECONDS);
            assertThat(java.util.List.of(first.path("version").asInt(),second.path("version").asInt())).containsExactlyInAnyOrder(1,2);
            assertThat(first.path("id").asText()).isNotEqualTo(second.path("id").asText());
            for(var item:java.util.List.of(first,second))mvc.perform(auth(get("/api/rfq/documents/"+item.path("id").asText()+"/download"),token)).andExpect(status().isOk()).andExpect(content().bytes(bytes));
        } finally {workers.shutdownNow();workers.awaitTermination(30,TimeUnit.SECONDS);clean(project);}
    }
    @Test void databaseRejectsARepeatedProjectVersion() throws Exception {
        String token=token("sr01"),project=newProject(token,"P"+unique());
        try {
            String id=upload(token,project,samples.build()).path("id").asText();var duplicate=documents.findById(id).orElseThrow();duplicate.setId("DOC-duplicate-"+unique());
            assertThatThrownBy(()->documents.insert(duplicate)).isInstanceOf(DuplicateKeyException.class);
        } finally {clean(project);}
    }
    @Test void versionOverflowRejectsUploadWithoutConsumingAFileOrProjectChange() throws Exception {
        String token=token("sr01"), project=newProject(token,"P"+unique());byte[] bytes=samples.build();
        try {
            String id=upload(token,project,bytes).path("id").asText();jdbc.update("update customer_document set version=? where id=?",Integer.MAX_VALUE,id);
            mvc.perform(auth(multipart("/api/rfq/projects/"+project+"/documents").file(new MockMultipartFile("file","next.docx","application/octet-stream",bytes)),token)).andExpect(status().isConflict());
            assertThat(documents.countByProjectId(project)).isEqualTo(1);
            assertThat(ok(auth(get("/api/rfq/projects/"+project),token)).path("version").asLong()).isEqualTo(1);
        } finally {clean(project);}
    }
}
