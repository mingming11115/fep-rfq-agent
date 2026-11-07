package com.naura.rfq.config;

import java.io.IOException;
import java.io.StringReader;
import java.nio.charset.StandardCharsets;
import java.util.Arrays;
import java.util.Collection;
import java.util.List;
import org.flywaydb.core.api.ResourceProvider;
import org.flywaydb.core.api.resource.LoadableResource;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.autoconfigure.flyway.FlywayConfigurationCustomizer;
import org.springframework.boot.autoconfigure.flyway.FlywayMigrationStrategy;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.core.io.ByteArrayResource;
import org.springframework.core.io.ClassPathResource;
import org.springframework.core.io.support.EncodedResource;
import org.springframework.jdbc.core.ConnectionCallback;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.init.ScriptUtils;
import org.springframework.jdbc.support.JdbcTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

@Configuration(proxyBeanMethods = false)
class DatabaseInit {
    private static final String BASELINE_NAME = "B10__rfq_schema.sql";
    private static final String ASSET_SCHEMA = "-- RFQ_DEMO_ASSET_SCHEMA";
    private static final String INSERTS = "-- RFQ_DEMO_INSERTS\n";
    private static final String INSERTS_END = "-- RFQ_DEMO_INSERTS_END";
    private static final String IMPORT_MARKER = "init-sql-v1";
    private static final String SEED_LOCK = "init-sql-lock";

    private final String sql;

    DatabaseInit() throws IOException {
        sql = new ClassPathResource("db/init.sql").getContentAsString(StandardCharsets.UTF_8).replace("\r\n", "\n");
    }

    @Bean
    FlywayConfigurationCustomizer initSqlBaseline() {
        // Keep the same schema baseline identity for databases already initialized.
        String schema = sql.substring(0, sql.indexOf(ASSET_SCHEMA));
        LoadableResource baseline = new LoadableResource() {
            @Override public StringReader read() { return new StringReader(schema); }
            @Override public String getFilename() { return BASELINE_NAME; }
            @Override public String getRelativePath() { return BASELINE_NAME; }
            @Override public String getAbsolutePath() { return "classpath:db/init.sql"; }
            @Override public String getAbsolutePathOnDisk() { return getAbsolutePath(); }
        };
        return configuration -> configuration.baselineVersion("10").resourceProvider(new ResourceProvider() {
            @Override
            public LoadableResource getResource(String name) {
                return BASELINE_NAME.equals(name) ? baseline : null;
            }

            @Override
            public Collection<LoadableResource> getResources(String prefix, String[] suffixes) {
                return BASELINE_NAME.startsWith(prefix) && Arrays.stream(suffixes).anyMatch(BASELINE_NAME::endsWith)
                    ? List.of(baseline) : List.of();
            }
        });
    }

    @Bean
    FlywayMigrationStrategy initializeDatabase(@Value("${rfq.demo-data.enabled:false}") boolean demoEnabled) {
        return flyway -> {
            var dataSource = flyway.getConfiguration().getDataSource();
            var jdbc = new JdbcTemplate(dataSource);
            if (!hasTable(jdbc, flyway.getConfiguration().getTable()) && hasTable(jdbc, "rfq_demo_seed")
                    && hasTable(jdbc, "rfq_demo_document")
                    && jdbc.queryForObject("select count(*) from rfq_demo_seed where id=? and initialized_at is not null",
                        Integer.class, IMPORT_MARKER) == 1) {
                flyway.baseline();
            }
            flyway.migrate();
            if (!demoEnabled || alreadySeeded(jdbc)) return;

            jdbc.execute(sql.substring(sql.indexOf(ASSET_SCHEMA) + ASSET_SCHEMA.length(), sql.indexOf("START TRANSACTION;")));
            var seedScript = new EncodedResource(new ByteArrayResource(sql.substring(
                sql.indexOf(INSERTS) + INSERTS.length(), sql.indexOf(INSERTS_END)).getBytes(StandardCharsets.UTF_8)),
                StandardCharsets.UTF_8);
            new TransactionTemplate(new JdbcTransactionManager(dataSource)).executeWithoutResult(status -> {
                jdbc.update("insert into rfq_demo_seed (id) values (?) on duplicate key update id=id", SEED_LOCK);
                if (alreadySeeded(jdbc)) return;
                jdbc.execute((ConnectionCallback<Void>) connection -> {
                    ScriptUtils.executeSqlScript(connection, seedScript);
                    return null;
                });
            });
        };
    }

    private boolean alreadySeeded(JdbcTemplate jdbc) {
        return jdbc.queryForObject("select exists (select 1 from app_user)", Boolean.class)
            || jdbc.queryForObject("select exists (select 1 from rfq_demo_seed where id<>?)", Boolean.class, SEED_LOCK);
    }

    private boolean hasTable(JdbcTemplate jdbc, String table) {
        return jdbc.queryForObject("select exists (select 1 from information_schema.tables where table_schema=database() and table_name=?)",
            Boolean.class, table);
    }
}
