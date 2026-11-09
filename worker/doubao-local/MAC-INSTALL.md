# 在另一台 Mac 安装豆包执行器

这份指南用于把一台新 Mac 接到**已有的 Storydock 工作台**。新 Mac 需要 Node.js 24 或更新版本、Git（从仓库安装时）和安装在 `/Applications/Doubao.app` 的豆包客户端。先在豆包里登录要用于生成的账号。

## 新 Mac 安装

1. 如果收到的是 Git bundle，运行 `git clone "/完整路径/mac-doubao.bundle" mac-doubao`。如果从 GitHub 的 Storydock 仓库克隆，直接在仓库根目录运行下方命令。如果克隆的是 bundle，先进入 `prototypes/storydock`：

   ```sh
   node --version
   bash worker/doubao-local/build-mac-package.sh "$HOME/Downloads/Storydock-Doubao-Mac.zip"
   ```

   输出 ZIP 路径必须尚不存在。已经收到安装 ZIP 的话，可以直接解压并从下一步开始。
2. 解压安装包，把整个 `Storydock-Doubao-Mac` 文件夹移到固定位置。双击「安装.command」，也可以在该目录运行 `bash ./安装.command`。把终端显示的 `ssh-ed25519` 公钥交给工作台管理员，等待管理员登记并提供连接配置。
3. 把管理员给的「连接配置.json」放在解压后的安装目录里，再运行一次「安装.command」。安装程序会验证 SSH 隧道及设备凭据，然后配置后台服务。安装成功后，可以移除解压目录里的连接配置副本。
4. 等豆包当前生成结束，在客户端按 ⌘Q 完全退出，再运行「启动豆包后台.command」。如需登录，在豆包客户端完成。工作台分镜页的「豆包队列」会显示在线状态。已有另一台执行器时，同时检查下面的本机日志，确认这台 Mac 已开始轮询。
5. 如果首次连接配置的账号列表为空，执行器会在豆包空闲时读取当前账号和「更多账号」并上报。管理员核对额度归属后提供补齐账号列表的连接配置。把它放进解压目录，再运行一次「安装.command」，即可开始领任务。

## 验收与排查

在新 Mac 登录桌面后，检查服务和日志：

```sh
launchctl print "gui/$(id -u)/com.storydock.doubao-tunnel"
launchctl print "gui/$(id -u)/com.storydock.doubao-worker"
curl -fsS http://127.0.0.1:9227/json/version
tail -n 20 "$HOME/Library/Application Support/Storydock/doubao-local/worker.log"
```

日志出现 `"reason":"empty"`（没有待领取任务）、`"reason":"desktop_locked"`（另一台执行器持有任务）或 `"reason":"daily_limit"`（当前账号池没有可用额度），表示这台 Mac 已能连接工作台。验证部署无需提交测试视频。隧道问题检查同一目录下的 `tunnel.log`；遇到「等待豆包登录」时，检查豆包是否登录、是否通过启动脚本打开。执行器在领取任务时会向云端登记本机账号池。

SSH 隧道和执行器在登录 macOS 后自动运行，进程退出后会尝试重新启动。豆包客户端需要保持登录。如果豆包被退出或重新启动，请再次运行「启动豆包后台.command」。

目前云端同一时间只分配一条任务。两台 Mac 可以连接同一个队列，先领取任务的 Mac 负责处理到结束。若要改由新 Mac 接班，请先等旧 Mac 的在途任务完成回传，再停止旧执行器。新 Mac 有自己的密钥、设备编号和任务状态。

## 管理员登记

在服务器上，先用 `ssh-keygen -lf <公钥文件>` 核对新 Mac 发来的 Ed25519 公钥。确认它尚未登记后，将它追加到现有受限 `storydock-tunnel` 用户的 `~/.ssh/authorized_keys`。保留原有条目，每个新增条目按以下格式填写一行，并确保文件归该用户所有、权限为 600：

```text
restrict,port-forwarding,permitopen="127.0.0.1:18456" ssh-ed25519 <新 Mac 的公钥正文>
```

使用工作台的管理员登录会话，向同源 `POST /api/v1/doubao-local/devices` 发送 JSON 请求 `{"label":"新 Mac 的设备名称"}`。返回的 `id` 和 `token` 分别填入 `deviceId` 和 `deviceToken`。服务器主机公钥由管理员在受信任的服务器会话中读取 `/etc/ssh/ssh_host_ed25519_key.pub`，取前两列。通过私密渠道把以下结构的「连接配置.json」交给新 Mac：

```json
{
  "deviceId": "替换成签发结果的 id",
  "deviceToken": "替换成签发结果的 token",
  "accounts": [
    {"label": "新 Mac 上已登录的豆包账号显示名", "quotaKey": "此账号已有的额度编号"}
  ],
  "ssh": {
    "host": "工作台服务器的 SSH 主机名或 IP",
    "user": "storydock-tunnel",
    "hostKey": "ssh-ed25519 替换成已验证的服务器主机公钥"
  }
}
```

账号的 `quotaKey` 必须与现有执行器一致，才能在两台电脑之间共用每日额度。只填新 Mac 实际已登录的账号。新账号用单独的额度编号。确有需要时可为每个账号填写 `canvasLabel` 来指定已有画布。

名单未知时，先用 `"accounts": []` 签发连接配置。在「豆包队列」查看执行器上报的名单，或者从管理员接口 `GET /api/v1/doubao-local/queue` 查看 `account_reports`。确认账号与额度身份后，沿用同一设备编号、令牌和 SSH 设置，仅补齐 `accounts`。设备上报只更新名单，不增加额度或启用账号。

Git 和安装包只存程序及说明。真实连接配置、私钥、设备令牌、账号池配置和任务状态都保留在各自设备上。

## 给新 Mac 上的部署 agent

> 请在这台 Mac 上部署 Storydock 的 mac-doubao 本地执行器，并接入我已有的 Storydock 工作台。我会提供安装 ZIP 或仓库路径。请读取 `worker/doubao-local/MAC-INSTALL.md`，检查环境并沿用已有 SSH 密钥；首次登记时只把本机公钥交给我。收到 `连接配置.json` 后安装、启动豆包后台，并验证执行器已上报账号名单。若配置已有生成账号，也请验证执行器正在轮询。验收时不要提交测试视频。
