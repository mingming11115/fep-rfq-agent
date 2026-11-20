#!/usr/bin/env bash
# 一键修复 nginx（堡垒机友好：全程无需手动复制粘贴/编辑文件）
# 做的事：
#   1. 自动定位 nginx 主配置和 listen 80 的站点文件
#   2. 自动备份原文件（同目录 .bak.时间戳）
#   3. 在 80 端口的 server 块里插入：
#        /api/rfq/ -> http://127.0.0.1:48081   （RFQ 后端，Docker）
#        /jaeger/  -> http://127.0.0.1:16686/  （Jaeger UI）
#   4. nginx -t 校验，通过才 reload；失败自动还原备份
# 用法: bash fix-nginx.sh
set -u

NGX="$(command -v nginx 2>/dev/null || true)"
[ -z "$NGX" ] && NGX=/usr/local/nginx/sbin/nginx
[ -x "$NGX" ] || { echo "[fail] 找不到 nginx 可执行文件"; exit 1; }

CONF="$($NGX -V 2>&1 | tr ' ' '\n' | grep '^--conf-path=' | cut -d= -f2)"
[ -z "${CONF:-}" ] && CONF=/usr/local/nginx/conf/nginx.conf
[ -f "$CONF" ] || { echo "[fail] 找不到主配置: $CONF"; exit 1; }
CONFDIR="$(dirname "$CONF")"

# 找所有包含 listen 80 的站点配置文件
TARGETS="$(grep -rEl 'listen[^;]*\b80\b' "$CONFDIR" 2>/dev/null | grep -v mime.types)"
[ -n "${TARGETS:-}" ] || { echo "[fail] 没找到 listen 80 的配置文件，把 nginx.conf 路径发我"; exit 1; }
echo "[info] 目标文件: $TARGETS"

INSERT=$(cat <<'EOF'
    # ---- added by fix-nginx.sh (RFQ backend + Jaeger UI) ----
    location /api/rfq/ {
        proxy_pass http://127.0.0.1:48081;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    }

    location /jaeger/ {
        proxy_pass http://127.0.0.1:16686/;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    }
    # ---- end added ----

EOF
)

TS="$(date +%Y%m%d%H%M%S)"

for f in $TARGETS; do
  # 已有生效的 proxy_pass 就不动，先打出来给用户看
  ACTIVE="$(grep -n 'proxy_pass' "$f" | grep -v ':[[:space:]]*#' || true)"
  if [ -n "$ACTIVE" ]; then
    echo "[skip] $f 已存在生效的 proxy_pass（未改动），行内容："
    echo "$ACTIVE"
    echo "       如需改端口，把上面这行发我"
    continue
  fi

  cp "$f" "$f.bak.$TS" || { echo "[fail] 备份失败: $f"; exit 1; }
  echo "[info] 已备份: $f.bak.$TS"

  awk -v ins="$INSERT" '
    BEGIN { inblk=0; depth=0; hit=0; done=0 }
    {
      line=$0
      if (done) { print line; next }
      if (!inblk) {
        if (line ~ /(^|[;{ \t])server[ \t]*\{/) { inblk=1; depth=1; hit=0 }
        print line
        next
      }
      tmp=line
      o=gsub(/{/,"",tmp); c=gsub(/}/,"",tmp)
      if (!hit && line ~ /listen[^;]*\b80\b/) hit=1
      nd=depth+o-c
      if (hit && nd==0 && !done) {
        printf "%s", ins
        done=1
        print line
        inblk=0
        next
      }
      depth=nd
      print line
      if (depth==0) { inblk=0 }
    }
  ' "$f" > "$f.tmp" && mv "$f.tmp" "$f"
  echo "[ok] 已在 $f 的 80 server 块内插入转发规则"
done

echo "[info] 校验配置..."
if "$NGX" -t; then
  "$NGX" -s reload && echo "[ok] nginx 已重载"
  echo "     验证: curl -sI http://127.0.0.1/jaeger/ | head -3"
  echo "     页面: http://你的域名/jaeger/   前端接口: http://你的域名/api/rfq/..."
else
  echo "[fail] nginx -t 未通过，自动还原备份"
  for f in $TARGETS; do
    [ -f "$f.bak.$TS" ] && cp "$f.bak.$TS" "$f"
  done
  "$NGX" -t
  exit 1
fi
