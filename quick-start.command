#!/bin/sh
# macOS：首次使用可在终端执行 chmod +x quick-start.command。
SIXMANG_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd) || exit 1
exec /bin/sh "$SIXMANG_DIR/quick-start.sh" "$@"
