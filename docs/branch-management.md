# StoryDock 分支管理

**`master` 是唯一长期分支，也是开发和上线的基准。** 小改动可以直接在 `master` 上提交。涉及多个模块、需要多人并行或要跨多次提交的大改动，从最新的 `master` 开一个临时开发分支，验证通过后合回 `master`，再清理已合并的临时分支。

## 开始开发前

在仓库根目录确认当前分支、提交和工作区状态。

```sh
git status --short --branch
git log -1 --oneline
git remote -v
```

StoryDock 的 GitHub 仓库是 `liaogaoyu/video-production`。开发时打开该仓库的工作区，确认根目录直接包含 `server/`、`worker/` 和 `webapp/`。旧 LumenX 工作区里的 `main:prototypes/storydock/` 是迁移前的历史来源。

开工前从 GitHub 的 `master` 同步最新提交。以下命令适用于远程名为 `github` 且工作区干净的情况。如果直接克隆独立仓库，通常用 `origin`，请先核对它指向 `liaogaoyu/video-production`。

```sh
git fetch github
git switch master
git merge --ff-only github/master
```

如果工作区已经有人在开发，保留现场。大改动可用独立的 Git worktree 开发，两个助手可以各自使用一个目录。

```sh
git worktree add -b dev/subtitle-erase ../storydock-subtitle-erase github/master
```

如果同步无法快进，先查明本地提交和远程提交各自包含哪些改动，再决定如何合并。

## 合并和发布

1. 提交前检查差异，只暂存本次任务的文件。阿里云密钥、`.env.aliyun.local`、数据库和媒体留在各自的运行环境。
2. 跑相关测试和前端构建，检查本次修改影响的现有入口。改到分镜页时，顺手验证「上传本集成片」、MOV 预览和小屏上的「生成本镜」。
3. 小改动验证后推送 `master`。大改动通过 PR 合回 `master`，遇到冲突时同时保留原功能和新增功能。
4. 从已提交的 `master` 构建部署包，记录线上发布的提交号和需要备份的文件。发布后验证页面和服务。线上紧急修复也要同步提交到 `master`。
