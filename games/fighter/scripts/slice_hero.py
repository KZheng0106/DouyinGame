#!/usr/bin/env python3
"""把 AI 出的英雄图自动切成可用素材：抠背景 → 切姿态 → 归一化 → 压体积。

用法:
    python3 scripts/slice_hero.py assets/hero_raw/*.png
    python3 scripts/slice_hero.py assets/hero_raw/niu_sheet.png --key niu

自动识别两种布局：
    A) 纯动作表   —— 5~6 个等大姿态，排成 1 行 或 2 行
    B) 立绘+姿态  —— 左侧 1 张大立绘 + 右侧 5~6 个小姿态（即梦/GPT 常见出图）

背景：绿幕 / 蓝幕 / 纯色底都能自动识别，按背景色溢出量生成软边 alpha 并 despill。

输出:
    assets/hero/{key}_sheet_0..5.png   256x256 透明底，顺序 idle/walk/attack/hurt/down/win
    assets/hero/{key}_bust.png         512x512 透明底（图里有大立绘时才生成）
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

import numpy as np
from PIL import Image
from scipy import ndimage

ROOT = Path(__file__).resolve().parent.parent
OUT_DIR = ROOT / "assets" / "hero"

FRAME_SIZE = 256
BUST_SIZE = 512
FRAME_COLORS = 64
BUST_COLORS = 128
FRAME_PAD = 0.04

POSE_NAMES = ("idle", "walk", "attack", "hurt", "down", "win")

KEY_LO = 8.0
KEY_HI = 70.0
KEY_DETECT = 40.0
MIN_BLOB_AREA = 3000
MIN_POSES = 5
MAX_POSES = 6


def detect_key_channel(rgb: np.ndarray) -> int:
    """从图像边框判断背景由哪个通道主导，返回 0/1/2 (R/G/B)。"""
    band = 6
    border = np.concatenate(
        [
            rgb[:band].reshape(-1, 3),
            rgb[-band:].reshape(-1, 3),
            rgb[:, :band].reshape(-1, 3),
            rgb[:, -band:].reshape(-1, 3),
        ]
    ).astype(np.float32)

    best_ch, best_score = 1, -1.0
    for ch in range(3):
        others = [c for c in range(3) if c != ch]
        excess = border[:, ch] - border[:, others].max(axis=1)
        score = float((excess > KEY_DETECT).mean())
        if score > best_score:
            best_ch, best_score = ch, score

    if best_score < 0.15:
        raise ValueError("识别不出背景色（不是纯色幕布）。请用纯色背景重出，或先用 remove.bg 抠好再传。")
    return best_ch


def key_out(rgb: np.ndarray, ch: int) -> Image.Image:
    """按背景通道生成软边 alpha，并把溢出的背景色压回去（去绿边/蓝边）。"""
    img = rgb.astype(np.float32)
    others = [c for c in range(3) if c != ch]
    other_max = img[:, :, others].max(axis=2)
    excess = img[:, :, ch] - other_max

    alpha = np.clip(1.0 - (excess - KEY_LO) / (KEY_HI - KEY_LO), 0.0, 1.0)
    alpha[alpha < 0.04] = 0.0

    img[:, :, ch] = np.where(excess > 0, other_max, img[:, :, ch])

    out = np.dstack([np.clip(img, 0, 255), alpha * 255.0]).astype(np.uint8)
    return Image.fromarray(out, "RGBA")


def split_blobs(im: Image.Image) -> list[tuple[int, int, int, int]]:
    """连通域求每个姿态的包围盒 (x0, y0, x1, y1)。"""
    mask = np.asarray(im)[:, :, 3] > 20
    mask = ndimage.binary_opening(mask, np.ones((3, 3)))
    mask = ndimage.binary_closing(mask, np.ones((7, 7)))

    lab, _ = ndimage.label(mask)
    boxes = []
    for i, sl in enumerate(ndimage.find_objects(lab), 1):
        if sl is None or (lab[sl] == i).sum() < MIN_BLOB_AREA:
            continue
        boxes.append((sl[1].start, sl[0].start, sl[1].stop, sl[0].stop))
    return boxes


def pick_bust(boxes: list[tuple[int, int, int, int]], img_w: int):
    """姿态数超过 6 时，把明显更大更靠左的那个当成立绘。"""
    if len(boxes) <= MAX_POSES:
        return None, boxes

    def area(b):
        return (b[2] - b[0]) * (b[3] - b[1])

    widest = max(boxes, key=lambda b: b[2] - b[0])
    if (widest[2] - widest[0]) > 0.30 * img_w and widest[0] < img_w * 0.5:
        return widest, [b for b in boxes if b != widest]

    return None, sorted(boxes, key=area, reverse=True)[:MAX_POSES]


def sort_poses(boxes: list[tuple[int, int, int, int]]) -> list[tuple[int, int, int, int]]:
    """按 行 → 列 排序。y 中心相差不到行高的 40% 算同一行。"""
    if len(boxes) <= 1:
        return boxes

    cx = [(b[0] + b[2]) / 2 for b in boxes]
    cy = [(b[1] + b[3]) / 2 for b in boxes]
    heights = [b[3] - b[1] for b in boxes]
    tol = float(np.median(heights)) * 0.4

    rows: list[list[int]] = []
    for i in sorted(range(len(boxes)), key=lambda k: cy[k]):
        if rows and abs(cy[i] - np.mean([cy[j] for j in rows[-1]])) < tol:
            rows[-1].append(i)
        else:
            rows.append([i])

    ordered: list[int] = []
    for row in rows:
        ordered.extend(sorted(row, key=lambda k: cx[k]))
    return [boxes[i] for i in ordered]


def normalize(im: Image.Image, box, size: int, scale: float, pad: float) -> Image.Image:
    """按统一 scale 缩放（保留各姿态相对大小），底部对齐居中放进 size 画布。

    宽高都不许溢出画布，超出时整体再压一次 scale，避免出现贴边裁切。
    """
    crop = im.crop(box)
    inner = size * (1 - 2 * pad)
    nw, nh = crop.width * scale, crop.height * scale
    if nw > inner or nh > inner:
        scale *= min(inner / nw, inner / nh)

    nw = max(1, round(crop.width * scale))
    nh = max(1, round(crop.height * scale))
    crop = crop.resize((nw, nh), Image.LANCZOS)

    canvas = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    ox = (size - nw) // 2
    oy = round(size - pad * size - nh)
    canvas.paste(crop, (max(ox, 0), max(oy, 0)), crop)
    return canvas


def quantize(im: Image.Image, colors: int) -> Image.Image:
    """调色板量化后转回 RGBA，避免某些端把 P 模式 alpha 当成实心。"""
    q = im.convert("RGBA").quantize(colors=colors, method=Image.FASTOCTREE, dither=Image.NONE)
    return q.convert("RGBA")


def guess_key(path: Path, index: int) -> str:
    """从文件名猜 ASCII key；中文名一律回退成 heroN，请用 --key 显式指定。"""
    stem = path.stem.lower()
    for suffix in ("_sheet", "_action", "_frames", "_poses"):
        if stem.endswith(suffix):
            stem = stem[: -len(suffix)].rstrip("_-")
    ascii_stem = "".join(c for c in stem if c.isascii() and (c.isalnum() or c in "-_"))
    return ascii_stem or f"hero{index}"


def process(src: Path, key: str) -> tuple[int, bool]:
    rgb = np.asarray(Image.open(src).convert("RGB"))
    im = key_out(rgb, detect_key_channel(rgb))

    boxes = split_blobs(im)
    OUT_DIR.mkdir(parents=True, exist_ok=True)

    # 单主体特写图：只出立绘，不出动作帧
    if len(boxes) == 1:
        b = boxes[0]
        span = max(b[2] - b[0], b[3] - b[1])
        bust = normalize(im, b, BUST_SIZE, BUST_SIZE * 0.94 / span, 0.03)
        quantize(bust, BUST_COLORS).save(OUT_DIR / f"{key}_bust.png", optimize=True)
        return 0, True

    if len(boxes) < MIN_POSES:
        raise ValueError(f"只切出 {len(boxes)} 个姿态，至少需要 {MIN_POSES} 个")

    bust_box, pose_boxes = pick_bust(boxes, im.width)
    pose_boxes = sort_poses(pose_boxes)[:MAX_POSES]

    target_h = FRAME_SIZE * (1 - 2 * FRAME_PAD)
    scale = target_h / max(b[3] - b[1] for b in pose_boxes)

    for i, box in enumerate(pose_boxes):
        frame = normalize(im, box, FRAME_SIZE, scale, FRAME_PAD)
        quantize(frame, FRAME_COLORS).save(OUT_DIR / f"{key}_sheet_{i}.png", optimize=True)

    made_bust = False
    if bust_box:
        span = max(bust_box[2] - bust_box[0], bust_box[3] - bust_box[1])
        bust = normalize(im, bust_box, BUST_SIZE, BUST_SIZE * 0.94 / span, 0.03)
        quantize(bust, BUST_COLORS).save(OUT_DIR / f"{key}_bust.png", optimize=True)
        made_bust = True

    return len(pose_boxes), made_bust


def main(argv: list[str]) -> int:
    ap = argparse.ArgumentParser(description="切片 AI 出的英雄图（绿幕/蓝幕/纯色底）")
    ap.add_argument("files", nargs="+", type=Path, help="AI 出的 PNG")
    ap.add_argument("--key", help="强制指定英雄 key（只处理单个文件时用）")
    args = ap.parse_args(argv)

    total = 0
    for i, src in enumerate(args.files):
        if not src.exists():
            print(f"跳过（不存在）: {src}", file=sys.stderr)
            continue
        key = args.key or guess_key(src, i + 1)
        try:
            frames, bust = process(src, key)
        except ValueError as e:
            print(f"{src.name}: {e}", file=sys.stderr)
            continue
        total += frames + (1 if bust else 0)
        print(f"{src.name} -> key={key}: {frames} 帧" + (" + 立绘" if bust else ""))

    print(f"完成，共输出 {total} 个文件到 {OUT_DIR}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
