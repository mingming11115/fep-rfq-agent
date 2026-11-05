package com.naura.rfq.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.naura.rfq.mapper.CustomerDocumentMapper;
import com.naura.rfq.storage.DocumentStorage;
import com.naura.rfq.support.AcceptanceSupport;
import java.io.ByteArrayOutputStream;
import java.nio.file.Files;
import java.nio.file.Path;
import java.security.MessageDigest;
import java.util.HexFormat;
import java.util.Map;
import java.util.concurrent.atomic.AtomicReference;
import org.apache.pdfbox.pdmodel.*;
import org.apache.pdfbox.pdmodel.encryption.*;
import org.apache.poi.xwpf.usermodel.XWPFDocument;
import org.junit.jupiter.api.Test;
import org.mybatis.spring.SqlSessionTemplate;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.transaction.*;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionTemplate;
import static org.assertj.core.api.Assertions.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

class DocumentAcceptanceTest extends AcceptanceSupport {
    static final Path ROOT;
    static { try { ROOT=Files.createTempDirectory("rfq-document-acceptance-"); } catch(Exception e){throw new RuntimeException(e);} }
    @DynamicPropertySource static void properties(DynamicPropertyRegistry r){r.add("rfq.storage-dir",()->ROOT.toString());}
    @Autowired CustomerDocumentMapper documents;
    @Autowired DocumentStorage storage;
    @Autowired JdbcTemplate jdbc;
    @Autowired SqlSessionTemplate sqlSession;
    @Autowired PlatformTransactionManager transactions;

    static byte[] pdf(String title,boolean encrypted) throws Exception {
        var out=new ByteArrayOutputStream();
        try(var pdf=new PDDocument()) {
            pdf.addPage(new PDPage());pdf.getDocumentInformation().setTitle(title);
            if(encrypted) {var policy=new StandardProtectionPolicy("owner-test","reader-test",new AccessPermission());policy.setEncryptionKeyLength(128);pdf.protect(policy);}
            pdf.save(out);
        }
        return out.toByteArray();
    }
    static byte[] docx() throws Exception {
        var out=new ByteArrayOutputStream();try(var doc=new XWPFDocument()){doc.createParagraph().createRun().setText("1.1 Design pressure shall be 2 MPa.");doc.write(out);}return out.toByteArray();
    }
    JsonNode upload(String actor,String project,String name,String type,byte[] bytes) throws Exception {
        return ok(auth(multipart("/api/rfq/projects/"+project+"/documents").file(new MockMultipartFile("file",name,type,bytes)),actor));
    }
    String checksum(byte[] bytes) throws Exception {return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(bytes));}

    @Test void validatedFormatDeterminesMimeAndDetailHasIndependentChecksum() throws Exception {
        String sr=token("sr01"), project=newProject(sr,"P"+unique());byte[] bytes=docx();
        var saved=upload(sr,project,"C:\\客户资料\\需求 文件.DOCX","application/pdf",bytes);String id=saved.path("id").asText();
        assertThat(saved.path("name").asText()).isEqualTo("需求 文件.DOCX");
        assertThat(saved.path("sha256").asText()).isEqualTo(checksum(bytes));
        assertThat(saved.path("contentType").asText()).isEqualTo("application/vnd.openxmlformats-officedocument.wordprocessingml.document");
        var detail=ok(auth(get("/api/rfq/documents/"+id),sr));
        assertThat(detail.path("sha256").asText()).isEqualTo(checksum(bytes));assertThat(detail.toString()).doesNotContain("storageRef",ROOT.toString());
        assertThat(documents.findById(id).orElseThrow().getContentType()).isEqualTo("application/vnd.openxmlformats-officedocument.wordprocessingml.document");
        mvc.perform(auth(get("/api/rfq/documents/"+id+"/download"),sr)).andExpect(status().isOk()).andExpect(content().bytes(bytes))
                .andExpect(header().string("ETag","\""+checksum(bytes)+"\""));
    }
    @Test void fileNameLimitMatchesDatabaseAndInvalidNameDoesNotWriteAFile() throws Exception {
        String sr=token("sr01"), project=newProject(sr,"P"+unique());byte[] bytes=pdf("names",false);
        upload(sr,project,"a".repeat(251)+".pdf","application/pdf",bytes);
        mvc.perform(auth(multipart("/api/rfq/projects/"+project+"/documents").file(new MockMultipartFile("file","a".repeat(252)+".pdf","application/pdf",bytes)),sr))
                .andExpect(status().isBadRequest());
        assertThat(documents.countByProjectId(project)).isEqualTo(1);
        try(var paths=Files.walk(ROOT)){assertThat(paths.filter(Files::isRegularFile).count()).isEqualTo(1);}
    }
    @Test void invalidContentEncryptedPdfAndEmptyUploadLeaveProjectUnchanged() throws Exception {
        String sr=token("sr01"), project=newProject(sr,"P"+unique());
        for(var file:java.util.List.of(new MockMultipartFile("file","fake.docx","application/pdf",pdf("wrong",false)),
                new MockMultipartFile("file","fake.pdf","application/pdf",new byte[]{1,2,3}),
                new MockMultipartFile("file","locked.pdf","application/pdf",pdf("secret",true)),
                new MockMultipartFile("file","empty.pdf","application/pdf",new byte[0])))
            mvc.perform(auth(multipart("/api/rfq/projects/"+project+"/documents").file(file),sr)).andExpect(status().isBadRequest());
        assertThat(documents.countByProjectId(project)).isZero();
        var current=ok(auth(get("/api/rfq/projects/"+project),sr));assertThat(current.path("stage").asText()).isEqualTo("DRAFT");assertThat(current.path("version").asLong()).isZero();
        try(var paths=Files.walk(ROOT)){assertThat(paths.filter(Files::isRegularFile)).isEmpty();}
    }
    @Test void versionsAreDistinctImmutableAndCanBePagedByVersion() throws Exception {
        String sr=token("sr01"), project=newProject(sr,"P"+unique());byte[] one=pdf("one",false),two=pdf("two",false);
        var first=upload(sr,project,"rfq.pdf","text/plain",one);var second=upload(sr,project,"rfq.pdf","application/pdf",two);
        assertThat(first.path("version").asInt()).isEqualTo(1);assertThat(second.path("version").asInt()).isEqualTo(2);
        assertThat(first.path("id").asText()).isNotEqualTo(second.path("id").asText());
        mvc.perform(auth(get("/api/rfq/documents/"+first.path("id").asText()+"/download"),sr)).andExpect(status().isOk()).andExpect(content().bytes(one));
        mvc.perform(auth(get("/api/rfq/documents/"+second.path("id").asText()+"/download"),sr)).andExpect(status().isOk()).andExpect(content().bytes(two));
        var page=ok(auth(get("/api/rfq/projects/"+project+"/documents").param("size","1").param("sort","version,desc"),sr));
        assertThat(page.path("total").asInt()).isEqualTo(2);assertThat(page.path("list").get(0).path("version").asInt()).isEqualTo(2);
    }
    @Test void parserStatusWriteCannotAlterRegisteredOriginalMetadata() throws Exception {
        String sr=token("sr01"), project=newProject(sr,"P"+unique());byte[] bytes=pdf("metadata",false);
        var original=upload(sr,project,"original.pdf","application/pdf",bytes);String id=original.path("id").asText();
        var row=documents.findById(id).orElseThrow();String ref=row.getStorageRef();
        row.setName("changed.docx");row.setVersion(99);row.setStorageRef("wrong/path");row.setSha256("0".repeat(64));row.setSizeBytes(1L);
        row.setContentType("text/plain");row.setPurpose("OTHER");row.setUploadedBy("someone");row.setStatus("PARSED");documents.update(row);
        var kept=documents.findById(id).orElseThrow();assertThat(kept.getStatus()).isEqualTo("PARSED");
        assertThat(kept.getName()).isEqualTo("original.pdf");assertThat(kept.getVersion()).isEqualTo(1);assertThat(kept.getStorageRef()).isEqualTo(ref);
        assertThat(kept.getSha256()).isEqualTo(checksum(bytes));assertThat(kept.getSizeBytes()).isEqualTo((long)bytes.length);
        assertThat(kept.getPurpose()).isEqualTo("REQUIREMENT_SOURCE");assertThat(kept.getContentType()).isEqualTo("application/pdf");assertThat(kept.getUploadedBy()).isEqualTo("demo-sales");
    }
    @Test void corruptedOriginalIsRejectedBeforeDownload() throws Exception {
        String sr=token("sr01"), project=newProject(sr,"P"+unique());byte[] bytes=pdf("integrity",false);
        String id=upload(sr,project,"source.pdf","application/pdf",bytes).path("id").asText();
        byte[] changed=bytes.clone();changed[20]=(byte)(changed[20]^1);Files.write(storage.resolve(documents.findById(id).orElseThrow().getStorageRef()),changed);
        mvc.perform(auth(get("/api/rfq/documents/"+id+"/download"),sr)).andExpect(status().isConflict()).andExpect(jsonPath("$.code").value(409));
    }
    @Test void missingFileOrUnverifiableMetadataIsNotReturnedAsSuccess() throws Exception {
        String sr=token("sr01"), project=newProject(sr,"P"+unique());byte[] bytes=pdf("metadata",false);
        String id=upload(sr,project,"source.pdf","application/pdf",bytes).path("id").asText();Path path=storage.resolve(documents.findById(id).orElseThrow().getStorageRef());
        Files.delete(path);mvc.perform(auth(get("/api/rfq/documents/"+id+"/download"),sr)).andExpect(status().isNotFound());Files.write(path,bytes);
        jdbc.update("update customer_document set sha256=null where id=?",id);sqlSession.clearCache();
        mvc.perform(auth(get("/api/rfq/documents/"+id+"/download"),sr)).andExpect(status().isConflict());
        jdbc.update("update customer_document set sha256=?,size_bytes=? where id=?",checksum(bytes),bytes.length+1,id);sqlSession.clearCache();
        mvc.perform(auth(get("/api/rfq/documents/"+id+"/download"),sr)).andExpect(status().isConflict());
    }
    @Test void streamingHeadersRangesAndHeadPreserveBytesWithoutWritingAudit() throws Exception {
        String sr=token("sr01"), project=newProject(sr,"P"+unique());byte[] bytes=pdf("range",false);String id=upload(sr,project,"客户 需求.PDF","application/octet-stream",bytes).path("id").asText();
        long before=jdbc.queryForObject("select count(*) from audit_event",Long.class);
        ok(auth(get("/api/rfq/documents/"+id),sr));
        mvc.perform(auth(get("/api/rfq/documents/"+id+"/download"),sr)).andExpect(status().isOk()).andExpect(content().bytes(bytes))
                .andExpect(header().string("Content-Type","application/pdf")).andExpect(header().string("Cache-Control","no-store"))
                .andExpect(header().string("X-Content-Type-Options","nosniff")).andExpect(header().string("Content-Disposition",org.hamcrest.Matchers.containsString("attachment")));
        mvc.perform(auth(get("/api/rfq/documents/"+id+"/download").header("Range","bytes=0-9"),sr)).andExpect(status().isPartialContent()).andExpect(content().bytes(java.util.Arrays.copyOf(bytes,10)));
        mvc.perform(auth(head("/api/rfq/documents/"+id+"/download"),sr)).andExpect(status().isOk()).andExpect(header().longValue("Content-Length",bytes.length));
        assertThat(jdbc.queryForObject("select count(*) from audit_event",Long.class)).isEqualTo(before);
    }
    @Test void detailAndDownloadRespectAccessAndRevocationIncludingArchivedProjects() throws Exception {
        String sr=token("sr01"), bu=token("bu01"),project=newProject(sr,"P"+unique());String id=upload(sr,project,"a.pdf","application/pdf",pdf("scope",false)).path("id").asText();
        for(String suffix:new String[]{"","/download"}) {
            mvc.perform(get("/api/rfq/documents/"+id+suffix)).andExpect(status().isUnauthorized());
            for(String denied:new String[]{token("tech01"),token("admin")})mvc.perform(auth(get("/api/rfq/documents/"+id+suffix),denied)).andExpect(status().isForbidden());
        }
        ok(auth(body(patch("/api/rfq/projects/"+project+"/members/demo-technical"),Map.of("version",1,"enabled",true,"reason","允许读取")),bu));
        ok(auth(body(post("/api/rfq/projects/"+project+"/archives"),Map.of("version",2,"reason","归档后读取")),sr));String tech=token("tech01");
        ok(auth(get("/api/rfq/documents/"+id),tech));mvc.perform(auth(get("/api/rfq/documents/"+id+"/download"),tech)).andExpect(status().isOk());
        ok(auth(body(patch("/api/rfq/projects/"+project+"/members/demo-technical"),Map.of("version",3,"enabled",false,"reason","撤销读取")),bu));
        for(String suffix:new String[]{"","/download"})mvc.perform(auth(get("/api/rfq/documents/"+id+suffix),tech)).andExpect(status().isForbidden());
    }
    @Test @Transactional(propagation=Propagation.NOT_SUPPORTED)
    void rollbackRemovesFileDatabaseRecordProjectAdvanceAndSuccessAudit() throws Exception {
        String sr=token("sr01"), project=newProject(sr,"P"+unique());var tx=new TransactionTemplate(transactions);var ref=new AtomicReference<String>();
        try {
            assertThatThrownBy(()->tx.execute(status->{
                try {String id=upload(sr,project,"rollback.pdf","application/pdf",pdf("rollback",false)).path("id").asText();ref.set(documents.findById(id).orElseThrow().getStorageRef());}
                catch(Exception e){throw new RuntimeException(e);}throw new IllegalStateException("force rollback");
            })).isInstanceOf(IllegalStateException.class);
            assertThat(Files.exists(storage.resolve(ref.get()))).isFalse();assertThat(documents.countByProjectId(project)).isZero();
            var current=ok(auth(get("/api/rfq/projects/"+project),sr));assertThat(current.path("version").asLong()).isZero();assertThat(current.path("stage").asText()).isEqualTo("DRAFT");
            assertThat(jdbc.queryForObject("select count(*) from audit_event where action='上传客户文件' and detail like '%rollback.pdf%'",Long.class)).isZero();
        } finally {jdbc.update("delete from audit_event where object_id=?",project);jdbc.update("delete from project_member where project_id=?",project);jdbc.update("delete from project where id=?",project);}
    }
}
