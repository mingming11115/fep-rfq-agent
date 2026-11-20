#!/usr/bin/env bash
# 在服务器上更新前端静态产物（nginx 直接读磁盘，无需重启任何服务）。
#
# 前提：服务器上已有本仓库的 git 克隆，且 nginx 站点已由 setup-https.sh 装好。
# 用法：
#   bash apps/observability/update-web.sh            # 自动从 nginx 配置探测前端目录，再 git pull + 同步
#   WEB_ROOT=/srv/rfq/web bash apps/observability/update-web.sh   # 手动指定前端目录
#
# 做两件事：
#   1) deploy/frontend-dist/  → WEB_ROOT/            （index.html + assets 构建产物）
#   2) packages/craft-editors/site/*-classic/ → WEB_ROOT/craft-editors/*-classic/
#      （PDF/Word 原文阅读器，wasm 不进 deploy/frontend-dist，只能从仓库同步）
#
# 同步后浏览器需强制刷新（Ctrl+F5）：wasm 按 nginx 规则缓存 7 天，普通刷新可能仍是旧版。
set -euo pipefail

REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"

# 未指定 WEB_ROOT 时，从 nginx 配置的 root 指令探测前端目录（跳过 ACME 校验目录）
# 只信名字带 rfq 的站点配置，避免抓到 default 站点的 /usr/share/nginx/html
detect_web_root() {
  local conf p
  for conf in /etc/nginx/conf.d/rfq.conf /usr/local/nginx/conf/conf.d/rfq.conf \
              /etc/nginx/conf.d/*rfq*.conf /usr/local/nginx/conf/conf.d/*rfq*.conf; do
    [ -f "$conf" ] || continue
    p=$(grep -E '^\s*root\s+/.*;' "$conf" 2>/dev/null \
        | grep -v '/var/www/acme' | head -1 | awk '{print $2}' | tr -d ';')
    [ -n "$p" ] && { echo "$p"; return 0; }
  done
  return 1
}

WEB_ROOT="${WEB_ROOT:-}"
if [ -z "$WEB_ROOT" ]; then
  if WEB_ROOT=$(detect_web_root); then
    echo "==> 从 nginx 配置探测到前端目录：$WEB_ROOT"
  else
    echo "错误：无法自动定位前端目录（nginx 配置里没找到 root 指令）。" >&2
    echo "请手动指定后重跑，例如：WEB_ROOT=/opt/rfq/web bash apps/observability/update-web.sh" >&2
    exit 1
  fi
fi

cd "$REPO"
echo "==> git pull（仓库：$REPO）"
git pull --ff-only

[ -d deploy/frontend-dist ] || { echo "错误：仓库里没有 deploy/frontend-dist" >&2; exit 1; }
[ -d packages/craft-editors/site/pdfcraft-classic ] || { echo "错误：仓库里没有 craft-editors 产物，请先 git pull" >&2; exit 1; }
[ -d "$WEB_ROOT" ] || { echo "错误：WEB_ROOT 不存在：$WEB_ROOT（首次部署请先跑 setup-https.sh）" >&2; exit 1; }

echo "==> 同步构建产物 deploy/frontend-dist → $WEB_ROOT"
rm -rf "$WEB_ROOT/assets"
cp -r deploy/frontend-dist/index.html deploy/frontend-dist/assets "$WEB_ROOT/"

echo "==> 同步原文阅读器 packages/craft-editors/site/*-classic → $WEB_ROOT/craft-editors/"
mkdir -p "$WEB_ROOT/craft-editors"
for editor in wordcraft-classic pdfcraft-classic; do
    rm -rf "$WEB_ROOT/craft-editors/$editor"
    cp -r "packages/craft-editors/site/$editor" "$WEB_ROOT/craft-editors/$editor"
done

echo
echo "==> 校验（pdfcraft wasm 应为 74749063 字节；66971623 说明 git 没拉到最新）"
ls -l "$WEB_ROOT/craft-editors/pdfcraft-classic/pdfcraft-classic_bg.wasm"
ls -l "$WEB_ROOT/assets"/index-*.js

echo "==> 完整性校验：本地副本 sha256 是否与 build.json 一致"
expected=$(python3 -c "import json;print(json.load(open('packages/craft-editors/site/pdfcraft-classic/build.json'))['files']['pdfcraft-classic_bg.wasm'])" 2>/dev/null || true)
actual=$(sha256sum "$WEB_ROOT/craft-editors/pdfcraft-classic/pdfcraft-classic_bg.wasm" | awk '{print $1}')
if [ -n "$expected" ] && [ "$actual" = "$expected" ]; then
  echo "  sha256 一致：$actual"
else
  echo "  !! sha256 不一致（expected=$expected actual=$actual），副本已损坏，请重跑本脚本" >&2
  exit 1
fi

echo "==> 走 nginx 实测：浏览器拿到的 wasm 是否真的是二进制"
if command -v curl >/dev/null 2>&1; then
  check_url="${WEB_CHECK_URL:-https://127.0.0.1}/craft-editors/pdfcraft-classic/pdfcraft-classic_bg.wasm"
  probe=$(mktemp)
  code=$(curl -sk -o "$probe" -w '%{http_code}' "$check_url" || echo 000)
  magic=$(head -c 4 "$probe" | od -An -tx1 | tr -d ' \n')
  rm -f "$probe"
  if [ "$code" = "200" ] && [ "$magic" = "0061736d" ]; then
    echo "  nginx 返回 200，wasm 魔数 00 61 73 6d 正确"
  else
    echo "  !! nginx 实测异常（HTTP=$code 魔数=$magic）" >&2
    echo "     说明 nginx 实际服务的目录不是 $WEB_ROOT。请核对站点配置：" >&2
    echo "       grep -rE 'root\s+/' /etc/nginx/ /usr/local/nginx/conf/ 2>/dev/null | grep -v acme" >&2
    echo "     然后用真实目录重跑：WEB_ROOT=<查到的目录> bash apps/observability/update-web.sh" >&2
    exit 1
  fi
else
  echo "  （服务器无 curl，跳过 nginx 实测）"
fi

echo
echo "完成。浏览器 Ctrl+F5 强刷即可，nginx 与后端容器都不用动。"
