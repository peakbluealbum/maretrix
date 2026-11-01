#!/usr/bin/env python3
"""Patch tauri-plugin-notifications' build.rs so its Swift static lib links on Xcode 27.

Two separate breakages, both handled here:

1. **Symbol locality.** `swift build -c release` produces
   `out/Products/Release/libtauri-plugin-notifications.a` from a single merged
   whole-module object in which the swift-bridge C symbols
   (`___swift_bridge__$NotificationPlugin$*`) are LOCAL (`t`) instead of GLOBAL
   (`T`). Rust's linker only resolves global symbols, so the final `maretrix` link
   fails with "symbol(s) not found for architecture arm64". The per-file objects in
   `Intermediates.noindex/**/Objects-normal/<arch>/*.o` still carry them globally,
   so the archive is rebuilt with `ar` from those.

2. **Product path moved.** Xcode 27's SwiftPM writes products under
   `<scratch>/out/Products/<Profile>/`, but the crate tells cargo to link from
   `<scratch>/<triple>-apple-macosx/<profile>/` (`swift_library_static_lib_dir`).
   That directory is no longer created, so cargo fails with
   `could not find native static library 'tauri-plugin-notifications'`. The built
   archive is mirrored into the directory cargo is actually told to search.

This script patches the *cargo git checkout* on this machine (the crate is a git
dependency pinned in Cargo.lock, so the checkout is cached and reused). Re-run after
a `cargo clean`/cache eviction or after a Cargo.lock rev change — a re-fetched
checkout loses the patch silently, and the build then fails at link time.

Idempotent for the current version: a file carrying the current marker is left alone,
a file carrying the older single-fix patch is upgraded.
"""

from __future__ import annotations

import glob
import os
import sys

MARKER = "// PATCHED-BY-maretrix: v2 re-archive + mirror into link-search dir"
LEGACY_MARKER = "// PATCHED-BY-sable-dws: re-archive swift static lib"
REV = "92c96b300517c49024a48aaff863338e3bd63616"

CALL_SITE = "            compile_swift();\n"
CALL_REPLACEMENT = (
    "            compile_swift();\n"
    "            rearchive_swift_static_lib();\n"
)

FUNC = r'''
// PATCHED-BY-maretrix: v2 re-archive + mirror into link-search dir
//
// Swift 6.x's SwiftPM emits a merged object whose swift-bridge C symbols are
// local (`t`) rather than global (`T`), so rustc's linker cannot resolve them.
// Rebuild the .a from the per-file objects, which still export them globally,
// then mirror it into the directory `swift_library_static_lib_dir` advertises to
// cargo — Xcode 27's SwiftPM writes products under `<scratch>/out/Products/` and
// never creates `<scratch>/<triple>/<profile>/`.
#[cfg(target_os = "macos")]
fn rearchive_swift_static_lib() {
    let profile = if is_release_build() { "Release" } else { "Debug" };
    let products = swift_build_dir().join(format!("out/Products/{profile}"));
    let product_archive = products.join("libtauri-plugin-notifications.a");
    let arch = swift_arch();
    let obj_dir = swift_build_dir().join(format!(
        "out/Intermediates.noindex/tauri-plugin-notifications.build/{profile}/\
         tauri-plugin-notifications-t.build/Objects-normal/{arch}"
    ));

    let mut archive: Option<std::path::PathBuf> = None;

    if obj_dir.is_dir() {
        let mut objs: Vec<_> = std::fs::read_dir(&obj_dir)
            .expect("read swift object dir")
            .filter_map(|e| e.ok())
            .map(|e| e.path())
            .filter(|p| p.extension().map(|x| x == "o").unwrap_or(false))
            .collect();
        objs.sort();

        if !objs.is_empty() {
            let _ = std::fs::remove_file(&product_archive);
            let mut cmd = Command::new("ar");
            cmd.current_dir(&products)
                .args(["rcs", "libtauri-plugin-notifications.a"]);
            for o in &objs {
                cmd.arg(o);
            }
            let out = cmd.output().expect("run ar to rebuild swift archive");
            assert!(
                out.status.success(),
                "ar failed rebuilding swift archive: {}",
                String::from_utf8_lossy(&out.stderr)
            );
            archive = Some(product_archive.clone());
        }
    }

    // No per-file objects (nothing to fix) but the product exists: use it as-is.
    let archive = match archive {
        Some(path) => path,
        None if product_archive.is_file() => product_archive.clone(),
        None => {
            println!(
                "cargo:warning=swift archive missing under {}",
                products.display()
            );
            return;
        }
    };

    // Mirror into the path cargo is told to search, or the link step fails with
    // "could not find native static library".
    let link_dir = swift_library_static_lib_dir();
    let link_archive = link_dir.join("libtauri-plugin-notifications.a");
    if archive != link_archive {
        std::fs::create_dir_all(&link_dir).expect("create swift link-search dir");
        std::fs::copy(&archive, &link_archive).expect("mirror swift archive into link-search dir");
    }

    println!("cargo:warning=swift archive ready at {}", link_archive.display());
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
        print("already patched (v2): %s" % path)
        return 0

    if CALL_SITE not in src:
        print("call site not found in %s" % path, file=sys.stderr)
        return 3

    if LEGACY_MARKER in src:
        # The v1 patch appended its function at EOF; drop it and append v2 instead.
        head = src.split(LEGACY_MARKER)[0].rstrip() + "\n"
        open(path, "w", encoding="utf-8").write(head + FUNC)
        print("upgraded v1 -> v2: %s" % path)
        return 0

    patched = src.replace(CALL_SITE, CALL_REPLACEMENT, 1) + FUNC
    open(path, "w", encoding="utf-8").write(patched)
    print("patched: %s" % path)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
