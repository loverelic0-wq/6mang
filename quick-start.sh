#!/bin/sh
# 定位脚本自身目录，支持从桌面快捷方式启动和含空格、中文的路径。
SIXMANG_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd) || exit 1
SIXMANG_NODE=${NODE_BINARY:-node}
if ! command -v "$SIXMANG_NODE" >/dev/null 2>&1; then
  printf '%s\n' '[错误] 没有找到 Node.js。请安装 Node.js 24 LTS：https://nodejs.org/'
  printf '%s\n' '安装后重新打开终端。如果用 nvm/fnm，请先在终端激活 Node，再运行此脚本。'
  printf '%s\n' '桌面启动找不到 Node 时，可设置 NODE_BINARY 为 node 可执行文件的绝对路径。'
  if [ -t 0 ]; then
    printf '%s' '按回车关闭……'
    read -r SIXMANG_REPLY
  fi
  exit 1
fi
exec "$SIXMANG_NODE" "$SIXMANG_DIR/scripts/quick-start.js" "$@"
