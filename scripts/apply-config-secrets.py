#!/usr/bin/env python3
"""Merge untracked config.secrets.json into config.json, before building.

config.json is committed with EMPTY provider keys, so the published fork carries no
credentials. The real keys live in config.secrets.json — gitignored, mode 600, kept
only on the build host — and are merged in here at build time.

A fresh clone without config.secrets.json still builds; GIF search is simply disabled
until the operator supplies their own keys.

Usage:
    python3 scripts/apply-config-secrets.py
    python3 scripts/apply-config-secrets.py --out /tmp/build/config.json \
        --secrets ~/.config/maretrix/config.secrets.json

`--out` exists so a local build can merge into a scratch file instead of mutating the
tracked `config.json` (see scripts/build-macos-local.sh). CI keeps the default, where the
checkout is disposable.
"""
from __future__ import annotations

import argparse
import json
import pathlib
import sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
TARGET = ROOT / "config.json"
SECRETS = ROOT / "config.secrets.json"


def merge(dst: dict, src: dict) -> None:
    for key, value in src.items():
        if isinstance(value, dict) and isinstance(dst.get(key), dict):
            merge(dst[key], value)
        else:
            dst[key] = value


def parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Merge config.secrets.json into config.json")
    parser.add_argument(
        "--out",
        type=pathlib.Path,
        default=TARGET,
        help="write the merged config here (default: repo config.json)",
    )
    parser.add_argument(
        "--secrets",
        type=pathlib.Path,
        default=SECRETS,
        help="secrets file to merge (default: repo config.secrets.json)",
    )
    return parser.parse_args(argv)


def main(argv: list[str] | None = None) -> int:
    args = parse_args(argv)
    target: pathlib.Path = args.out
    secrets: pathlib.Path = args.secrets

    if not TARGET.is_file():
        print(f"missing {TARGET.name} — copy config.example.json to config.json", file=sys.stderr)
        return 1
    if not secrets.is_file():
        print(f"no {secrets}; building with placeholder keys (GIF search disabled)")
        if target != TARGET:
            target.write_text(TARGET.read_text())
        return 0
    cfg = json.loads(TARGET.read_text())
    merge(cfg, json.loads(secrets.read_text()))
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(json.dumps(cfg, indent=2) + "\n")
    print(f"merged {secrets} into {target}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
