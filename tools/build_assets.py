"""Builds the web-ready assets in assets/web/ from the source files in assets/.

The woven hall-hanging is not an image: it is drawn live in js/shaders.js so it
stays sharp when the camera dives into it.

Run from the project root:  python -I tools/build_assets.py

Everything here is generated, so it is safe to delete assets/web/ and rebuild.
"""
import math
import os

import numpy as np
from PIL import Image, ImageFilter

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
A = lambda *p: os.path.join(ROOT, "assets", *p)
OUT = A("web")
rng = np.random.default_rng(7)


def save_webp(img, path, q=84, alpha_q=None):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    kw = dict(quality=q, method=6)
    if img.mode == "RGBA":
        kw["alpha_quality"] = alpha_q or 90
    img.save(path, "WEBP", **kw)
    print(f"  {os.path.relpath(path, ROOT)}  {img.size[0]}x{img.size[1]}  {os.path.getsize(path)//1024}KB")


def fbm(h, w, octaves=5, base=4, seed=0):
    """Smooth fractal noise in 0..1 made by stacking upscaled random grids."""
    r = np.random.default_rng(seed)
    acc = np.zeros((h, w), np.float32)
    amp, tot = 1.0, 0.0
    for o in range(octaves):
        gh, gw = base * 2**o, base * 2**o * w // h + 1
        g = r.random((gh, gw)).astype(np.float32)
        up = np.array(Image.fromarray((g * 255).astype(np.uint8)).resize((w, h), Image.BICUBIC), np.float32) / 255
        acc += up * amp
        tot += amp
        amp *= 0.5
    return acc / tot


# ---------------------------------------------------------------- helmet
def build_helmet():
    im = Image.open(A("artifacts", "sutton-hoo-helmet-cutout.png")).convert("RGBA")
    im = im.crop(im.getchannel("A").getbbox())
    h = 1600
    im = im.resize((round(im.width * h / im.height), h), Image.LANCZOS)
    save_webp(im, os.path.join(OUT, "hero", "helmet.webp"), q=88)
    small = im.resize((im.width // 2, im.height // 2), Image.LANCZOS)
    save_webp(small, os.path.join(OUT, "hero", "helmet-800.webp"), q=86)


def build_helmet_depth():
    """A height map for the helmet so the stage can bulge and relight it in 3D.
    Shape comes from the cut-out's silhouette (a dome from the distance to its
    edge); a little surface relief comes from the photo's own shading."""
    import cv2
    im = Image.open(A("artifacts", "sutton-hoo-helmet-cutout.png")).convert("RGBA")
    im = im.crop(im.getchannel("A").getbbox())
    im = im.resize((560, 800), Image.LANCZOS)
    a = np.asarray(im).astype(np.float32)
    mask = (a[..., 3] > 100).astype(np.uint8)
    dist = cv2.distanceTransform(mask, cv2.DIST_L2, 5)
    dome = np.sqrt(dist / max(dist.max(), 1))
    dome = cv2.GaussianBlur(dome, (0, 0), 6)
    lum = a[..., :3].mean(2) / 255
    relief = lum - cv2.GaussianBlur(lum, (0, 0), 9)
    holes = np.clip((0.16 - lum) / 0.12, 0, 1) * mask        # eye sockets and shadows sit deeper
    holes = cv2.GaussianBlur(holes, (0, 0), 3)
    depth = np.clip(dome * 0.9 + relief * 0.35 * mask - holes * 0.45, 0, 1)
    out = Image.fromarray((depth * 255).astype(np.uint8), "L")
    os.makedirs(os.path.join(OUT, "hero"), exist_ok=True)
    out.save(os.path.join(OUT, "hero", "helmet-depth.png"), optimize=True)
    print(f"  assets/web/hero/helmet-depth.png  560x800")


def build_warriors():
    im = Image.open(A("artifacts", "sutton-hoo-helmet-dancing-warriors.png")).convert("RGBA")
    im = im.crop(im.getchannel("A").getbbox())
    save_webp(im, os.path.join(OUT, "graphics", "dancing-warriors.webp"), q=90)


# ---------------------------------------------------------------- stone ledge
def build_stone():
    W, H = 2048, 512
    veins = fbm(H, W, octaves=6, base=3, seed=11)
    vein = np.clip(1 - np.abs(np.sin(veins * 9 + np.linspace(0, 4, W)[None, :])) * 3, 0, 1) * 0.05
    mott = fbm(H, W, octaves=5, base=5, seed=5)
    grain = rng.random((H, W)).astype(np.float32)
    lum = 0.93 + 0.07 * (mott - 0.5) - vein + 0.03 * (grain - 0.5)
    base = np.array([238, 232, 219], np.float32)
    im = Image.fromarray(np.clip(base[None, None] * lum[..., None], 0, 255).astype(np.uint8), "RGB")
    save_webp(im, os.path.join(OUT, "hero", "stone.webp"), q=84)


# ---------------------------------------------------------------- scene plates
PLATES = {
    "art/skelton-sailing-to-daneland.jpg": "plates/sailing-to-daneland",
    "art/skelton-grendel.jpg": "plates/grendel",
    "art/bacon-grendel-1910.png": "plates/grendel-bacon",
    "art/bacon-beowulf-and-grendel-1910.png": "plates/beowulf-and-grendel-bacon",
    "art/skelton-wealhtheow-pours-mead.jpg": "plates/wealhtheow",
    "art/skelton-grendels-mother.jpg": "plates/grendels-mother",
    "art/skelton-head-of-grendel.jpg": "plates/head-of-grendel",
    "art/dahl-megalith-grave-in-winter.jpg": "plates/barrow-in-winter",
    "art/skelton-thief-steals-cup.jpg": "plates/thief-steals-cup",
    "art/skelton-beowulf-fights-dragon.jpg": "plates/dragon",
    "art/skelton-wiglaf-and-dying-beowulf.jpg": "plates/wiglaf",
    "art/dicksee-funeral-of-a-viking.jpg": "plates/funeral",
    "art/aivazovsky-ninth-wave.jpg": "plates/ninth-wave",
    "artifacts/sutton-hoo-great-gold-buckle.jpg": "plates/gold-buckle",
    "artifacts/sutton-hoo-purse-lid.jpg": "plates/purse-lid",
    "artifacts/sutton-hoo-shoulder-clasp.jpg": "plates/shoulder-clasp",
    "artifacts/sutton-hoo-sceptre-face.jpg": "plates/sceptre",
    "manuscripts/beowulf-manuscript-first-page.jpg": "plates/manuscript",
    "manuscripts/lindisfarne-carpet-page.jpg": "plates/lindisfarne-carpet",
    "manuscripts/book-of-durrow-carpet-page.jpg": "plates/durrow-carpet",
}


def trim_paper(im, limit=0.05):
    """Crops the white page margin that book scans leave around a colour plate."""
    a = np.asarray(im).astype(np.float32)
    lum = a.mean(2)
    sat = a.max(2) - a.min(2)
    paper = (lum > 205) & (sat < 40)

    def run(frac_along):  # frac_along: 1-D fraction of paper pixels per line, from the edge inward
        n = 0
        while n < len(frac_along) and frac_along[n] > 0.55:
            n += 1
        return n

    h, w = lum.shape
    top = run(paper.mean(1)[: int(h * limit)])
    bottom = run(paper.mean(1)[::-1][: int(h * limit)])
    left = run(paper.mean(0)[: int(w * limit)])
    right = run(paper.mean(0)[::-1][: int(w * limit)])
    pad = max(2, int(min(w, h) * 0.006))  # also shave the soft edge of the margin
    box = (left + pad, top + pad, w - right - pad, h - bottom - pad)
    return im.crop(box), box


def save_sizes(im, dst, q=82):
    for long_side, suffix in ((2000, ""), (1000, "-1000")):
        s = min(1.0, long_side / max(im.size))
        out = im.resize((round(im.width * s), round(im.height * s)), Image.LANCZOS) if s < 1 else im
        save_webp(out, os.path.join(OUT, dst + suffix + ".webp"), q=q)


def build_plates():
    for src, dst in PLATES.items():
        im = Image.open(A(*src.split("/"))).convert("RGB")
        if "skelton" in src:
            im, box = trim_paper(im)
            print(f"  trimmed {src}: {box}")
        save_sizes(im, dst)


def cutout_on_black(src, dst, tol=22):
    """Lifts an object photographed on black: flood-fills the background from the
    corners (so dark detail inside the object is kept) and feathers the edge."""
    import cv2
    im = np.array(Image.open(A(*src.split("/"))).convert("RGB"))
    h, w = im.shape[:2]
    mask = np.zeros((h + 2, w + 2), np.uint8)
    flags = 4 | cv2.FLOODFILL_MASK_ONLY | cv2.FLOODFILL_FIXED_RANGE | (255 << 8)
    for seed in ((0, 0), (w - 1, 0), (0, h - 1), (w - 1, h - 1), (w // 2, 0), (w // 2, h - 1)):
        if im[seed[1], seed[0]].max() < 40:
            cv2.floodFill(im, mask, seed, 0, (tol,) * 3, (tol,) * 3, flags)
    bg = mask[1:-1, 1:-1] > 0
    alpha = (~bg).astype(np.uint8) * 255
    alpha = cv2.erode(alpha, np.ones((3, 3), np.uint8), iterations=1)
    alpha = cv2.GaussianBlur(alpha, (0, 0), 1.1)
    rgba = Image.fromarray(np.dstack([im, alpha]), "RGBA")
    rgba = rgba.crop(rgba.getchannel("A").getbbox())
    save_sizes(rgba, dst, q=88)


FLIGHT_KEYS = ["grendel", "grendel-bacon", "wealhtheow", "head-of-grendel", "barrow-in-winter", "sailing-to-daneland", "beowulf-and-grendel-bacon",
               "thief-steals-cup", "dragon", "wiglaf", "funeral"]


def build_xl():
    """Full-screen versions for the flight: the old book plates are only about
    1000px wide, so they are enlarged with a high-quality filter and sharpened
    once here, which looks much better than letting the GPU stretch them."""
    for key in FLIGHT_KEYS:
        im = Image.open(os.path.join(OUT, "plates", key + ".webp")).convert("RGB")
        target = 2400
        if max(im.size) < target:
            s = target / max(im.size)
            im = im.resize((round(im.width * s), round(im.height * s)), Image.LANCZOS)
            im = im.filter(ImageFilter.UnsharpMask(radius=2.2, percent=70, threshold=2))
        save_webp(im, os.path.join(OUT, "plates", key + "-xl.webp"), q=84)


if __name__ == "__main__":
    print("helmet");   build_helmet(); build_helmet_depth()
    print("warriors"); build_warriors()
    print("stone");    build_stone()
    print("plates");   build_plates()
    print("cutouts");  cutout_on_black("artifacts/sutton-hoo-great-gold-buckle.jpg", "plates/gold-buckle-cutout")
    print("xl");       build_xl()
