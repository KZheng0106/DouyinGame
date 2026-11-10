/**
 * 战斗场景绘制：霓虹夜街背景 + 地面 + 两位英雄。
 *
 * 背景全部用代码画，不依赖背景图，包体小且能随屏幕比例自适应。
 * 角色只有「一张静态姿态」，所以动感全靠位移/缩放/闪白伪造。
 */
import type { AssetStore, HeroArt } from '../assets/loader.ts';
import type { BattleState, Fighter, Pose } from '../core/battle.ts';
import { HERO_POSES } from '../generated/hero-poses.ts';
import type { PoseName } from '../generated/hero-poses.ts';
import type { View } from '../core/view.ts';
import { groundScreenY, stageOffsetX } from '../core/view.ts';
import { rr } from './draw.ts';

/** 站立姿态从脚底到头顶的屏幕高度。横屏下地面到血条约 500，角色占 260 刚好不顶血条。 */
export const CHAR_H = 262;

/* ------------------------------------------------------------------ 背景 */

interface SkylineBlock {
  x: number;
  w: number;
  h: number;
  /** 亮灯的窗：列号 * 100 + 行号。 */
  lit: number[];
}

/** 天际线按宽度缓存：超宽屏要铺满到 view.w，换宽度只需重建一次。 */
let cityWidth = 0;
let city: SkylineBlock[] = [];

function skylineFor(width: number): SkylineBlock[] {
  if (cityWidth !== width) {
    city = buildSkyline(width);
    cityWidth = width;
  }
  return city;
}

/** 固定种子生成，避免每帧抖动。 */
function buildSkyline(width: number): SkylineBlock[] {
  let seed = 0x2f6e21;
  const rand = (): number => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 0x100000000;
  };
  const blocks: SkylineBlock[] = [];
  let x = -40;
  while (x < width + 40) {
    const w = 44 + Math.round(rand() * 66);
    const h = 90 + Math.round(rand() * 210);
    const lit: number[] = [];
    const cols = Math.max(2, Math.floor(w / 16));
    const rows = Math.max(2, Math.floor(h / 22));
    for (let c = 0; c < cols; c += 1) {
      for (let r = 0; r < rows; r += 1) {
        if (rand() > 0.62) lit.push(c * 100 + r);
      }
    }
    blocks.push({ x, w, h, lit });
    x += w + 6 + Math.round(rand() * 10);
  }
  return blocks;
}

function drawSky(ctx: CanvasRenderingContext2D, view: View): void {
  const sky = ctx.createLinearGradient(0, 0, 0, view.h);
  sky.addColorStop(0, '#120b2e');
  sky.addColorStop(0.42, '#2a1350');
  sky.addColorStop(0.72, '#5b1f52');
  sky.addColorStop(1, '#1b0d24');
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, view.w, view.h);

  const groundY = groundScreenY(view);
  const moonX = view.w * 0.76;
  const moonY = groundY * 0.24;
  const halo = ctx.createRadialGradient(moonX, moonY, 6, moonX, moonY, 130);
  halo.addColorStop(0, 'rgba(255,214,170,0.55)');
  halo.addColorStop(0.35, 'rgba(255,150,190,0.16)');
  halo.addColorStop(1, 'rgba(255,150,190,0)');
  ctx.fillStyle = halo;
  ctx.fillRect(moonX - 140, moonY - 140, 280, 280);
  ctx.fillStyle = '#ffe9c4';
  ctx.beginPath();
  ctx.arc(moonX, moonY, 44, 0, Math.PI * 2);
  ctx.fill();
}

function drawSkyline(ctx: CanvasRenderingContext2D, view: View): void {
  const groundY = groundScreenY(view);
  for (const block of skylineFor(view.w)) {
    const top = groundY - block.h;
    ctx.fillStyle = 'rgba(18,12,42,0.92)';
    ctx.fillRect(block.x, top, block.w, block.h);
    ctx.fillStyle = 'rgba(120,90,220,0.30)';
    ctx.fillRect(block.x, top, block.w, 3);
    for (const code of block.lit) {
      const col = Math.floor(code / 100);
      const row = code % 100;
      ctx.fillStyle = row % 3 === 0 ? 'rgba(255,190,120,0.75)' : 'rgba(120,220,255,0.55)';
      ctx.fillRect(block.x + 5 + col * 16, top + 10 + row * 22, 6, 9);
    }
  }
}

function drawGround(ctx: CanvasRenderingContext2D, view: View): void {
  const groundY = groundScreenY(view);

  const floor = ctx.createLinearGradient(0, groundY, 0, view.h);
  floor.addColorStop(0, '#2b1b46');
  floor.addColorStop(0.35, '#1b1030');
  floor.addColorStop(1, '#0c0718');
  ctx.fillStyle = floor;
  ctx.fillRect(0, groundY, view.w, view.h - groundY);

  ctx.strokeStyle = 'rgba(150,110,255,0.16)';
  ctx.lineWidth = 2;
  for (let i = -4; i <= 4; i += 1) {
    ctx.beginPath();
    ctx.moveTo(view.w / 2 + i * 46, groundY);
    ctx.lineTo(view.w / 2 + i * 190, view.h);
    ctx.stroke();
  }
  for (let i = 1; i <= 4; i += 1) {
    const y = groundY + Math.pow(i / 4, 1.9) * (view.h - groundY);
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(view.w, y);
    ctx.stroke();
  }

  ctx.fillStyle = 'rgba(255,92,190,0.85)';
  ctx.fillRect(0, groundY - 3, view.w, 4);
  const glow = ctx.createLinearGradient(0, groundY - 34, 0, groundY + 4);
  glow.addColorStop(0, 'rgba(255,92,190,0)');
  glow.addColorStop(1, 'rgba(255,92,190,0.35)');
  ctx.fillStyle = glow;
  ctx.fillRect(0, groundY - 34, view.w, 38);
}

/* ------------------------------------------------------------------ 角色 */

/** scale = 归一化高度单位对应的屏幕像素数。同一英雄所有姿态共用，杜绝忽大忽小。 */
function heroScale(key: Fighter['hero']): number {
  return CHAR_H / HERO_POSES[key].idle.h;
}

interface PoseTransform {
  /** 相对站立点的横向偏移，已含朝向。 */
  dx: number;
  /** 纵向抬升，正数向上。 */
  lift: number;
  scaleX: number;
  scaleY: number;
  /** 整图旋转（弧度）。 */
  rot: number;
}

const REST: PoseTransform = { dx: 0, lift: 0, scaleX: 1, scaleY: 1, rot: 0 };

/** 前摇后压 → 判定前冲 → 后摇回收。 */
function attackTransform(fighter: Fighter): PoseTransform {
  const move = fighter.move;
  if (!move) return REST;
  const { startup, active, recovery } = move.data;
  const e = move.elapsed;
  const dir = fighter.facing;

  if (e < startup) {
    const t = startup === 0 ? 1 : e / startup;
    return {
      dx: -dir * 9 * t,
      lift: 0,
      scaleX: 1 + 0.04 * t,
      scaleY: 1 - 0.05 * t,
      rot: -dir * 0.03 * t,
    };
  }
  if (e < startup + active) {
    const t = (e - startup) / Math.max(1, active);
    return { dx: dir * 16 * (0.5 + 0.5 * t), lift: 2, scaleX: 0.97, scaleY: 1.02, rot: dir * 0.03 };
  }
  const t = (e - startup - active) / Math.max(1, recovery);
  const ease = 1 - t * t;
  return { dx: dir * 16 * ease, lift: 0, scaleX: 1, scaleY: 1, rot: dir * 0.03 * ease };
}

function poseTransform(fighter: Fighter, time: number): PoseTransform {
  switch (fighter.pose) {
    case 'attack':
      return attackTransform(fighter);
    case 'walk':
      return { ...REST, lift: Math.abs(Math.sin(time * 0.011)) * 4 };
    case 'hurt':
      return { ...REST, dx: -fighter.facing * (fighter.stun > 6 ? 7 : 3), rot: -fighter.facing * 0.04 };
    case 'idle':
      return { ...REST, lift: Math.sin(time * 0.003) * 2.5, scaleY: 1 + Math.sin(time * 0.003) * 0.008 };
    default:
      return REST;
  }
}

function drawShadow(ctx: CanvasRenderingContext2D, fighter: Fighter, groundY: number, scale: number): void {
  const radius = (HERO_POSES[fighter.hero].idle.w * scale) / 2.4;
  ctx.fillStyle = 'rgba(4,2,12,0.5)';
  ctx.beginPath();
  ctx.ellipse(fighter.x, groundY + 6, radius, radius * 0.26, 0, 0, Math.PI * 2);
  ctx.fill();
}

/** 贴图缺失时的占位色块，保证逻辑照常跑。 */
function fillBody(ctx: CanvasRenderingContext2D, w: number, h: number): void {
  ctx.fillStyle = 'rgba(255,120,200,0.7)';
  rr(ctx, -w / 2, -h, w, h, 18);
  ctx.fill();
}

function drawSprite(
  ctx: CanvasRenderingContext2D,
  art: HeroArt,
  pose: PoseName,
  key: Fighter['hero'],
  cx: number,
  feetY: number,
  scale: number,
  tf: PoseTransform,
  facing: 1 | -1,
  alpha: number,
): void {
  const sprite = art.poses[pose];
  const box = HERO_POSES[key][pose];

  ctx.save();
  ctx.translate(cx + tf.dx, feetY - tf.lift);
  ctx.rotate(tf.rot);
  ctx.scale(facing * tf.scaleX, tf.scaleY);
  ctx.globalAlpha = alpha;

  if (sprite) {
    // 整帧按 scale 缩放；再平移到「包围盒底边中点落在局部原点」
    const imgX = -(box.x + box.w / 2) * scale;
    const imgY = -(box.y + box.h) * scale;
    try {
      ctx.drawImage(sprite.image, 0, 0, sprite.width, sprite.height, imgX, imgY, scale, scale);
    } catch {
      fillBody(ctx, box.w * scale, box.h * scale);
    }
  } else {
    fillBody(ctx, box.w * scale, box.h * scale);
  }
  ctx.restore();
}

function drawShield(ctx: CanvasRenderingContext2D, fighter: Fighter, groundY: number, scale: number): void {
  const cx = fighter.x + fighter.facing * 20;
  const r = scale * 0.36;
  const cy = groundY - r * 0.9;
  ctx.save();
  ctx.globalAlpha = 0.6;
  const grad = ctx.createRadialGradient(cx, cy, r * 0.28, cx, cy, r);
  grad.addColorStop(0, 'rgba(120,235,255,0.04)');
  grad.addColorStop(0.7, 'rgba(120,235,255,0.22)');
  grad.addColorStop(1, 'rgba(120,235,255,0.75)');
  ctx.strokeStyle = grad;
  ctx.lineWidth = 7;
  ctx.beginPath();
  ctx.ellipse(cx, cy, r * 0.6, r, 0, -Math.PI / 2.2, Math.PI / 2.2);
  ctx.stroke();
  ctx.restore();
}

export function drawFighter(
  ctx: CanvasRenderingContext2D,
  view: View,
  art: AssetStore['heroes'],
  fighter: Fighter,
  time: number,
): void {
  const heroArt = art[fighter.hero];
  if (!heroArt) return;

  const scale = heroScale(fighter.hero);
  const groundY = groundScreenY(view);
  const pose: Pose = fighter.pose;
  const tf = poseTransform(fighter, time);
  const cx = fighter.x;
  const feetY = groundY + (pose === 'down' ? 10 : 0);

  drawShadow(ctx, fighter, groundY, scale);
  drawSprite(ctx, heroArt, pose, fighter.hero, cx, feetY, scale, tf, fighter.facing, 1);

  // 受击闪白：叠加模式再画一遍提亮
  if (fighter.flash > 0) {
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = Math.min(0.8, fighter.flash / 8);
    drawSprite(ctx, heroArt, pose, fighter.hero, cx, feetY, scale, tf, fighter.facing, 1);
    ctx.restore();
  }

  if (fighter.blocking) drawShield(ctx, fighter, groundY, scale);
}

/* ------------------------------------------------------------------ 场景 */

export function drawStage(
  ctx: CanvasRenderingContext2D,
  state: BattleState,
  view: View,
  art: AssetStore['heroes'],
  time: number,
): void {
  drawSky(ctx, view);
  drawSkyline(ctx, view);
  drawGround(ctx, view);

  ctx.save();
  if (state.shake > 0.2) {
    ctx.translate((Math.random() - 0.5) * state.shake, (Math.random() - 0.5) * state.shake * 0.6);
  }
  // 角色用舞台坐标，超宽屏时整体右移一个留白量才落在正中
  ctx.translate(stageOffsetX(view), 0);
  drawFighter(ctx, view, art, state.p2, time);
  drawFighter(ctx, view, art, state.p1, time);
  ctx.restore();

  const vignette = ctx.createRadialGradient(
    view.w / 2,
    view.h * 0.5,
    Math.min(view.w, view.h) * 0.42,
    view.w / 2,
    view.h * 0.5,
    Math.max(view.w, view.h) * 0.78,
  );
  vignette.addColorStop(0, 'rgba(0,0,0,0)');
  vignette.addColorStop(1, 'rgba(0,0,0,0.45)');
  ctx.fillStyle = vignette;
  ctx.fillRect(0, 0, view.w, view.h);
}
