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
 * 启动时执行 db/init.sql 末尾的 RFQ_PERMISSION_BACKFILL 段，修复确认权限断链。
 *
 * <p>为什么不只放在 init.sql 里：spring.sql.init 走的是 Spring 的脚本执行器，
 * 执行失败或被跳过时没有任何痕迹，出问题时无法判断「到底跑没跑」。
 * 这里显式执行一次并打印执行前后的断链数量，日志关键字 permission.self-heal，
 * 上线后 grep 一行即可确认是否生效。
 *
 * <p>修复内容（全部幂等，重跑无副作用）：
 * <ol>
 *   <li>有 ACTIVE 的 SR/TECH/APPROVER 角色却没有成员档案 → 补启用档案；</li>
 *   <li>项目负责人的角色被停用 → 恢复 ACTIVE；</li>
 *   <li>项目负责人的档案缺失或被停用 → 启用并给确认资格。</li>
 * </ol>
 * 只修已有角色的账号和项目负责人，不凭空创建角色，不影响 BU 权限边界。
 */
@Component
@Order(0)
@Slf4j
class PermissionSelfHeal implements ApplicationRunner {
    private static final String MARKER = "-- RFQ_PERMISSION_BACKFILL";
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

    private final DataSource dataSource;
    private final JdbcTemplate jdbc;
    private final String script;

    PermissionSelfHeal(DataSource dataSource) throws IOException {
        this.dataSource = dataSource;
        this.jdbc = new JdbcTemplate(dataSource);
        this.script = loadBackfillScript();
    }

    @Override
    public void run(ApplicationArguments args) {
        try {
            long missingBefore = count(MISSING_PROFILE_SQL);
            long disabledBefore = count(DISABLED_PROFILE_SQL);
            execute();
            long missingAfter = count(MISSING_PROFILE_SQL);
            long disabledAfter = count(DISABLED_PROFILE_SQL);
            log.info("permission.self-heal 完成：缺档案 {} → {} 条，档案被停用 {} → {} 条（停用属人工操作，不自动恢复）",
                    missingBefore, missingAfter, disabledBefore, disabledAfter);
        } catch (Exception error) {
            log.warn("permission.self-heal 执行失败（不影响启动）：{}", error.getMessage(), error);
        }
    }

    private String loadBackfillScript() throws IOException {
        String sql = new ClassPathResource("db/init.sql").getContentAsString(StandardCharsets.UTF_8);
        int index = sql.indexOf(MARKER);
        if (index < 0) {
            log.warn("init.sql 中未找到 {} 标记，权限自愈跳过", MARKER);
            return "";
        }
        return sql.substring(index);
    }

    private void execute() {
        if (script.isBlank()) {
            return;
        }
        var connection = DataSourceUtils.getConnection(dataSource);
        try {
            var resource = new EncodedResource(
                    new ByteArrayResource(script.getBytes(StandardCharsets.UTF_8)), StandardCharsets.UTF_8);
            // continueOnError=true：单条失败不影响后续语句，残留断链数会在日志里暴露
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
}
