#!/usr/bin/env bash
# Compile src-tauri/icons/AppIcon.icon -> src-tauri/icons/Assets.car
#
# Why this exists: tauri-bundler shells out to standalone `actool`, and the
# macos-latest CI runner's older actool crashes on Liquid Glass .icon documents
# with `selectCatalogIconComposerItemsFromCollection: attempt to insert nil
# object from objects[0]`. Precompiling here means the bundler copies the .car
# verbatim and never invokes actool at all.
#
# Requires FULL Xcode (not just Command Line Tools) with actool >= 26.
# Verified with Xcode 27.1 / actool 27.1: exit 0, valid Assets.car.
#
# Usage:  scripts/icons/compile-assets-car.sh
#         git add src-tauri/icons/Assets.car && git commit -m "icons: rebuild Assets.car"
set -euo pipefail

REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
ICON_DIR="$REPO/src-tauri/icons/AppIcon.icon"
OUT_CAR="$REPO/src-tauri/icons/Assets.car"

if [ ! -d "$ICON_DIR" ]; then
  echo "error: $ICON_DIR not found" >&2
  exit 1
fi

# Prefer the full Xcode install; Command Line Tools alone has no actool.
if [ -d /Applications/Xcode.app/Contents/Developer ]; then
  export DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer
fi

if ! xcrun --find actool >/dev/null 2>&1; then
  echo "error: actool not found. Install full Xcode and set DEVELOPER_DIR," >&2
  echo "       e.g. export DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer" >&2
  exit 1
fi

VER="$(xcrun actool --version --output-format=human-readable-text 2>/dev/null | sed -n 's/.*short-bundle-version: //p' | head -1)"
echo "actool version: ${VER:-unknown}"
case "${VER%%.*}" in
  ''|*[!0-9]*) echo "warning: could not parse actool version; continuing" >&2 ;;
  *) [ "${VER%%.*}" -ge 26 ] || { echo "error: actool ${VER} < 26; Liquid Glass needs Xcode 26+" >&2; exit 1; } ;;
esac

TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

# The bundler renames the directory to Icon.icon and passes --app-icon Icon,
# so mirror that exactly or the result won't match what ships.
cp -R "$ICON_DIR" "$TMP/Icon.icon"
mkdir -p "$TMP/out"

xcrun actool "$TMP/Icon.icon" \
  --compile "$TMP/out" \
  --output-format human-readable-text \
  --notices --warnings \
  --output-partial-info-plist "$TMP/out/assetcatalog_generated_info.plist" \
  --app-icon Icon \
  --include-all-app-icons \
  --accent-color AccentColor \
  --enable-on-demand-resources NO \
  --development-region en \
  --target-device mac \
  --minimum-deployment-target 26.0 \
  --platform macosx

[ -f "$TMP/out/Assets.car" ] || { echo "error: actool produced no Assets.car" >&2; exit 1; }

cp "$TMP/out/Assets.car" "$OUT_CAR"
echo "wrote $OUT_CAR ($(wc -c < "$OUT_CAR" | tr -d ' ') bytes)"

# Sanity: the car must expose an app icon, or CFBundleIconName resolves empty.
NAME="$(xcrun assetutil --info "$OUT_CAR" 2>/dev/null | python3 -c '
import json,sys
try:
    d=json.load(sys.stdin)
except Exception:
    sys.exit(1)
for e in d:
    if isinstance(e,dict) and e.get("AssetType") in ("IconImageStack","Icon Image"):
        print(e.get("Name","")); break
' 2>/dev/null || true)"
if [ -n "$NAME" ]; then
  echo "app icon name in car: $NAME"
else
  echo "warning: no IconImageStack found in Assets.car; CFBundleIconName may be empty" >&2
fi
