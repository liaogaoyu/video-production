#!/bin/sh
set -eu
# 在目标 Linux 服务器上以 root 运行。Worker 首次启动会安装校验过的固定 CLI。
ROOT=/opt/storydock
if [ "$(id -u)" -ne 0 ]; then echo "请使用 sudo sh deploy/install.sh" >&2; exit 1; fi
cd "$ROOT"
if [ ! -x /usr/bin/node ]; then echo "请先安装系统级 Node.js 24（/usr/bin/node）" >&2; exit 1; fi
/usr/bin/node -e 'if(Number(process.versions.node.split(".")[0])<24)process.exit(1);require("node:sqlite")' || { echo "需要 Node.js 24 或更高版本及 node:sqlite" >&2; exit 1; }
command -v docker >/dev/null
command -v systemctl >/dev/null
docker info >/dev/null
getent group storydock >/dev/null || groupadd --system storydock
id storydock >/dev/null 2>&1 || useradd --system --gid storydock --home-dir /srv/storydock --shell /usr/sbin/nologin storydock
test -f node_modules/fastify/package.json || { echo "请先在 /opt/storydock 执行 npm ci --omit=dev --ignore-scripts" >&2; exit 1; }
install -d -m 0750 -o storydock -g storydock /srv/storydock /srv/storydock/data /srv/storydock/media /srv/storydock/runs /srv/storydock/backups
install -d -m 0700 -o storydock -g storydock /run/storydock /srv/storydock/cli
install -d -m 0750 -g storydock /etc/storydock
if [ ! -f /etc/storydock/master-key ]; then
  head -c 32 /dev/urandom > /etc/storydock/master-key
  chown root:storydock /etc/storydock/master-key
  chmod 0640 /etc/storydock/master-key
fi
if [ ! -f /etc/storydock/storydock.env ]; then
  install -m 0640 -o root -g storydock /dev/null /etc/storydock/storydock.env
fi
if [ -n "${STORYDOCK_CLI_IMAGE:-}" ]; then
  docker image inspect "$STORYDOCK_CLI_IMAGE" >/dev/null
  echo "自定义镜像请同时通过 systemd Environment=STORYDOCK_CLI_IMAGE 配置给 Worker。"
fi
# 可选国际网页专用代理；节点文件由运维提供，凭据不会进入仓库或镜像。
if [ "${STORYDOCK_ENABLE_DREAMINA_PROXY:-0}" = "1" ]; then
  if [ -n "${STORYDOCK_XRAY_ARCHIVE:-}" ]; then
    /usr/sbin/runuser -u storydock -- /usr/bin/env STORYDOCK_ROOT=/srv/storydock /usr/bin/node scripts/dreamina-proxy.cjs install --archive "$STORYDOCK_XRAY_ARCHIVE"
  else
    /usr/sbin/runuser -u storydock -- /usr/bin/env STORYDOCK_ROOT=/srv/storydock /usr/bin/node scripts/dreamina-proxy.cjs install
  fi
  if [ -n "${STORYDOCK_PROXY_NODE_FILE:-}" ]; then
    /usr/sbin/runuser -u storydock -- /usr/bin/env STORYDOCK_ROOT=/srv/storydock /usr/bin/node scripts/dreamina-proxy.cjs configure "$STORYDOCK_PROXY_NODE_FILE"
  fi
  test -s /srv/storydock/proxy/xray.json || { echo "缺少私有节点配置，请设置 STORYDOCK_PROXY_NODE_FILE" >&2; exit 1; }
  install -m 0644 deploy/systemd/storydock-proxy.service /etc/systemd/system/storydock-proxy.service
  for service in storydock-api storydock-worker; do
    install -d /etc/systemd/system/$service.service.d
    cat > /etc/systemd/system/$service.service.d/proxy.conf <<'DEPENDENCY'
[Unit]
Wants=storydock-proxy.service
After=storydock-proxy.service
DEPENDENCY
  done
  systemctl daemon-reload
  systemctl enable storydock-proxy.service
  systemctl restart storydock-proxy.service
  /usr/sbin/runuser -u storydock -- /usr/bin/env STORYDOCK_ROOT=/srv/storydock /usr/bin/node scripts/dreamina-proxy.cjs enable
  /usr/bin/node - <<'PROXY_ENV'
const fs=require('node:fs'),file='/etc/storydock/storydock.env';
const lines=fs.readFileSync(file,'utf8').split('\n').filter(line=>!line.startsWith('STORYDOCK_WEB_PROXY='));
lines.push('STORYDOCK_WEB_PROXY=http://127.0.0.1:17891');
fs.writeFileSync(file,lines.join('\n')+'\n');
PROXY_ENV
fi
# 国际网页渠道是可选运行时。先安装再启动，浏览器与运行用户共用固定缓存目录。
if [ "${STORYDOCK_ENABLE_DREAMINA_WEB:-0}" = "1" ]; then
  export PLAYWRIGHT_BROWSERS_PATH=/opt/storydock-browsers
  if [ "${STORYDOCK_ENABLE_DREAMINA_PROXY:-0}" = "1" ]; then
    /usr/bin/env HTTP_PROXY=http://127.0.0.1:17891 HTTPS_PROXY=http://127.0.0.1:17891 /usr/bin/node scripts/setup-dreamina-web.cjs --with-deps
  else
    /usr/bin/node scripts/setup-dreamina-web.cjs --with-deps
  fi
  chmod -R a+rX "$PLAYWRIGHT_BROWSERS_PATH"
  /usr/sbin/runuser -u storydock -- /usr/bin/env PLAYWRIGHT_BROWSERS_PATH="$PLAYWRIGHT_BROWSERS_PATH" /usr/bin/node scripts/check-dreamina-web.cjs
fi
install -m 0644 deploy/systemd/storydock-api.service /etc/systemd/system/storydock-api.service
install -m 0644 deploy/systemd/storydock-worker.service /etc/systemd/system/storydock-worker.service
systemctl daemon-reload
systemctl enable --now storydock-api.service storydock-worker.service
echo "API 和 Worker 共用 storydock 服务用户以访问同一数据库和媒体；仅 Worker 服务获得 docker 附加组。API 屏蔽 Docker socket。"

if [ "${STORYDOCK_ENABLE_DREAMINA_PROXY:-0}" = "1" ]; then
  systemctl restart storydock-api.service storydock-worker.service
fi
