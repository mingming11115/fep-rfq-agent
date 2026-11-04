package com.naura.rfq.document;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.naura.rfq.mapper.CustomerDocumentMapper;
import java.net.URI;
import java.net.http.*;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.jdbc.core.JdbcTemplate;
import static org.assertj.core.api.Assertions.*;

@SpringBootTest(webEnvironment=SpringBootTest.WebEnvironment.RANDOM_PORT)
class DocumentUploadHttpTest {
    @LocalServerPort int port;
    @Autowired ObjectMapper json;
    @Autowired JdbcTemplate jdbc;
    @Autowired CustomerDocumentMapper documents;
    @Autowired DocumentStorage storage;
    final HttpClient client=HttpClient.newBuilder().version(HttpClient.Version.HTTP_1_1).build();
    HttpRequest.Builder request(String path,String token) {
        var builder=HttpRequest.newBuilder(URI.create("http://127.0.0.1:"+port+"/api/rfq"+path)).timeout(Duration.ofSeconds(60));
        return token==null?builder:builder.header("Authorization","Bearer "+token);
    }
    JsonNode post(String path,String token,Object value) throws Exception {
        var response=client.send(request(path,token).header("Content-Type","application/json").POST(HttpRequest.BodyPublishers.ofString(json.writeValueAsString(value))).build(),HttpResponse.BodyHandlers.ofString());
        assertThat(response.statusCode()).isEqualTo(200);return json.readTree(response.body()).path("data");
    }
    String token() throws Exception {return post("/auth/login",null,Map.of("username","sr01","password","Rfq@2026")).path("token").asText();}
    String project(String token) throws Exception {return post("/projects",token,Map.of("code","H"+UUID.randomUUID().toString().substring(0,12),"name","真实HTTP原件验收")).path("id").asText();}
    HttpRequest upload(String token,String project,HttpRequest.BodyPublisher payload) {
        String boundary="rfqDocumentBoundary";
        var prefix=HttpRequest.BodyPublishers.ofByteArray(("--"+boundary+"\r\nContent-Disposition: form-data; name=\"file\"; filename=\"客户 需求.PDF\"\r\nContent-Type: application/octet-stream\r\n\r\n").getBytes(StandardCharsets.UTF_8));
        var suffix=HttpRequest.BodyPublishers.ofByteArray(("\r\n--"+boundary+"--\r\n").getBytes(StandardCharsets.UTF_8));
        return request("/projects/"+project+"/documents",token).header("Content-Type","multipart/form-data; boundary="+boundary)
                .POST(HttpRequest.BodyPublishers.concat(prefix,payload,suffix)).build();
    }
    void clean(String project) throws Exception {
        for(var row:documents.findByProjectIdOrderByCreatedAtDesc(project)){jdbc.update("delete from audit_event where object_id=?",row.getId());storage.delete(row.getStorageRef());}
        jdbc.update("delete from customer_document where project_id=?",project);jdbc.update("delete from audit_event where object_id=?",project);
        jdbc.update("delete from project_member where project_id=?",project);jdbc.update("delete from project where id=?",project);
    }
    @Test void realHttpUploadParseQueryAndDatabaseRoundtrip() throws Exception {
        String token=token(), project=project(token);
        var output=new java.io.ByteArrayOutputStream();
        try(var pdf=new org.apache.pdfbox.pdmodel.PDDocument()) {
            var page=new org.apache.pdfbox.pdmodel.PDPage(); pdf.addPage(page);
            try(var content=new org.apache.pdfbox.pdmodel.PDPageContentStream(pdf,page)) {
                content.beginText();
                content.setFont(new org.apache.pdfbox.pdmodel.font.PDType1Font(org.apache.pdfbox.pdmodel.font.Standard14Fonts.FontName.HELVETICA),12);
                content.newLineAtOffset(50,700);
                content.showText("1.1 The system shall support 300 mm wafers."); content.endText();
            }
            pdf.save(output);
        }
        byte[] bytes=output.toByteArray();
        try {
            var uploaded=client.send(upload(token,project,HttpRequest.BodyPublishers.ofByteArray(bytes)),HttpResponse.BodyHandlers.ofString());
            assertThat(uploaded.statusCode()).isEqualTo(200);
            String id=json.readTree(uploaded.body()).path("data").path("id").asText();
            var parsed=post("/documents/"+id+"/parse-runs",token,Map.of());
            assertThat(parsed.path("status").asText()).isEqualTo("completed");
            int count=parsed.path("requirementCount").asInt();
            assertThat(count).isPositive();
            assertThat(jdbc.queryForObject("select count(*) from requirement where document_id=?",Integer.class,id)).isEqualTo(count);
            assertThat(jdbc.queryForObject("select original_text from requirement where document_id=? limit 1",String.class,id)).contains("300 mm");
            var queried=client.send(request("/projects/"+project+"/requirements",token).GET().build(),HttpResponse.BodyHandlers.ofString());
            assertThat(queried.statusCode()).isEqualTo(200);
            assertThat(queried.body()).contains(id,"300 mm");
            var download=client.send(request("/documents/"+id+"/download",token).GET().build(),HttpResponse.BodyHandlers.ofByteArray());
            assertThat(download.statusCode()).isEqualTo(200);
            assertThat(download.body()).isEqualTo(bytes);
            System.out.println("UPLOAD_E2E document="+id+" requirements="+count+" original=300 mm; HTTP query and SQL verified");
        } finally {
            jdbc.update("delete from requirement where project_id=?",project);
            jdbc.update("delete from document_block where document_id in (select id from customer_document where project_id=?)",project);
            jdbc.update("delete from parse_run where document_id in (select id from customer_document where project_id=?)",project);
            clean(project);
        }
    }
    @Test void realMultipartLimitReturnsUnified413BeforeWritingBusinessData() throws Exception {
        String token=token(),project=project(token);
        try {
            var response=client.send(upload(token,project,HttpRequest.BodyPublishers.ofInputStream(()->DocumentStorageTest.zeroStream(30L*1024*1024+1))),HttpResponse.BodyHandlers.ofString());
            assertThat(response.statusCode()).isEqualTo(413);var error=json.readTree(response.body());
            assertThat(error.path("code").asInt()).isEqualTo(413);assertThat(error.path("msg").asText()).contains("文件");
            assertThat(documents.countByProjectId(project)).isZero();
            assertThat(jdbc.queryForObject("select version from project where id=?",Long.class,project)).isZero();
        } finally {clean(project);}
    }
    @Test void actualHeadHasNoBodyWhileKeepingLengthAndRangeSupport() throws Exception {
        String token=token(),project=project(token);byte[] bytes=DocumentAcceptanceTest.pdf("http-head",false);
        try {
            var uploaded=client.send(upload(token,project,HttpRequest.BodyPublishers.ofByteArray(bytes)),HttpResponse.BodyHandlers.ofString());
            assertThat(uploaded.statusCode()).isEqualTo(200);var data=json.readTree(uploaded.body()).path("data");String id=data.path("id").asText();
            assertThat(data.path("name").asText()).isEqualTo("客户 需求.PDF");
            var head=client.send(request("/documents/"+id+"/download",token).method("HEAD",HttpRequest.BodyPublishers.noBody()).build(),HttpResponse.BodyHandlers.ofByteArray());
            assertThat(head.statusCode()).isEqualTo(200);assertThat(head.body()).isEmpty();assertThat(head.headers().firstValueAsLong("Content-Length").orElseThrow()).isEqualTo(bytes.length);
            var range=client.send(request("/documents/"+id+"/download",token).header("Range","bytes=0-9").GET().build(),HttpResponse.BodyHandlers.ofByteArray());
            assertThat(range.statusCode()).isEqualTo(206);assertThat(range.body()).containsExactly(java.util.Arrays.copyOf(bytes,10));
        } finally {clean(project);}
    }
}
