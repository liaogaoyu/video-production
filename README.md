# LumenX 漫剧工作台

本地 Electron 客户端，用于管理漫剧项目、资产图片、整剧分镜和批量生成任务。客户端没有自身账号系统；项目、配置、任务和媒体默认保存在本机。

## 启动与验证

```sh
cd /Users/liaogaoyu/Documents/limenx/prototypes/storydock
npm install
npm start
npm run check
npm test
```

浏览器只用于界面预览：`npm run preview`，访问 `http://127.0.0.1:4318/`。浏览器预览没有 SQLite、加密密钥、原生文件和真实生成能力。

macOS Apple Silicon 构建：`npm run build:mac`。产物位于 `dist/LumenX 漫剧工作台-darwin-arm64/`。本次同时生成 `dist/LumenX-Storydock-0.1.0-arm64.dmg`。当前构建未签名、未公证。

## 已实现

- 项目列表和独立创建项目页面；项目之间隔离资产、分镜和任务。
- Electron 主进程使用 SQLite 保存项目与连接配置；保留浏览器预览的 localStorage 回退。
- 资产 JSON 导入预检、稳定 `assetKey`、图片本地存储和内容哈希去重。
- 多个不可变图片版本和明确固定；重新生成不会修改已有任务的参考图快照。
- OpenAI Images 协议生图适配器；API Key 使用 Electron `safeStorage` 加密；支持 base64 和 URL 响应。
- 整剧分镜导入，支持 `episode + number`、稳定 shot key 和结构化 `refs[].assetKey`。
- 官方 `dreamina` CLI 账号池：每账号独立 Docker volume、GNOME Keyring 和 OAuth；身份哈希去重；登录与生成权限分别显示。
- 即梦多图视频参数校验、提交 ID 保存、查询、下载和客户端重启恢复。
- 提交结果不明时不自动重复提交；下载失败不会重新生成。
- 完整项目包导出和恢复，包含媒体与可移植 manifest，不导出密钥或登录凭据。

## 外部运行条件

生图需要用户提供可用的 OpenAI Images 协议服务、模型名和 API Key。保存配置不等于接口验证成功。

即梦需要运行中的 Docker（Linux 服务器使用 Docker Engine，本机可用 Docker Desktop）、用户完成官方 OAuth，以及账号具备官方 CLI 生成权限。B/S Worker 首次启动时自动下载通过 SHA-256 校验的固定版本官方 CLI，构建 `lumenx-dreamina-eval:1.4.21` 镜像；已有镜像直接复用，失败会退避重试。页面显示安装状态，安装不阻塞项目管理和生图。`STORYDOCK_AUTO_INSTALL_CLI=0` 可关闭自动安装；设置 `STORYDOCK_CLI_IMAGE` 使用预装自定义镜像时也不自动构建。客户端仍可在“模型与账号”页面一键安装运行环境。可选代理通过 `STORYDOCK_DREAMINA_PROXY` 启动环境变量设置，不写入镜像或项目导出。

## 验证边界

自动测试覆盖 SQLite 重开、加密会话、IPC 隔离、媒体存储、资产版本、结构化引用、项目包恢复、官方 CLI OAuth 解析、账号卷隔离、视频参数和异步状态解析。

2026-10-17 的桌面实测完成：开发版和打包版启动、SQLite 项目重载、资产导入、Docker 镜像检查及官方 CLI 环境识别。

当前真实即梦账号返回“仅限会员用户使用”，因此没有提交真实付费视频任务。两个不同真实 CLI 账号、真实多图视频结果和自动下载仍需有权限账号完成最终验收；客户端会阻止无权限账号提交。网页登录 Cookie 的第三方积分检查仅保留为研究代码，不用于生产视频提交。

详细设计与验证账本位于 `docs/agents/deliverables/storydock-design/`。

## 从旧客户端恢复项目

本机迁移工具会复制项目、全部图片版本、参考图、分镜引用和历史视频。账号凭据和模型密钥不会迁移；历史任务全部暂停，避免重新提交。重复运行会跳过同一来源已经恢复的项目。

```sh
# 先预览，不修改数据库
node scripts/restore-desktop.cjs --source '/旧客户端数据目录'
# 停止 API 和 Worker 后应用。工具先为来源和服务端数据库建立一致性备份。
node scripts/restore-desktop.cjs --source '/旧客户端数据目录' --apply
```

来源目录必须包含 `storydock.sqlite`。macOS 打包版通常在 `~/Library/Application Support/LumenX 漫剧工作台`。迁移报告和备份写入服务端数据目录下 `backups/desktop-migration-<时间>/`，旧客户端文件保持不变。迁移结果与文件校验通过后再启动 API、Worker。运行时数据库和媒体不提交 Git。

### Dreamina 国际版：Seedance 分镜视频

国际 CLI **只接分镜视频**，资产生图仍使用「生图模型」中配置的 OpenAI/APIMart 接口。

1. 在运行 Worker 的机器安装官方 Dreamina Canvas CLI 1.0.3；无需替换国内 `dreamina` 或 Docker 镜像。
2. 「模型与账号 → Dreamina 国际版 · 分镜视频」添加账号。新账号自动获得独立 profile；本机已有登录可填写已有 profile，再点「检查」确认身份。新 profile 点「授权」，在官方网页由用户完成同意。
3. 勾选分镜 →「批量生成视频」→ 视频渠道选「Dreamina 国际版 · Seedance」。模型来自当前账号实时目录，仅显示 Seedance。
4. 「准备并获取报价」只上传资产和保存草稿；检查报价后点「批准并提交」。未批准不调用生成。无引用走 t2v，有引用走 m2v 并携带已固定的资产版本。
5. 任务在「生成队列」查询并下载归档。提交响应丢失后使用原 submit ID 恢复；下载失败只重试下载，不重新生成。

可选服务环境变量：

```bash
# CLI 绝对路径；默认 ~/.local/bin/dreamina-canvas（Windows 为 .exe）
STORYDOCK_GLOBAL_CLI=/opt/storydock/bin/dreamina-canvas
# 仅影响国际 CLI 子进程，按实际可达的 HTTP 代理填写；不要提交凭据
STORYDOCK_GLOBAL_PROXY=http://127.0.0.1:7890
```

本地 CLI 凭据由官方 SDK 管理；`STORYDOCK_ROOT/global-state` 保存操作恢复记录，不是账号 token 的自定义存放目录。服务器无代理时不得以本机成功推断服务器可用；上线前应以 Worker 用户验证模型、上传和媒体下载通路。

常规 `npm test` 不调用收费模型。当前已测试单账号真实 CLI 查询/下载、真实上传/引用/报价与队列归档；生成提交的限额、丢响应和恢复使用自动化测试覆盖，并已有前期真实 CLI 成功任务作协议依据。真正两个不同美区账号的隔离仍需要各自授权后验收。

国际 CLI 1.0.3 的 `auth account` 只返回 userId、isVip、vipLevel，未公开剩余积分查询。国际账号区明确显示此限制并提供官网入口；生成报价为本次最高用量，不代表账号余额。

### 本地后台启动

```bash
npm run local:start
```

同时启动 API 和 Worker，使用独立后台进程，启动命令结束后继续运行。重复运行会复用已经存活的服务。默认地址 http://127.0.0.1:4320/ 。PID 与日志保存在 `var/storydock/local-services/`（使用 `STORYDOCK_ROOT` 时位于其目录下）。这仅是本机开发启动方式，生产仍使用 systemd。


### Dreamina 国际网页渠道（Seedance 2.0 / Fast）

此渠道独立于官方 CLI，使用内置的 `vendor/jimeng-api` fork（GPL-3.0，来源见其 `UPSTREAM.md`），只生成分镜视频。CLI 的 OAuth 不能直接当作网页 sessionid 使用。账号列表支持网页登录、剩余积分查询、暂停和轮流分配；资产生图仍走原来的配置。

本机安装：`npm run web:setup`；环境自检：`node scripts/check-dreamina-web.cjs`。安装完成后重启 API、Worker，在模型与账号页面添加国际网页账号并打开登录窗口。登录窗口操作服务器端的 Chromium，完成登录后点击保存，网页 Cookie 加密存入服务器数据库。不要把自己电脑的代理地址直接复制到服务器。

Ubuntu / systemd 部署（代码放 `/opt/storydock`，Node.js 24、Docker Engine 和 nginx 按原部署要求准备）：

```sh
cd /opt/storydock
npm ci --omit=dev --ignore-scripts
# 安装固定锁文件依赖、Chromium 和 Ubuntu 运行库；自检使用 storydock 用户
sudo STORYDOCK_ENABLE_DREAMINA_WEB=1 sh deploy/install.sh
```

在 `/etc/storydock/storydock.env` 里配置以下值，然后执行 `sudo systemctl restart storydock-api storydock-worker`：

```ini
# 必须换为服务器实际可达的 HTTP 代理，API 登录和 Worker 生成共用该出口
STORYDOCK_WEB_PROXY=http://实际代理地址:端口
STORYDOCK_ACCESS_PASSWORD=自行设置的访问密码
# 官方 Canvas CLI 渠道独立配置；仅在使用该渠道时需要
# STORYDOCK_GLOBAL_CLI=/服务用户可执行的路径/dreamina-canvas
# STORYDOCK_GLOBAL_PROXY=http://实际代理地址:端口
```

- 前端只访问本站 API；不要公开 Chromium 调试端口或额外 jimeng-api HTTP 服务。公网入口使用 HTTPS，登录截图、验证码和输入经本站传输。
- API 和 Worker 使用同一个 `storydock` 系统用户、`STORYDOCK_ROOT=/srv/storydock` 和主密钥。持久化 `/srv/storydock`（数据库、`web-profiles/`、媒体、恢复记录），另行备份 `/etc/storydock/master-key`；丢失密钥无法解密账号。浏览器运行库安装于 `/opt/storydock-browsers`。
- 登录在服务器浏览器完成。关闭前端不会终止已提交生成；每账号默认同时三个生成任务，可在账号区调整为1至10。固定提交 UUID，受理后查询原任务；超时不会再次扣费提交，下载失败只重试原结果。
- 官方 Canvas CLI 渠道依然由 Worker 在服务器发起 OAuth，用户在自己浏览器同意；凭据由官方 SDK 保存在服务器服务用户的凭据存储。不能把 macOS Keychain 复制给 Ubuntu。国际网页渠道需单独网页登录。
- 部署后先用服务用户执行浏览器自检，再验证官网能打开、网页登录并保存、重启后检查积分、提交一个真实视频并下载。**本机验证不代表 Ubuntu 网络已验证**，本次没有在无代理的远程服务器提交任务。
- 日志：`journalctl -u storydock-api -u storydock-worker -f`。bridge 不输出原始 Cookie / 签名请求到系统日志；第三方代码的内部日志仍按敏感运行数据管理，不公开或提交 Git。


### 国际渠道调整（2026-10-20）

国际视频的新任务入口统一使用 Dreamina 网页渠道。国际 Canvas CLI 配置区和生成选项已从页面移除，旧的浏览器渠道偏好会在下次生成时转为网页渠道。保留旧 CLI 后端和历史记录仅供查询、恢复已有任务，不卸载 CLI 或删除凭据。国内即梦 CLI 不受影响。网页任务显示“等待提交”表示已经分配账号、尚未提交官网；单账号并发数默认3，可在账号区调整为1至10，这是本地调度配置，不代表官网并发上限。


网页渠道的“重新提交”会复用原任务冻结的提示词、模型和参考图，创建新的任务和提交 UUID，重新调用官网生成。原记录保留并显示“已重新提交”；同一旧记录的重复点击返回同一新任务。后台自动查询不会重新生成；“重试下载”继续下载已有结果。


### 国际网页专用 VLESS / XHTTP / REALITY 代理（Linux 可部署）

国际网页渠道可以使用独立 Xray 进程提供的本地 HTTP 代理，不依赖 macOS 的代理软件。固定内核 `v26.3.27`，安装器按 macOS arm64 / Linux amd64 / Linux arm64 选择官方包，并核对固定 SHA-256；支持离线安装。配置转换使用节点导出文件的 `password` 作为 VLESS 用户 ID，`uuid` 是导出记录元数据；REALITY 使用 `publicKey`、`shortId`、`peer`，XHTTP 使用 `path` / `mode`。依据：[VLESS](https://xtls.github.io/en/config/outbounds/vless.html)、[REALITY](https://xtls.github.io/en/config/transports/reality.html)、[XHTTP](https://xtls.github.io/en/config/transports/xhttp.html)。

本机命令（从客户端代码目录运行）：

```sh
npm run proxy -- install
# 离线可用：npm run proxy -- install --archive /可读目录/Xray-linux-64.zip
npm run proxy -- configure /私有目录/node.json
npm run proxy -- start
npm run proxy -- check
npm run proxy -- enable
# enable 成功后重启 API、Worker，国际网页渠道才使用新出口
```

节点配置只保存在 `STORYDOCK_ROOT/proxy/xray.json`，目录0700、文件0600。代理入口只监听 `127.0.0.1:17891`，只有 VLESS 出站，没有直连备用出口。服务自身不修改系统代理、国内 CLI 或生图接口。国际 bridge 子进程统一给所有 Axios 请求设置代理，覆盖积分、上传令牌、ImageX申请/上传/提交、任务查询、CDN下载；浏览器登录和签名浏览器使用同一 HTTP 代理。代理不可用时请求失败，不降级为直连。

Ubuntu / systemd：

1. 先安装 Node.js 24、curl、unzip、ca-certificates，确认服务器时钟同步、能出站连接节点的TCP端口。Chromium 按上一节安装。
2. 将节点JSON放入 `/etc/storydock/node.json`，设置 `root:storydock` / 0640（storydock 服务用户需可读）。不要提交到 Git 或打进镜像。
3. 在 `/opt/storydock` 运行：

```sh
sudo STORYDOCK_ENABLE_DREAMINA_WEB=1 \
  STORYDOCK_ENABLE_DREAMINA_PROXY=1 \
  STORYDOCK_PROXY_NODE_FILE=/etc/storydock/node.json \
  sh deploy/install.sh
# 下载受限可额外设置 STORYDOCK_XRAY_ARCHIVE=/服务用户可读目录/官方安装包.zip
```

安装器启用 `storydock-proxy.service`，出口检查通过后才写入国际代理配置、重启 API/Worker。配置和二进制持久化在 `/srv/storydock/proxy/`。国际网页专用环境变量 `STORYDOCK_WEB_PROXY` 优先于 `web-runtime.json`；安装器将其设为本机17891端口，不修改国内 CLI 的 `STORYDOCK_DREAMINA_PROXY`。只有没有专用配置时才兼容读取旧变量。

```sh
sudo journalctl -u storydock-proxy -u storydock-api -u storydock-worker -f
sudo -u storydock env STORYDOCK_ROOT=/srv/storydock /usr/bin/node /opt/storydock/scripts/dreamina-proxy.cjs check
```

**2026-10-20 实机验证：** macOS 和目标 Ubuntu 26.04.1 LTS amd64 的实际出口均已验证。Ubuntu 上以 storydock 服务用户完成官网 HTTP 200、余额查询、参考图上传检查、已有视频查询、10,744,618 字节视频下载（SHA-256与本机一致），以及 Chromium 156 通过代理打开官网。`storydock-proxy.service` 已实际安装，active / enabled，只监听127.0.0.1:17891。国内 API/Worker 保持运行，本次未整体替换服务器应用版本；新版本部署时读取已准备好的国际网页代理配置。Linux arm64 提供已校验安装包，但未在原生arm64服务器实测。没有额外提交收费生成。

同步生图接口默认最多并行执行 3 个任务，等待响应期间会持续续租，不阻塞后续图片提交或其他渠道任务。可在 `/etc/storydock/storydock.env` 中设置 `STORYDOCK_IMAGE_CONCURRENCY=3`（范围 1–10）并重启 Worker。该上限按 Worker 进程计算；同步请求仍需等待接口返回后才能取得结果。

## React 工作台与应用登录

B/S 前端位于 `webapp/`，使用 React 19、TypeScript、Ant Design 6 和 Vite。后端与 Worker 保持独立。安装及构建：

```sh
npm ci --omit=dev --ignore-scripts
npm ci --prefix webapp
npm run web:build
STORYDOCK_WEB_UI=react npm run server
```

`npm run local:start` 检测到构建产物后会使用 React。前端开发可运行 `npm run dev --prefix webapp`，`/api` 代理到本地 4320。路由仍使用 `#/assets?project=...`，刷新和前进后退保留项目。

登录账号存储在业务 SQLite 的 `app_users` 中，密码使用带随机盐的 scrypt 哈希；登录会话只在数据库保存令牌哈希，浏览器通过 HttpOnly、SameSite Cookie 访问 API、图片、视频及下载。生产环境设置 `STORYDOCK_AUTH_REQUIRED=1`。第一次迁移可设置 `STORYDOCK_LEGACY_HTPASSWD` 指向旧 Nginx bcrypt 格式 htpasswd 文件；仅在尚无应用账号时导入，不会在后续重启时恢复旧密码。用户登录后会自动升级密码哈希，原用户名和密码不变。

在“模型与账号 → 登录账号”修改账号和密码；新密码至少 8 位。修改后其他会话失效。管理员忘记密码时，可在服务器通过终端重置（不要把密码放在命令参数或 Git 中）：

```sh
read -s -p '新密码: ' STORYDOCK_NEW_PASSWORD
printf '%s' "$STORYDOCK_NEW_PASSWORD" | sudo -u storydock env STORYDOCK_ROOT=/srv/storydock STORYDOCK_MASTER_KEY=/etc/storydock/master-key node scripts/manage-login.cjs admin
unset STORYDOCK_NEW_PASSWORD
```

`deploy/install.sh` 会安装前端依赖并构建；已有 Nginx 登录部署可在首次部署时传入 `STORYDOCK_LEGACY_HTPASSWD=/etc/nginx/storydock.htpasswd`。确认应用已导入账号、未登录 API 返回 401 后，再移除 Nginx 的 `auth_basic`，避免浏览器认证弹窗覆盖应用登录页。新服务器先用上述终端命令初始化账号。应用不提供公开注册；所有登录账号共享原有工作空间。

备份任务现在包含媒体索引，可导回图片版本、参考图、固定状态、分镜和已归档结果；恢复的历史任务不会自动再次调用生成服务。
