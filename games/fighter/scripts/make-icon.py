#!/usr/bin/env python3
"""生成小游戏图标：assets/icon-{144,512,600}.png

主视觉用 gu_bust（奶娃）正面像，背景为放射光斑。
144 尺寸下文字不可读，所以图标里不放任何文字。
"""
import math
import os

import numpy as np
from PIL import Image, ImageDraw, ImageFilter

HERE = os.path.dirname(os.path.abspath(__file__))
ASSETS = os.path.normpath(os.path.join(HERE, '..', 'assets'))
SIZE = 600

# 与 heroes.ts 的 gu（奶娃）主色一致：亮黄 + 深紫背景
BG_CENTER = (74, 24, 96)
BG_EDGE = (14, 6, 22)
RAY_COLOR = (255, 196, 74)
GLOW_COLOR = (255, 168, 48)


def radial_background(n: int) -> Image.Image:
    yy, xx = np.mgrid[0:n, 0:n].astype(np.float32)
    cx = cy = (n - 1) / 2
    d = np.sqrt((xx - cx) ** 2 + (yy - cy) ** 2) / (n * 0.62)
    d = np.clip(d, 0.0, 1.0)[..., None]
    center = np.array(BG_CENTER, dtype=np.float32)
    edge = np.array(BG_EDGE, dtype=np.float32)
    rgb = center * (1 - d) + edge * d
    return Image.fromarray(rgb.astype(np.uint8), 'RGB')


def ray_layer(n: int) -> Image.Image:
    """16 道放射条，模拟格斗游戏「冲击」底。"""
    layer = Image.new('L', (n, n), 0)
    draw = ImageDraw.Draw(layer)
    cx = cy = n / 2
    count = 16
    for i in range(count):
        a = (i / count) * math.tau
        half = math.tau / (count * 4)
        far = n * 1.2
        pts = [
            (cx, cy),
            (cx + math.cos(a - half) * far, cy + math.sin(a - half) * far),
            (cx + math.cos(a + half) * far, cy + math.sin(a + half) * far),
        ]
        draw.polygon(pts, fill=255)
    layer = layer.filter(ImageFilter.GaussianBlur(n * 0.006))
    return layer


def build() -> Image.Image:
    canvas = radial_background(SIZE)

    rays = ray_layer(SIZE)
    ray_rgba = Image.new('RGBA', (SIZE, SIZE), RAY_COLOR + (0,))
    ray_rgba.putalpha(rays.point(lambda v: int(v * 0.20)))
    canvas = Image.alpha_composite(canvas.convert('RGBA'), ray_rgba)

    # 底部暖色光晕，把人物从背景里托出来
    glow = Image.new('RGBA', (SIZE, SIZE), (0, 0, 0, 0))
    gd = ImageDraw.Draw(glow)
    gd.ellipse([SIZE * 0.08, SIZE * 0.24, SIZE * 0.92, SIZE * 1.08], fill=GLOW_COLOR + (78,))
    glow = glow.filter(ImageFilter.GaussianBlur(SIZE * 0.07))
    canvas = Image.alpha_composite(canvas, glow)

    bust = Image.open(os.path.join(ASSETS, 'hero', 'gu_bust.png')).convert('RGBA')
    alpha = np.array(bust)[:, :, 3]
    ys, xs = np.where(alpha > 12)
    bust = bust.crop((xs.min(), ys.min(), xs.max() + 1, ys.max() + 1))

    # 人物占画布 80%，底部对齐，头顶留一点空间给光
    target = int(SIZE * 0.80)
    scale = target / bust.height
    bust = bust.resize((max(1, int(bust.width * scale)), target), Image.LANCZOS)

    # 白色描边：先画一层放大后纯白的剪影，垫在人物下面
    pad = max(2, int(SIZE * 0.012))
    mask = bust.split()[3]
    outline = Image.new('RGBA', (bust.width + pad * 2, bust.height + pad * 2), (0, 0, 0, 0))
    white = Image.new('RGBA', bust.size, (255, 255, 255, 235))
    for dx in range(-pad, pad + 1, max(1, pad // 2)):
        for dy in range(-pad, pad + 1, max(1, pad // 2)):
            outline.paste(white, (pad + dx, pad + dy), mask)
    bust_padded = Image.new('RGBA', outline.size, (0, 0, 0, 0))
    bust_padded.paste(bust, (pad, pad), bust)
    outline = Image.alpha_composite(outline, bust_padded)

    px = (SIZE - outline.width) // 2
    py = SIZE - outline.height - int(SIZE * 0.02)
    canvas.alpha_composite(outline, (px, py))

    # 顶部压暗，让 144 缩略时轮廓更清楚
    vignette = Image.new('L', (SIZE, SIZE), 0)
    vd = ImageDraw.Draw(vignette)
    vd.ellipse([-SIZE * 0.18, -SIZE * 0.30, SIZE * 1.18, SIZE * 1.02], fill=255)
    vignette = vignette.filter(ImageFilter.GaussianBlur(SIZE * 0.09))
    dark = Image.new('RGBA', (SIZE, SIZE), (0, 0, 0, 150))
    dark.putalpha(Image.eval(vignette, lambda v: int((255 - v) * 0.55)))
    canvas = Image.alpha_composite(canvas, dark)

    return canvas


def main() -> None:
    icon = build()
    for size in (600, 512, 144):
        out = icon.resize((size, size), Image.LANCZOS)
        path = os.path.join(ASSETS, f'icon-{size}.png')
        # 平台要求 PNG 无 alpha 也能传，这里直接保留 RGB 去掉透明通道
        out.convert('RGB').save(path, optimize=True)
        print(f'{path}  {os.path.getsize(path) // 1024}KB')


if __name__ == '__main__':
    main()
