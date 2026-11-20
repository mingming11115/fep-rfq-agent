#!/usr/bin/env bash
# Flyway 启动失败诊断（只读，不改库、不改配置）
# 用法: bash apps/observability/fw.sh
set -u

C=rfq-service

echo "############ 1. 容器状态 ############"
docker ps -a --filter "name=$C" --format '{{.Names}} | {{.Status}}' 2>/dev/null || echo "  容器不存在"
echo "  重启次数: $(docker inspect "$C" --format '{{.RestartCount}}' 2>/dev/null || echo '-')"
echo "  上次退出码: $(docker inspect "$C" --format '{{.State.ExitCode}}' 2>/dev/null || echo '-')"

echo
echo "############ 2. Spring Boot 启动失败报告（最有用）############"
docker logs "$C" 2>&1 | grep -a -A 22 "APPLICATION FAILED TO START" | tail -30
echo "  --- 若上面为空，说明还没走到失败分析器 ---"

echo
echo "############ 3. Flyway 自己的日志（最后 25 行）############"
docker logs "$C" 2>&1 | grep -ai "flyway" | tail -25

echo
echo "############ 4. 真正的异常链 / SQL 错误 ############"
docker logs "$C" 2>&1 \
  | grep -aE "Caused by:|SQL State|Error Code|Message *:|Migration .*(failed|checksum)|checksum mismatch|already exists|Unknown database|Access denied|Table .* doesn't exist|Syntax error" \
  | tail -25

echo
echo "############ 5. 容器里连的库和账号 ############"
envs=$(docker inspect "$C" --format '{{range .Config.Env}}{{println .}}{{end}}' 2>/dev/null || true)
echo "$envs" | grep -E '^RFQ_DB_(URL|USER)' | sed 's/^/  /' || echo "  没有 RFQ_DB_* 变量（用镜像内置值）"

DBU=$(echo "$envs" | sed -n 's/^RFQ_DB_USER=//p' | head -1)
DBP=$(echo "$envs" | sed -n 's/^RFQ_DB_PASSWORD=//p' | head -1)
if [ -z "${DBU:-}" ] && [ -f /opt/rfq/db.env ]; then
  . /opt/rfq/db.env
  DBU="${RFQ_DB_USER:-}"
  DBP="${RFQ_DB_PASSWORD:-}"
fi

echo
echo "############ 6. 库里的 flyway 历史表 ############"
MYSQL_BIN="$(command -v mysql || true)"
if [ -n "$MYSQL_BIN" ] && [ -n "${DBU:-}" ]; then
  "$MYSQL_BIN" -h127.0.0.1 -u"$DBU" -p"$DBP" rfq 2>&1 \
    -e "select count(*) as total_tables from information_schema.tables where table_schema='rfq';
        select installed_rank,version,description,type,success from flyway_schema_history order by installed_rank;" \
    | tail -45
else
  echo "  跳过（没有 mysql 客户端，或拿不到账号密码）"
fi

echo
echo "############ 7. 常见原因的对应特征 ############"
echo " A. checksum mismatch for migration version N"
echo "    -> 库里有历史表，但 init.sql 里 V11~V28 的文本改过。修: 关掉校验或 repair"
echo " B. Table 'xxx' already exists"
echo "    -> baseline 版本探测错了，迁移又去建表。修: 补 baseline 记录到正确版本"
echo " C. Unknown database 'rfq' / Access denied"
echo "    -> 还是连接/账号问题，不是 Flyway 本身"
echo " D. total_tables 很大但第 6 步查历史表报 doesn't exist"
echo "    -> 库是手工初始化过的（旧 demo 库），Flyway 需要 baseline"
