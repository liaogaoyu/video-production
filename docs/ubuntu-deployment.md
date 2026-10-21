# Ubuntu 单服务器部署

适用于当前 B/S 版本。代码部署包不包含账号凭据、模型密钥或项目媒体。以下系统安装命令面向一台新的专用服务器；已有其他业务的机器先检查现有 Node、Docker 和 Nginx 配置，避免覆盖。

## 环境

| 项目 | 要求 |
|---|---|
| 系统 | 推荐 Ubuntu 24.04 LTS，x86_64 / amd64 |
| Node.js | 推荐系统级 Node.js 24 LTS，包含 npm；systemd 使用 `/usr/bin/node` |
| Docker | Docker Engine，daemon 已运行；不需要 Docker Desktop 或 WSL |
| 入口 | Nginx；公网配域名、可信 HTTPS 证书及入口访问密码 |
| 初始资源 | 建议 4 vCPU / 8GB RAM / 100GB SSD，属于容量建议，并非目标机实测 |
| 数据库 | 程序内置 SQLite，无需安装 MySQL、PostgreSQL 或 Redis |
| 其他 | curl、CA 证书、tar、xz、git（通过Git更新时）、apache2-utils（创建入口密码） |

不需要显卡、CUDA、桌面环境、Electron 或 Python 后端。即梦账号仍需具备官方 CLI 权限。服务器需要能访问即梦、官方 CLI 下载域名、Docker Hub、Debian 软件源、生图中转和供应商媒体下载地址。CLI 计算通过官方服务完成。

## 1. 预装依赖

```sh
sudo apt update
sudo apt install -y ca-certificates curl tar xz-utils git nginx apache2-utils
uname -m
```

`uname -m` 应为 `x86_64`。当前自动安装器固定下载 Linux AMD64 CLI，不把 ARM Ubuntu 当作已验收环境。

Node.js 应从官方来源安装。以下示例下载当前 Node 24 的 x64 二进制并校验 SHA-256，适用于没有安装 Node 的新服务器：

```sh
STORYDOCK_NODE_TMP=$(mktemp -d)
cd "$STORYDOCK_NODE_TMP"
curl -fsSLO https://nodejs.org/dist/latest-v24.x/SHASUMS256.txt
STORYDOCK_NODE_FILE=$(awk '$2 ~ /^node-v24\..*-linux-x64.tar.xz$/ {print $2; exit}' SHASUMS256.txt)
test -n "$STORYDOCK_NODE_FILE"
curl -fsSLO "https://nodejs.org/dist/latest-v24.x/$STORYDOCK_NODE_FILE"
sha256sum --check --ignore-missing SHASUMS256.txt
sudo mkdir -p /opt/storydock-node24
sudo tar -xJf "$STORYDOCK_NODE_FILE" -C /opt/storydock-node24 --strip-components=1
sudo ln -s /opt/storydock-node24/bin/node /usr/bin/node
sudo ln -s /opt/storydock-node24/bin/npm /usr/bin/npm
sudo ln -s /opt/storydock-node24/bin/npx /usr/bin/npx
/usr/bin/node --version
/usr/bin/node -e 'require("node:sqlite"); console.log("SQLite OK")'
npm --version
```

如果 `/usr/bin/node` 已存在，不要强制覆盖，先确认版本；通过 nvm 安装的交互式 Node 不一定能被 systemd 找到。

Docker 按官方 Ubuntu apt 仓库安装（已经安装并正常运行时跳过）：

```sh
sudo install -m 0755 -d /etc/apt/keyrings
sudo curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
sudo chmod a+r /etc/apt/keyrings/docker.asc
sudo tee /etc/apt/sources.list.d/docker.sources >/dev/null <<EOF
Types: deb
URIs: https://download.docker.com/linux/ubuntu
Suites: $(. /etc/os-release && echo "${UBUNTU_CODENAME:-$VERSION_CODENAME}")
Components: stable
Architectures: $(dpkg --print-architecture)
Signed-By: /etc/apt/keyrings/docker.asc
EOF
sudo apt update
sudo apt install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
sudo systemctl enable --now docker
sudo docker info --format '{{.OSType}}/{{.Architecture}}'
```

预期为 `linux/x86_64` 或等价的 AMD64 表示。已有发行版 Docker 时，先按官方文档核对冲突包，不要直接并装两套 Docker。

## 2. 上传代码

从自己的电脑通过 SSH 上传生成的部署包，替换示例用户和主机：

```sh
scp LumenX-StoryDock-server-2026-10-19.tar.gz ubuntu@SERVER_IP:/tmp/
```

服务器执行：

```sh
sudo mkdir -p /opt/storydock
sudo tar -xzf /tmp/LumenX-StoryDock-server-2026-10-19.tar.gz -C /opt/storydock
cd /opt/storydock
sudo npm ci --omit=dev --ignore-scripts
sudo sh deploy/install.sh
```

部署包根目录就是项目根目录，包含 `server/`、`worker/`、`web/`、`deploy/` 和 `package.json`。生产环境忽略安装脚本并省略 devDependencies，以免下载 Electron。

脚本自动创建 storydock 服务用户、数据目录、主密钥，以及两个 systemd 服务。API 和 Worker 共用同一 Unix 用户访问数据库和媒体；只有 Worker 服务通过 `SupplementaryGroups=docker` 获得 Docker 组，API 屏蔽 Docker socket。这是单机部署的权限安排，不是面向不可信多租户的隔离边界。

首次启动 Worker 会校验官方 CLI 二进制并构建固定版本镜像。已经有镜像时复用。Docker 未启动或网络失败时页面显示原因并稍后重试，不代表账号授权失败。自定义预装镜像通过配置文件设置 `STORYDOCK_CLI_IMAGE`，该模式不会自动重建。

## 3. 验收服务

```sh
sudo systemctl status storydock-api storydock-worker --no-pager
curl -fsS http://127.0.0.1:4320/api/v1/system/runtime
sudo journalctl -u storydock-worker -n 80 --no-pager
```

验收标准：`api=ok`、`worker=ok`、`sqliteWritable=true`，首次安装结束后 `cli.available=true`。首次安装可能需要几分钟，取决于网络和构建缓存。

API 默认只监听服务器回环地址。首次可先通过 SSH 隧道访问，不必开放 4320：

```sh
# 在自己的电脑执行
ssh -L 4321:127.0.0.1:4320 ubuntu@SERVER_IP
```

浏览器打开 `http://127.0.0.1:4321/`。不要使用与本机开发版冲突的 4320 隧道端口。

## 4. Nginx 和公网入口

内网验收可使用仓库模板。先创建入口密码，模板才可用：

```sh
sudo htpasswd -c /etc/storydock/htpasswd admin
sudo chown root:www-data /etc/storydock/htpasswd
sudo chmod 0640 /etc/storydock/htpasswd
sudo chmod o+x /etc/storydock
sudo cp /opt/storydock/deploy/reverse-proxy.conf /etc/nginx/sites-available/storydock
sudo ln -s /etc/nginx/sites-available/storydock /etc/nginx/sites-enabled/storydock
sudo nginx -t
sudo systemctl reload nginx
```

`chmod o+x` 仅允许穿过配置目录，主密钥仍受文件权限保护。不要对已经存在的密码文件再次使用 `htpasswd -c`，以免覆盖其他入口用户。

模板默认 HTTP 80、所有入口均使用 Nginx Basic Auth。公网开放前，将 `server_name _` 改成实际域名，配置可信 TLS 证书并将 HTTP 重定向到 HTTPS；可按自己的域名服务流程使用 ACME 客户端。Basic Auth 密码不要通过公网 HTTP 输入。存在其他默认站点时根据域名配置站点，避免盲目删除现有站点。

公网通常只开放 SSH、HTTP/HTTPS；不向公网开放 4320、SQLite 或 Docker daemon。云服务器安全组也需同步配置。

不要同时启用 `STORYDOCK_ACCESS_PASSWORD` 和入口 Basic Auth 来代替完整登录：当前浏览器媒体/事件请求主要依赖同源入口保护，优先让 Nginx 统一保护页面、API、媒体、下载。模型 API key 仍在应用设置中保存。

## 5. 迁移本机已经恢复的项目

上传代码不会上传本机项目。目前项目已经恢复到本机 B/S 数据库，需要另行迁移 `/var/storydock` 数据目录中的数据库与媒体。迁移期间停止两边 API、Worker，保证快照和媒体一致。

在本机代码目录先停止开发服务，再执行：

```sh
# 仅打包 B/S 项目数据库和媒体；不包含账号密钥和模型密钥
tar -czf /tmp/storydock-project-data.tar.gz -C var/storydock data media
scp /tmp/storydock-project-data.tar.gz ubuntu@SERVER_IP:/tmp/
```

数据库中可能含有已经加密的模型密钥、账号状态和授权设备码；单独复制数据库不代表服务器能解密。以下“重新配置”流程在首次安装、服务器为空的情况下执行，不能覆盖已经使用的服务器数据库：

```sh
sudo systemctl stop storydock-api storydock-worker
# 对已有服务器先备份，勿直接覆盖生产数据
sudo tar -xzf /tmp/storydock-project-data.tar.gz -C /srv/storydock
sudo chown -R storydock:storydock /srv/storydock/data /srv/storydock/media
```

然后在 `/opt/storydock` 以 storydock 用户运行以下一次性清理：保留项目/媒体/历史任务，重置旧机绑定的凭据和授权状态。仅用于上述首次迁移模式：

```sh
cd /opt/storydock
sudo -u storydock env STORYDOCK_ROOT=/srv/storydock STORYDOCK_MASTER_KEY=/etc/storydock/master-key STORYDOCK_RUNTIME_DIR=/run/storydock node <<'NODE'
const {openServices}=require('./server/context.cjs');
const s=openServices();
s.db.exec(`BEGIN IMMEDIATE;
  DELETE FROM secrets;
  UPDATE model_connections SET secret_id=NULL;
  UPDATE jimeng_accounts SET authorized=0,permission='unknown',check_requested_at=NULL,message='迁移后请重新授权';
  UPDATE auth_sessions SET status='cancelled',device_nonce=NULL,device_ciphertext=NULL;
  UPDATE account_leases SET owner=NULL,purpose=NULL,lease_until=NULL;
  COMMIT;`);
s.db.close();
NODE
sudo systemctl start storydock-api storydock-worker
```

服务器重新填写生图密钥，并逐账号完成官方 OAuth。当前已恢复的历史任务全部暂停，不会因为搬迁而重新生成视频。

若希望连登录态和模型密钥一起原样迁移，还需配套迁移本机主密钥、账号 Docker 卷、CLI 输出目录和解锁密码密文，且严格保持它们之间的对应关系。建议首次部署选择重新配置，减少旧凭据迁移问题。

## 6. 更新和备份

配置文件：`/etc/storydock/storydock.env`，两个服务均会读取，修改后重启。代码在 `/opt/storydock`，数据在 `/srv/storydock`，主密钥在 `/etc/storydock/master-key`，升级代码不要覆盖后两者。

```sh
sudo journalctl -u storydock-api -u storydock-worker -f
sudo systemctl restart storydock-api storydock-worker
```

数据库和媒体、主密钥、账号 Docker 卷需分别备份，并演练恢复。只备份 SQLite 不足以找回视频；只备份账号卷也不足以解密 Keyring。

## 验证边界

代码已在当前 macOS 开发环境运行，CLI 已通过 Linux AMD64 容器实际运行验证；本说明中的 Ubuntu systemd、Unix权限和 Nginx 仍需在你的目标服务器验收。没有目标机登录信息，不能声称已经在你的 Ubuntu 上部署完成。

官方参考：
- Node.js 版本：https://nodejs.org/en/about/previous-releases
- Node.js SQLite：https://nodejs.org/api/sqlite.html
- Docker Ubuntu 安装：https://docs.docker.com/engine/install/ubuntu/
