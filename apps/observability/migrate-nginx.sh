#!/usr/bin/env bash
set -euo pipefail
port="${WEB_HOST_PORT:-48080}"
ngx="$(command -v nginx || true)"
[ -n "$ngx" ] || ngx=/usr/local/nginx/sbin/nginx
[ -x "$ngx" ] || { echo '[fail] 无法找到宿主机 nginx，未修改入口'; exit 1; }
scratch=$(mktemp -d)
chmod 700 "$scratch"
files=(); backups=(); committed=0
cleanup() {
  local i
  if [ "$committed" -eq 0 ]; then
    for ((i=0;i<${#backups[@]};i++)); do cat "${backups[$i]}" > "${files[$i]}"; done
    if [ "${#backups[@]}" -gt 0 ]; then "$ngx" -t && "$ngx" -s reload || true; fi
  fi
  rm -r -- "$scratch"
}
trap cleanup EXIT
"$ngx" -T > "$scratch/dump" 2> "$scratch/errors" || { cat "$scratch/errors"; exit 1; }
docker exec -i rfq-web node /usr/local/lib/rfq/migrate-nginx.mjs "$port" < "$scratch/dump" > "$scratch/plan"
while IFS= read -r -d '' file && IFS= read -r -d '' content; do
  [[ "$file" = /* ]] && [ -f "$file" ] && [ -w "$file" ] || { echo "[fail] 无权更新 nginx 配置 $file，请用原有部署管理员账号执行 start"; exit 1; }
  i=${#files[@]}; files+=("$file"); printf '%s' "$content" > "$scratch/new-$i"
done < "$scratch/plan"
[ "${#files[@]}" -gt 0 ] || { echo '[fail] 未生成有效 nginx 迁移计划'; exit 1; }
backup_dir="${RFQ_NGINX_BACKUP_DIR:-/var/backups/rfq-nginx}"
mkdir -p -- "$backup_dir"
chmod 700 "$backup_dir"
for ((i=0;i<${#files[@]};i++)); do
  backup="$backup_dir/$(date +%Y%m%d%H%M%S)-$$-$i.conf"
  cp -pL -- "${files[$i]}" "$backup"; backups+=("$backup")
  cat "$scratch/new-$i" > "${files[$i]}"
done
"$ngx" -t
"$ngx" -s reload
# 迁移后确认 80 入口真的落到新前端：旧站点常被缓存/别名接走，只看配置通过不够。
entry="${RFQ_ENTRY_ADDR:-127.0.0.1:80}"
health="$(curl --fail --silent --connect-timeout 2 --max-time 5 "http://${entry}/backend-health" 2>/dev/null || true)"
if ! printf '%s' "$health" | grep -Eq '"status"[[:space:]]*:[[:space:]]*"UP"'; then
  echo "[fail] HTTP 80 入口（${entry}）仍返回旧页面，未指向新前端，已恢复原 nginx 配置"
  exit 1
fi
committed=1
echo '[ok] 原 HTTP 80 入口已自动切换到前端容器，域名与对外端口保留'
