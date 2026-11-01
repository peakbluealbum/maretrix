#!/usr/bin/env bash
# Build Maretrix for the connected iPhone and install it, using automatic signing
# with a free ("Personal Team") Apple ID.
#
# Prerequisites, both manual and one-time:
#   1. Xcode → Settings → Accounts → "+" → Apple ID. Xcode creates an
#      "Apple Development" certificate and a Personal Team.
#   2. On the iPhone: Settings → Privacy & Security → Developer Mode → On, then
#      reboot and confirm. Without it devicectl fails with
#      "The operation failed because Developer Mode is turned off."
#
# Usage:
#   scripts/install-ios-device.sh                 # auto-detect the one connected device
#   scripts/install-ios-device.sh <UDID>
#   APPLE_DEVELOPMENT_TEAM=ABCDE12345 scripts/install-ios-device.sh
#
# A free-team signature expires after 7 days; re-run this to refresh. The app's
# data survives the re-install (same bundle id, same signing identity).
set -euo pipefail

REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO"

export DEVELOPER_DIR="${DEVELOPER_DIR:-/Applications/Xcode.app/Contents/Developer}"
export PATH="$HOME/.cargo/bin:$PATH"

if [ ! -d "src-tauri/gen/apple/maretrix.xcodeproj" ]; then
  echo "error: Xcode project missing — run: pnpm tauri ios init --ci" >&2
  exit 1
fi

if [ -z "${APPLE_DEVELOPMENT_TEAM:-}" ]; then
  # Fall back to the team embedded in the generated project, if any.
  APPLE_DEVELOPMENT_TEAM="$(grep -m1 'DEVELOPMENT_TEAM' src-tauri/gen/apple/maretrix.xcodeproj/project.pbxproj \
    | sed 's/.*DEVELOPMENT_TEAM = \(.*\);/\1/' | tr -d ' "')"
fi
if [ -z "${APPLE_DEVELOPMENT_TEAM:-}" ]; then
  echo "error: no development team. Sign into Xcode with an Apple ID (Settings → Accounts)," >&2
  echo "       then re-run, or pass APPLE_DEVELOPMENT_TEAM=<TEAMID>." >&2
  echo "       Team ids are listed by: security find-identity -v -p codesigning" >&2
  exit 1
fi
export APPLE_DEVELOPMENT_TEAM

UDID="${1:-}"
if [ -z "$UDID" ]; then
  UDID="$(xcrun devicectl list devices 2>/dev/null \
    | awk '/connected/ && $0 ~ /iPhone|iPad/ {print $3}' | head -1)"
fi
if [ -z "$UDID" ]; then
  echo "error: no connected iPhone/iPad found. Unlock the phone and trust this Mac." >&2
  xcrun devicectl list devices >&2 || true
  exit 1
fi
echo "device : $UDID"
echo "team   : $APPLE_DEVELOPMENT_TEAM"

echo "building (Rust target aarch64-apple-ios + Xcode release)…"
pnpm tauri ios build 2>&1 | tail -25

IPA="$(find src-tauri/gen/apple/build -name '*.ipa' -newermt '-30 minutes' | head -1)"
if [ -z "$IPA" ]; then
  echo "error: no .ipa produced. Signed builds land in src-tauri/gen/apple/build/." >&2
  exit 1
fi
echo "ipa    : $IPA"

TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT
unzip -q "$IPA" -d "$TMP"
APP="$(find "$TMP/Payload" -maxdepth 1 -name '*.app' | head -1)"
[ -n "$APP" ] || { echo "error: no .app inside $IPA" >&2; exit 1; }

echo "installing…"
xcrun devicectl device install app --device "$UDID" "$APP"

cat <<'EONOTE'

Installed. First launch on the phone will be refused until you trust the developer:
  Settings → General → VPN & Device Management → Apple Development: <your Apple ID> → Trust
The signature expires 7 days after it was issued; re-run this script to renew.
EONOTE
