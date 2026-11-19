#!/usr/bin/env bash
# RFQ Docker 一键管理脚本（不依赖 docker compose / plugin）
# 用法: bash docker-rfq.sh {pull|build|start|stop|restart|status|logs}
# 可选环境变量:
#   RFQ_DB_URL / RFQ_DB_USER / RFQ_DB_PASSWORD   覆盖数据库配置
#   OTEL_AGENT   javaagent jar 路径（默认 /opt/otel/opentelemetry-javaagent.jar）
#   HOST_PORT    对外端口（默认 48081，仅绑定 127.0.0.1）
#   JAEGER_IMAGE jaeger 镜像名（默认 jaegertracing/all-in-one:1.62）
#   SKIP_JAEGER=1 只起 rfq-service，不拉/不起 jaeger
set -u

IMAGE="rfq-service:onlyoffice"
JAEGER_IMAGE="${JAEGER_IMAGE:-jaegertracing/all-in-one:1.62}"
# Docker Hub 直连不通时依次尝试的加速源（自动加前缀）
JAEGER_MIRRORS="${JAEGER_MIRRORS:-docker.1ms.run docker.m.daocloud.io docker.xuanyuan.me hub.rat.dev}"
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

image_ok() { docker image inspect "$1" >/dev/null 2>&1; }

# 拉镜像：先直连，失败依次换加速源，成功后统一打回原名字
ensure_image() {
  local img="$1"
  if image_ok "$img"; then
    echo "[info] 本地已有镜像 $img"
    return 0
  fi

  echo "[info] 本地无镜像 $img，尝试直连拉取..."
  if docker pull "$img"; then return 0; fi

  local m ref
  for m in $JAEGER_MIRRORS; do
    ref="${m}/${img}"
    echo "[info] 直连失败，尝试加速源: $ref"
    if docker pull "$ref"; then
      docker tag "$ref" "$img"
      echo "[ok] 已通过 $m 拉取并重命名为 $img"
      return 0
    fi
  done

  cat <<EOF
[fail] 所有源都拉不到 $img
       可手动试（任一条成功后重跑 start）:
         docker pull docker.1ms.run/$img && docker tag docker.1ms.run/$img $img
         docker pull docker.m.daocloud.io/$img && docker tag docker.m.daocloud.io/$img $img
         docker pull swr.cn-north-4.myhuaweicloud.com/ddn-k8s/docker.io/$img
       或在 /etc/docker/daemon.json 的 registry-mirrors 里加加速地址后 systemctl restart docker
EOF
  return 1
}

do_pull() {
  echo "[pull] 检查 jaeger 镜像..."
  ensure_image "$JAEGER_IMAGE" || exit 1
  echo "[ok] jaeger 镜像就绪: $JAEGER_IMAGE"
}

do_jaeger() {
  if docker ps --format '{{.Names}}' | grep -qx jaeger; then
    echo "[info] jaeger 已在运行"; return
  fi
  if ! ensure_image "$JAEGER_IMAGE"; then
    echo "[warn] jaeger 镜像不可用，本次跳过 jaeger（服务仍可启动，但没有 trace）"
    return 0
  fi
  rm_if_exists jaeger
  run_or_fail docker run -d --name jaeger --restart unless-stopped \
    --network "$NET" \
    -p 16686:16686 -p 4318:4318 -p 4317:4317 \
    -e MEMORY_MAX_TRACES=50000 \
    "$JAEGER_IMAGE"
  echo "[ok] jaeger 已启动 UI:http://<本机IP>:16686"
}

do_build() {
  [ -d "$API_DIR" ] || { echo "[fail] 未找到 apps/api 目录: $API_DIR"; exit 1; }
  echo "[build] 开始构建镜像（首次约 5~15 分钟，构建期借用宿主机网络）..."
  run_or_fail env DOCKER_BUILDKIT=1 docker build --network host -t "$IMAGE" "$API_DIR"
  echo "[ok] 镜像构建完成: $IMAGE"
}

do_start() {
  net_ok
  if [ "${SKIP_JAEGER:-0}" = "1" ]; then
    echo "[info] SKIP_JAEGER=1，跳过 jaeger"
  else
    do_jaeger
  fi
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
  args+=(-e "RFQ_LOG_DIR=/app/data/logs")

  echo "[info] 启动 rfq-service 端口 $HOST_PORT ..."
  run_or_fail docker run -d --name rfq-service --restart unless-stopped \
    --log-driver local --log-opt max-size=20m --log-opt max-file=5 \
    "${args[@]}" "$IMAGE"

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
  pull)    do_pull ;;
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
  *) echo "用法: bash $0 {pull|build|start|stop|restart|status|logs}"; exit 1 ;;
esac
