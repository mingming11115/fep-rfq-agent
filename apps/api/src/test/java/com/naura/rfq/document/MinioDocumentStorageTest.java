package com.naura.rfq.document;

import java.io.*;
import java.nio.file.*;
import org.apache.poi.xwpf.usermodel.XWPFDocument;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import static org.assertj.core.api.Assertions.*;
import static org.mockito.Mockito.*;

class MinioDocumentStorageTest {
    @TempDir Path root;
    byte[] docx() throws Exception {
        var out = new ByteArrayOutputStream();
        try (var doc = new XWPFDocument()) { doc.createParagraph().createRun().setText("RFQ"); doc.write(out); }
        return out.toByteArray();
    }
    @Test void remoteRoundtripSurvivesSwitchAndCleansTemporaryFile() throws Exception {
        var remote = mock(MinioObjectStore.class);
        var storage = new DocumentStorage(root.toString(), "minio", "rfq-files", remote);
        byte[] bytes = docx();
        var saved = storage.saveBytes("DOC-test", ".docx", bytes);
        assertThat(saved.storageRef()).startsWith("minio:rfq-files/");
        verify(remote).put(eq("rfq-files"), anyString(), any(Path.class));
        when(remote.get(eq("rfq-files"), anyString())).thenReturn(new ByteArrayInputStream(bytes));
        var switched = new DocumentStorage(root.toString(), "local", "rfq-files", remote);
        Path staged;
        try (var lease = switched.open(saved.storageRef(), saved.size(), saved.sha256())) {
            staged = lease.path();
            assertThat(Files.readAllBytes(staged)).isEqualTo(bytes);
        }
        assertThat(staged).doesNotExist();
        switched.delete(saved.storageRef());
        verify(remote).delete(eq("rfq-files"), anyString());
        when(remote.get(eq("rfq-files"), anyString())).thenReturn(new ByteArrayInputStream(bytes));
        assertThatThrownBy(() -> switched.open(saved.storageRef(), saved.size(), "0".repeat(64)))
            .hasMessageContaining("校验");
    }
    @Test void oldLocalFilesRemainReadableInMinioMode() throws Exception {
        var local = new DocumentStorage(root.toString());
        var saved = local.saveBytes("DOC-old", ".docx", docx());
        var remote = mock(MinioObjectStore.class);
        var switched = new DocumentStorage(root.toString(), "minio", "rfq-files", remote);
        try (var lease = switched.open(saved.storageRef(), saved.size(), saved.sha256())) {
            assertThat(lease.path()).exists();
        }
        assertThat(local.resolve(saved.storageRef())).exists();
        verifyNoInteractions(remote);
    }
    @Test void invalidStorageTypeAndRemoteReferenceAreRejected() {
        var remote = mock(MinioObjectStore.class);
        assertThatThrownBy(() -> new DocumentStorage(root.toString(), "typo", "rfq-files", remote))
            .isInstanceOf(IllegalArgumentException.class);
        var storage = new DocumentStorage(root.toString(), "local", "rfq-files", remote);
        assertThatThrownBy(() -> storage.open("minio:rfq-files/../../secret", 1L, "0".repeat(64)))
            .hasMessageContaining("无效");
        verifyNoInteractions(remote);
    }
    @Test void rejectsCorruptedRemoteContentAndInvalidUploads() throws Exception {
        var remote = mock(MinioObjectStore.class);
        var storage = new DocumentStorage(root.toString(), "minio", "rfq-files", remote);
        var saved = storage.saveBytes("DOC-test", ".docx", docx());
        when(remote.get(eq("rfq-files"), anyString())).thenReturn(new ByteArrayInputStream(new byte[]{1}));
        assertThatThrownBy(() -> storage.open(saved.storageRef(), saved.size(), saved.sha256())).hasMessageContaining("校验");
        clearInvocations(remote);
        assertThatThrownBy(() -> storage.saveBytes("DOC-fake", ".pdf", new byte[]{1})).hasMessageContaining("PDF");
        verifyNoInteractions(remote);
    }
    @Test void remoteFailureDoesNotLeaveLocalOriginal() throws Exception {
        var remote = mock(MinioObjectStore.class);
        doThrow(new IOException("unavailable")).when(remote).put(anyString(), anyString(), any());
        var storage = new DocumentStorage(root.toString(), "minio", "rfq-files", remote);
        assertThatThrownBy(() -> storage.saveBytes("DOC-fail", ".docx", docx())).isInstanceOf(IOException.class);
        try (var files = Files.walk(root)) { assertThat(files.filter(Files::isRegularFile)).isEmpty(); }
    }
}
