#!/usr/bin/env python3
"""Build the Windows icon from the brand source.

The shipped `icon.ico` used to be a 100%-opaque navy tile carrying the old red mark, so Windows
showed a solid square where every other platform shows the glyph. This rebuilds it from the current
ember artwork, which is already transparent outside the squircle — "transparent at rest" — and keeps
the full size ladder Windows picks from.

    python3 scripts/icons/build-windows-ico.py

Source: src-tauri/icons/source/icon_C_ember_glass_1024.png (checked in; the brand set lives in
~/Pictures/daiwascarlet-logo on the Mac, and this repo is the mirror).
"""

from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parents[2]
SOURCE = ROOT / 'src-tauri/icons/source/icon_C_ember_glass_1024.png'
TARGET = ROOT / 'src-tauri/icons/icon.ico'

# Windows picks from this ladder: 16 for the title bar, 24/32 for the taskbar, 48/64 for Explorer,
# 128 for large tiles, 256 for the "Extra large icons" view and high-DPI.
SIZES = [16, 24, 32, 48, 64, 128, 256]


def main() -> None:
    source = Image.open(SOURCE).convert('RGBA')
    if source.width != source.height:
        raise SystemExit(f'{SOURCE} is not square: {source.size}')

    frames = [source.resize((size, size), Image.LANCZOS) for size in SIZES]
    # The 256 frame is the last one `save` uses for the large entry; `sizes` keeps the rest.
    frames[-1].save(
        TARGET,
        format='ICO',
        sizes=[(size, size) for size in SIZES],
        append_images=frames[:-1],
    )
    print(f'wrote {TARGET.relative_to(ROOT)} ({", ".join(str(s) for s in SIZES)})')


if __name__ == '__main__':
    main()
