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

即梦需要 Docker Desktop、`lumenx-dreamina-eval:1.4.21` 镜像、用户完成官方 OAuth，以及账号具备官方 CLI 生成权限。缺少镜像时可在“模型与账号”页面一键从即梦官方下载并构建 Windows x64 可用的隔离运行环境。可选代理通过 `STORYDOCK_DREAMINA_PROXY` 启动环境变量设置，不写入镜像或项目导出。

## 验证边界

自动测试覆盖 SQLite 重开、加密会话、IPC 隔离、媒体存储、资产版本、结构化引用、项目包恢复、官方 CLI OAuth 解析、账号卷隔离、视频参数和异步状态解析。

2026-10-17 的桌面实测完成：开发版和打包版启动、SQLite 项目重载、资产导入、Docker 镜像检查及官方 CLI 环境识别。

当前真实即梦账号返回“仅限会员用户使用”，因此没有提交真实付费视频任务。两个不同真实 CLI 账号、真实多图视频结果和自动下载仍需有权限账号完成最终验收；客户端会阻止无权限账号提交。网页登录 Cookie 的第三方积分检查仅保留为研究代码，不用于生产视频提交。

详细设计与验证账本位于 `docs/agents/deliverables/storydock-design/`。
