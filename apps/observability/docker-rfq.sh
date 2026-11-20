#!/usr/bin/env bash
# RFQ Docker 一键管理脚本（不依赖 docker compose / plugin）
# 用法: bash docker-rfq.sh {pull|build|start|stop|restart|status|logs}
# 可选环境变量:
#   RFQ_DB_URL / RFQ_DB_USER / RFQ_DB_PASSWORD   覆盖数据库配置
#   OTEL_AGENT   javaagent jar 路径（默认 /opt/otel/opentelemetry-javaagent.jar）
#   OTEL_ENABLE=1 开启链路追踪（默认 0 = 不挂 javaagent）
#   HOST_PORT    对外端口（默认 48081，仅绑定 127.0.0.1）
#   JAEGER_MODE  auto|docker|native（默认 auto：有镜像用容器，没有就装宿主机二进制）
#   JAEGER_VERSION  jaeger 版本（默认 2.23.0；v1 与 v2 的镜像名/启动参数/配置自动适配）
#   JAEGER_HOME   native 模式的安装目录（默认 /opt/jaeger）
#   JAEGER_IMAGE  docker 模式镜像名（默认 jaegertracing/jaeger:<版本>，v1 为 all-in-one）
#   SKIP_JAEGER=1 只起 rfq-service，不拉/不起 jaeger
set -u

IMAGE="rfq-service:onlyoffice"
JAEGER_MODE="${JAEGER_MODE:-auto}"
JAEGER_VERSION="${JAEGER_VERSION:-2.23.0}"
JAEGER_MAJOR="${JAEGER_VERSION%%.*}"
if [ "$JAEGER_MAJOR" = "1" ]; then
  JAEGER_BIN="jaeger-all-in-one"
  DEFAULT_IMAGE="jaegertracing/all-in-one:$JAEGER_VERSION"
else
  JAEGER_BIN="jaeger"
  DEFAULT_IMAGE="jaegertracing/jaeger:$JAEGER_VERSION"
fi
JAEGER_IMAGE="${JAEGER_IMAGE:-$DEFAULT_IMAGE}"
JAEGER_MIRRORS="${JAEGER_MIRRORS:-docker.1ms.run docker.m.daocloud.io docker.xuanyuan.me hub.rat.dev}"
JAEGER_HOME="${JAEGER_HOME:-/opt/jaeger}"
GH_PROXIES="${GH_PROXIES:-https://ghfast.top https://ghproxy.net https://gh-proxy.com}"
NET="rfq-net"
HOST_PORT="${HOST_PORT:-48081}"
OTEL_AGENT="${OTEL_AGENT:-/opt/otel/opentelemetry-javaagent.jar}"
API_DIR="$(cd "$(dirname "$0")/../api" 2>/dev/null && pwd)"

# 数据库：默认连宿主机 MySQL。可用 /opt/rfq/db.env（内容形如 RFQ_DB_USER=xx）或环境变量覆盖
DB_ENV_FILE="${DB_ENV_FILE:-/opt/rfq/db.env}"
if [ -f "$DB_ENV_FILE" ]; then
  . "$DB_ENV_FILE"
  echo "[info] 已加载数据库配置: $DB_ENV_FILE"
fi
RFQ_DB_URL="${RFQ_DB_URL:-jdbc:mysql://host.docker.internal:3306/rfq?useUnicode=true&characterEncoding=utf8&connectionTimeZone=Asia/Shanghai&allowPublicKeyRetrieval=true&useSSL=false&rewriteBatchedStatements=true}"
JAEGER_PID="$JAEGER_HOME/jaeger.pid"
JAEGER_LOG="$JAEGER_HOME/jaeger.log"
JAEGER_DIR="$JAEGER_HOME/jaeger-$JAEGER_VERSION-linux-amd64"
JAEGER_TAR="jaeger-$JAEGER_VERSION-linux-amd64.tar.gz"
JAEGER_URL="https://github.com/jaegertracing/jaeger/releases/download/v$JAEGER_VERSION/$JAEGER_TAR"
OTEL_ENDPOINT="http://jaeger:4318"

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

port_listen() { ss -ltn 2>/dev/null | grep -q ":$1 "; }

ensure_image() {
  local img="$1"
  if image_ok "$img"; then
    echo "[info] 本地已有镜像 $img"
    return 0
  fi

  echo "[info] 本地无镜像 $img，尝试直连拉取（约 60 秒超时）..."
  if timeout 60 docker pull "$img"; then return 0; fi

  local m ref
  for m in $JAEGER_MIRRORS; do
    ref="${m}/${img}"
    echo "[info] 直连失败，尝试加速源: $ref"
    if timeout 90 docker pull "$ref"; then
      docker tag "$ref" "$img"
      echo "[ok] 已通过 $m 拉取并重命名为 $img"
      return 0
    fi
  done
  echo "[fail] 所有镜像源都拉不到 $img"
  return 1
}

do_pull() {
  echo "[pull] 检查 jaeger 镜像..."
  ensure_image "$JAEGER_IMAGE" || exit 1
  echo "[ok] jaeger 镜像就绪: $JAEGER_IMAGE"
}

download_jaeger() {
  mkdir -p "$JAEGER_HOME" || return 1
  local p
  echo "[info] 下载 jaeger $JAEGER_VERSION 二进制（走 GitHub 加速）..."
  if curl -fL --connect-timeout 15 -m 300 -o "$JAEGER_HOME/$JAEGER_TAR" "$JAEGER_URL"; then
    return 0
  fi
  for p in $GH_PROXIES; do
    echo "[info] 直连失败，尝试加速: $p"
    if curl -fL --connect-timeout 15 -m 300 -o "$JAEGER_HOME/$JAEGER_TAR" "$p/$JAEGER_URL"; then
      return 0
    fi
  done
  echo "[fail] jaeger 二进制下载失败，可手动下载后放到 $JAEGER_HOME/$JAEGER_TAR"
  return 1
}

write_jaeger_config_v2() {
  local cfg="$JAEGER_DIR/config.yaml"
  [ -f "$cfg" ] && return 0
  cat > "$cfg" <<EOF
service:
  extensions: [jaeger_storage, jaeger_query, healthcheckv2]
  pipelines:
    traces:
      receivers: [otlp]
      processors: [batch]
      exporters: [jaeger_storage_exporter]
extensions:
  healthcheckv2:
    use_v2: true
    http:
  jaeger_query:
    storage:
      traces: some_store
  jaeger_storage:
    backends:
      some_store:
        memory:
          max_traces: 50000
receivers:
  otlp:
    protocols:
      grpc:
        endpoint: 0.0.0.0:4317
      http:
        endpoint: 0.0.0.0:4318
processors:
  batch:
exporters:
  jaeger_storage_exporter:
    trace_storage: some_store
EOF
  echo "[info] 已生成 jaeger v2 配置: $cfg"
}

jaeger_native_up() {
  local i
  if [ -f "$JAEGER_PID" ] && kill -0 "$(cat "$JAEGER_PID" 2>/dev/null)" 2>/dev/null; then
    echo "[info] jaeger(宿主机进程) 已在运行 pid=$(cat "$JAEGER_PID")"
    return 0
  fi

  if [ ! -x "$JAEGER_DIR/$JAEGER_BIN" ]; then
    if [ -s "$JAEGER_HOME/$JAEGER_TAR" ] && tar -tzf "$JAEGER_HOME/$JAEGER_TAR" >/dev/null 2>&1; then
      echo "[info] 安装包已存在且完整，直接解压（不重新下载）"
    else
      download_jaeger || return 1
    fi
    rm -rf "$JAEGER_DIR"
    tar -xzf "$JAEGER_HOME/$JAEGER_TAR" -C "$JAEGER_HOME" || {
      echo "[warn] 解压失败，安装包可能不完整，重新下载一次"
      rm -f "$JAEGER_HOME/$JAEGER_TAR"
      download_jaeger || return 1
      tar -xzf "$JAEGER_HOME/$JAEGER_TAR" -C "$JAEGER_HOME" || {
        echo "[fail] 解压仍失败，请手动检查 $JAEGER_HOME"
        return 1
      }
    }
  fi

  local -a cmd
  if [ "$JAEGER_MAJOR" = "1" ]; then
    cmd=(./"$JAEGER_BIN" --memory.max-traces=50000)
  else
    write_jaeger_config_v2
    cmd=(./"$JAEGER_BIN" --config "$JAEGER_DIR/config.yaml")
  fi

  echo "[info] 启动 jaeger $JAEGER_VERSION(宿主机进程) 4317/4318/16686 ..."
  ( cd "$JAEGER_DIR" && nohup "${cmd[@]}" >"$JAEGER_LOG" 2>&1 & echo $! >"$JAEGER_PID" )
  for i in $(seq 1 25); do
    sleep 1
    if port_listen 16686; then
      echo "[ok] jaeger 已启动(宿主机进程) UI:http://<本机IP>:16686  日志:$JAEGER_LOG"
      return 0
    fi
  done
  echo "[fail] jaeger 未起来，最后日志:"
  tail -20 "$JAEGER_LOG" 2>/dev/null || true
  return 1
}

do_jaeger() {
  local mode="$JAEGER_MODE"

  if [ "$mode" = "auto" ]; then
    if image_ok "$JAEGER_IMAGE"; then mode="docker"; else mode="native"; fi
  fi

  if [ "$mode" = "docker" ]; then
    if docker ps --format '{{.Names}}' | grep -qx jaeger; then
      echo "[info] jaeger 容器已在运行"; OTEL_ENDPOINT="http://jaeger:4318"; return 0
    fi
    if ! ensure_image "$JAEGER_IMAGE"; then
      echo "[warn] 镜像拉不到，改为宿主机二进制方式"
      mode="native"
    else
      rm_if_exists jaeger
      local -a jargs=(-d --name jaeger --restart unless-stopped
        --network "$NET"
        -p 16686:16686 -p 4318:4318 -p 4317:4317)
      [ "$JAEGER_MAJOR" = "1" ] && jargs+=(-e MEMORY_MAX_TRACES=50000)
      run_or_fail docker run "${jargs[@]}" "$JAEGER_IMAGE"
      echo "[ok] jaeger 容器已启动($JAEGER_IMAGE) UI:http://<本机IP>:16686"
      OTEL_ENDPOINT="http://jaeger:4318"
      return 0
    fi
  fi

  if jaeger_native_up; then
    OTEL_ENDPOINT="http://host.docker.internal:4318"
  else
    echo "[warn] jaeger 不可用，本次启动不带 trace（接口不影响）"
    OTEL_ENDPOINT=""
  fi
}

do_build() {
  [ -d "$API_DIR" ] || { echo "[fail] 未找到 apps/api 目录: $API_DIR"; exit 1; }
  echo "[build] 开始构建镜像（首次约 5~15 分钟，构建期借用宿主机网络）..."
  run_or_fail env DOCKER_BUILDKIT=1 docker build --network host -t "$IMAGE" "$API_DIR"
  echo "[ok] 镜像构建完成: $IMAGE"
}

do_start() {
  net_ok
  if [ "${OTEL_ENABLE:-0}" = "1" ] && [ "${SKIP_JAEGER:-0}" != "1" ]; then
    do_jaeger
  else
    echo "[info] 链路追踪未启用，跳过 jaeger（开启: OTEL_ENABLE=1 bash $0 start）"
    OTEL_ENDPOINT=""
  fi
  rm_if_exists rfq-service

  local -a args=(--network "$NET"
    -p "127.0.0.1:${HOST_PORT}:48081"
    --add-host=host.docker.internal:host-gateway
    -v rfq-office-documents:/app/data)

  if [ "${OTEL_ENABLE:-0}" = "1" ] && [ -n "$OTEL_ENDPOINT" ] && [ -f "$OTEL_AGENT" ]; then
    args+=(-v "${OTEL_AGENT}:/otel/agent.jar:ro"
      -e "JAVA_TOOL_OPTIONS=-javaagent:/otel/agent.jar -Dotel.service.name=rfq-api -Dotel.exporter.otlp.endpoint=$OTEL_ENDPOINT -Dotel.traces.exporter=otlp -Dotel.metrics.exporter=none -Dotel.logs.exporter=none")
    echo "[info] 链路追踪已启用 上报地址: $OTEL_ENDPOINT"
  else
    echo "[info] 链路追踪未启用（要开启: OTEL_ENABLE=1 bash $0 start）"
  fi

  [ -n "${RFQ_DB_URL:-}" ]      && args+=(-e "RFQ_DB_URL=$RFQ_DB_URL")
  [ -n "${RFQ_DB_USER:-}" ]     && args+=(-e "RFQ_DB_USER=$RFQ_DB_USER")
  [ -n "${RFQ_DB_PASSWORD:-}" ] && args+=(-e "RFQ_DB_PASSWORD=$RFQ_DB_PASSWORD")
  args+=(-e "RFQ_LOG_DIR=/app/data/logs")
  echo "[info] 数据库地址: $RFQ_DB_URL"
  echo "[info] 数据库用户: ${RFQ_DB_USER:-<镜像内置默认值>}"

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

do_stop() {
  docker rm -f rfq-service jaeger >/dev/null 2>&1
  if [ -f "$JAEGER_PID" ]; then
    kill "$(cat "$JAEGER_PID" 2>/dev/null)" >/dev/null 2>&1
    rm -f "$JAEGER_PID"
    echo "[info] 已停止宿主机 jaeger 进程"
  fi
  echo "[ok] 已停止"
}

do_status() {
  docker ps -a --format 'table {{.Names}}\t{{.Status}}\t{{.Ports}}' | grep -E 'rfq-service|jaeger' \
    || echo "[info] 无相关容器"
  if [ -f "$JAEGER_PID" ] && kill -0 "$(cat "$JAEGER_PID" 2>/dev/null)" 2>/dev/null; then
    echo "[ok] jaeger 宿主机进程运行中 pid=$(cat "$JAEGER_PID") UI:http://<本机IP>:16686"
  elif port_listen 16686; then
    echo "[ok] 16686 端口已在监听（jaeger 就绪）"
  else
    echo "[warn] jaeger 未运行"
  fi
  curl -s -m 3 "http://127.0.0.1:${HOST_PORT}/actuator/health" >/dev/null 2>&1 \
    && echo "[ok] 应用健康检查通过" || echo "[warn] 应用健康检查未通过（可能还在启动）"
}

case "${1:-start}" in
  pull)    do_pull ;;
  build)   do_build ;;
  start)   do_start ;;
  stop)    do_stop ;;
  restart) do_stop; do_start ;;
  status)  do_status ;;
  logs)    docker logs -f --tail 100 rfq-service ;;
  *) echo "用法: bash $0 {pull|build|start|stop|restart|status|logs}"; exit 1 ;;
esac
