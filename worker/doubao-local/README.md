# 豆包本地执行器

云端分镜页的「本地豆包生成」将保存已锁定资产的图片版本、图片内容摘要、顺序和提示词。本机通过 SSH 隧道领取任务，操作已登录的豆包客户端，下载视频并回传到原分镜。

## 当前支持

- macOS、Node.js 24、豆包本机调试接口。执行器通过后台页面连接完成操作。
- 默认使用 Seedance 2.0 Fast，支持 4 至 15 秒。按项目设置固定画幅，支持 16:9、9:16、1:1、3:4、4:3、21:9。最多 9 张 PNG/JPEG/WebP 参考图，图片合计最多 50 MB。
- 图片按照分镜资产顺序上传。相同内容的图片合并为一个图号，资产引用转换为「图1、图2」。未匹配的资产引用或缺失的固定图片会阻止任务创建。
- 同一桌面一次执行一个任务。从领取任务到视频回传成功期间保留账号锁。网络中断、状态不明确、重启均保留锁。
- 豆包明确显示当前编号节点生成失败时，结束该次锁定，保留失败记录并保守计入使用次数。重新生成由新的队列任务触发。
- 排队和准备阶段可在分镜页点击「终止操作」。本机停止准备并确认后释放账号锁和额度预留。任务进入提交阶段后会显示生成进度。
- 每个 `quotaKey` 每天最多两次任务。同一账号的多个组织应使用相同 `quotaKey`。计数日暂按 Asia/Shanghai 零点划分，需要根据实际额度恢复情况校准。

## 启动

接入另一台 Mac 时，先按 [安装说明](MAC-INSTALL.md) 生成该设备的公钥并登记。可以用 `bash worker/doubao-local/build-mac-package.sh /绝对路径/Storydock-Doubao-Mac.zip` 打包，安装包不包含本机配置和凭据。

连接配置位于 `~/Library/Application Support/Storydock/doubao-local/config.json`，权限必须为 600。配置含专用设备凭据，服务器只保存摘要。设备只能领取豆包任务、访问已领取任务的参考图、上报状态和回传视频。

完全退出豆包后，用以下命令在后台启动调试连接。`cdpEndpoint` 默认使用 `http://127.0.0.1:9227`。接口仅监听本机，提供已登录页面的读写能力，开启前需要得到账号使用者的授权。

```sh
open -g -a /Applications/Doubao.app --args \
  --remote-debugging-address=127.0.0.1 --remote-debugging-port=9227
```

模型选择、提示词填写、账号切换和节点操作在豆包页面内完成。图片通过调试协议直接设置文件输入框。调试连接不可用时，任务保留原状态并提示重连。

先在终端建立隧道，保持该进程运行。若已有隧道监听本机 28456 端口，可直接启动执行器。

```sh
ssh -N -o ExitOnForwardFailure=yes -o ServerAliveInterval=30 -o ServerAliveCountMax=3 \
  -L 127.0.0.1:28456:127.0.0.1:18456 storydock-tunnel@YOUR_STORYDOCK_SSH_HOST
```

在项目目录的另一终端执行。密码仅由 SSH 交互登录使用。

```sh
node worker/doubao-local/main.cjs \
  "$HOME/Library/Application Support/Storydock/doubao-local/config.json" --submit --watch
```

省略 `--submit` 将停在准备好的节点，保留账号锁。省略 `--watch` 每次处理一个任务。豆包可以处于后台，使用其他应用时执行器继续工作。执行期间请保持豆包登录，任务所在的画布由执行器操作。

配置中的 `accounts` 为按优先级排列的账号池，每项提供豆包完整界面名称 `label` 和账号额度身份 `quotaKey`。已有画布可填侧栏的完整 `canvasLabel`，缺少已配置画布时执行器会创建新画布。`usedToday` 和 `usageDate` 可记录接入前已经手动使用的次数，过期的初始记录会被忽略。

## 恢复

Ctrl+C 停止本地程序，云端任务锁继续保留。恢复时重新运行同一命令，保留原配置和 state 目录。已编号的准备中节点可继续上传剩余参考图。生成中、下载中、回传中的任务恢复原任务，提交结果不确定时会停止并提示核对，禁止盲目重提。

视频下载目录默认是 `~/Downloads`。必须能找到包含该任务编号的完整 MP4 才会上传。下载位置可通过 `downloadDirectory` 配置。上传成功后，原分镜可直接预览及导出。

设备凭据可通过将 `doubao_local_devices.revoked_at` 设为当前时间撤销。配置和运行数据均存于用户 Library，源码不包含连接凭据。
