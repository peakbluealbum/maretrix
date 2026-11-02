#!/usr/bin/env bash
# Build the release iOS IPA, repairing Swift plugin archives between attempts.
#
# Xcode 27 / Swift 6 emits plugin archives whose `init_plugin_*` symbols are LOCAL, so the
# Rust link fails with "Undefined symbols". scripts/fix-ios-swift-archives.py rebuilds each
# archive from its per-file objects (which keep the symbols global). The repair can only run
# after the Swift side has been built once, hence: build -> repair -> build.
set -uo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/.." || exit 1

export PATH="$HOME/.local/xcode-shim:$HOME/.cargo/bin:$PATH"
export DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer
export APPLE_SIGNING_IDENTITY=''
export CARGO_TARGET_DIR="${CARGO_TARGET_DIR:-$PWD/src-tauri/target-ios}"
export MARETRIX_CONFIG_PATH="${MARETRIX_CONFIG_PATH:-/tmp/merged-config.json}"

LOG=/tmp/ios-ipa-build.log
attempt() {
  pnpm tauri:wry ios build --target aarch64 --no-sign >"$LOG" 2>&1
}

echo "== attempt 1 =="
if attempt; then echo "built on first attempt"; exit 0; fi

if ! grep -q "Undefined symbols" "$LOG"; then
  echo "failed for a reason other than Swift symbol locality:" >&2
  grep -E "^error" "$LOG" | head -5 >&2
  exit 1
fi

echo "== repairing Swift plugin archives =="
python3 scripts/fix-ios-swift-archives.py --target-dir "$CARGO_TARGET_DIR" | tail -6

echo "== attempt 2 =="
if attempt; then echo "built after repair"; exit 0; fi

echo "still failing:" >&2
grep -E "^error|Undefined symbols" "$LOG" | head -6 >&2
exit 1
