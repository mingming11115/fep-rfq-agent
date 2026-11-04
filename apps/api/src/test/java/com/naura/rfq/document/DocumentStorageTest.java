package com.naura.rfq.document;

import java.nio.file.Path;
import java.nio.file.Files;
import java.io.ByteArrayOutputStream;
import org.apache.poi.xwpf.usermodel.XWPFDocument;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.springframework.mock.web.MockMultipartFile;
import static org.assertj.core.api.Assertions.*;
import com.naura.rfq.common.exception.BusinessException;

class DocumentStorageTest {
    @TempDir Path root;
    @Test void rejectsFakeDocxAndLeavesNoStoredFile() throws Exception {
        var storage = new DocumentStorage(root.toString());
        assertThatThrownBy(() -> storage.save("DOC-test", new MockMultipartFile("file", "a.docx", "", "fake".getBytes()), ".docx"))
            .hasMessageContaining("DOCX");
        try (var paths = Files.walk(root)) { assertThat(paths.filter(Files::isRegularFile)).isEmpty(); }
    }
    @Test void validDocxIsImmutableAndHasSha256() throws Exception {
        var bytes = new ByteArrayOutputStream();
        try (var doc = new XWPFDocument()) { doc.createParagraph().createRun().setText("RFQ"); doc.write(bytes); }
        var storage = new DocumentStorage(root.toString());
        var saved = storage.save("DOC-test", new MockMultipartFile("file", "a.docx", "", bytes.toByteArray()), ".docx");
        assertThat(Files.readAllBytes(storage.resolve(saved.storageRef()))).isEqualTo(bytes.toByteArray());
        assertThat(saved.sha256()).hasSize(64);
        assertThatThrownBy(() -> storage.saveBytes("DOC-test", ".docx", bytes.toByteArray())).isInstanceOf(Exception.class);
    }
    @Test void advertisedSizeOverLimitIsRejectedBeforeOpeningTheStream() throws Exception {
        var storage=new DocumentStorage(root.toString());
        var file=new MockMultipartFile("file","big.pdf","application/pdf",new byte[]{1}) {
            @Override public long getSize(){return 30L*1024*1024+1;}
            @Override public java.io.InputStream getInputStream(){throw new AssertionError("oversized file stream must not open");}
        };
        assertThatThrownBy(()->storage.save("DOC-big",file,".pdf")).isInstanceOfSatisfying(BusinessException.class,e->assertThat(e.getCode()).isEqualTo(413));
        try(var files=Files.walk(root)){assertThat(files.filter(Files::isRegularFile)).isEmpty();}
    }
    @Test void actualStreamOverLimitCannotBypassAFalseDeclaredSize() throws Exception {
        var storage=new DocumentStorage(root.toString());
        assertThatThrownBy(()->storage.save("DOC-big",streamFile(30L*1024*1024+1),".pdf"))
                .isInstanceOfSatisfying(BusinessException.class,e->assertThat(e.getCode()).isEqualTo(413));
        try(var files=Files.walk(root)){assertThat(files.filter(Files::isRegularFile)).isEmpty();}
    }
    @Test void exactSizeLimitReachesContentValidationInsteadOfSizeRejection() throws Exception {
        var storage=new DocumentStorage(root.toString());
        assertThatThrownBy(()->storage.save("DOC-limit",streamFile(30L*1024*1024),".pdf"))
                .isInstanceOfSatisfying(BusinessException.class,e->assertThat(e.getCode()).isEqualTo(400));
        try(var files=Files.walk(root)){assertThat(files.filter(Files::isRegularFile)).isEmpty();}
    }
    static java.io.InputStream zeroStream(long length) {
        return new java.io.InputStream(){long left=length;
            @Override public int read(){if(left==0)return -1;left--;return 0;}
            @Override public int read(byte[] data,int offset,int count){if(left==0)return -1;int n=(int)Math.min(left,count);java.util.Arrays.fill(data,offset,offset+n,(byte)0);left-=n;return n;}
        };
    }
    private MockMultipartFile streamFile(long length) {
        return new MockMultipartFile("file","big.pdf","application/pdf",new byte[]{1}) {
            @Override public long getSize(){return 1;}
            @Override public java.io.InputStream getInputStream(){return zeroStream(length);}
        };
    }
}
