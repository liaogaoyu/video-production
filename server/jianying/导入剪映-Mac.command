#!/bin/bash
set -euo pipefail
cd -- "$(dirname -- "$0")"
printf '请先退出剪映。请输入剪映设置中的草稿位置，直接回车使用默认目录：\n'
read -r draft_root
draft_root="${draft_root:-$HOME/Movies/JianyingPro/User Data/Projects/com.lveditor.draft}"
/usr/bin/perl ./import.pl "$draft_root"
printf '\n导入完成，重新打开剪映查看新草稿。按回车关闭。\n'
read -r _
