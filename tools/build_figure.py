"""Beowulf as a figure: cut out of J. H. F. Bacon's 1910 engraving.

The flight's first stop shows him standing in 3D in front of the ship that brought
him to Denmark. This cuts him out (a hand-traced outline, tightened by the depth
map) from the head down to the thigh, with his sword, and writes:

    assets/web/figures/beowulf.webp        grey engraving + alpha
    assets/web/figures/beowulf-depth.png   relief (white = near)

    python -I tools/build_figure.py <path to model.onnx>
"""
import os
import sys

import cv2
import numpy as np
import onnxruntime as ort
from PIL import Image, ImageDraw, ImageFilter

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from build_depth import run  # noqa: E402

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, "assets", "web", "plates", "beowulf-and-grendel-bacon-xl.webp")
OUT = os.path.join(ROOT, "assets", "web", "figures")

# Outline (0..1 across, 0..1 down), traced on a grid over the engraving: crown, his
# right arm down to the hand on Grendel's head, a level cut across the thighs, then
# back up his left side round the sword.
OUTLINE = [
    (0.43, 0.24), (0.47, 0.19), (0.53, 0.155), (0.585, 0.165), (0.625, 0.215), (0.645, 0.27), (0.625, 0.315),
    (0.6, 0.345), (0.66, 0.41), (0.705, 0.48), (0.735, 0.55), (0.775, 0.6), (0.825, 0.655), (0.79, 0.695),
    (0.725, 0.67), (0.695, 0.6), (0.65, 0.52), (0.605, 0.47), (0.585, 0.52), (0.56, 0.62), (0.53, 0.7),
    (0.25, 0.7), (0.205, 0.6), (0.175, 0.535), (0.152, 0.56), (0.128, 0.88), (0.075, 0.895), (0.098, 0.6),
    (0.098, 0.48), (0.128, 0.405), (0.172, 0.395), (0.205, 0.325), (0.275, 0.255), (0.36, 0.245),
]
CROP = (0.05, 0.13, 0.86, 0.92)


def main():
    model = sys.argv[1]
    os.makedirs(OUT, exist_ok=True)
    img = Image.open(SRC).convert("RGB")
    w, h = img.size
    sess = ort.InferenceSession(model, providers=["CPUExecutionProvider"])
    depth = run(sess, img)                                   # 0..1, white = near
    depth = cv2.resize(depth, (w, h), interpolation=cv2.INTER_LINEAR)

    poly = Image.new("L", (w, h), 0)
    ImageDraw.Draw(poly).polygon([(x * w, y * h) for x, y in OUTLINE], fill=255)
    poly = np.asarray(poly.filter(ImageFilter.GaussianBlur(w * 0.004)), np.float32) / 255
    near = np.clip((depth - 0.3) / 0.1, 0, 1)              # drop what the depth map calls background
    near = cv2.GaussianBlur(near, (0, 0), w * 0.003)
    alpha = poly * near
    # Fade out across the thighs instead of a hard cut.
    ys = (np.arange(h, dtype=np.float32) / h)[:, None]
    alpha *= np.clip((0.7 - ys) / 0.08, 0, 1)
    # The sword blade runs on below the cut, so it gets its own shape.
    blade = Image.new("L", (w, h), 0)
    ImageDraw.Draw(blade).polygon(
        [(0.152 * w, 0.54 * h), (0.128 * w, 0.88 * h), (0.075 * w, 0.895 * h), (0.098 * w, 0.6 * h), (0.11 * w, 0.54 * h)], fill=255)
    sword = np.asarray(blade.filter(ImageFilter.GaussianBlur(w * 0.002)), np.float32) / 255
    alpha = np.maximum(alpha, sword * np.clip((0.9 - ys) / 0.05, 0, 1))

    x0, y0, x1, y1 = (int(CROP[0] * w), int(CROP[1] * h), int(CROP[2] * w), int(CROP[3] * h))
    grey = np.asarray(img.convert("L"), np.float32)
    rgba = np.dstack([grey, grey, grey, alpha * 255]).astype(np.uint8)[y0:y1, x0:x1]
    Image.fromarray(rgba, "RGBA").save(os.path.join(OUT, "beowulf.webp"), quality=90)
    d = (np.clip(depth, 0, 1) * 255).astype(np.uint8)[y0:y1, x0:x1]
    Image.fromarray(cv2.resize(d, ((x1 - x0) // 2, (y1 - y0) // 2), interpolation=cv2.INTER_AREA)).save(
        os.path.join(OUT, "beowulf-depth.png"), optimize=True)
    print("figure", x1 - x0, y1 - y0)


if __name__ == "__main__":
    main()
