#!/usr/bin/env bash
# RFQ Docker 一键管理脚本（不依赖 docker compose / plugin）
# 用法: bash docker-rfq.sh {build|start|stop|restart|status|logs}
# 可选环境变量:
#   RFQ_DB_URL / RFQ_DB_USER / RFQ_DB_PASSWORD   覆盖数据库配置
#   OTEL_AGENT   javaagent jar 路径（默认 /opt/otel/opentelemetry-javaagent.jar）
#   HOST_PORT    对外端口（默认 48081，仅绑定 127.0.0.1）
set -u

IMAGE="rfq-service:onlyoffice"
JAEGER_IMAGE="jaegertracing/all-in-one:1.62"
NET="rfq-net"
HOST_PORT="${HOST_PORT:-48081}"
OTEL_AGENT="${OTEL_AGENT:-/opt/otel/opentelemetry-javaagent.jar}"
API_DIR="$(cd "$(dirname "$0")/../api" 2>/dev/null && pwd)"

docker() { command docker "$@"; }

run_or_fail() { "$@" || { echo "[fail] $* 执行失败"; exit 1; }; }

net_ok() {
  docker network inspect "$NET" >/dev/null 2>&1 || docker network create "$NET" >/dev/null
}

rm_if_exists() {
  if docker ps -a --format '{{.Names}}' | grep -qx "$1"; then
    docker rm -f "$1" >/dev/null && echo "[info] 已移除旧容器 $1"
  fi
}

do_jaeger() {
  if docker ps --format '{{.Names}}' | grep -qx jaeger; then
    echo "[info] jaeger 已在运行"; return
  fi
  rm_if_exists jaeger
  run_or_fail docker run -d --name jaeger --restart unless-stopped \
    --network "$NET" \
    -p 16686:16686 -p 4318:4318 -p 4317:4317 \
    -e MEMORY_MAX_TRACES=50000 \
    "$JAEGER_IMAGE"
  echo "[ok] jaeger 已启动 UI:http://<本机IP>:16686"
}

build_args() {
  # 数据库等环境变量（默认值已内置 application-prod.yml，仅覆盖时传入）
  [ -n "${RFQ_DB_URL:-}" ]      && printf ' -e RFQ_DB_URL=%s' "$RFQ_DB_URL"
  [ -n "${RFQ_DB_USER:-}" ]     && printf ' -e RFQ_DB_USER=%s' "$RFQ_DB_USER"
  [ -n "${RFQ_DB_PASSWORD:-}" ] && printf ' -e RFQ_DB_PASSWORD=%s' "$RFQ_DB_PASSWORD"
}

do_build() {
  [ -d "$API_DIR" ] || { echo "[fail] 未找到 apps/api 目录: $API_DIR"; exit 1; }
  echo "[build] 开始构建镜像（首次约 5~15 分钟）..."
  run_or_fail env DOCKER_BUILDKIT=1 docker build -t "$IMAGE" "$API_DIR"
  echo "[ok] 镜像构建完成: $IMAGE"
}

do_start() {
  net_ok
  do_jaeger
  rm_if_exists rfq-service

  local -a args=(--network "$NET"
    -p "127.0.0.1:${HOST_PORT}:48081"
    --add-host=host.docker.internal:host-gateway
    -v rfq-office-documents:/app/data)

  if [ -f "$OTEL_AGENT" ]; then
    args+=(-v "${OTEL_AGENT}:/otel/agent.jar:ro"
      -e "JAVA_TOOL_OPTIONS=-javaagent:/otel/agent.jar -Dotel.service.name=rfq-api -Dotel.exporter.otlp.endpoint=http://jaeger:4318 -Dotel.traces.exporter=otlp -Dotel.metrics.exporter=none -Dotel.logs.exporter=none")
    echo "[info] 链路追踪已启用 (agent: $OTEL_AGENT)"
  else
    echo "[warn] 未找到 javaagent($OTEL_AGENT)，本次启动不带链路追踪"
  fi

  [ -n "${RFQ_DB_URL:-}" ]      && args+=(-e "RFQ_DB_URL=$RFQ_DB_URL")
  [ -n "${RFQ_DB_USER:-}" ]     && args+=(-e "RFQ_DB_USER=$RFQ_DB_USER")
  [ -n "${RFQ_DB_PASSWORD:-}" ] && args+=(-e "RFQ_DB_PASSWORD=$RFQ_DB_PASSWORD")

  echo "[info] 启动 rfq-service 端口 $HOST_PORT ..."
  run_or_fail docker run -d --name rfq-service --restart unless-stopped "${args[@]}" "$IMAGE"

  sleep 3
  if docker ps --format '{{.Names}}' | grep -qx rfq-service; then
    echo "[ok] rfq-service 已启动"
    echo "     日志: bash $0 logs"
    echo "     验证: curl http://127.0.0.1:${HOST_PORT}/actuator/health"
  else
    echo "[fail] 启动失败，最后日志:"
    docker logs --tail 30 rfq-service 2>&1 || true
    exit 1
  fi
}

case "${1:-start}" in
  build)   do_build ;;
  start)   do_start ;;
  stop)    docker rm -f rfq-service jaeger 2>/dev/null; echo "[ok] 已停止" ;;
  restart) "$0" stop; "$0" start ;;
  status)
    docker ps -a --format 'table {{.Names}}\t{{.Status}}\t{{.Ports}}' | grep -E 'rfq-service|jaeger' || echo "[info] 无相关容器"
    curl -s -m 3 "http://127.0.0.1:${HOST_PORT}/actuator/health" >/dev/null 2>&1 \
      && echo "[ok] 应用健康检查通过" || echo "[warn] 应用健康检查未通过（可能还在启动）"
    ;;
  logs)    docker logs -f --tail 100 rfq-service ;;
  *) echo "用法: bash $0 {build|start|stop|restart|status|logs}"; exit 1 ;;
esac
