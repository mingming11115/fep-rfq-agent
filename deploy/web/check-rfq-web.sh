#!/bin/sh
set -eu
origin=http://127.0.0.1:8080
wget -q -T 5 -O /dev/null "$origin/healthz"
wget -q -T 5 -O - "$origin/backend-health" | grep -Eq '"status"[[:space:]]*:[[:space:]]*"UP"'

if [ "${1:-}" = --full ]; then
    # Startup only: hash bytes delivered by nginx, including nested JS imports.
    # Periodic Docker health checks below only request headers of large files.
    while read -r expected relative; do
        actual=$(wget -q -T 20 -O - "$origin/$relative" | sha256sum | cut -d ' ' -f 1)
        [ "$actual" = "$expected" ] || { echo "Editor HTTP integrity failed: $relative" >&2; exit 1; }
    done < /usr/share/nginx/html/.editor-assets.sha256
else
    for editor in wordcraft pdfcraft; do
        for file in index.html "$editor-classic.js" "$editor-classic_bg.wasm"; do
            wget -q -T 5 --spider "$origin/craft-editors/$editor-classic/$file"
        done
    done
fi
