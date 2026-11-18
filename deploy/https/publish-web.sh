#!/usr/bin/env bash
# 在本地开发机执行（Windows 的 Git Bash 也可）：构建前端并同步到服务器。
#
# 用法：
#   REMOTE=user@10.1.2.34 ./publish-web.sh
#   REMOTE=user@10.1.2.34 WEB_ROOT=/srv/rfq/web ./publish-web.sh
#
# 说明：只同步静态产物，不改服务器上的 nginx 配置，也不重启后端。
#       首次部署请先在服务器上跑一次 setup-https.sh。

set -euo pipefail

REMOTE="${REMOTE:-}"
WEB_ROOT="${WEB_ROOT:-/opt/rfq/web}"

[ -n "$REMOTE" ] || { printf '用法：REMOTE=user@服务器 [WEB_ROOT=/opt/rfq/web] %s\n' "$0"; exit 1; }

cd "$(dirname "${BASH_SOURCE[0]}")/../.."

printf '==> 构建前端\n'
npm run build

[ -d apps/web/dist ] || { printf '错误：未生成 apps/web/dist\n' >&2; exit 1; }

printf '==> 同步到 %s:%s\n' "$REMOTE" "$WEB_ROOT"
if command -v rsync >/dev/null 2>&1; then
    # --delete 清掉上一次构建残留的旧 hash 资源，避免目录无限增长
    rsync -az --delete apps/web/dist/ "$REMOTE:$WEB_ROOT/"
else
    printf '提示：本机无 rsync，改用 scp。旧版本资源不会被删除，必要时手工清理。\n'
    ssh "$REMOTE" "mkdir -p '$WEB_ROOT'"
    scp -r apps/web/dist/. "$REMOTE:$WEB_ROOT/"
fi

printf '\n完成。刷新浏览器即可，nginx 无需 reload（静态文件直读磁盘）。\n'
