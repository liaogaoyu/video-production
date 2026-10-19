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
