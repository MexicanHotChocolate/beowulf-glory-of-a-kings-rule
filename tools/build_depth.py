"""Depth maps for the flight paintings.

Runs Depth Anything V2 Small (ONNX, from huggingface.co/onnx-community/depth-anything-v2-small)
once over each painting and writes assets/web/depth/<key>.png: white = near, black = far.
The site uses these to move the paintings in layers (figures slide over backgrounds).

    python -I tools/build_depth.py <path to model.onnx>

The model file is not part of the site and does not need to be shipped.
"""
import os
import sys

import cv2
import numpy as np
import onnxruntime as ort
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PLATES = os.path.join(ROOT, "assets", "web", "plates")
OUT = os.path.join(ROOT, "assets", "web", "depth")
KEYS = ["grendel", "grendel-bacon", "wealhtheow", "head-of-grendel", "barrow-in-winter", "sailing-to-daneland", "beowulf-and-grendel-bacon",
        "thief-steals-cup", "dragon", "wiglaf", "funeral"]
MEAN = np.array([0.485, 0.456, 0.406], np.float32)
STD = np.array([0.229, 0.224, 0.225], np.float32)


def run(sess, img):
    w, h = img.size
    short = 700
    s = short / min(w, h)
    tw, th = int(round(w * s / 14)) * 14, int(round(h * s / 14)) * 14
    x = np.asarray(img.convert("RGB").resize((tw, th), Image.BICUBIC), np.float32) / 255.0
    x = ((x - MEAN) / STD).transpose(2, 0, 1)[None]
    name = sess.get_inputs()[0].name
    d = sess.run(None, {name: x})[0].reshape(th, tw)
    lo, hi = np.percentile(d, 1), np.percentile(d, 99.5)
    d = np.clip((d - lo) / (hi - lo), 0, 1)
    # Grow near things a little before softening, so a figure's edge moves with the figure
    # instead of smearing into the background behind it.
    d = cv2.dilate(d, np.ones((5, 5), np.uint8))
    d = cv2.GaussianBlur(d, (0, 0), 2.2)
    return d


def main():
    model = sys.argv[1]
    os.makedirs(OUT, exist_ok=True)
    sess = ort.InferenceSession(model, providers=["CPUExecutionProvider"])
    for key in KEYS:
        src = os.path.join(PLATES, key + ".webp")
        img = Image.open(src)
        d = run(sess, img)
        w, h = img.size
        s = 768 / max(w, h)
        out = cv2.resize(d, (int(w * s), int(h * s)), interpolation=cv2.INTER_AREA)
        Image.fromarray((out * 255).astype(np.uint8)).save(os.path.join(OUT, key + ".png"), optimize=True)
        print(key, out.shape)


if __name__ == "__main__":
    main()
