#!/usr/bin/env python3
"""Build the Maretrix Liquid Glass icon set from the ember-glass master.

Source of truth: ~/Downloads/daiwascarlet-logo/icon_C_ember_glass_1024.png
(variant C, the brand mark chosen for rc2).

Why this exists
---------------
macOS 26+ does not draw a flat `.icns` as an app icon: it renders the icon
from a compiled `Assets.car` produced from an Icon Composer `.icon` bundle.
A flat icns lands in "icon jail" (small, dim, inside a system squircle).

Two things this script deliberately does NOT do:
  * It does not bake the squircle. The `.icon` system applies the mask. Art
    that already has corners cut away reads as a smaller icon inset inside
    the system squircle -- the jail look we are fixing. So the master is
    cropped to its squircle bounds and scaled to fill the canvas edge to
    edge.
  * It does not set translucency on the layer group. Translucency is what
    makes a glass icon read as grey mush on a dark dock. The OS supplies
    the glass material and specular highlight; the artwork stays opaque.

Outputs
-------
  src-tauri/icons/AppIcon.icon/icon.json
  src-tauri/icons/AppIcon.icon/AppIcon-1024.png
  src-tauri/icons/AppIcon-1024-fullbleed.png   (flat reference / CI input)
  public/logo-maskable/logo-maskable-{512,384,256,192}.png
  public/logo-maskable/apple-touch-icon-180.png
  public/favicon.png (32)

Compiling the .icon to Assets.car requires actool from a full Xcode install
and happens in CI, not here.
"""

from __future__ import annotations

import json
import shutil
from pathlib import Path

from PIL import Image

REPO = Path(__file__).resolve().parents[2]
SRC = Path.home() / "Downloads" / "daiwascarlet-logo" / "icon_C_ember_glass_1024.png"
ICON_DIR = REPO / "src-tauri" / "icons" / "AppIcon.icon"
# The web tree keeps generated art under public/res/ - scripts/icons/replace.js
# writes the same paths, and the deployed site serves public/res/* at /public/*.
PWA_DIR = REPO / "public" / "res" / "logo-maskable"
CIRCULAR_DIR = REPO / "public" / "res" / "logo"

MASKABLE_SIZES = (36, 48, 57, 60, 72, 76, 96, 114, 120, 144, 152, 167, 180, 192, 256, 384, 512)
CIRCULAR_SIZES = (36, 48, 72, 96, 144, 192, 256, 384, 512)

# Brand navy used by the app chrome; also the .icon fill so Tinted/Clear
# variants have a sane base colour.
NAVY = (11, 27, 51, 255)


def squircle_box(im: Image.Image) -> tuple[int, int, int, int]:
    """Bounds of the opaque field, measured through the centre lines."""
    a = im.getchannel("A")
    w, h = im.size
    cy, cx = h // 2, w // 2

    def first_true(values):
        for i, v in enumerate(values):
            if v > 250:
                return i
        return 0

    left = first_true([a.getpixel((x, cy)) for x in range(w)])
    right = w - 1 - first_true([a.getpixel((w - 1 - x, cy)) for x in range(w)])
    top = first_true([a.getpixel((cx, y)) for y in range(h)])
    bottom = h - 1 - first_true([a.getpixel((cx, h - 1 - y)) for y in range(h)])
    return left, top, right + 1, bottom + 1


def fullbleed(im: Image.Image, size: int) -> tuple[Image.Image, tuple[int, int, int, int]]:
    """Crop to the field and scale it edge to edge so the system mask,
    not baked-in corners, defines the icon silhouette.

    The squircle's cut corners land outside the canvas after scaling, so they
    are filled with the artwork's own edge colour. That keeps the layer fully
    opaque and seamless: no flat-fill tint bleeding through at the corners,
    and no reliance on the OS to hide a seam.
    """
    box = squircle_box(im)
    field = im.crop(box).convert("RGBA")
    # Square it off if the measurement is a pixel or two out.
    side = min(field.size)
    field = field.crop((0, 0, side, side))
    art = field.resize((size, size), Image.LANCZOS)
    edge = art.getpixel((size // 2, 2))
    canvas = Image.new("RGBA", (size, size), edge)
    canvas.alpha_composite(art)
    return canvas, edge


def main() -> None:
    if not SRC.exists():
        raise SystemExit(f"master art missing: {SRC}")

    master = Image.open(SRC).convert("RGBA")
    art, edge = fullbleed(master, 1024)

    # actool resolves `image-name` relative to AppIcon.icon/Assets/. A PNG at the
    # bundle root resolves to nil and actool aborts with
    # `NSPlaceholderArray initWithObjects:count: attempt to insert nil object`.
    # Keep the artwork inside Assets/ or the .icon compile fails.
    ICON_ASSETS = ICON_DIR / "Assets"
    ICON_ASSETS.mkdir(parents=True, exist_ok=True)
    ICON_DIR.mkdir(parents=True, exist_ok=True)
    art.save(ICON_ASSETS / "AppIcon-1024.png", optimize=True)
    art.save(REPO / "src-tauri" / "icons" / "AppIcon-1024-fullbleed.png", optimize=True)

    # Icon Composer document. Schema verified against real shipping .icon files
    # (iina, agency-agents): fill-specializations + per-group name/specular/
    # blur-material + squares:[macOS]. The previous hand-written schema used
    # invented keys ("fill" at root, "circles":[watchOS], "squares":"shared"),
    # which made actool resolve a nil item and abort.
    # One opaque layer: the OS draws the glass material and specular rim.
    fill = "srgb:{:.5f},{:.5f},{:.5f},1.00000".format(
        edge[0] / 255, edge[1] / 255, edge[2] / 255
    )
    icon_json = {
        "fill-specializations": [
            {"value": {"solid": fill}},
            {"appearance": "dark", "value": {"solid": fill}},
        ],
        "groups": [
            {
                "blur-material": None,
                "layers": [
                    {
                        "glass": False,
                        "image-name": "AppIcon-1024.png",
                        "name": "Ember Glass",
                        "opacity": 1,
                    }
                ],
                "name": "Ember Glass",
                "shadow": {"kind": "neutral", "opacity": 0.0},
                "specular": False,
                "translucency": {"enabled": False, "value": 0.0},
            }
        ],
        "supported-platforms": {"squares": ["macOS"]},
    }
    (ICON_DIR / "icon.json").write_text(json.dumps(icon_json, indent=2) + "\n")

    # Web / PWA. Maskable icons are full bleed by definition, so the same
    # full-bleed art is correct here. 80% safe zone is respected because the
    # glyph already sits inside ~71% of the field.
    PWA_DIR.mkdir(parents=True, exist_ok=True)
    CIRCULAR_DIR.mkdir(parents=True, exist_ok=True)
    for n in MASKABLE_SIZES:
        art.resize((n, n), Image.LANCZOS).save(PWA_DIR / f"logo-maskable-{n}x{n}.png", optimize=True)
    for n in CIRCULAR_SIZES:
        art.resize((n, n), Image.LANCZOS).save(CIRCULAR_DIR / f"logo-{n}x{n}.png", optimize=True)
    art.resize((512, 512), Image.LANCZOS).save(REPO / "public" / "favicon.png", optimize=True)

    # Keep a copy next to the bundle so CI can diff the compiled result.
    shutil.copy2(ICON_ASSETS / "AppIcon-1024.png", REPO / "src-tauri" / "icons" / "AppIcon-1024.png")

    print(f"icon bundle : {ICON_DIR}")
    for f in sorted(ICON_DIR.iterdir()):
        size = f.stat().st_size if f.is_file() else sum(
            p.stat().st_size for p in f.rglob("*") if p.is_file()
        )
        kind = "" if f.is_file() else "/"
        print(f"  {f.name + kind:24} {size:>8} bytes")
    print("pwa icons   :", ", ".join(sorted(p.name for p in PWA_DIR.glob("*.png"))))


if __name__ == "__main__":
    main()
