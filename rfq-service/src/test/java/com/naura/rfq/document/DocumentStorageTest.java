package com.naura.rfq.document;

import java.nio.file.Path;
import java.nio.file.Files;
import java.io.ByteArrayOutputStream;
import org.apache.poi.xwpf.usermodel.XWPFDocument;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.springframework.mock.web.MockMultipartFile;
import static org.assertj.core.api.Assertions.*;

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
}
