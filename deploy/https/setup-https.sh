#!/usr/bin/env bash
# 在部署服务器上执行：安装 nginx 配置、生成证书、校验并热加载。
#
# 用法：
#   sudo ./setup-https.sh                       # 自动探测本机 IP 作访问地址，自签证书
#   sudo ./setup-https.sh -n rfq.intra.net      # 用域名，自签证书
#   sudo ./setup-https.sh -n rfq.intra.net \
#        --cert /etc/pki/rfq.crt --key /etc/pki/rfq.key \
#        --chain /etc/pki/rfq-chain.crt          # 用企业 CA 签发的证书
#   sudo ./setup-https.sh -w /srv/rfq/web --dry-run   # 只打印将执行的动作
#
# 前置：本机已安装 nginx，前端产物已同步到 -w 指定目录。

set -euo pipefail

SERVER_NAME="${SERVER_NAME:-}"
WEB_ROOT="${WEB_ROOT:-/opt/rfq/web}"
API_PORT="${API_PORT:-48084}"
OFFICE_PORT="${OFFICE_PORT:-48081}"
CERT_DIR="${CERT_DIR:-/etc/nginx/ssl}"
CERT="${CERT:-}"
KEY="${KEY:-}"
CHAIN="${CHAIN:-}"
DAYS="${DAYS:-3650}"
EXTRA_SAN="${EXTRA_SAN:-}"
DRY_RUN=0

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TEMPLATE="$SCRIPT_DIR/nginx-rfq.conf"
PROXY_SRC="$SCRIPT_DIR/rfq-proxy.conf"
PROXY_DST="/etc/nginx/rfq-proxy.conf"

say()  { printf '%s\n' "$*"; }
fail() { printf '错误：%s\n' "$*" >&2; exit 1; }
run()  { if [ "$DRY_RUN" -eq 1 ]; then say "[dry-run] $*"; else eval "$@"; fi; }

usage() {
    sed -n '2,15p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//'
    exit 0
}

while [ $# -gt 0 ]; do
    case "$1" in
        -n|--server-name) SERVER_NAME="$2"; shift 2 ;;
        -w|--web-root)    WEB_ROOT="$2";    shift 2 ;;
        --api-port)       API_PORT="$2";    shift 2 ;;
        --office-port)    OFFICE_PORT="$2"; shift 2 ;;
        --cert)           CERT="$2";        shift 2 ;;
        --key)            KEY="$2";         shift 2 ;;
        --chain)          CHAIN="$2";       shift 2 ;;
        --days)           DAYS="$2";        shift 2 ;;
        --extra-san)      EXTRA_SAN="$2";   shift 2 ;;
        --cert-dir)       CERT_DIR="$2";    shift 2 ;;
        --dry-run)        DRY_RUN=1;        shift ;;
        -h|--help)        usage ;;
        *) fail "未知参数：$1（用 -h 查看用法）" ;;
    esac
done

[ "$(id -u)" -eq 0 ] || [ "$DRY_RUN" -eq 1 ] || fail "需要 root 权限，请用 sudo 执行"
if [ "$DRY_RUN" -eq 0 ]; then
    command -v nginx >/dev/null 2>&1 || fail "未检测到 nginx，请先安装（apt install nginx / yum install nginx）"
fi
[ -f "$TEMPLATE" ] || fail "找不到模板 $TEMPLATE，请把整个 deploy/https 目录一起上传"
[ -f "$PROXY_SRC" ] || fail "找不到 $PROXY_SRC"

# 自动探测访问地址：优先取默认路由出口的本机 IP
if [ -z "$SERVER_NAME" ]; then
    SERVER_NAME="$(ip route get 1.1.1.1 2>/dev/null | awk '{print $7; exit}' || true)"
    [ -n "$SERVER_NAME" ] || SERVER_NAME="$(hostname -I 2>/dev/null | awk '{print $1}' || true)"
    [ -n "$SERVER_NAME" ] || fail "无法自动探测本机 IP，请用 -n 指定访问地址"
fi

# 判定访问地址是 IP 还是域名，决定证书的 SAN 类型
if printf '%s' "$SERVER_NAME" | grep -Eq '^[0-9]{1,3}(\.[0-9]{1,3}){3}$'; then
    SAN="IP:$SERVER_NAME"
else
    SAN="DNS:$SERVER_NAME"
fi
[ -n "$EXTRA_SAN" ] && SAN="$SAN,$EXTRA_SAN"

# 未指定证书则生成自签证书（含 SAN，否则浏览器一律判定为无效证书）
if { [ -n "$CERT" ] && [ -z "$KEY" ]; } || { [ -z "$CERT" ] && [ -n "$KEY" ]; }; then
    fail "--cert 与 --key 必须同时提供"
fi

if [ -z "$CERT" ] || [ -z "$KEY" ]; then
    CERT="$CERT_DIR/rfq.crt"
    KEY="$CERT_DIR/rfq.key"
    say "==> 生成自签证书：$CERT（SAN=$SAN，有效期 $DAYS 天）"
    run "mkdir -p '$CERT_DIR'"
    run "chmod 700 '$CERT_DIR'"
    run "openssl req -x509 -newkey rsa:2048 -sha256 -nodes -days '$DAYS' \
        -keyout '$KEY' -out '$CERT' -subj '/CN=$SERVER_NAME' \
        -addext 'subjectAltName=$SAN' \
        -addext 'keyUsage=critical,digitalSignature,keyEncipherment' \
        -addext 'extendedKeyUsage=serverAuth'"
    run "chmod 600 '$KEY'"
    SELF_SIGNED=1
else
    [ -f "$CERT" ] || fail "证书不存在：$CERT"
    [ -f "$KEY" ]  || fail "私钥不存在：$KEY"
    SELF_SIGNED=0
    say "==> 使用已有证书：$CERT"
fi

say "==> 安装反代公共配置：$PROXY_DST"
run "install -m 644 '$PROXY_SRC' '$PROXY_DST'"

# 兼容不同发行版：优先 conf.d，其次 sites-enabled
if [ -d /etc/nginx/conf.d ]; then
    CONF_DST="/etc/nginx/conf.d/rfq.conf"
else
    CONF_DST="/etc/nginx/sites-enabled/rfq.conf"
fi
say "==> 生成站点配置：$CONF_DST（server_name=$SERVER_NAME）"

TMP_CONF="$(mktemp)"
sed -e "s|__SERVER_NAME__|$SERVER_NAME|g" \
    -e "s|__WEB_ROOT__|$WEB_ROOT|g" \
    -e "s|__CERT__|$CERT|g" \
    -e "s|__KEY__|$KEY|g" \
    -e "s|__CHAIN__|$CHAIN|g" \
    -e "s|__API_PORT__|$API_PORT|g" \
    -e "s|__OFFICE_PORT__|$OFFICE_PORT|g" \
    "$TEMPLATE" > "$TMP_CONF"

# 自签场景没有证书链，删掉 ssl_trusted_certificate 整行
if [ -z "$CHAIN" ]; then
    sed -i '/ssl_trusted_certificate/d' "$TMP_CONF"
fi

if [ ! -d "$WEB_ROOT" ]; then
    say "警告：前端目录 $WEB_ROOT 不存在，请先把 apps/web/dist 同步上去，否则访问会 404"
fi

# 先备份再落盘：nginx -t 校验的是落盘后的真实配置，失败必须能回滚
BACKUP=""
if [ "$DRY_RUN" -eq 0 ] && [ -f "$CONF_DST" ]; then
    BACKUP="$CONF_DST.bak.$(date +%s)"
    install -m 644 "$CONF_DST" "$BACKUP"
    say "==> 已备份原配置：$BACKUP"
fi

run "install -m 644 '$TMP_CONF' '$CONF_DST'"
rm -f "$TMP_CONF"

if [ "$DRY_RUN" -eq 0 ]; then
    if ! nginx -t; then
        if [ -n "$BACKUP" ]; then
            install -m 644 "$BACKUP" "$CONF_DST"
            fail "新配置未通过校验，已回滚到 $BACKUP"
        fi
        fail "新配置未通过校验，请检查 $CONF_DST"
    fi
else
    say "[dry-run] nginx -t"
fi

say "==> 热加载 nginx"
run "nginx -s reload || systemctl reload nginx"

cat <<EOF

完成。访问地址：https://$SERVER_NAME

后续检查：
  1. curl -kI https://$SERVER_NAME/                       静态站是否 200
  2. curl -k  https://$SERVER_NAME/api/rfq/actuator/health  反代是否通
  3. 若后端端口不是 $API_PORT / $OFFICE_PORT，重跑时用 --api-port / --office-port 指定
EOF

if [ "$SELF_SIGNED" -eq 1 ]; then
    cat <<EOF

自签证书需要客户端信任，否则每个浏览器都会拦一次：
  把 $CERT 分发到各访问电脑，导入「受信任的根证书颁发机构」。
  Windows 域环境可用组策略统一推送，比逐台安装可靠得多。
EOF
fi
