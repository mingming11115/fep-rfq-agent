#!/usr/bin/env bash
# 容器连宿主机 MySQL 全套诊断（一条命令出结论）
# 用法: bash apps/observability/netcheck.sh
set -u

C=rfq-service

echo "=== 1. 容器在跑吗 ==="
docker ps --format '{{.Names}} {{.Status}}' | grep "^$C " || echo "!! 容器没在运行"

echo "=== 2. 容器生效的数据库配置 ==="
docker inspect "$C" --format '{{range .Config.Env}}{{println .}}{{end}}' 2>/dev/null | grep -E '^RFQ_DB_(URL|USER)' \
  || echo "!! 容器没有 RFQ_DB 环境变量（用的镜像内旧配置）"

echo "=== 3. 容器内解析 host.docker.internal ==="
docker exec "$C" python3 -c "import socket;print(socket.gethostbyname('host.docker.internal'))" 2>&1

echo "=== 4. 容器内连宿主机 3306 ==="
docker exec "$C" python3 -c "import socket;s=socket.socket();s.settimeout(3);print('RESULT:',s.connect_ex(('host.docker.internal',3306)))" 2>&1

echo "=== 5. 宿主机 3306 监听地址 ==="
ss -ltn | grep 3306 | awk '{print $1,$4}'

echo "=== 6. 宿主机防火墙 ==="
firewall-cmd --state 2>/dev/null || echo "firewalld 未运行"
iptables -S INPUT 2>/dev/null | tail -3

echo "=== 结论参考 ==="
echo "第4步 RESULT:0 = 网络通(问题在账号或应用配置)"
echo "第4步 RESULT:111 = 被拒绝(防火墙REJECT或路由)"
echo "第4步 连接超时/其他 = 防火墙DROP或MySQL没监听"
