#!/usr/bin/env bash
# RFQ 单体服务启动脚本（含 OTel 链路追踪）
# 用法: ./start-rfq.sh {start|stop|restart|status}
# 部署位置建议: /opt/rfq/start-rfq.sh
set -u

# ========= 可按需修改的配置（放最前面） =========
APP_NAME="rfq-api"
APP_DIR="/opt/rfq"                          # 应用目录
JAR_PATH="${APP_DIR}/rfq-api.jar"           # jar 包位置
LOG_DIR="${APP_DIR}/logs"
PID_FILE="${APP_DIR}/${APP_NAME}.pid"
LOG_FILE="${LOG_DIR}/${APP_NAME}.out"

JAVA_BIN="java"                             # 若用指定 JDK: /usr/lib/jvm/jdk-17/bin/java
SERVER_PORT=48084                           # 服务端口
SPRING_PROFILES="prod"                      # Spring profile
JVM_OPTS="-Xms512m -Xmx1024m -XX:+HeapDumpOnOutOfMemoryError -XX:HeapDumpPath=${APP_DIR}/logs/"

# OTel 链路追踪参数（Jaeger 已装在 /opt/otel，见 install-otel-jaeger.sh）
OTEL_AGENT="/opt/otel/opentelemetry-javaagent.jar"
OTEL_OPTS=""
if [ -f "${OTEL_AGENT}" ]; then
  OTEL_OPTS="-javaagent:${OTEL_AGENT}
    -Dotel.service.name=${APP_NAME}
    -Dotel.exporter.otlp.endpoint=http://localhost:4318
    -Dotel.traces.exporter=otlp
    -Dotel.metrics.exporter=none
    -Dotel.logs.exporter=none"
  OTEL_OPTS=$(echo "${OTEL_OPTS}" | tr '\n' ' ' | tr -s ' ')
else
  echo "[warn] 未找到 ${OTEL_AGENT}，本次启动不带链路追踪"
fi

# ========= 以下为执行逻辑 =========
mkdir -p "${LOG_DIR}"

get_pid() {
  [ -f "${PID_FILE}" ] && cat "${PID_FILE}" 2>/dev/null || echo ""
}

is_running() {
  local pid; pid=$(get_pid)
  [ -n "${pid}" ] && kill -0 "${pid}" 2>/dev/null
}

do_start() {
  if is_running; then
    echo "[skip] ${APP_NAME} 已在运行 (pid $(get_pid))"
    return 0
  fi
  if [ ! -f "${JAR_PATH}" ]; then
    echo "[error] 找不到 ${JAR_PATH}"
    exit 1
  fi
  echo "[start] 启动 ${APP_NAME} (port ${SERVER_PORT})..."
  nohup "${JAVA_BIN}" ${JVM_OPTS} ${OTEL_OPTS} \
    -jar "${JAR_PATH}" \
    --server.port="${SERVER_PORT}" \
    --spring.profiles.active="${SPRING_PROFILES}" \
    >> "${LOG_FILE}" 2>&1 &
  echo $! > "${PID_FILE}"
  sleep 3
  if is_running; then
    echo "[ok] ${APP_NAME} 已启动 (pid $(get_pid))"
    echo "       日志: tail -f ${LOG_FILE}"
    echo "       链路: http://<服务器IP>:16686"
  else
    echo "[fail] 启动失败，查看日志: tail -100 ${LOG_FILE}"
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
  for i in $(seq 1 20); do
    kill -0 "${pid}" 2>/dev/null || break
    sleep 1
  done
  if kill -0 "${pid}" 2>/dev/null; then
    echo "[warn] 20 秒未退出，强制 kill -9"
    kill -9 "${pid}"
  fi
  rm -f "${PID_FILE}"
  echo "[ok] 已停止"
}

do_status() {
  if is_running; then
    echo "[running] ${APP_NAME} pid $(get_pid)"
  else
    echo "[stopped] ${APP_NAME} 未运行"
  fi
}

case "${1:-}" in
  start)   do_start ;;
  stop)    do_stop ;;
  restart) do_stop; sleep 2; do_start ;;
  status)  do_status ;;
  *) echo "用法: $0 {start|stop|restart|status}"; exit 1 ;;
esac
