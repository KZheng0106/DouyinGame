#!/usr/bin/env python3
"""量出每张英雄图的可见像素包围盒，生成渲染层要用的尺寸表。

切图之后每张姿态图的透明边留白都不一样：idle 瘦高、down 横卧。
如果渲染时统一塞进一个方框，角色会在 idle/walk 之间忽大忽小，
「倒地」还会被拉成一根竖条。所以先量出 alpha 包围盒，
渲染时按包围盒底边中点对齐、按同一比例缩放。

用法:
    python3 scripts/measure_hero.py

输出:
    src/generated/hero-poses.ts
"""

from __future__ import annotations

import json
from pathlib import Path

import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
HERO_DIR = ROOT / "assets" / "hero"
OUT_FILE = ROOT / "src" / "generated" / "hero-poses.ts"

KEYS = ("niu", "gu", "nai")
POSES = ("idle", "walk", "attack", "hurt", "down", "win")

# alpha 低于这个值算全透明，滤掉抗锯齿的浮边
ALPHA_FLOOR = 12


def bbox_of(path: Path) -> dict[str, float]:
    """返回归一化到 0~1 的包围盒 {x,y,w,h}。图整张透明时退回整幅。"""
    image = Image.open(path).convert("RGBA")
    alpha = np.asarray(image)[:, :, 3]
    mask = alpha > ALPHA_FLOOR
    if not mask.any():
        return {"x": 0.0, "y": 0.0, "w": 1.0, "h": 1.0}

    rows = np.flatnonzero(mask.any(axis=1))
    cols = np.flatnonzero(mask.any(axis=0))
    y0, y1 = int(rows[0]), int(rows[-1]) + 1
    x0, x1 = int(cols[0]), int(cols[-1]) + 1

    height, width = mask.shape
    return {
        "x": round(x0 / width, 4),
        "y": round(y0 / height, 4),
        "w": round((x1 - x0) / width, 4),
        "h": round((y1 - y0) / height, 4),
    }


def main() -> int:
    data: dict[str, dict[str, dict[str, float]]] = {}
    missing: list[str] = []

    for key in KEYS:
        poses: dict[str, dict[str, float]] = {}
        for index, pose in enumerate(POSES):
            path = HERO_DIR / f"{key}_sheet_{index}.png"
            if not path.exists():
                missing.append(str(path.relative_to(ROOT)))
                continue
            poses[pose] = bbox_of(path)
        data[key] = poses

    if missing:
        print("缺少素材，先跑 scripts/slice_hero.py：")
        for item in missing:
            print(f"  {item}")
        return 1

    OUT_FILE.parent.mkdir(parents=True, exist_ok=True)
    payload = json.dumps(data, ensure_ascii=False, indent=2)
    OUT_FILE.write_text(
        "// 本文件由 scripts/measure_hero.py 生成，请勿手改。\n"
        "// 每项是姿态图 alpha 包围盒相对整幅的归一化矩形（x, y, w, h）。\n\n"
        "export interface PoseBox {\n"
        "  readonly x: number;\n"
        "  readonly y: number;\n"
        "  readonly w: number;\n"
        "  readonly h: number;\n"
        "}\n\n"
        "export type PoseName = 'idle' | 'walk' | 'attack' | 'hurt' | 'down' | 'win';\n\n"
        f"export const HERO_POSES: Record<string, Record<PoseName, PoseBox>> = {payload};\n",
        encoding="utf-8",
    )

    print(f"已写入 {OUT_FILE.relative_to(ROOT)}")
    for key, poses in data.items():
        summary = "  ".join(f"{name}={box['w']:.2f}x{box['h']:.2f}" for name, box in poses.items())
        print(f"  {key}: {summary}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
