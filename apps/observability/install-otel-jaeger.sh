#!/usr/bin/env bash
# RFQ 单体服务可观测性安装脚本（OTel Java Agent + Jaeger all-in-one）
# 用法: 在 CentOS 上以 root 执行  bash install-otel-jaeger.sh
set -euo pipefail

OTEL_HOME="/opt/otel"
AGENT_VERSION="2.11.0"
JAEGER_VERSION="1.62.0"
AGENT_URL="https://github.com/open-telemetry/opentelemetry-java/releases/download/v${AGENT_VERSION}/opentelemetry-javaagent.jar"
JAEGER_URL="https://github.com/jaegertracing/jaeger/releases/download/v${JAEGER_VERSION}/jaeger-all-in-one-linux-amd64.tar.gz"

mkdir -p "${OTEL_HOME}"

echo "== 1/4 准备文件（若 GitHub 直连慢，可先在本机下载后 scp 到 ${OTEL_HOME} 再重跑）=="
if [ ! -f "${OTEL_HOME}/opentelemetry-javaagent.jar" ]; then
  curl -fL --retry 3 -o "${OTEL_HOME}/opentelemetry-javaagent.jar" "${AGENT_URL}" \
    || echo "!! javaagent 下载失败，请本机下载后: scp opentelemetry-javaagent.jar root@服务器:${OTEL_HOME}/"
fi
if [ ! -x "${OTEL_HOME}/jaeger-all-in-one" ]; then
  curl -fL --retry 3 -o /tmp/jaeger.tgz "${JAEGER_URL}" \
    && tar -xzf /tmp/jaeger.tgz -C /tmp \
    && cp /tmp/jaeger-${JAEGER_VERSION}-linux-amd64/jaeger-all-in-one "${OTEL_HOME}/" \
    || echo "!! jaeger 下载失败，请本机下载解压后: scp jaeger-all-in-one root@服务器:${OTEL_HOME}/"
fi
chmod +x "${OTEL_HOME}/jaeger-all-in-one" 2>/dev/null || true

echo "== 2/4 创建运行用户 =="
id -u otel >/dev/null 2>&1 || useradd -r -s /sbin/nologin otel
chown -R otel:otel "${OTEL_HOME}"

echo "== 3/4 写入 Jaeger 环境变量 =="
cat > "${OTEL_HOME}/jaeger.env" <<'EOF'
SPAN_STORAGE_TYPE=memory
MEMORY_MAX_TRACES=50000
EOF

echo "== 4/4 安装 systemd 服务 =="
cat > /etc/systemd/system/jaeger.service <<'EOF'
[Unit]
Description=Jaeger all-in-one (traces backend for RFQ)
After=network.target

[Service]
User=otel
EnvironmentFile=/opt/otel/jaeger.env
ExecStart=/opt/otel/jaeger-all-in-one
Restart=on-failure
RestartSec=5
MemoryMax=512M

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable --now jaeger
systemctl status jaeger --no-pager || true

echo
echo "完成。UI: http://<服务器IP>:16686"
echo "RFQ 应用启动参数（加到 java 启动命令，见同目录 rfq-otel-java.args）:"
cat "$(dirname "$0")/rfq-otel-java.args" 2>/dev/null || true
