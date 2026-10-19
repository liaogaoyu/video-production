#!/bin/sh
set -eu
ROOT="${STORYDOCK_ROOT:-/srv/storydock}"
STAMP=$(date -u +%Y%m%dT%H%M%SZ)
DEST="${ROOT}/backups/${STAMP}"
mkdir -p "$DEST"
node <<EOF
const { DatabaseSync } = require("node:sqlite");
const db = new DatabaseSync("${ROOT}/data/storydock.sqlite");
db.exec("VACUUM INTO '${DEST}/storydock.sqlite'");
db.close();
EOF
cp -a "${ROOT}/media" "$DEST/media"
echo "数据库和媒体已复制到 $DEST"
echo "账号卷需要单独执行 docker volume 备份。主密钥 /etc/storydock/master-key 必须分开保存。"
