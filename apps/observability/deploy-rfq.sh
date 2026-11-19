#!/usr/bin/env bash
# =============================================================
# RFQ 部署启动脚本（含环境检查）
# 用法:
#   bash deploy-rfq.sh check     # 环境体检（java/jar/端口/数据库/Jaeger）
#   bash deploy-rfq.sh start     # 启动（默认先跑体检）
#   bash deploy-rfq.sh stop|restart|status|logs
#   bash deploy-rfq.sh install-service   # 生成 systemd 服务（开机自启）
# jar/数据库等均可用环境变量覆盖，见下方配置区
# =============================================================
set -u

# ================= 配置区（环境变量可覆盖） =================
APP_NAME="${APP_NAME:-rfq-api}"
PORT="${SERVER_PORT:-48084}"
PROFILE="${SPRING_PROFILES:-prod}"
XMX="${XMX:-1024m}"

# jar：不指定则自动搜索
JAR_PATH="${JAR_PATH:-}"

# 数据库：设置了就通过环境变量注入 Spring（不改 jar 内配置）
# 示例: DB_URL="jdbc:mysql://10.0.0.5:3306/rfq?useSSL=false&serverTimezone=Asia/Shanghai"
DB_URL="${DB_URL:-}"
DB_USER="${DB_USER:-}"
DB_PASS="${DB_PASS:-}"

BASE="$(cd "$(dirname "$0")" && pwd)"
GIT_ROOT="$(git -C "${BASE}" rev-parse --show-toplevel 2>/dev/null || echo "")"
LOG_FILE="${BASE}/${APP_NAME}.log"
PID_FILE="${BASE}/${APP_NAME}.pid"
AGENT="/opt/otel/opentelemetry-javaagent.jar"

# ================= 基础探测 =================
find_java() {
  if command -v java >/dev/null 2>&1; then command -v java; return; fi
  for d in /usr/lib/jvm/*/bin/java /usr/java/*/bin/java /opt/jdk*/bin/java; do
    [ -x "$d" ] && { echo "$d"; return; }
  done
  echo ""
}

find_jar() {
  [ -n "${JAR_PATH}" ] && { echo "${JAR_PATH}"; return; }
  # 只搜索真实存在的目录，放宽深度到 6 层
  local dirs=" /opt/rfq /srv /data /home /root"
  [ -n "${GIT_ROOT}" ] && dirs="${dirs} ${GIT_ROOT}"
  local found
  found=$(find ${dirs} -maxdepth 6 -type f -name "*.jar" \
    ! -name "*sources*" ! -name "*javadoc*" ! -path "*/node_modules/*" 2>/dev/null)
  # 优先级: target 下的 rfq jar > 名字带 rfq 的 > 第一个 jar
  {
    echo "${found}" | grep "target/" | grep -i "rfq"
    echo "${found}" | grep -i "rfq"
    echo "${found}"
  } | grep -v "^$" | head -1
}

port_in_use() { ss -tln 2>/dev/null | grep -q ":${1} "; }

tcp_ok() { timeout 3 bash -c "echo > /dev/tcp/${1}/${2}" 2>/dev/null; }

is_run() { [ -f "${PID_FILE}" ] && kill -0 "$(cat "${PID_FILE}")" 2>/dev/null; }

# ================= 环境体检 =================
do_check() {
  local ok=0
  echo "========== 环境体检 =========="

  # 1. Java
  local java_bin; java_bin=$(find_java)
  if [ -n "${java_bin}" ]; then
    echo "[ok] Java: ${java_bin} ($("${java_bin}" -version 2>&1 | head -1))"
  else
    echo "[fail] 未找到 java，先安装 JDK17: yum install -y java-17-openjdk"
    ok=1
  fi

  # 2. jar
  local jar; jar=$(find_jar)
  if [ -n "${jar}" ] && [ -f "${jar}" ]; then
    echo "[ok] jar: ${jar} ($(du -h "${jar}" | cut -f1))"
  else
    echo "[fail] 未找到 jar，用 JAR_PATH=/路径/xx.jar 指定，或从本机上传 rfq-service.jar"
    ok=1
  fi

  # 3. 端口占用
  if port_in_use "${PORT}"; then
    echo "[warn] 端口 ${PORT} 已被占用: $(ss -tlnp 2>/dev/null | grep ":${PORT} " | head -1)"
    ok=1
  else
    echo "[ok] 端口 ${PORT} 空闲"
  fi

  # 4. 数据库连通性（按 DB_URL 或 jar 同目录常见配置推断）
  local db_host=""
  if [ -n "${DB_URL}" ]; then
    db_host=$(echo "${DB_URL}" | sed -n 's|.*://\([^:/]*\):\([0-9]*\).*|\1 \2|p')
  elif [ -f "${BASE}/application.yml" ]; then
    db_host=$(grep -A2 datasource "${BASE}/application.yml" 2>/dev/null | grep -oE "[0-9.]+:[0-9]+" | head -1 | tr ':' ' ')
  fi
  if [ -n "${db_host}" ]; then
    if tcp_ok ${db_host}; then
      echo "[ok] 数据库可达: ${db_host}"
    else
      echo "[fail] 数据库不可达: ${db_host}（检查地址/防火墙/账号）"
      ok=1
    fi
  else
    echo "[hint] 未检测到数据库地址，将使用 jar 内置配置；不对可直接: DB_URL=jdbc:mysql://IP:3306/rfq DB_USER=xx DB_PASS=xx bash $0 start"
  fi

  # 5. OTel + Jaeger（可选）
  if [ -f "${AGENT}" ]; then
    echo "[ok] OTel agent: ${AGENT}"
    systemctl is-active --quiet jaeger \
      && echo "[ok] Jaeger: running (UI :16686)" \
      || echo "[warn] Jaeger 未运行，链路数据将无处可去: systemctl start jaeger"
  else
    echo "[warn] 无 OTel agent，本次启动无链路追踪（不影响业务）"
  fi

  # 6. 内存
  local mem_free; mem_free=$(free -m | awk '/^Mem/{print $7}')
  echo "[info] 可用内存 ${mem_free}MB（应用 Xmx ${XMX}）"
  [ "${mem_free}" -lt 1200 ] && echo "[warn] 内存偏紧，建议 Xmx=512m bash $0 start"

  echo "=============================="
  [ ${ok} -eq 0 ] && echo "体检通过，可启动: bash $0 start" || echo "存在上述问题，修复后再启动"
  return ${ok}
}

# ================= 服务器本地构建 =================
MAVEN_DIR="${BASE}/.maven"

ensure_java() {
  # 优先找 JDK17（路径特征），再用 PATH 里的，最后校验版本必须 >=17
  local java_bin=""
  for d in /usr/lib/jvm/*17*/bin/java /usr/java/*17*/bin/java /opt/*17*/bin/java; do
    [ -x "$d" ] && { java_bin="$d"; break; }
  done
  [ -z "${java_bin}" ] && java_bin=$(command -v java 2>/dev/null || echo "")
  # 校验大版本
  if [ -n "${java_bin}" ]; then
    local major
    major=$("${java_bin}" -version 2>&1 | head -1 | sed -n 's/.*version "\([0-9]*\).*/\1/p')
    [ "${major}" = "1" ] && major="8"
    if [ "${major}" -ge 17 ] 2>/dev/null; then echo "${java_bin}"; return 0; fi
  fi
  echo "[build] 未找到 JDK17，尝试 yum 安装（需要 root/网络）..."
  yum install -y java-17-openjdk java-17-openjdk-devel >/dev/null 2>&1 \
    && { [ -x /usr/lib/jvm/java-17*/bin/java ] 2>/dev/null; java_bin=$(ls /usr/lib/jvm/java-17*/bin/java 2>/dev/null | head -1); \
         [ -n "${java_bin}" ] && echo "${java_bin}" && return 0; }
  echo "[fail] 需要 JDK17。当前: $(java -version 2>&1 | head -1)"
  echo "       请安装: yum install -y java-17-openjdk java-17-openjdk-devel"
  echo "       或用二进制 JDK 放到 /usr/lib/jvm/java-17-openjdk/"
  return 1
}

ensure_maven() {
  if command -v mvn >/dev/null 2>&1; then command -v mvn; return 0; fi
  if [ -x "${MAVEN_DIR}/apache-maven-*/bin/mvn" ] 2>/dev/null || ls "${MAVEN_DIR}"/apache-maven-*/bin/mvn >/dev/null 2>&1; then
    echo "$(ls "${MAVEN_DIR}"/apache-maven-*/bin/mvn | head -1)"; return 0
  fi
  echo "[build] 未找到 mvn，下载便携版（阿里云镜像）..."
  mkdir -p "${MAVEN_DIR}"
  local url="https://mirrors.aliyun.com/apache/maven/maven-3/3.9.9/binaries/apache-maven-3.9.9-bin.tar.gz"
  curl -fL --retry 3 --connect-timeout 15 -o /tmp/maven.tgz "${url}" || return 1
  tar -xzf /tmp/maven.tgz -C "${MAVEN_DIR}" && echo "$(ls "${MAVEN_DIR}"/apache-maven-*/bin/mvn | head -1)" && return 0
  return 1
}

do_build() {
  local java_bin mvn
  java_bin=$(ensure_java) || exit 1
  mvn=$(ensure_maven)     || { echo "[fail] maven 下载失败，检查网络或手动安装"; exit 1; }
  echo "[build] java=$(basename $(dirname $(dirname ${java_bin})))  mvn=${mvn}"

  mkdir -p "${MAVEN_DIR}"

  # 阿里云 Maven 镜像 settings（加速依赖下载）
  cat > "${MAVEN_DIR}/settings.xml" <<'SETTINGS'
<?xml version="1.0" encoding="UTF-8"?>
<settings xmlns="http://maven.apache.org/SETTINGS/1.0.0">
  <mirrors>
    <mirror>
      <id>aliyun</id>
      <name>Aliyun Maven</name>
      <url>https://maven.aliyun.com/repository/public</url>
      <mirrorOf>central</mirrorOf>
    </mirror>
  </mirrors>
</settings>
SETTINGS

  [ -d "${GIT_ROOT}/apps/api" ] || { echo "[fail] 找不到 ${GIT_ROOT}/apps/api"; exit 1; }
  echo "[build] 开始打包（首次会下载依赖，耐心等）..."
  ( cd "${GIT_ROOT}/apps/api" && JAVA_HOME=$(dirname $(dirname "${java_bin}")) \
      "${mvn}" -s "${MAVEN_DIR}/settings.xml" -Dmaven.repo.local="${HOME}/.rfq-m2-repo" \
      clean package -DskipTests -q ) || { echo "[fail] 打包失败，看上方报错"; exit 1; }
  echo "[ok] 打包完成，继续: bash $0 start"
}


# ================= 启动 =================
do_start() {
  is_run && { echo "已在运行 pid=$(cat "${PID_FILE}")"; exit 0; }

  local java_bin; java_bin=$(find_java)
  local jar; jar=$(find_jar)
  if [ -z "${java_bin}" ]; then echo "[error] 无 java"; exit 1; fi
  if [ -z "${jar}" ]; then
    echo "[error] 无 jar。先构建: bash $0 build"
    echo "        或指定: JAR_PATH=/路径/xx.jar bash $0 start"
    exit 1
  fi
  if port_in_use "${PORT}"; then echo "[error] 端口 ${PORT} 被占用"; exit 1; fi

  local db_env=""
  [ -n "${DB_URL}" ]  && db_env="${db_env} -Dspring.datasource.url=${DB_URL}"
  [ -n "${DB_USER}" ] && db_env="${db_env} -Dspring.datasource.username=${DB_USER}"
  [ -n "${DB_PASS}" ] && db_env="${db_env} -Dspring.datasource.password=${DB_PASS}"

  local otel=""
  [ -f "${AGENT}" ] && otel="-javaagent:${AGENT} -Dotel.service.name=${APP_NAME} -Dotel.exporter.otlp.endpoint=http://localhost:4318 -Dotel.traces.exporter=otlp -Dotel.metrics.exporter=none -Dotel.logs.exporter=none"

  echo "[start] jar=$(basename "${jar}") 端口=${PORT} profile=${PROFILE}"
  nohup "${java_bin}" -Xms512m -Xmx${XMX} -XX:+HeapDumpOnOutOfMemoryError \
    ${otel} ${db_env} \
    -jar "${jar}" \
    --server.port=${PORT} --spring.profiles.active=${PROFILE} \
    >> "${LOG_FILE}" 2>&1 &
  echo $! > "${PID_FILE}"

  # 等端口就绪（最多 60 秒）
  for _ in $(seq 1 30); do
    port_in_use "${PORT}" && {
      echo "[ok] 已启动 pid=$(cat "${PID_FILE}") 端口 ${PORT} 就绪"
      echo "     日志: bash $0 logs"
      echo "     链路: http://<本机IP>:16686"
      return 0
    }
    kill -0 "$(cat "${PID_FILE}")" 2>/dev/null || {
      echo "[fail] 进程退出，看日志:"; tail -30 "${LOG_FILE}"; exit 1; }
    sleep 2
  done
  echo "[warn] 60 秒端口未就绪，可能仍在启动，看日志确认: bash $0 logs"
}

do_stop() {
  if is_run; then
    local pid; pid=$(cat "${PID_FILE}")
    echo "[stop] 停止 pid=${pid}..."
    kill "${pid}"
    for _ in $(seq 1 20); do kill -0 "${pid}" 2>/dev/null || break; sleep 1; done
    kill -0 "${pid}" 2>/dev/null && kill -9 "${pid}"
    rm -f "${PID_FILE}"; echo "[ok] 已停止"
  else
    echo "未在运行"; rm -f "${PID_FILE}"
  fi
}

do_status() {
  is_run && echo "[running] pid=$(cat "${PID_FILE}")  日志: ${LOG_FILE}" || echo "[stopped]"
  local jar; jar=$(find_jar)
  [ -n "${jar}" ] && echo "[jar] ${jar}" || echo "[jar] 未找到"
  port_in_use "${PORT}" && echo "[port] ${PORT} 监听中" || echo "[port] ${PORT} 未监听"
}

do_logs() { tail -n 200 -f "${LOG_FILE}"; }

# ================= systemd 安装（开机自启） =================
do_install_service() {
  local java_bin; java_bin=$(find_java)
  local jar; jar=$(find_jar)
  [ -z "${java_bin}" -o -z "${jar}" ] && { echo "先解决 java/jar 再安装服务"; exit 1; }
  cat > /etc/systemd/system/${APP_NAME}.service <<UNIT
[Unit]
Description=RFQ API service
After=network.target mysqld.service

[Service]
Type=simple
Environment=SERVER_PORT=${PORT}
Environment=SPRING_PROFILES_ACTIVE=${PROFILE}
ExecStart=${java_bin} -Xms512m -Xmx${XMX} -jar ${jar} --server.port=${PORT} --spring.profiles.active=${PROFILE}
Restart=on-failure
RestartSec=10

[Install]
WantedBy=multi-user.target
UNIT
  systemctl daemon-reload
  systemctl enable ${APP_NAME}
  echo "[ok] 服务已安装。启动: systemctl start ${APP_NAME}"
  echo "     注意: systemd 方式不含 OTel agent；要追踪请改用 bash $0 start"
}

case "${1:-}" in
  check)           do_check ;;
  build)           do_build ;;
  start)           do_check >/dev/null 2>&1; do_start ;;
  stop)            do_stop ;;
  restart)         do_stop; sleep 2; do_start ;;
  status)          do_status ;;
  logs)            do_logs ;;
  install-service) do_install_service ;;
  *) echo "用法: bash $0 {check|start|stop|restart|status|logs|install-service}"; exit 1 ;;
esac
