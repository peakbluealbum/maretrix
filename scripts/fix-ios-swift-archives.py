#!/usr/bin/env python3
"""Re-archive the iOS Swift plugin libraries so their init symbols are global.

Every Tauri plugin with a Swift side exports `init_plugin_<name>` from a static archive that
swift-rs builds via `swift build`. On Xcode 27 / Swift 6, the product archive
`out/Products/Release-iphoneos/lib<plugin>.a` holds a merged whole-module object whose symbols
are LOCAL (`t`), so the Rust link fails:

    Undefined symbols for architecture arm64:
      "_init_plugin_dialog", referenced from: ... tauri_plugin_dialog::mobile ...

The per-file objects under `Intermediates.noindex/**/Objects-normal/arm64/*.o` still carry
them as global (`T`). Rebuilding the archive from those fixes the link — the same fix
scripts/fix-notifications-swift-archive.py applies to the macOS notifications plugin, but this
covers every plugin and both platforms in one pass.

Usage:
    python3 scripts/fix-ios-swift-archives.py [--target-dir src-tauri/target-ios] [--check]

Exit code 1 with --check when anything still has local symbols (CI can gate on it).
"""

from __future__ import annotations

import argparse
import subprocess
import sys
from pathlib import Path


def objects_for(archive: Path) -> list[Path]:
    """Per-file .o objects that produced this archive, if the intermediates are still around."""
    # .../<plugin>/out/Products/Release-iphoneos/lib<plugin>.a
    # -> .../<plugin>/out/Intermediates.noindex/.../Objects-normal/<arch>/*.o
    out_dir = archive.parent.parent.parent  # .../<plugin>/out
    candidates = sorted(out_dir.glob("Intermediates.noindex/**/Objects-normal/**/*.o"))
    return [p for p in candidates if p.is_file()]


def symbol_state(archive: Path) -> tuple[int, int]:
    """(global init_plugin symbols, local init_plugin symbols)."""
    try:
        out = subprocess.run(
            ["nm", str(archive)], capture_output=True, text=True, check=False
        ).stdout
    except OSError:
        return (0, 0)
    glob = local = 0
    for line in out.splitlines():
        parts = line.split()
        if len(parts) < 3 or "init_plugin" not in parts[-1]:
            continue
        if parts[-2] == "T":
            glob += 1
        elif parts[-2] == "t":
            local += 1
    return (glob, local)


def rearchive(archive: Path, objects: list[Path], arch: str) -> bool:
    """Replace the archive with one built from the given objects."""
    if not objects:
        return False
    archive.unlink(missing_ok=True)
    cmd = ["ar", "rcs", archive.name, *[str(o.resolve()) for o in objects]]
    res = subprocess.run(cmd, cwd=archive.parent, capture_output=True, text=True, check=False)
    if res.returncode != 0:
        print(f"  ar failed for {archive.name}: {res.stderr.strip()[:200]}", file=sys.stderr)
        return False
    return True


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--target-dir", default="src-tauri/target-ios")
    ap.add_argument("--check", action="store_true", help="only report, exit 1 if local symbols remain")
    args = ap.parse_args()

    root = Path(args.target_dir)
    if not root.is_dir():
        print(f"no target dir at {root}", file=sys.stderr)
        return 2

    archives = [
        p
        for p in root.rglob("out/Products/*/lib*.a")
        if "tauri-plugin" in str(p) or "swift-rs" in str(p)
    ]
    if not archives:
        print(f"no plugin archives under {root}")
        return 0

    fixed = broken = 0
    for archive in sorted(archives):
        arch = "arm64" if "iphoneos" in str(archive) else "x86_64"
        glob, local = symbol_state(archive)
        label = f"{archive.parent.parent.parent.name}/{archive.parent.name}"

        if local == 0 and glob > 0:
            print(f"ok      {label} (global={glob})")
            continue
        if local == 0 and glob == 0:
            print(f"skip    {label} (no init_plugin symbols)")
            continue

        print(f"LOCAL   {label} (global={glob} local={local})")
        broken += 1
        if args.check:
            continue

        objs = objects_for(archive)
        if not objs:
            print("  no per-file objects found; cannot repair", file=sys.stderr)
            continue
        if rearchive(archive, objs, arch):
            g2, l2 = symbol_state(archive)
            if l2 == 0:
                print(f"  repaired from {len(objs)} objects (global now {g2})")
                fixed += 1
            else:
                print(f"  still {l2} local symbols after re-archive", file=sys.stderr)

    print(f"\narchives={len(archives)} repaired={fixed} still-local={broken - fixed}")
    if args.check and broken:
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
