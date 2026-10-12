#!/usr/bin/env python3
"""Merge untracked config.secrets.json into config.json, before building.

config.json is committed with EMPTY provider keys, so the published fork carries no
credentials. The real keys live in config.secrets.json — gitignored, mode 600, kept
only on the build host — and are merged in here at build time.

A fresh clone without config.secrets.json still builds; GIF search is simply disabled
until the operator supplies their own keys.

Usage:
    python3 scripts/apply-config-secrets.py
"""
from __future__ import annotations

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


def main() -> int:
    if not TARGET.is_file():
        print(f"missing {TARGET.name} — copy config.example.json to config.json", file=sys.stderr)
        return 1
    if not SECRETS.is_file():
        print("no config.secrets.json; building with placeholder keys (GIF search disabled)")
        return 0
    cfg = json.loads(TARGET.read_text())
    merge(cfg, json.loads(SECRETS.read_text()))
    TARGET.write_text(json.dumps(cfg, indent=2) + "\n")
    print("merged config.secrets.json into config.json")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
