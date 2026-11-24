#!/usr/bin/env python3
"""Turn public-domain coin photos (assets-src/mint) into grayscale relief maps
(public/coins/<key>.webp). The app derives normal maps from these at runtime.
Also renders original house-coin and text-only dollar-obverse reliefs.
Run: python3 tools/build_textures.py"""
import json, math, os
import numpy as np
from PIL import Image, ImageDraw, ImageFont, ImageFilter
from scipy import ndimage

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, 'assets-src', 'mint')
OUT = os.path.join(ROOT, 'public', 'coins')
SIZE = 768
os.makedirs(OUT, exist_ok=True)

def coin_mask_bbox(im):
    a = np.asarray(im.convert('RGBA')).astype(np.float32)
    if a[..., 3].min() < 250:
        m = a[..., 3] > 128
    else:
        rgb = a[..., :3]
        corners = np.stack([rgb[0, 0], rgb[0, -1], rgb[-1, 0], rgb[-1, -1]]).mean(0)
        m = np.abs(rgb - corners).sum(-1) > 45
        m = ndimage.binary_opening(m, iterations=3)
    lab, n = ndimage.label(m)
    if n > 1:
        sizes = ndimage.sum(m, lab, range(1, n + 1))
        m = lab == (1 + int(np.argmax(sizes)))
    m = ndimage.binary_fill_holes(m)
    ys, xs = np.where(m)
    return xs.min(), ys.min(), xs.max(), ys.max()

def relief_from_photo(path):
    im = Image.open(path)
    x0, y0, x1, y1 = coin_mask_bbox(im)
    cx, cy = (x0 + x1) / 2, (y0 + y1) / 2
    r = max(x1 - x0, y1 - y0) / 2
    im = im.convert('RGBA')
    bg = Image.new('RGBA', im.size, (0, 0, 0, 255)); bg.alpha_composite(im)
    crop = bg.crop((int(cx - r), int(cy - r), int(cx + r), int(cy + r))).resize((SIZE, SIZE), Image.LANCZOS)
    g = np.asarray(crop.convert('L')).astype(np.float32) / 255.0
    # remove low-frequency toning / lighting, keep the design
    low = ndimage.gaussian_filter(g, SIZE / 24)
    hp = g - 0.75 * low
    hp = ndimage.gaussian_filter(hp, 0.6)
    yy, xx = np.mgrid[0:SIZE, 0:SIZE]
    rr = np.hypot(xx - SIZE / 2 + .5, yy - SIZE / 2 + .5) / (SIZE / 2)
    inside = rr < 0.985
    lo, hi = np.percentile(hp[inside], [2, 99.5])
    h = np.clip((hp - lo) / (hi - lo), 0, 1)
    # keep a raised rim ring, fade outside
    rim = np.clip((rr - 0.90) / 0.04, 0, 1) * np.clip((0.99 - rr) / 0.02, 0, 1)
    h = np.maximum(h * (rr < 0.93), rim * 0.85)
    h[rr >= 0.995] = 0
    return Image.fromarray((h * 255).astype(np.uint8), 'L')

def font(size, bold=True):
    for p in ['/usr/share/fonts/truetype/dejavu/DejaVuSerif-Bold.ttf']:
        if os.path.exists(p):
            return ImageFont.truetype(p, size)
    return ImageFont.load_default()

def arc_text(img, text, radius, size, top=True, spread=None):
    d = ImageDraw.Draw(img)
    f = font(size)
    widths = [d.textlength(c, font=f) for c in text]
    total = sum(widths) * 1.08
    ang_total = total / radius
    a = -math.pi / 2 - ang_total / 2 if top else math.pi / 2 + ang_total / 2
    c = SIZE / 2
    for ch, w in zip(text, widths):
        step = w * 1.08 / radius
        mid = a + step / 2 if top else a - step / 2
        tile = Image.new('L', (size * 2, size * 2), 0)
        ImageDraw.Draw(tile).text((size, size), ch, font=f, fill=255, anchor='mm')
        rot = -math.degrees(mid) - 90 if top else -math.degrees(mid) + 90
        tile = tile.rotate(rot, resample=Image.BICUBIC)
        px, py = c + radius * math.cos(mid), c + radius * math.sin(mid)
        img.paste(255, (int(px - size), int(py - size)), tile)
        a = a + step if top else a - step

def finish(img, beads=True):
    a = np.asarray(img).astype(np.float32) / 255
    yy, xx = np.mgrid[0:SIZE, 0:SIZE]
    rr = np.hypot(xx - SIZE / 2 + .5, yy - SIZE / 2 + .5) / (SIZE / 2)
    if beads:
        ang = np.arctan2(yy - SIZE / 2, xx - SIZE / 2)
        bead = (np.cos(ang * 120) > 0.2) * (np.abs(rr - 0.895) < 0.012)
        a = np.maximum(a, bead * 0.6)
    a = ndimage.gaussian_filter(a, 1.4) * 0.65 + ndimage.gaussian_filter(a, 3.5) * 0.35
    rim = np.clip((rr - 0.92) / 0.03, 0, 1) * np.clip((0.99 - rr) / 0.02, 0, 1)
    a = np.maximum(a * (rr < 0.92), rim * 0.85)
    a[rr >= 0.995] = 0
    return Image.fromarray((np.clip(a, 0, 1) * 255).astype(np.uint8), 'L')

def house(side):
    img = Image.new('L', (SIZE, SIZE), 0)
    d = ImageDraw.Draw(img)
    c = SIZE / 2
    arc_text(img, 'HEADS OR TAILS', 300, 54, top=True)
    if side == 'obv':
        # original emblem: a radiant sun with a face-less disc
        for i in range(24):
            t = i / 24 * 2 * math.pi
            r0, r1 = 95, 200 if i % 2 == 0 else 160
            w = 0.07
            pts = [(c + r0 * math.cos(t - w), c + r0 * math.sin(t - w)), (c + r1 * math.cos(t), c + r1 * math.sin(t)), (c + r0 * math.cos(t + w), c + r0 * math.sin(t + w))]
            d.polygon(pts, fill=150)
        d.ellipse((c - 95, c - 95, c + 95, c + 95), fill=200)
        d.ellipse((c - 70, c - 70, c + 70, c + 70), fill=235)
        d.text((c, c), 'H', font=font(96), fill=120, anchor='mm')
        arc_text(img, '• RADLS •', 300, 40, top=False)
    else:
        # original emblem: crossed laurel ring with a big T
        for i in range(36):
            t = i / 36 * 2 * math.pi
            px, py = c + 175 * math.cos(t), c + 175 * math.sin(t)
            d.ellipse((px - 18, py - 9, px + 18, py + 9), fill=170)
        d.ellipse((c - 140, c - 140, c + 140, c + 140), fill=60)
        d.text((c, c - 6), 'T', font=font(170), fill=230, anchor='mm')
        arc_text(img, 'TAILS • 2026', 300, 40, top=False)
    return finish(img)

def dollar_obv():
    """Text-only stand-in: the Sacagawea obverse portrait (Goodacre, 2000) is not
    confirmed public domain, so v1 renders only the legally generic legends."""
    img = Image.new('L', (SIZE, SIZE), 0)
    d = ImageDraw.Draw(img)
    c = SIZE / 2
    arc_text(img, 'LIBERTY', 300, 64, top=True)
    d.text((c, c - 40), 'IN GOD', font=font(58), fill=210, anchor='mm')
    d.text((c, c + 30), 'WE TRUST', font=font(58), fill=210, anchor='mm')
    arc_text(img, '2000', 300, 60, top=False)
    d.ellipse((c - 205, c - 205, c + 205, c + 205), outline=120, width=6)
    return finish(img, beads=False)

def main():
    srcs = json.load(open(os.path.join(SRC, 'sources.json')))
    manifest = {}
    for s in srcs:
        im = relief_from_photo(os.path.join(SRC, s['file']))
        out = os.path.join(OUT, s['key'] + '.webp')
        im.save(out, 'WEBP', quality=82, method=6)
        manifest[s['key']] = os.path.getsize(out)
    for key, im in [('house_obv', house('obv')), ('house_rev', house('rev')), ('dollar_obv', dollar_obv())]:
        out = os.path.join(OUT, key + '.webp')
        im.save(out, 'WEBP', quality=82, method=6)
        manifest[key] = os.path.getsize(out)
    for k, v in sorted(manifest.items()):
        print(f'{k:12s} {v/1024:7.1f} KB')
    print('total', sum(manifest.values()) / 1024, 'KB')

if __name__ == '__main__':
    main()
