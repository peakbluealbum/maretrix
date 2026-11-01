#!/usr/bin/env bash
# Build the macOS app on this Mac with the real config merged in.
#
# Why this exists: the committed config.json is an empty template (no homeserver, no GIF
# keys, no push gateway) so the public repo carries no credentials. A local `pnpm tauri
# build` therefore embedded the template and shipped a client whose login screen pointed
# at nothing and whose GIF search was dead. CI avoids this by merging secrets into the
# checkout; this script does the equivalent without ever mutating the tracked file:
# it merges into a scratch path and points vite at it via MARETRIX_CONFIG_PATH.
#
#   scripts/build-macos-local.sh                 # host arch, default features
#   scripts/build-macos-local.sh --target universal-apple-darwin
#
# Secrets: ~/.config/maretrix/config.secrets.json (override with MARETRIX_SECRETS).
# Updater signing: ~/.config/maretrix/updater/maretrix.key (override with
# MARETRIX_UPDATER_KEY). Missing key only costs the .sig, not the build.
set -euo pipefail

REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO"

SECRETS="${MARETRIX_SECRETS:-$HOME/.config/maretrix/config.secrets.json}"
UPDATER_KEY="${MARETRIX_UPDATER_KEY:-$HOME/.config/maretrix/updater/maretrix.key}"

if [ ! -f "$SECRETS" ]; then
  echo "error: no secrets file at $SECRETS" >&2
  echo "       without it the build ships the empty config template (no homeserver, no GIFs)" >&2
  exit 1
fi

# Xcode 27's Swift is required by tauri-plugin-notifications; xcode-select points at
# CommandLineTools on this host, so force the full toolchain.
if [ -d /Applications/Xcode.app/Contents/Developer ]; then
  export DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer
fi

TMPDIR_BUILD="$(mktemp -d "${TMPDIR:-/tmp}/maretrix-config.XXXXXX")"
trap 'rm -rf "$TMPDIR_BUILD"' EXIT

python3 scripts/apply-config-secrets.py --out "$TMPDIR_BUILD/config.json" --secrets "$SECRETS"
export MARETRIX_CONFIG_PATH="$TMPDIR_BUILD/config.json"

if [ -f "$UPDATER_KEY" ]; then
  export TAURI_SIGNING_PRIVATE_KEY="$(cat "$UPDATER_KEY")"
  export TAURI_SIGNING_PRIVATE_KEY_PASSWORD=""
else
  echo "warning: no updater key at $UPDATER_KEY — updater artefacts will be unsigned" >&2
fi

echo "build: MARETRIX_CONFIG_PATH=$MARETRIX_CONFIG_PATH"
pnpm tauri build "$@"

# The frontend build copies the merged config into dist/, and Tauri embeds dist/.
DIST_CONFIG="dist/config.json"
if [ -f "$DIST_CONFIG" ]; then
  python3 - "$DIST_CONFIG" <<'PY'
import json, sys
cfg = json.load(open(sys.argv[1]))
hs = cfg.get("homeserverList") or []
gifs = cfg.get("gifs") or {}
print(f"dist/config.json: homeserverList={hs} tenorKey={bool(gifs.get('tenorApiKey'))} "
      f"push={bool((cfg.get('pushNotificationDetails') or {}).get('pushNotifyUrl'))}")
if not hs:
    sys.exit("error: dist/config.json has no homeserver — the build did not pick up the secrets")
PY
else
  echo "error: $DIST_CONFIG missing; the bundle would ship without a config" >&2
  exit 1
fi

echo
echo "artefacts:"
find src-tauri/target/release/bundle -maxdepth 2 -name '*.app' -o -maxdepth 2 -name '*.dmg' | sed 's/^/  /'
