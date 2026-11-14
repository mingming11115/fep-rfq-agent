package com.naura.rfq.config;

import com.naura.rfq.mapper.DatabaseBootstrapMapper;
import java.io.IOException;
import java.io.StringReader;
import java.nio.charset.StandardCharsets;
import java.util.Arrays;
import java.util.Collection;
import java.util.List;
import javax.sql.DataSource;
import lombok.extern.slf4j.Slf4j;
import org.flywaydb.core.Flyway;
import org.flywaydb.core.api.ResourceProvider;
import org.flywaydb.core.api.resource.LoadableResource;
import org.mybatis.spring.SqlSessionFactoryBean;
import org.mybatis.spring.SqlSessionTemplate;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.autoconfigure.flyway.FlywayConfigurationCustomizer;
import org.springframework.boot.autoconfigure.flyway.FlywayMigrationStrategy;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.core.io.ByteArrayResource;
import org.springframework.core.io.ClassPathResource;
import org.springframework.core.io.support.EncodedResource;
import org.springframework.jdbc.datasource.DataSourceUtils;
import org.springframework.jdbc.datasource.init.ScriptUtils;
import org.springframework.jdbc.support.JdbcTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

@Configuration(proxyBeanMethods = false)
@Slf4j
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
    private static final String V19_START = "-- RFQ_MIGRATION_V19\n";
    private static final String V19_END = "-- RFQ_MIGRATION_V19_END";
    private static final String V20_START = "-- RFQ_MIGRATION_V20\n";
    private static final String V20_END = "-- RFQ_MIGRATION_V20_END";
    private static final String V21_START = "-- RFQ_MIGRATION_V21\n";
    private static final String V21_END = "-- RFQ_MIGRATION_V21_END";
    private static final String V22_START = "-- RFQ_MIGRATION_V22\n";
    private static final String V22_END = "-- RFQ_MIGRATION_V22_END";
    private static final String V23_START = "-- RFQ_MIGRATION_V23\n";
    private static final String V23_END = "-- RFQ_MIGRATION_V23_END";
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
        var requirementFields = resource("V19__remove_unused_requirement_fields.sql",
                sql.substring(sql.indexOf(V19_START) + V19_START.length(), sql.indexOf(V19_END)),
                "classpath:db/init.sql#V19");
        var responseRemark = resource("V20__rename_response_remark.sql",
                sql.substring(sql.indexOf(V20_START) + V20_START.length(), sql.indexOf(V20_END)),
                "classpath:db/init.sql#V20");
        var historyParse = resource("V21__history_parse_queue.sql",
                sql.substring(sql.indexOf(V21_START) + V21_START.length(), sql.indexOf(V21_END)),
                "classpath:db/init.sql#V21");
        var sourceRefs = resource("V22__word_requirement_sources.sql",
                sql.substring(sql.indexOf(V22_START) + V22_START.length(), sql.indexOf(V22_END)),
                "classpath:db/init.sql#V22");
        var capabilityIndex = resource("V23__capability_index_sync.sql",
                sql.substring(sql.indexOf(V23_START) + V23_START.length(), sql.indexOf(V23_END)),
                "classpath:db/init.sql#V23");
        var resources = List.of(baseline, standardReplies, history, capability, match, workflow,
                replacements, projectGroups, historyRecall, requirementFields, responseRemark, historyParse, sourceRefs, capabilityIndex);
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
            var bootstrap = bootstrapMapper(dataSource);
            if (!bootstrap.hasTable(flyway.getConfiguration().getTable()) && bootstrap.hasTable("rfq_demo_seed")
                    && bootstrap.hasTable("rfq_demo_document") && bootstrap.hasCompletedSeed(IMPORT_MARKER)) {
                if (bootstrap.hasTable("standard-reply-record") && bootstrap.hasTable("history-rfq-record")
                        && bootstrap.hasTable("standard_reply_index_sync")) {
                    String version = bootstrap.hasColumn("customer_document", "history_document_ids")
                            ? (bootstrap.hasColumn("requirement", "sort_order") ? "18"
                                : bootstrap.hasColumn("requirement", "source_refs_json") ? "22"
                                : bootstrap.hasColumn("history_document", "parse_due_at") ? "21" : "19")
                            : bootstrap.hasColumn("project", "group_id") ? "17"
                            : bootstrap.hasTable("rfq_document_replacement") ? "16"
                            : bootstrap.hasTable("project_work_version") ? "15"
                            : bootstrap.hasTable("requirement_match_result") ? "14"
                            : bootstrap.hasColumn("capability_record", "source_fingerprint") ? "13"
                            : bootstrap.hasTable("history_rfq_index_sync") ? "12" : "11";
                    if ("22".equals(version) && bootstrap.hasTable("capability_index_sync")) {
                        version = "23";
                    }
                    Flyway.configure().configuration(flyway.getConfiguration()).baselineVersion(version).load().baseline();
                } else {
                    flyway.baseline();
                }
            }
            flyway.migrate();
            if (!demoEnabled || alreadySeeded(bootstrap)) {
                return;
            }

            executeScript(dataSource, sql.substring(
                    sql.indexOf(ASSET_SCHEMA) + ASSET_SCHEMA.length(), sql.indexOf("START TRANSACTION;")));
            String seedScript = sql.substring(sql.indexOf(INSERTS) + INSERTS.length(), sql.indexOf(INSERTS_END));
            new TransactionTemplate(new JdbcTransactionManager(dataSource)).executeWithoutResult(status -> {
                bootstrap.lockSeed(SEED_LOCK);
                if (!alreadySeeded(bootstrap)) {
                    executeScript(dataSource, seedScript);
                }
            });
        };
    }

    private DatabaseBootstrapMapper bootstrapMapper(DataSource dataSource) {
        var factory = new SqlSessionFactoryBean();
        factory.setDataSource(dataSource);
        factory.setMapperLocations(new ClassPathResource("db/DatabaseBootstrapMapper.xml"));
        try {
            return new SqlSessionTemplate(factory.getObject()).getMapper(DatabaseBootstrapMapper.class);
        } catch (Exception error) {
            log.error("初始化数据库迁移 Mapper 失败", error);
            throw new IllegalStateException("无法初始化数据库迁移 Mapper", error);
        }
    }

    private boolean alreadySeeded(DatabaseBootstrapMapper bootstrap) {
        return bootstrap.hasUsers() || bootstrap.hasSeedOtherThan(SEED_LOCK);
    }

    private void executeScript(DataSource dataSource, String script) {
        var resource = new EncodedResource(new ByteArrayResource(script.getBytes(StandardCharsets.UTF_8)),
                StandardCharsets.UTF_8);
        var connection = DataSourceUtils.getConnection(dataSource);
        try {
            ScriptUtils.executeSqlScript(connection, resource);
        } finally {
            DataSourceUtils.releaseConnection(connection, dataSource);
        }
    }
}
