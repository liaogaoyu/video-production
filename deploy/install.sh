#!/bin/sh
set -eu
# 在目标 Linux 服务器上以 root 运行。Worker 首次启动会安装校验过的固定 CLI。
ROOT=/opt/storydock
install -d -m 0750 -o storydock -g storydock /srv/storydock /srv/storydock/data /srv/storydock/media /srv/storydock/runs /srv/storydock/backups
install -d -m 0750 -o storydock-worker -g storydock-worker /run/storydock
install -d -m 0750 /etc/storydock
if [ ! -f /etc/storydock/master-key ]; then
  head -c 32 /dev/urandom > /etc/storydock/master-key
  chown root:storydock /etc/storydock/master-key
  chmod 0640 /etc/storydock/master-key
fi
docker info >/dev/null
if [ -n "${STORYDOCK_CLI_IMAGE:-}" ]; then
  docker image inspect "$STORYDOCK_CLI_IMAGE" >/dev/null
  echo "自定义镜像请同时通过 systemd Environment=STORYDOCK_CLI_IMAGE 配置给 Worker。"
fi
install -m 0644 deploy/systemd/storydock-api.service /etc/systemd/system/storydock-api.service
install -m 0644 deploy/systemd/storydock-worker.service /etc/systemd/system/storydock-worker.service
systemctl daemon-reload
systemctl enable --now storydock-api.service storydock-worker.service
echo "API 用户不加入 docker 组。只有 storydock-worker 可以调用 Docker。"
