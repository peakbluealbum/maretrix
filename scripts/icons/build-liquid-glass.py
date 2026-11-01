#!/usr/bin/env python3
"""Build the Maretrix Liquid Glass icon set from the ember-glass master.

Source of truth: ~/Downloads/daiwascarlet-logo/icon_C_ember_glass_1024.png
(variant C, the brand mark chosen for rc2), plus the layered greyscale matte
`glyph_matte_2048.png` that variant C was composed from.

Why the layers exist
--------------------
macOS 26+ does not draw a flat `.icns` as an app icon: it renders the icon from a
compiled `Assets.car` produced from an Icon Composer `.icon` bundle, and it applies
the Liquid Glass material to the *document*, not to the bitmap. A single opaque
raster that already contains the background, the shadow and the glyph is treated as
a sticker: no wallpaper tint through the field, no specular on the glyph, and in the
dock it reads muted next to real glass icons.

So the document is split the way Icon Composer expects:
  * the field is an Icon Composer *fill* (a two-stop gradient the system renders),
  * the scarlet bloom and the cool sheen are their own transparent layer,
  * the glyph is its own transparent layer with `glass: true` + `refractivity`,
    so the system lights it, refracts the field behind its edges and draws its
    shadow, instead of those being baked in.

Deliberately NOT done:
  * No squircle is baked. The `.icon` system applies the mask; art that already has
    corners cut away reads as a smaller icon inset inside the system squircle --
    the jail look this set exists to avoid.
  * `translucency` stays low (0.18). Higher values are what make a glass icon read
    as grey mush on a dark dock.

Outputs
-------
  src-tauri/icons/AppIcon.icon/icon.json
  src-tauri/icons/AppIcon.icon/Assets/{bloom,glyph}.png     (layers the system composes)
  src-tauri/icons/AppIcon.icon/Assets/AppIcon-1024.png      (flat composite, reference)
  src-tauri/icons/AppIcon-1024-fullbleed.png
  public/res/logo-maskable/logo-maskable-{n}.png
  public/res/logo/logo-{n}.png
  public/favicon.png

Compiling the .icon to Assets.car needs actool from a full Xcode install:
  scripts/icons/compile-assets-car.sh
"""

from __future__ import annotations

import json
import shutil
from pathlib import Path

from PIL import Image, ImageChops, ImageDraw, ImageFilter

REPO = Path(__file__).resolve().parents[2]
SRC = Path.home() / "Downloads" / "daiwascarlet-logo" / "icon_C_ember_glass_1024.png"
GLYPH_MATTE = Path.home() / "Downloads" / "daiwascarlet-logo" / "glyph_matte_2048.png"
ICON_DIR = REPO / "src-tauri" / "icons" / "AppIcon.icon"
# The web tree keeps generated art under public/res/ - scripts/icons/replace.js
# writes the same paths, and the deployed site serves public/res/* at /public/*.
PWA_DIR = REPO / "public" / "res" / "logo-maskable"
CIRCULAR_DIR = REPO / "public" / "res" / "logo"

MASKABLE_SIZES = (36, 48, 57, 60, 72, 76, 96, 114, 120, 144, 152, 167, 180, 192, 256, 384, 512)
CIRCULAR_SIZES = (36, 48, 72, 96, 144, 192, 256, 384, 512)

SCARLET = (200, 16, 46)        # brand #C8102E
SCARLET_HOT = (255, 45, 70)    # lifted, so the bloom reads as lit glass
FIELD_TOP = (18, 24, 40)       # #121828, matches the master's field at the top
FIELD_BOTTOM = (3, 5, 10)      # #03050A
SHADOW = (0, 0, 0)


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


def vgrad(size: int, stops: list[tuple[float, tuple[int, int, int]]]) -> Image.Image:
    col = Image.new("RGB", (1, size))
    p = col.load()
    stops = sorted(stops)
    for y in range(size):
        t = y / (size - 1)
        for i in range(len(stops) - 1):
            p0, c0 = stops[i]
            p1, c1 = stops[i + 1]
            if p0 <= t <= p1:
                f = 0 if p1 == p0 else (t - p0) / (p1 - p0)
                p[0, y] = tuple(int(round(c0[k] + (c1[k] - c0[k]) * f)) for k in range(3))
                break
        else:
            p[0, y] = stops[-1][1]
    return col.resize((size, size), Image.BILINEAR)


def bloom(size: int, cx: int, cy: int, rad: int, color: tuple[int, int, int], opacity: float) -> Image.Image:
    """Soft radial light pool, returned as RGBA."""
    layer = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    d = ImageDraw.Draw(layer)
    d.ellipse([cx - rad, cy - rad, cx + rad, cy + rad], fill=color + (int(255 * opacity),))
    return layer.filter(ImageFilter.GaussianBlur(rad * 0.55))


def bloom_layer(size: int) -> Image.Image:
    """The ember glow + cool sheen, transparent, as its own Icon Composer layer."""
    out = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    out.alpha_composite(bloom(size, int(size * 0.72), int(size * 0.80), int(size * 0.52), SCARLET_HOT, 0.40))
    out.alpha_composite(bloom(size, int(size * 0.12), int(size * 0.04), int(size * 0.34), (90, 130, 200), 0.22))
    return out


def glyph_layer(size: int) -> Image.Image:
    """The glyph alone: brand ramp fill, alpha from the matte, no shadow, no bake."""
    matte = Image.open(GLYPH_MATTE).convert("RGBA").getchannel("A")
    alpha = matte.crop(matte.getbbox())
    gh, gw = alpha.size
    target_h = int(size * 0.615)
    target_w = int(target_h * gw / gh)
    g = alpha.resize((target_w, target_h), Image.LANCZOS)
    gx = (size - target_w) // 2
    gy = (size - target_h) // 2 + int(size * 0.012)

    ramp = vgrad(size, [(0.0, (255, 130, 145)), (0.40, (255, 55, 80)), (1.0, SCARLET)])
    out = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    patch = ramp.crop((gx, gy, gx + target_w, gy + target_h)).convert("RGBA")
    out.paste(patch, (gx, gy), g)
    return out


def _srgb(rgb: tuple[int, int, int]) -> str:
    return "srgb:{:.5f},{:.5f},{:.5f},1.00000".format(rgb[0] / 255, rgb[1] / 255, rgb[2] / 255)


def icon_document() -> dict:
    """Icon Composer 2 document: system-rendered field + glass glyph.

    `features` is a hard gate: refractivity* requires "refractivity" and
    specular-highlight-placement* requires "specular-location". Icon Composer
    refuses a document that lists a feature it does not know.
    """
    gradient = {
        "linear-gradient": [_srgb(FIELD_TOP), _srgb(FIELD_BOTTOM)],
        "orientation": {"start": {"x": 0.15, "y": 0.0}, "stop": {"x": 0.85, "y": 1.0}},
    }
    gradient_dark = {
        "linear-gradient": [_srgb((16, 21, 35)), _srgb((2, 3, 6))],
        "orientation": {"start": {"x": 0.15, "y": 0.0}, "stop": {"x": 0.85, "y": 1.0}},
    }
    return {
        "features": ["refractivity", "specular-location"],
        "fill-specializations": [
            {"value": gradient},
            {"appearance": "dark", "value": gradient_dark},
        ],
        "groups": [
            {
                "name": "Ember Bloom",
                "layers": [{"name": "bloom", "image-name": "bloom.png"}],
                "lighting": "individual",
                "shadow": {"kind": "none", "opacity": 0.5},
                "specular": False,
                "translucency": {"enabled": False, "value": 0.0},
            },
            {
                "name": "Glyph",
                "layers": [{"name": "glyph", "image-name": "glyph.png", "glass": True}],
                "lighting": "individual",
                "shadow": {"kind": "neutral", "opacity": 0.55},
                "specular": True,
                "specular-highlight-placement": "automatic",
                "refractivity": {"enabled": True, "strength": 0.60, "depth": 0.50},
                "translucency": {"enabled": True, "value": 0.18},
            },
        ],
        "supported-platforms": {"squares": ["macOS"]},
    }


def main() -> None:
    if not SRC.exists():
        raise SystemExit(f"master art missing: {SRC}")
    if not GLYPH_MATTE.exists():
        raise SystemExit(f"glyph matte missing: {GLYPH_MATTE}")

    master = Image.open(SRC).convert("RGBA")
    art, _edge = fullbleed(master, 1024)

    # actool resolves `image-name` relative to AppIcon.icon/Assets/. A PNG at the
    # bundle root resolves to nil and actool aborts with
    # `NSPlaceholderArray initWithObjects:count: attempt to insert nil object`.
    ICON_ASSETS = ICON_DIR / "Assets"
    ICON_ASSETS.mkdir(parents=True, exist_ok=True)
    ICON_DIR.mkdir(parents=True, exist_ok=True)

    bloom_layer(1024).save(ICON_ASSETS / "bloom.png", optimize=True)
    glyph_layer(1024).save(ICON_ASSETS / "glyph.png", optimize=True)
    # Flat composite kept as the reference for the web tree and for any tooling
    # that still expects a single 1024 raster inside the bundle.
    art.save(ICON_ASSETS / "AppIcon-1024.png", optimize=True)
    art.save(REPO / "src-tauri" / "icons" / "AppIcon-1024-fullbleed.png", optimize=True)

    (ICON_DIR / "icon.json").write_text(json.dumps(icon_document(), indent=2) + "\n")

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
