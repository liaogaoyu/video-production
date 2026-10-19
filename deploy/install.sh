#!/bin/sh
set -eu
# 在目标 Linux 服务器上以 root 运行。运行时不拉取最新 CLI 镜像。
# 先把校验过的官方二进制放到 deploy/cli/dreamina，并设置 STORYDOCK_CLI_IMAGE 为已构建镜像的 digest。
ROOT=/opt/storydock
install -d -m 0750 -o storydock -g storydock /srv/storydock /srv/storydock/data /srv/storydock/media /srv/storydock/runs /srv/storydock/backups
install -d -m 0750 -o storydock-worker -g storydock-worker /run/storydock
install -d -m 0750 /etc/storydock
if [ ! -f /etc/storydock/master-key ]; then
  head -c 32 /dev/urandom > /etc/storydock/master-key
  chown root:storydock /etc/storydock/master-key
  chmod 0640 /etc/storydock/master-key
fi
if [ -z "${STORYDOCK_CLI_IMAGE:-}" ]; then
  echo "请先构建固定 digest 的 CLI 镜像，并设置 STORYDOCK_CLI_IMAGE" >&2
  exit 1
fi
docker image inspect "$STORYDOCK_CLI_IMAGE" >/dev/null
install -m 0644 deploy/systemd/storydock-api.service /etc/systemd/system/storydock-api.service
install -m 0644 deploy/systemd/storydock-worker.service /etc/systemd/system/storydock-worker.service
systemctl daemon-reload
systemctl enable --now storydock-api.service storydock-worker.service
echo "API 用户不加入 docker 组。只有 storydock-worker 可以调用 Docker。"
