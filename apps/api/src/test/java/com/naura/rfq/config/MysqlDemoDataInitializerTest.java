package com.naura.rfq.config;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.naura.rfq.storage.DocumentStorage;
import java.sql.Timestamp;
import java.util.Arrays;
import java.util.List;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.crypto.password.PasswordEncoder;
import static org.assertj.core.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

class MysqlDemoDataInitializerTest {
    private final JdbcTemplate jdbc = mock(JdbcTemplate.class);
    private final PasswordEncoder passwords = mock(PasswordEncoder.class);
    private final DocumentStorage storage = mock(DocumentStorage.class);

    @Test
    void seedsBusinessRowsAndDoesNotResetThemOnRestart() throws Exception {
        when(jdbc.queryForList(anyString(), eq(Timestamp.class), any(Object[].class)))
            .thenReturn(Arrays.asList((Timestamp) null), List.of(Timestamp.valueOf("2026-11-05 10:00:00")));
        when(jdbc.queryForObject(anyString(), eq(Integer.class), any(Object[].class))).thenReturn(0);
        when(passwords.encode(anyString())).thenReturn("encoded-password");
        when(storage.saveBytes(anyString(), eq(".docx"), any(byte[].class)))
            .thenReturn(new DocumentStorage.StoredFile("demo/source.docx", 100, "a".repeat(64)));
        var initializer = new MysqlDemoDataInitializer(jdbc, passwords, storage, new ObjectMapper());
        initializer.run();
        verify(jdbc, times(8)).update(startsWith("insert into project ("), any(Object[].class));
        verify(jdbc, times(33)).update(startsWith("insert into requirement ("), any(Object[].class));
        verify(passwords, times(5)).encode("Rfq@2026");
        clearInvocations(jdbc, storage, passwords);
        initializer.run();
        verify(jdbc, never()).update(startsWith("insert into project ("), any(Object[].class));
        verifyNoInteractions(storage, passwords);
    }

    @Test
    void refusesToTakeOverAnExistingUsername() {
        when(jdbc.queryForList(anyString(), eq(Timestamp.class), any(Object[].class)))
            .thenReturn(Arrays.asList((Timestamp) null));
        when(jdbc.queryForObject(anyString(), eq(Integer.class), any(Object[].class)))
            .thenAnswer(call -> call.getArgument(0, String.class).contains("username =") ? 1 : 0);
        var initializer = new MysqlDemoDataInitializer(jdbc, passwords, storage, new ObjectMapper());
        assertThatThrownBy(initializer::run).isInstanceOf(IllegalStateException.class).hasMessageContaining("账号");
        verify(jdbc, never()).update(startsWith("insert into user_bu_role"), any(Object[].class));
    }
}
