#!/usr/bin/env bash
# Regenerate the precompiled iOS app icon from the Icon Composer document.
#
# Why precompiled: CI's newest Xcode (26.6) cannot compile a Liquid Glass `.icon` — its
# actool aborts with `-[__NSPlaceholderArray initWithObjects:count:]: attempt to insert nil
# object` (tauri#15315), the same crash that forced macOS to ship a prebuilt Assets.car.
# So the icon is compiled here, with a full Xcode 27 toolchain, and the three files are
# committed. Re-run this after changing `src-tauri/icons/AppIcon.icon` or its Assets/.
#
# Outputs (checked in):
#   src-tauri/icons/ios/prebuilt/Assets.car              iOS 26+ Liquid Glass stacks
#   src-tauri/icons/ios/prebuilt/AppIcon60x60@2x.png     legacy, iOS 16-25
#   src-tauri/icons/ios/prebuilt/AppIcon76x76@2x~ipad.png
#   src-tauri/icons/ios/prebuilt/actool-partial.plist    reference for the CFBundleIcons keys
set -euo pipefail

REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
ICON="$REPO/src-tauri/icons/AppIcon.icon"
OUT="$REPO/src-tauri/icons/ios/prebuilt"

if [ -d /Applications/Xcode.app/Contents/Developer ]; then
  export DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer
fi
xcrun --find actool >/dev/null 2>&1 || {
  echo "error: actool not found — needs full Xcode 26.4+ (Xcode 27 verified)" >&2
  exit 1
}
[ -d "$ICON" ] || { echo "error: $ICON missing" >&2; exit 1; }

# actool refuses to write into a directory it has to create itself in some versions.
mkdir -p "$OUT"
rm -f "$OUT/Assets.car" "$OUT"/AppIcon*.png

xcrun actool "$ICON" \
  --compile "$OUT" \
  --platform iphoneos \
  --target-device iphone \
  --target-device ipad \
  --minimum-deployment-target 16.0 \
  --app-icon AppIcon \
  --include-all-app-icons \
  --output-partial-info-plist "$OUT/actool-partial.plist"

echo "wrote:"
ls -lh "$OUT" | tail -5

# The car must carry the Liquid Glass stacks, or iOS 26 will fall back to the flat PNGs.
xcrun assetutil --info "$OUT/Assets.car" | python3 -c '
import json, sys
data = json.load(sys.stdin)
stacks = [e for e in data if isinstance(e, dict) and e.get("AssetType") == "IconImageStack"]
apps = sorted({e.get("Appearance") for e in stacks})
print("IconImageStack count:", len(stacks), "appearances:", apps)
if len(stacks) < 3:
    raise SystemExit("error: expected light/dark/tinted stacks in Assets.car")
'
