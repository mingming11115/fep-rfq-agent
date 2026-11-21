package com.naura.rfq.config;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import javax.sql.DataSource;
import lombok.extern.slf4j.Slf4j;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.core.annotation.Order;
import org.springframework.core.io.ByteArrayResource;
import org.springframework.core.io.ClassPathResource;
import org.springframework.core.io.support.EncodedResource;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DataSourceUtils;
import org.springframework.jdbc.datasource.init.ScriptUtils;
import org.springframework.stereotype.Component;

/**
 * 启动时显式执行 init.sql 里的两段数据脚本，并打印执行结果。
 *
 * <p>为什么不能只依赖 spring.sql.init：它是隐式执行，被跳过或某条失败时不留痕迹，
 * 出问题时无法判断「到底跑没跑」。这里显式执行两次，日志关键字 permission.self-heal，
 * 一行日志就能确认结果。
 *
 * <p>执行内容（全部幂等，重跑无副作用，不存在的行才插入）：
 * <ol>
 *   <li>RFQ_DEMO_INSERTS：演示账号（mysql_sr 等）、BU、角色、成员资格档案；</li>
 *   <li>RFQ_PERMISSION_BACKFILL：缺档案的存量账号补档案、项目负责人角色与档案修复。</li>
 * </ol>
 * 只插不改：已有账号的角色和档案不会被覆盖，BU 权限边界保持不变。
 */
@Component
@Order(0)
@Slf4j
class PermissionSelfHeal implements ApplicationRunner {
    private static final String SEED_START = "-- RFQ_DEMO_INSERTS";
    private static final String SEED_END = "-- RFQ_DEMO_INSERTS_END";
    private static final String BACKFILL_START = "-- RFQ_PERMISSION_BACKFILL";
    private static final String MISSING_PROFILE_SQL = """
            select count(*) from user_bu_role role
            left join bu_member_profile profile
                on profile.user_id = role.user_id and profile.bu_id = role.bu_id
            where role.status = 'ACTIVE'
              and role.role in ('SR', 'TECH', 'APPROVER')
              and profile.user_id is null
            """;
    private static final String DISABLED_PROFILE_SQL = """
            select count(*) from user_bu_role role
            join bu_member_profile profile
                on profile.user_id = role.user_id and profile.bu_id = role.bu_id
            where role.status = 'ACTIVE'
              and role.role in ('SR', 'TECH', 'APPROVER')
              and profile.enabled = 0
            """;
    private static final String DEMO_ACCOUNT_SQL = """
            select concat(
                (select count(*) from app_user where username = 'mysql_sr'), '/',
                (select count(*) from user_bu_role role join app_user user on user.id = role.user_id
                  where user.username = 'mysql_sr' and role.role = 'SR' and role.status = 'ACTIVE'), '/',
                (select count(*) from bu_member_profile profile join app_user user on user.id = profile.user_id
                  where user.username = 'mysql_sr' and profile.enabled = 1))
            """;

    private final DataSource dataSource;
    private final JdbcTemplate jdbc;
    private final String seedScript;
    private final String backfillScript;

    PermissionSelfHeal(DataSource dataSource) throws IOException {
        this.dataSource = dataSource;
        this.jdbc = new JdbcTemplate(dataSource);
        String sql = new ClassPathResource("db/init.sql").getContentAsString(StandardCharsets.UTF_8);
        this.seedScript = section(sql, SEED_START, SEED_END);
        this.backfillScript = tail(sql, BACKFILL_START);
    }

    @Override
    public void run(ApplicationArguments args) {
        try {
            execute(seedScript);
            long missingBefore = count(MISSING_PROFILE_SQL);
            long disabledBefore = count(DISABLED_PROFILE_SQL);
            execute(backfillScript);
            long missingAfter = count(MISSING_PROFILE_SQL);
            long disabledAfter = count(DISABLED_PROFILE_SQL);
            log.info("permission.self-heal 完成：演示账号 账号/角色/档案={}；缺档案 {} → {} 条，档案停用 {} → {} 条",
                    demoAccount(), missingBefore, missingAfter, disabledBefore, disabledAfter);
        } catch (Exception error) {
            log.warn("permission.self-heal 执行失败（不影响启动）：{}", error.getMessage(), error);
        }
    }

    private String section(String sql, String start, String end) {
        int from = sql.indexOf(start);
        int to = sql.indexOf(end);
        if (from < 0 || to < 0) {
            log.warn("init.sql 中未找到 {} ~ {} 标记，该段跳过", start, end);
            return "";
        }
        return sql.substring(from + start.length(), to);
    }

    private String tail(String sql, String start) {
        int from = sql.indexOf(start);
        if (from < 0) {
            log.warn("init.sql 中未找到 {} 标记，该段跳过", start);
            return "";
        }
        return sql.substring(from);
    }

    private void execute(String script) {
        if (script == null || script.isBlank()) {
            return;
        }
        var connection = DataSourceUtils.getConnection(dataSource);
        try {
            var resource = new EncodedResource(
                    new ByteArrayResource(script.getBytes(StandardCharsets.UTF_8)), StandardCharsets.UTF_8);
            // continueOnError=true：单条失败不影响后续语句，失败会打 warn 并体现在断链计数上
            ScriptUtils.executeSqlScript(connection, resource, true, false,
                    new String[] {ScriptUtils.DEFAULT_COMMENT_PREFIX}, ScriptUtils.DEFAULT_STATEMENT_SEPARATOR,
                    ScriptUtils.DEFAULT_BLOCK_COMMENT_START_DELIMITER,
                    ScriptUtils.DEFAULT_BLOCK_COMMENT_END_DELIMITER);
        } finally {
            DataSourceUtils.releaseConnection(connection, dataSource);
        }
    }

    private long count(String sql) {
        Long count = jdbc.queryForObject(sql, Long.class);
        return count == null ? 0L : count;
    }

    private String demoAccount() {
        return jdbc.queryForObject(DEMO_ACCOUNT_SQL, String.class);
    }
}
