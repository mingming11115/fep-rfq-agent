#!/usr/bin/env bash
# RFQ 启动脚本（堡垒机/服务器直用版，自包含无外部依赖）
# 用法: bash start.sh {start|stop|restart|status}
#      jar 路径可用环境变量覆盖: JAR_PATH=/路径/xx.jar bash start.sh start
#      端口/profile: SERVER_PORT=48084 SPRING_PROFILES=prod bash start.sh start
set -u
APP_NAME="rfq-api"
BASE="$(cd "$(dirname "$0")" && pwd)"
PORT="${SERVER_PORT:-48084}"
PROFILE="${SPRING_PROFILES:-prod}"
LOG_FILE="${BASE}/${APP_NAME}.log"
PID_FILE="${BASE}/${APP_NAME}.pid"
AGENT="/opt/otel/opentelemetry-javaagent.jar"

# 自动查找 jar（优先脚本目录与 /opt/rfq）
JAR_PATH="${JAR_PATH:-}"
[ -z "${JAR_PATH}" ] && JAR_PATH=$(find "${BASE}" /opt/rfq /srv /home /root /data -maxdepth 4 -name "*.jar" ! -name "*sources*" ! -name "*javadoc*" 2>/dev/null | head -1)

# OTel 链路追踪（agent 存在才启用）
OTEL=""
[ -f "${AGENT}" ] && OTEL="-javaagent:${AGENT} -Dotel.service.name=${APP_NAME} -Dotel.exporter.otlp.endpoint=http://localhost:4318 -Dotel.traces.exporter=otlp -Dotel.metrics.exporter=none -Dotel.logs.exporter=none"

is_run() { [ -f "${PID_FILE}" ] && kill -0 "$(cat ${PID_FILE})" 2>/dev/null; }

case "${1:-start}" in
start)
  if is_run; then echo "已在运行 pid=$(cat ${PID_FILE})"; exit 0; fi
  [ -z "${JAR_PATH}" ] && { echo "找不到jar, 传上来后: JAR_PATH=/路径/xx.jar bash $0 start"; exit 1; }
  echo "启动 ${JAR_PATH} 端口${PORT} ${OTEL:+(含链路追踪)}"
  nohup java -Xms512m -Xmx1024m ${OTEL} -jar "${JAR_PATH}" --server.port=${PORT} --spring.profiles.active=${PROFILE} >> "${LOG_FILE}" 2>&1 &
  echo $! > "${PID_FILE}"; sleep 3
  is_run && echo "OK pid=$(cat ${PID_FILE}) 日志: tail -f ${LOG_FILE}" || { echo "启动失败: tail -50 ${LOG_FILE}"; exit 1; }
  ;;
stop)
  if is_run; then kill "$(cat ${PID_FILE})"; rm -f "${PID_FILE}"; echo "已停止"; else echo "未在运行"; fi
  ;;
restart) $0 stop; sleep 2; $0 start ;;
status)
  is_run && echo "[running] pid=$(cat ${PID_FILE}) jar=${JAR_PATH:-?}" || echo "[stopped]"
  ;;
*) echo "用法: bash $0 {start|stop|restart|status}"; exit 1 ;;
esac
