package com.naura.rfq.config;

import java.io.IOException;
import java.io.StringReader;
import java.nio.charset.StandardCharsets;
import java.util.Arrays;
import java.util.Collection;
import java.util.List;
import org.flywaydb.core.Flyway;
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
    private static final String V11_NAME = "V11__standard_reply_records.sql";
    private static final String V11_START = "-- RFQ_MIGRATION_V11\n";
    private static final String V11_END = "-- RFQ_MIGRATION_V11_END";
    private static final String V12_START = "-- RFQ_MIGRATION_V12\n";
    private static final String V12_END = "-- RFQ_MIGRATION_V12_END";
    private static final String V13_START = "-- RFQ_MIGRATION_V13\n";
    private static final String V13_END = "-- RFQ_MIGRATION_V13_END";
    private static final String V14_START = "-- RFQ_MIGRATION_V14\n";
    private static final String V14_END = "-- RFQ_MIGRATION_V14_END";
    private static final String V15_START = "-- RFQ_MIGRATION_V15\n";
    private static final String V15_END = "-- RFQ_MIGRATION_V15_END";
    private static final String V16_START = "-- RFQ_MIGRATION_V16\n";
    private static final String V16_END = "-- RFQ_MIGRATION_V16_END";
    private static final String V17_START = "-- RFQ_MIGRATION_V17\n";
    private static final String V17_END = "-- RFQ_MIGRATION_V17_END";
    private static final String V18_START = "-- RFQ_MIGRATION_V18\n";
    private static final String V18_END = "-- RFQ_MIGRATION_V18_END";
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
        int migration = sql.indexOf(V11_START);
        var baseline = resource(BASELINE_NAME, sql.substring(0, migration), "classpath:db/init.sql");
        var standardReplies = resource(V11_NAME, sql.substring(migration + V11_START.length(), sql.indexOf(V11_END)),
                "classpath:db/init.sql#V11");
        var history = resource("V12__history_rfq_publication.sql",
                sql.substring(sql.indexOf(V12_START) + V12_START.length(), sql.indexOf(V12_END)),
                "classpath:db/init.sql#V12");
        var capability = resource("V13__capability_library.sql",
                sql.substring(sql.indexOf(V13_START) + V13_START.length(), sql.indexOf(V13_END)),
                "classpath:db/init.sql#V13");
        var match = resource("V14__requirement_match.sql",
                sql.substring(sql.indexOf(V14_START) + V14_START.length(), sql.indexOf(V14_END)),
                "classpath:db/init.sql#V14");
        var workflow = resource("V15__project_work_version.sql",
                sql.substring(sql.indexOf(V15_START) + V15_START.length(), sql.indexOf(V15_END)),
                "classpath:db/init.sql#V15");
        var replacements = resource("V16__rfq_document_replacement.sql",
                sql.substring(sql.indexOf(V16_START) + V16_START.length(), sql.indexOf(V16_END)),
                "classpath:db/init.sql#V16");
        var projectGroups = resource("V17__project_group_binding.sql",
                sql.substring(sql.indexOf(V17_START) + V17_START.length(), sql.indexOf(V17_END)),
                "classpath:db/init.sql#V17");
        var historyRecall = resource("V18__document_history_recall.sql",
                sql.substring(sql.indexOf(V18_START) + V18_START.length(), sql.indexOf(V18_END)),
                "classpath:db/init.sql#V18");
        var resources = List.of(baseline, standardReplies, history, capability, match, workflow, replacements, projectGroups, historyRecall);
        return configuration -> configuration.baselineVersion("10").resourceProvider(new ResourceProvider() {
            @Override
            public LoadableResource getResource(String name) {
                return resources.stream().filter(resource -> resource.getFilename().equals(name)).findFirst().orElse(null);
            }

            @Override
            public Collection<LoadableResource> getResources(String prefix, String[] suffixes) {
                return resources.stream().filter(resource -> resource.getFilename().startsWith(prefix)
                        && Arrays.stream(suffixes).anyMatch(resource.getFilename()::endsWith)).toList();
            }
        });
    }

    private LoadableResource resource(String filename, String source, String path) {
        return new LoadableResource() {
            @Override public StringReader read() { return new StringReader(source); }
            @Override public String getFilename() { return filename; }
            @Override public String getRelativePath() { return filename; }
            @Override public String getAbsolutePath() { return path; }
            @Override public String getAbsolutePathOnDisk() { return path; }
        };
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
                if (hasTable(jdbc, "standard-reply-record") && hasTable(jdbc, "history-rfq-record")
                        && hasTable(jdbc, "standard_reply_index_sync")) {
                    String version = hasColumn(jdbc, "customer_document", "history_document_ids") ? "18"
                            : hasColumn(jdbc, "project", "group_id") ? "17"
                            : hasTable(jdbc, "rfq_document_replacement") ? "16"
                            : hasTable(jdbc, "project_work_version") ? "15"
                            : hasTable(jdbc, "requirement_match_result") ? "14"
                            : hasColumn(jdbc, "capability_record", "source_fingerprint") ? "13"
                            : hasTable(jdbc, "history_rfq_index_sync") ? "12" : "11";
                    Flyway.configure().configuration(flyway.getConfiguration()).baselineVersion(version).load().baseline();
                } else {
                    flyway.baseline();
                }
            }
            flyway.migrate();
            if (!demoEnabled || alreadySeeded(jdbc)) {
                return;
            }

            jdbc.execute(sql.substring(sql.indexOf(ASSET_SCHEMA) + ASSET_SCHEMA.length(), sql.indexOf("START TRANSACTION;")));
            var seedScript = new EncodedResource(new ByteArrayResource(sql.substring(
                sql.indexOf(INSERTS) + INSERTS.length(), sql.indexOf(INSERTS_END)).getBytes(StandardCharsets.UTF_8)),
                StandardCharsets.UTF_8);
            new TransactionTemplate(new JdbcTransactionManager(dataSource)).executeWithoutResult(status -> {
                jdbc.update("insert into rfq_demo_seed (id) values (?) on duplicate key update id=id", SEED_LOCK);
                if (alreadySeeded(jdbc)) {
                    return;
                }
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

    private boolean hasColumn(JdbcTemplate jdbc, String table, String column) {
        return jdbc.queryForObject("""
            select exists (select 1 from information_schema.columns
                           where table_schema=database() and table_name=? and column_name=?)
            """, Boolean.class, table, column);
    }
}
