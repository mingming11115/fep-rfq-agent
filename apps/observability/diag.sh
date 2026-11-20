#!/usr/bin/env bash
# 502 一次性诊断：容器活没活、为什么死、nginx 把请求转给谁
# 只读脚本，不改任何配置。用法: bash apps/observability/diag.sh
set -u

C=rfq-service
IMAGE="${IMAGE:-rfq-service:onlyoffice}"
PORT="${HOST_PORT:-48081}"

find_nginx() {
  local p
  for p in /usr/local/nginx/sbin/nginx /usr/sbin/nginx /usr/bin/nginx; do
    [ -x "$p" ] && { echo "$p"; return 0; }
  done
  command -v nginx 2>/dev/null && return 0
  return 1
}

echo "############ 1. 容器状态 ############"
docker ps -a --filter "name=$C" --format '{{.Names}} | {{.Status}}' 2>/dev/null || true
echo "重启次数: $(docker inspect "$C" --format '{{.RestartCount}}' 2>/dev/null || echo '-')"
echo "上次退出码: $(docker inspect "$C" --format '{{.State.ExitCode}}' 2>/dev/null || echo '-')"

echo
echo "############ 2. 后端本机健康检查 ############"
if curl -s -m 3 "http://127.0.0.1:${PORT}/actuator/health" 2>/dev/null; then
  echo
else
  echo "!! 连不上 127.0.0.1:${PORT}（这就是 502 的直接原因）"
fi

echo
echo "############ 3. 容器日志最后 30 行 ############"
docker logs --tail 30 "$C" 2>&1 | sed 's/^/  /' || echo "  读不到日志"

echo
echo "############ 4. 错误关键词计数 ############"
for k in "Access denied" "Connection refused" "Communications link failure" "Unknown database" "Table" "Flyway" "APPLICATION FAILED TO START"; do
  n=$(docker logs "$C" 2>&1 | grep -ac "$k" || true)
  [ "${n:-0}" -gt 0 ] && echo "  [$k] 出现 $n 次"
done

echo
echo "############ 5. 容器里实际生效的数据库配置 ############"
docker inspect "$C" --format '{{range .Config.Env}}{{println .}}{{end}}' 2>/dev/null \
  | grep -E '^RFQ_DB_' | sed 's/^/  /' || echo "  !! 没有任何 RFQ_DB_* 环境变量"

echo
echo "############ 6. 镜像里 jar 的数据库配置 ############"
docker run --rm --entrypoint python3 "$IMAGE" -c "
import glob,zipfile
f=glob.glob('/app/*.jar')
if not f:
    print('  !!! /app 下没有 jar'); raise SystemExit
d=zipfile.ZipFile(f[0]).read('BOOT-INF/classes/application-prod.yml').decode('utf-8','ignore')
i=d.find('datasource')
print(d[i:i+400] if i>=0 else '  !!! yml 里没有 datasource 段')
" 2>&1 | sed 's/^/  /'

echo
echo "############ 7. nginx 真实生效的转发规则（nginx -T）############"
NGX="$(find_nginx || true)"
if [ -n "${NGX:-}" ]; then
  echo "  nginx: $NGX"
  "$NGX" -T 2>/dev/null \
    | grep -nE '^\s*(listen|server_name|location)\s|proxy_pass' \
    | sed 's/^/  /'
else
  echo "  !! 找不到 nginx 可执行文件"
fi

echo
echo "############ 8. nginx 日志里的 502 上游地址 ############"
for f in /usr/local/nginx/logs/error.log /var/log/nginx/error.log; do
  if [ -f "$f" ]; then
    echo "  -- $f"
    grep -a "upstream" "$f" 2>/dev/null | tail -5 | sed 's/^/    /'
  fi
done

echo
echo "############ 9. 80 端口被谁占用 ############"
ss -ltnp 2>/dev/null | grep ':80 ' | sed 's/^/  /' || echo "  没有进程监听 80"

echo
echo "############ 结论怎么看 ############"
echo " 第1步 Restarting/Exited  -> 后端没活，502 是它的连锁反应，先修启动（看第3/4步）"
echo " 第2步 返回 UP            -> 后端正常，502 只能是第7步 proxy_pass 指错端口"
echo " 第7步 有 proxy_pass:48081 -> 转发正确"
echo " 第7步 指向别的端口/没有   -> 改 nginx（bash apps/observability/fix-nginx.sh）"
