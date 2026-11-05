package com.naura.rfq.config;

import com.fasterxml.jackson.databind.ObjectMapper;
import java.sql.Timestamp;
import java.util.Arrays;
import java.util.List;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.crypto.password.PasswordEncoder;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

class MysqlBusinessDataInitializerTest {
    @Test void preservesCompletedSeedAndExistingCredentials() throws Exception {
        var jdbc=mock(JdbcTemplate.class);var passwords=mock(PasswordEncoder.class);
        when(jdbc.queryForList(anyString(),eq(Timestamp.class),any(Object[].class))).thenReturn(List.of(Timestamp.valueOf("2026-11-05 12:00:00")));
        new MysqlBusinessDataInitializer(jdbc,new ObjectMapper(),passwords).run();
        verify(jdbc,never()).update(startsWith("insert into requirement_response"),any(Object[].class));
        verifyNoInteractions(passwords);
    }
    @Test void importsAllHistoriesButDoesNotResurrectDeletedSourceClauses() throws Exception {
        var jdbc=mock(JdbcTemplate.class);var passwords=mock(PasswordEncoder.class);
        when(jdbc.queryForList(anyString(),eq(Timestamp.class),any(Object[].class))).thenReturn(Arrays.asList((Timestamp)null));
        when(jdbc.queryForObject(anyString(),eq(Integer.class),any(Object[].class))).thenAnswer(call->call.getArgument(0,String.class).contains("app_user")?1:0);
        new MysqlBusinessDataInitializer(jdbc,new ObjectMapper(),passwords).run();
        verify(jdbc,times(7)).update(startsWith("insert into response_review"),any(Object[].class));
        verify(jdbc,times(3)).update(startsWith("insert into response_snapshot"),any(Object[].class));
        verify(jdbc,never()).update(startsWith("insert into requirement_response"),any(Object[].class));
        verify(jdbc,never()).update(startsWith("insert into requirement ("),any(Object[].class));
        verifyNoInteractions(passwords);
    }
}
