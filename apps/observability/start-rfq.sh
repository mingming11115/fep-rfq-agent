#!/usr/bin/env bash
# RFQ 启动脚本（自动查找 jar，可在任何位置直接执行）
# 用法: bash start-rfq.sh {start|stop|restart|status}
#      jar 路径可用环境变量覆盖: JAR_PATH=/xxx/yy.jar bash start-rfq.sh start
set -u

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

# ========= 配置（可用环境变量覆盖） =========
APP_NAME="rfq-api"
SERVER_PORT="${SERVER_PORT:-48084}"
SPRING_PROFILES="${SPRING_PROFILES:-prod}"
JAVA_BIN="${JAVA_BIN:-java}"
JVM_OPTS="${JVM_OPTS:--Xms512m -Xmx1024m -XX:+HeapDumpOnOutOfMemoryError}"

# 运行文件跟随脚本所在目录
LOG_DIR="${SCRIPT_DIR}/logs"
PID_FILE="${SCRIPT_DIR}/${APP_NAME}.pid"
LOG_FILE="${LOG_DIR}/${APP_NAME}.out"

# ========= 自动查找 jar =========
JAR_PATH="${JAR_PATH:-}"
if [ -z "${JAR_PATH}" ]; then
  JAR_PATH=$(find "${SCRIPT_DIR}" /opt/rfq /srv /home /root -maxdepth 4 -name "*.jar" \
    ! -name "*sources*" ! -name "*javadoc*" ! -path "*/m2/*" ! -path "*/repo/*" 2>/dev/null \
    | grep -i "rfq\|api\|app" | head -1)
  if [ -z "${JAR_PATH}" ]; then
    JAR_PATH=$(find "${SCRIPT_DIR}" /opt/rfq /srv /home /root -maxdepth 4 -name "*.jar" \
      ! -name "*sources*" ! -name "*javadoc*" ! -path "*/m2/*" ! -path "*/repo/*" 2>/dev/null | head -1)
  fi
fi

# ========= OTel 参数（agent 存在才启用） =========
OTEL_AGENT="/opt/otel/opentelemetry-javaagent.jar"
OTEL_OPTS=""
if [ -f "${OTEL_AGENT}" ]; then
  OTEL_OPTS="-javaagent:${OTEL_AGENT} -Dotel.service.name=${APP_NAME} -Dotel.exporter.otlp.endpoint=http://localhost:4318 -Dotel.traces.exporter=otlp -Dotel.metrics.exporter=none -Dotel.logs.exporter=none"
else
  echo "[warn] 未找到 ${OTEL_AGENT}，本次启动不带链路追踪"
fi

# ========= 执行逻辑 =========
get_pid() { [ -f "${PID_FILE}" ] && cat "${PID_FILE}" 2>/dev/null || echo ""; }

is_running() {
  local pid; pid=$(get_pid)
  [ -n "${pid}" ] && kill -0 "${pid}" 2>/dev/null
}

do_start() {
  if is_running; then
    echo "[skip] ${APP_NAME} 已在运行 (pid $(get_pid))"
    return 0
  fi
  if [ -z "${JAR_PATH}" ] || [ ! -f "${JAR_PATH}" ]; then
    echo "[error] 找不到 jar 包。请指定: JAR_PATH=/路径/xx.jar bash $0 start"
    echo "        已搜索: ${SCRIPT_DIR} /opt/rfq /srv /home /root"
    exit 1
  fi
  mkdir -p "${LOG_DIR}"
  echo "[start] 启动 ${APP_NAME}"
  echo "        jar:  ${JAR_PATH}"
  echo "        端口: ${SERVER_PORT}  profile: ${SPRING_PROFILES}"
  nohup "${JAVA_BIN}" ${JVM_OPTS} ${OTEL_OPTS} \
    -jar "${JAR_PATH}" \
    --server.port="${SERVER_PORT}" \
    --spring.profiles.active="${SPRING_PROFILES}" \
    >> "${LOG_FILE}" 2>&1 &
  echo $! > "${PID_FILE}"
  sleep 3
  if is_running; then
    echo "[ok] 已启动 (pid $(get_pid))"
    echo "     日志: tail -f ${LOG_FILE}"
    echo "     链路: http://<服务器IP>:16686"
  else
    echo "[fail] 启动失败: tail -100 ${LOG_FILE}"
    exit 1
  fi
}

do_stop() {
  if ! is_running; then
    echo "[skip] ${APP_NAME} 未在运行"
    rm -f "${PID_FILE}"
    return 0
  fi
  local pid; pid=$(get_pid)
  echo "[stop] 停止 ${APP_NAME} (pid ${pid})..."
  kill "${pid}"
  for _ in $(seq 1 20); do
    kill -0 "${pid}" 2>/dev/null || break
    sleep 1
  done
  kill -0 "${pid}" 2>/dev/null && { echo "[warn] 未退出，强制 kill -9"; kill -9 "${pid}"; }
  rm -f "${PID_FILE}"
  echo "[ok] 已停止"
}

do_status() {
  is_running && echo "[running] ${APP_NAME} pid $(get_pid)" || echo "[stopped] ${APP_NAME} 未运行"
  [ -n "${JAR_PATH}" ] && [ -f "${JAR_PATH}" ] && echo "[jar] ${JAR_PATH}" || echo "[jar] 未找到"
}

case "${1:-}" in
  start)   do_start ;;
  stop)    do_stop ;;
  restart) do_stop; sleep 2; do_start ;;
  status)  do_status ;;
  *) echo "用法: bash $0 {start|stop|restart|status}"; exit 1 ;;
esac
