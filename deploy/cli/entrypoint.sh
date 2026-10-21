#!/bin/sh
set -eu
if [ "${1:-}" != "--inside-keyring" ]; then
  exec dbus-run-session -- "$0" --inside-keyring "$@"
fi
shift
if [ ! -r /run/secrets/keyring_password ]; then
  echo "Missing account keyring password" >&2
  exit 1
fi
mkdir -p /run/dreamina-keyring /root/.dreamina_cli
if [ ! -f /root/.dreamina_cli/version.json ]; then
  cp /opt/dreamina/version.json /root/.dreamina_cli/version.json
fi
export GNOME_KEYRING_CONTROL=/run/dreamina-keyring
gnome-keyring-daemon --unlock --components=secrets < /run/secrets/keyring_password >/dev/null
exec /usr/local/bin/dreamina "$@"
