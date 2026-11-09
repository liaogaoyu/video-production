#!/bin/bash
set -euo pipefail
if [ "$#" -ne 1 ] || [[ "$1" != /*.zip ]]; then
  echo "用法：bash build-mac-package.sh /绝对路径/Storydock-Doubao-Mac.zip" >&2
  exit 1
fi
if [ -e "$1" ]; then echo "输出文件已存在：$1" >&2; exit 1; fi
root="$(cd -- "$(dirname -- "$0")/../.." && pwd)"
stage="$(mktemp -d)"
trap 'rm -rf -- "$stage"' EXIT
package="$stage/Storydock-Doubao-Mac"
mkdir -p "$package/worker/doubao-local" "$package/server"
for name in main.cjs driver.cjs cdp.cjs background.cjs mac-setup.cjs; do
  cp "$root/worker/doubao-local/$name" "$package/worker/doubao-local/"
done
cp "$root/server/video-export.cjs" "$root/server/errors.cjs" "$package/server/"
cp "$root/worker/doubao-local/MAC-INSTALL.md" "$package/安装说明.md"
cat > "$package/安装.command" <<'EOF'
#!/bin/bash
set -euo pipefail
export PATH="/opt/homebrew/opt/node@24/bin:/usr/local/opt/node@24/bin:/opt/homebrew/bin:/usr/local/bin:$PATH"
cd -- "$(dirname -- "$0")"
if ! command -v node >/dev/null; then echo "请先安装 Node.js 24 或更新版本。"; exit 1; fi
if [ "$#" -eq 0 ] && [ -f 连接配置.json ]; then set -- "$PWD/连接配置.json"; fi
exec node worker/doubao-local/mac-setup.cjs "$@"
EOF
cat > "$package/启动豆包后台.command" <<'EOF'
#!/bin/bash
set -euo pipefail
if /usr/bin/curl -fsS --max-time 2 http://127.0.0.1:9227/json/version >/dev/null 2>&1; then
  echo "豆包后台接口已启动。"
  exit 0
fi
if /usr/bin/pgrep -f '^/Applications/Doubao\.app/Contents/MacOS/Doubao($| )' >/dev/null; then
  echo "请在豆包中按 ⌘Q 完全退出，然后重新运行本文件。"
  exit 1
fi
open -g -a /Applications/Doubao.app --args --remote-debugging-address=127.0.0.1 --remote-debugging-port=9227
EOF
chmod +x "$package/"*.command
/usr/bin/ditto -c -k --norsrc --keepParent "$package" "$1"
