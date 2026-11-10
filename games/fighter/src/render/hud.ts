/**
 * 血条 / 能量条 / 计时 / 回合胜点 / 连击 / 阶段提示。
 *
 * 全部画在屏幕坐标系里，不参与震屏，保证数值永远清晰可读。
 */
import type { BattleState } from '../core/battle.ts';
import { MAX_ENERGY, ROUNDS_TO_WIN } from '../core/constants.ts';
import type { HeroKey } from '../core/heroes.ts';
import { getHero } from '../core/heroes.ts';
import type { View } from '../core/view.ts';
import { contentBox } from '../core/layout.ts';
import { rr, shadowText } from './draw.ts';

const PAD = 22;
const BAR_TOP = 28;
const BAR_H = 24;
const ENERGY_H = 9;
const TIMER_R = 38;
/** 血条最长值。超宽屏不拉长，保持一眼可读的密度。 */
const BAR_MAX_W = 560;

interface BarGeom {
  x: number;
  y: number;
  w: number;
  h: number;
}

function healthBar(view: View, side: 'p1' | 'p2'): BarGeom {
  const box = contentBox(view);
  const w = Math.min(BAR_MAX_W, (box.w - PAD * 2 - TIMER_R * 2 - 30) / 2);
  return {
    x: side === 'p1' ? box.x + PAD : box.x + box.w - PAD - w,
    y: BAR_TOP,
    w,
    h: BAR_H,
  };
}

/** 血条按 HP 比例收缩。p2 从右往左掉，符合对称直觉。 */
function barFill(geom: BarGeom, ratio: number, side: 'p1' | 'p2'): BarGeom {
  const clamped = Math.max(0, Math.min(1, ratio));
  const w = geom.w * clamped;
  return { x: side === 'p1' ? geom.x : geom.x + geom.w - w, y: geom.y, w, h: geom.h };
}

function drawHealth(
  ctx: CanvasRenderingContext2D,
  state: BattleState,
  view: View,
  side: 'p1' | 'p2',
  hero: HeroKey,
): void {
  const geom = healthBar(view, side);
  const fighter = side === 'p1' ? state.p1 : state.p2;
  const ratio = fighter.hp / fighter.maxHp;
  const fill = barFill(geom, ratio, side);

  ctx.save();

  // 外框
  ctx.fillStyle = 'rgba(6,4,16,0.72)';
  rr(ctx, geom.x - 3, geom.y - 3, geom.w + 6, geom.h + 6, 8);
  ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,0.22)';
  ctx.lineWidth = 2;
  rr(ctx, geom.x - 3, geom.y - 3, geom.w + 6, geom.h + 6, 8);
  ctx.stroke();

  // 空槽
  ctx.fillStyle = 'rgba(255,255,255,0.10)';
  rr(ctx, geom.x, geom.y, geom.w, geom.h, 6);
  ctx.fill();

  // 血量：低于 30% 变红并闪烁
  if (fill.w > 0.5) {
    const low = ratio < 0.3;
    const blink = low ? 0.72 + Math.abs(Math.sin(state.frame * 0.18)) * 0.28 : 1;
    const grad = ctx.createLinearGradient(fill.x, fill.y, fill.x, fill.y + fill.h);
    if (low) {
      grad.addColorStop(0, `rgba(255,110,110,${blink})`);
      grad.addColorStop(1, `rgba(190,30,50,${blink})`);
    } else {
      grad.addColorStop(0, '#8ef7c1');
      grad.addColorStop(0.55, '#37d67a');
      grad.addColorStop(1, '#159a55');
    }
    ctx.fillStyle = grad;
    rr(ctx, fill.x, fill.y, fill.w, fill.h, 6);
    ctx.fill();
  }

  // 能量条：挂在血条内侧下方
  const eGeom: BarGeom = { x: geom.x, y: geom.y + geom.h + 5, w: geom.w, h: ENERGY_H };
  ctx.fillStyle = 'rgba(255,255,255,0.10)';
  rr(ctx, eGeom.x, eGeom.y, eGeom.w, eGeom.h, 4);
  ctx.fill();

  const eRatio = Math.min(1, fighter.energy / MAX_ENERGY);
  if (eRatio > 0) {
    const eW = eGeom.w * eRatio;
    const eX = side === 'p1' ? eGeom.x : eGeom.x + eGeom.w - eW;
    const full = fighter.energy >= MAX_ENERGY;
    const pulse = full ? 0.75 + Math.abs(Math.sin(state.frame * 0.12)) * 0.25 : 1;
    const eGrad = ctx.createLinearGradient(eX, eGeom.y, eX, eGeom.y + eGeom.h);
    eGrad.addColorStop(0, `rgba(180,240,255,${pulse})`);
    eGrad.addColorStop(1, `rgba(50,150,255,${pulse})`);
    ctx.fillStyle = eGrad;
    rr(ctx, eX, eGeom.y, Math.max(2, eW), eGeom.h, 4);
    ctx.fill();
  }

  // 名字
  const heroInfo = getHero(hero);
  ctx.textAlign = side === 'p1' ? 'left' : 'right';
  ctx.textBaseline = 'top';
  shadowText(
    ctx,
    heroInfo.name,
    side === 'p1' ? geom.x : geom.x + geom.w,
    eGeom.y + eGeom.h + 6,
    'bold 20px sans-serif',
    '#ffffff',
    4,
  );

  // 回合胜点
  const dotY = eGeom.y + eGeom.h + 34;
  const wins = side === 'p1' ? state.wins.p1 : state.wins.p2;
  for (let i = 0; i < ROUNDS_TO_WIN; i += 1) {
    const cx = side === 'p1' ? geom.x + 8 + i * 24 : geom.x + geom.w - 8 - i * 24;
    ctx.beginPath();
    ctx.arc(cx, dotY, 7, 0, Math.PI * 2);
    ctx.fillStyle = i < wins ? '#ffd24a' : 'rgba(255,255,255,0.18)';
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.45)';
    ctx.lineWidth = 1.5;
    ctx.stroke();
  }

  ctx.restore();
}

function drawTimer(ctx: CanvasRenderingContext2D, state: BattleState, view: View): void {
  const cx = view.w / 2;
  const cy = BAR_TOP + BAR_H / 2;

  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, TIMER_R, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(10,6,22,0.82)';
  ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,0.28)';
  ctx.lineWidth = 3;
  ctx.stroke();

  const seconds = Math.max(0, Math.ceil(state.timeLeft / 60));
  const urgent = seconds <= 10 && state.phase === 'fight';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  shadowText(
    ctx,
    String(seconds),
    cx,
    cy + 1,
    'bold 36px sans-serif',
    urgent ? '#ff6b7d' : '#ffffff',
    5,
  );
  ctx.restore();
}

function drawCombo(
  ctx: CanvasRenderingContext2D,
  state: BattleState,
  view: View,
  side: 'p1' | 'p2',
): void {
  const fighter = side === 'p1' ? state.p1 : state.p2;
  if (fighter.combo < 2 || fighter.comboTimer <= 0) return;

  const geom = healthBar(view, side);
  const x = side === 'p1' ? geom.x + 4 : geom.x + geom.w - 4;
  const y = geom.y + geom.h + 62;
  const pop = Math.min(1, fighter.comboTimer / 8);

  ctx.save();
  ctx.textAlign = side === 'p1' ? 'left' : 'right';
  ctx.textBaseline = 'top';
  ctx.globalAlpha = 0.55 + pop * 0.45;
  shadowText(
    ctx,
    `${fighter.combo} 连击`,
    x,
    y,
    `bold ${26 + pop * 10}px sans-serif`,
    '#ffd24a',
    5,
  );
  ctx.restore();
}

/** 中央大字：READY / FIGHT / KO / TIMEOUT。 */
function drawCallout(ctx: CanvasRenderingContext2D, state: BattleState, view: View): void {
  let text: string | null = null;
  let color = '#ffffff';
  let scale = 1;

  if (state.phase === 'ready') {
    // 61 帧准备时间：前 30 帧 READY，之后 FIGHT
    const fight = state.frame > 30;
    text = fight ? 'FIGHT!' : 'READY';
    color = fight ? '#ffd24a' : '#8ef7ff';
    scale = 1 + (fight ? (state.frame - 30) / 30 : state.frame / 30) * 0.12;
  } else if (state.phase === 'ko' && state.lastRound) {
    text = state.lastRound.reason === 'timeout' ? 'TIME UP' : 'K.O.';
    color = '#ff6b7d';
    scale = 1 + Math.min(0.3, state.koTimer / 90);
  }

  if (!text) return;

  ctx.save();
  ctx.translate(view.w / 2, view.h * 0.33);
  ctx.scale(scale, scale);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  shadowText(ctx, text, 0, 0, 'bold 68px sans-serif', color, 10);
  ctx.restore();
}

export function drawHud(ctx: CanvasRenderingContext2D, state: BattleState, view: View): void {
  drawHealth(ctx, state, view, 'p1', state.p1.hero);
  drawHealth(ctx, state, view, 'p2', state.p2.hero);
  drawTimer(ctx, state, view);
  drawCombo(ctx, state, view, 'p1');
  drawCombo(ctx, state, view, 'p2');
  drawCallout(ctx, state, view);
}
