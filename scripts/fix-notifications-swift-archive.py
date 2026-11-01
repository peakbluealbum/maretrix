#!/usr/bin/env python3
"""Patch tauri-plugin-notifications' build.rs to re-archive its Swift static lib.

Why: on Xcode 27 / Swift 6.x, `swift build -c release` produces
`out/Products/Release/libtauri-plugin-notifications.a` containing a single
merged whole-module object in which the swift-bridge C symbols
(`___swift_bridge__$NotificationPlugin$*`) are LOCAL (`t`) instead of GLOBAL
(`T`). Rust's linker only resolves against global symbols, so the final
`maretrix` link fails with "symbol(s) not found for architecture arm64".

The per-file objects in `Intermediates.noindex/**/Objects-normal/<arch>/*.o`
still carry the symbols as global. Re-archiving those into the product .a
fixes the link.

This script patches the *cargo git checkout* on this machine (the crate is a
git dependency pinned in Cargo.lock, so the checkout is cached and reused).
Re-run after a `cargo clean`/cache eviction or after Cargo.lock rev changes.

Idempotent: inserts a marked block once and exits 0 on later runs.
"""

from __future__ import annotations

import glob
import os
import sys

MARKER = "// PATCHED-BY-sable-dws: re-archive swift static lib"
REV = "92c96b300517c49024a48aaff863338e3bd63616"

CALL_SITE = "            compile_swift();\n"
CALL_REPLACEMENT = (
    "            compile_swift();\n"
    "            rearchive_swift_static_lib();\n"
)

FUNC = r'''
// PATCHED-BY-sable-dws: re-archive swift static lib
//
// Swift 6.x's SwiftPM emits a merged object whose swift-bridge C symbols are
// local (`t`) rather than global (`T`), so rustc's linker cannot resolve them.
// Rebuild the .a from the per-file objects, which still export them globally.
#[cfg(target_os = "macos")]
fn rearchive_swift_static_lib() {
    let products = swift_build_dir().join("out/Products/Release");
    let archive = products.join("libtauri-plugin-notifications.a");
    let arch = swift_arch();
    let obj_dir = swift_build_dir().join(format!(
        "out/Intermediates.noindex/tauri-plugin-notifications.build/Release/\
         tauri-plugin-notifications-t.build/Objects-normal/{arch}"
    ));

    if !obj_dir.is_dir() {
        return;
    }

    let mut objs: Vec<_> = std::fs::read_dir(&obj_dir)
        .expect("read swift object dir")
        .filter_map(|e| e.ok())
        .map(|e| e.path())
        .filter(|p| p.extension().map(|x| x == "o").unwrap_or(false))
        .collect();
    objs.sort();
    if objs.is_empty() {
        return;
    }

    let _ = std::fs::remove_file(&archive);

    let mut cmd = Command::new("ar");
    cmd.current_dir(&products).args(["rcs", "libtauri-plugin-notifications.a"]);
    for o in &objs {
        cmd.arg(o);
    }
    let out = cmd.output().expect("run ar to rebuild swift archive");
    assert!(
        out.status.success(),
        "ar failed rebuilding swift archive: {}",
        String::from_utf8_lossy(&out.stderr)
    );
}
'''


def find_build_rs() -> str | None:
    # The checkout directory is named with cargo's short rev (first 7 chars).
    pattern = os.path.expanduser(
        "~/.cargo/git/checkouts/tauri-plugin-notifications-*/" + REV[:7] + "/build.rs"
    )
    hits = sorted(glob.glob(pattern))
    return hits[0] if hits else None


def main() -> int:
    path = find_build_rs()
    if path is None:
        print("no checkout found (looked for %s)" % REV, file=sys.stderr)
        return 2

    src = open(path, encoding="utf-8").read()
    if MARKER in src:
        print("already patched: %s" % path)
        return 0

    if CALL_SITE not in src:
        print("call site not found in %s" % path, file=sys.stderr)
        return 3

    patched = src.replace(CALL_SITE, CALL_REPLACEMENT, 1) + FUNC
    open(path, "w", encoding="utf-8").write(patched)
    print("patched: %s" % path)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
