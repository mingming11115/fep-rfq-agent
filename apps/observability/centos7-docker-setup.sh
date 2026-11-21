#!/usr/bin/env bash
# CentOS 7 Docker 一键安装（含 EOL 源修复 + 镜像加速）
# 在服务器上执行: bash centos7-docker-setup.sh
set -u
log() { echo "[$(date +%H:%M:%S)] $*"; }

log "1/5 修复 CentOS 7 基础 yum 源（EOL 后官方源已下架，换阿里云 vault 存档）"
cat > /etc/yum.repos.d/CentOS-Base.repo <<'EOF'
[base]
name=CentOS-7.9.2009 - Base
baseurl=https://mirrors.aliyun.com/centos-vault/7.9.2009/os/x86_64/
enabled=1
gpgcheck=1
gpgkey=https://mirrors.aliyun.com/centos-vault/7.9.2009/os/x86_64/RPM-GPG-KEY-CentOS-7

[updates]
name=CentOS-7.9.2009 - Updates
baseurl=https://mirrors.aliyun.com/centos-vault/7.9.2009/updates/x86_64/
enabled=1
gpgcheck=1
gpgkey=https://mirrors.aliyun.com/centos-vault/7.9.2009/os/x86_64/RPM-GPG-KEY-CentOS-7

[extras]
name=CentOS-7.9.2009 - Extras
baseurl=https://mirrors.aliyun.com/centos-vault/7.9.2009/extras/x86_64/
enabled=1
gpgcheck=1
gpgkey=https://mirrors.aliyun.com/centos-vault/7.9.2009/os/x86_64/RPM-GPG-KEY-CentOS-7
EOF

log "2/5 添加 docker-ce 源（阿里云）"
cat > /etc/yum.repos.d/docker-ce.repo <<'EOF'
[docker-ce-stable]
name=Docker CE Stable
baseurl=https://mirrors.aliyun.com/docker-ce/linux/centos/7/$basearch/stable
enabled=1
gpgcheck=1
gpgkey=https://mirrors.aliyun.com/docker-ce/linux/centos/gpg
EOF

log "3/5 清理旧 Docker 并安装 docker-ce + compose 插件"
yum remove -y docker docker-common docker-client docker-latest docker-logrotate docker-engine 2>/dev/null || true
yum clean all
yum makecache fast || yum makecache || { log "FAIL yum makecache 失败，检查服务器外网/内网源"; exit 1; }
yum install -y docker-ce docker-ce-cli containerd.io docker-compose-plugin \
  || { log "FAIL docker 安装失败，把上方报错发给开发"; exit 1; }

log "4/5 启动 Docker 并配置镜像加速"
mkdir -p /etc/docker
cat > /etc/docker/daemon.json <<'EOF'
{ "registry-mirrors": ["https://docker.1ms.run", "https://docker.m.daocloud.io"] }
EOF
systemctl enable --now docker
systemctl is-active --quiet docker || { log "FAIL docker 未启动: journalctl -u docker -n 20"; exit 1; }

log "5/5 验证"
docker --version
docker compose version
docker run --rm hello-world >/dev/null 2>&1 \
  && log "OK hello-world 拉取运行成功，可以部署 RFQ 了" \
  || log "WARN hello-world 拉取失败，镜像加速器可能不可用，但不影响继续尝试"
log "下一步: cd 仓库路径，更新代码后执行 bash apps/observability/docker-rfq.sh build，再执行 bash apps/observability/docker-rfq.sh start（统一部署前后端，无需 Compose）"
