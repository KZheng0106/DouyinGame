/**
 * 标题页 / 选人页 / 结算页。
 *
 * 三个页面共用同一套霓虹夜空背景，和战斗场景视觉连续，
 * 玩家从选人到开打不会有风格跳变。
 */
import type { AssetStore } from '../assets/loader.ts';
import type { BattleState } from '../core/battle.ts';
import { GAME_CONFIG } from '../config.ts';
import { HEROES, HERO_ORDER } from '../core/heroes.ts';
import type { HeroKey } from '../core/heroes.ts';
import type {
  Difficulty,
  HeroCard,
  MenuButton,
  OpponentRow,
} from '../core/layout.ts';
import type { View } from '../core/view.ts';
import { contentBox } from '../core/layout.ts';
import { rr, shadowText } from './draw.ts';

/* --------------------------------------------------------------- 背景 */

export function drawBackdrop(ctx: CanvasRenderingContext2D, view: View, time: number): void {
  const sky = ctx.createLinearGradient(0, 0, 0, view.h);
  sky.addColorStop(0, '#0d0724');
  sky.addColorStop(0.45, '#2d1152');
  sky.addColorStop(0.78, '#57204f');
  sky.addColorStop(1, '#170b20');
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, view.w, view.h);

  // 缓慢呼吸的光斑
  for (let i = 0; i < 3; i += 1) {
    const phase = time * 0.0004 + i * 2.1;
    const cx = view.w * (0.25 + 0.28 * i) + Math.sin(phase) * 40;
    const cy = view.h * (0.22 + 0.16 * i) + Math.cos(phase * 1.3) * 26;
    const r = 150 + i * 40;
    const glow = ctx.createRadialGradient(cx, cy, 8, cx, cy, r);
    const color = i === 0 ? '120,200,255' : i === 1 ? '255,110,200' : '255,200,120';
    glow.addColorStop(0, `rgba(${color},0.16)`);
    glow.addColorStop(1, `rgba(${color},0)`);
    ctx.fillStyle = glow;
    ctx.fillRect(cx - r, cy - r, r * 2, r * 2);
  }

  // 底部霓虹地平线
  const floorY = view.h * 0.9;
  ctx.fillStyle = 'rgba(255,92,190,0.7)';
  ctx.fillRect(0, floorY, view.w, 3);
  const glow = ctx.createLinearGradient(0, floorY - 60, 0, floorY + 2);
  glow.addColorStop(0, 'rgba(255,92,190,0)');
  glow.addColorStop(1, 'rgba(255,92,190,0.22)');
  ctx.fillStyle = glow;
  ctx.fillRect(0, floorY - 60, view.w, 62);
}

/* --------------------------------------------------------------- 按钮 */

export function drawMenuButton(ctx: CanvasRenderingContext2D, button: MenuButton): void {
  ctx.save();

  if (button.active) {
    ctx.shadowColor = 'rgba(255,210,74,0.75)';
    ctx.shadowBlur = 18;
  } else if (button.primary) {
    ctx.shadowColor = 'rgba(255,110,200,0.55)';
    ctx.shadowBlur = 16;
  }

  if (button.primary) {
    const grad = ctx.createLinearGradient(button.x, button.y, button.x, button.y + button.h);
    grad.addColorStop(0, '#ff8ecb');
    grad.addColorStop(1, '#a441d8');
    ctx.fillStyle = grad;
  } else if (button.active) {
    ctx.fillStyle = 'rgba(255,210,74,0.9)';
  } else {
    ctx.fillStyle = 'rgba(255,255,255,0.14)';
  }

  rr(ctx, button.x, button.y, button.w, button.h, button.h * 0.32);
  ctx.fill();

  ctx.shadowBlur = 0;
  ctx.strokeStyle = button.active ? 'rgba(255,255,255,0.9)' : 'rgba(255,255,255,0.3)';
  ctx.lineWidth = 2;
  rr(ctx, button.x, button.y, button.w, button.h, button.h * 0.32);
  ctx.stroke();

  const fontSize = button.h >= 60 ? 26 : 20;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  shadowText(
    ctx,
    button.label,
    button.x + button.w / 2,
    button.y + button.h / 2 + 1,
    `bold ${fontSize}px sans-serif`,
    button.active ? '#2a1030' : '#ffffff',
    button.active ? 0 : 4,
  );

  ctx.restore();
}

/* --------------------------------------------------------------- 标题页 */

export function drawTitle(
  ctx: CanvasRenderingContext2D,
  view: View,
  art: AssetStore['heroes'],
  time: number,
  button: MenuButton,
): void {
  drawBackdrop(ctx, view, time);

  const cx = view.w / 2;
  const titleY = view.h * 0.15;

  ctx.save();
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  shadowText(ctx, GAME_CONFIG.gameName, cx, titleY, 'bold 58px sans-serif', '#ffffff', 12);
  shadowText(
    ctx,
    '网络抽象梗 · 横屏 1v1 格斗',
    cx,
    titleY + 46,
    'bold 20px sans-serif',
    'rgba(255,214,240,0.92)',
    5,
  );
  ctx.restore();

  // 全部英雄站成一排招手，横屏有横向空间，排布按舞台宽算不随屏幕拉伸
  const box = contentBox(view);
  const sprite = view.h * 0.3;
  const step = Math.min(box.w / (HERO_ORDER.length + 0.4), 300);
  const center = box.x + box.w / 2;
  const feetY = view.h * 0.62;
  HERO_ORDER.forEach((key, index) => {
    const image = art[key]?.poses.idle;
    if (!image) return;
    const x = center + (index - (HERO_ORDER.length - 1) / 2) * step;
    const bob = Math.sin(time * 0.0022 + index * 1.4) * 6;
    ctx.save();
    ctx.globalAlpha = 0.95;
    ctx.drawImage(image.image, x - sprite / 2, feetY + bob - sprite, sprite, sprite);
    ctx.restore();
  });

  drawMenuButton(ctx, button);

  ctx.save();
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = 'rgba(255,255,255,0.42)';
  ctx.font = '16px sans-serif';
  ctx.fillText('左方向键走位 · 右下四键出招 · 盾挡伤害 · 满能量放大招', cx, view.h - 26);
  ctx.restore();
}

/* --------------------------------------------------------------- 选人页 */

function drawHeroCard(
  ctx: CanvasRenderingContext2D,
  card: HeroCard,
  art: AssetStore['heroes'],
  selected: boolean,
): void {
  const hero = HEROES[card.key];

  ctx.save();
  if (selected) {
    ctx.shadowColor = 'rgba(255,110,200,0.85)';
    ctx.shadowBlur = 24;
  }
  const grad = ctx.createLinearGradient(card.x, card.y, card.x, card.y + card.h);
  if (selected) {
    grad.addColorStop(0, 'rgba(255,140,205,0.32)');
    grad.addColorStop(1, 'rgba(120,60,200,0.32)');
  } else {
    grad.addColorStop(0, 'rgba(255,255,255,0.10)');
    grad.addColorStop(1, 'rgba(255,255,255,0.04)');
  }
  ctx.fillStyle = grad;
  rr(ctx, card.x, card.y, card.w, card.h, 20);
  ctx.fill();

  ctx.shadowBlur = 0;
  ctx.strokeStyle = selected ? 'rgba(255,190,235,0.95)' : 'rgba(255,255,255,0.18)';
  ctx.lineWidth = selected ? 3 : 2;
  rr(ctx, card.x, card.y, card.w, card.h, 20);
  ctx.stroke();

  // 头像用 bust 图，等比塞进卡片
  const bust = art[card.key]?.bust;
  const boxH = card.h * 0.62;
  const boxW = card.w * 0.86;
  const bx = card.x + (card.w - boxW) / 2;
  const by = card.y + card.h * 0.06;
  if (bust) {
    const ratio = Math.min(boxW / bust.width, boxH / bust.height);
    const dw = bust.width * ratio;
    const dh = bust.height * ratio;
    ctx.drawImage(bust.image, bx + (boxW - dw) / 2, by + (boxH - dh) / 2, dw, dh);
  } else {
    ctx.fillStyle = 'rgba(255,120,200,0.35)';
    rr(ctx, bx, by, boxW, boxH, 14);
    ctx.fill();
  }

  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  shadowText(ctx, hero.name, card.x + card.w / 2, by + boxH + 8, 'bold 22px sans-serif', '#ffffff', 4);

  ctx.fillStyle = 'rgba(255,210,240,0.8)';
  ctx.font = '15px sans-serif';
  ctx.fillText(hero.role, card.x + card.w / 2, by + boxH + 38);

  ctx.restore();
}

export interface SelectInput {
  cards: HeroCard[];
  selected: HeroKey;
  difficulty: Difficulty;
  difficultyButtons: MenuButton[];
  opponent: HeroKey;
  opponentRow: OpponentRow;
  fightButton: MenuButton;
}

export function drawSelect(
  ctx: CanvasRenderingContext2D,
  view: View,
  art: AssetStore['heroes'],
  time: number,
  input: SelectInput,
): void {
  drawBackdrop(ctx, view, time);

  ctx.save();
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  shadowText(ctx, '选择英雄', view.w / 2, view.h * 0.075, 'bold 34px sans-serif', '#ffffff', 6);

  const hero = HEROES[input.selected];
  shadowText(
    ctx,
    `「${hero.ultimateName}」· ${hero.tagline}`,
    view.w / 2,
    view.h * 0.115,
    '16px sans-serif',
    'rgba(255,214,240,0.86)',
    4,
  );
  ctx.restore();

  for (const card of input.cards) {
    drawHeroCard(ctx, card, art, card.key === input.selected);
  }

  for (const button of input.difficultyButtons) {
    drawMenuButton(ctx, button);
  }

  // 对手行
  const row = input.opponentRow;
  ctx.save();
  ctx.fillStyle = 'rgba(255,255,255,0.07)';
  rr(ctx, row.x, row.y, row.w, row.h, 18);
  ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,0.16)';
  ctx.lineWidth = 2;
  rr(ctx, row.x, row.y, row.w, row.h, 18);
  ctx.stroke();

  const oppBust = art[input.opponent]?.bust;
  if (oppBust) {
    const ratio = Math.min(row.bust.w / oppBust.width, row.bust.h / oppBust.height);
    const dw = oppBust.width * ratio;
    const dh = oppBust.height * ratio;
    ctx.drawImage(
      oppBust.image,
      row.bust.x + (row.bust.w - dw) / 2,
      row.bust.y + (row.bust.h - dh) / 2,
      dw,
      dh,
    );
  }

  const opp = HEROES[input.opponent];
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  shadowText(ctx, '对手', row.x + 120, row.y + 16, '14px sans-serif', 'rgba(255,255,255,0.55)', 0);
  shadowText(ctx, opp.name, row.x + 120, row.y + 36, 'bold 26px sans-serif', '#ffd24a', 5);
  shadowText(ctx, opp.role, row.x + 120, row.y + 68, '14px sans-serif', 'rgba(255,255,255,0.6)', 0);
  ctx.restore();

  drawMenuButton(ctx, row.reroll);
  drawMenuButton(ctx, input.fightButton);
}

/* --------------------------------------------------------------- 结算页 */

export interface ResultInput {
  state: BattleState;
  playerWon: boolean;
  buttons: MenuButton[];
  /** 是否已经用掉了续关机会。 */
  reviveUsed: boolean;
  art: AssetStore['heroes'];
}

export function drawResult(
  ctx: CanvasRenderingContext2D,
  view: View,
  time: number,
  input: ResultInput,
): void {
  drawBackdrop(ctx, view, time);

  ctx.save();
  ctx.fillStyle = 'rgba(6,3,16,0.62)';
  ctx.fillRect(0, 0, view.w, view.h);
  ctx.restore();

  const cx = view.w / 2;
  const won = input.playerWon;
  const box = contentBox(view);

  ctx.save();
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  shadowText(ctx, won ? '胜  利' : '失  败', cx, view.h * 0.14, 'bold 68px sans-serif', won ? '#ffd24a' : '#ff6b7d', 12);
  ctx.restore();

  // 横屏左右分栏：左边立绘，右边文字，互不遮挡
  const winnerKey: HeroKey = won ? input.state.p1.hero : input.state.p2.hero;
  const sprite = input.art[winnerKey]?.poses[won ? 'win' : 'idle'];
  if (sprite) {
    const h = view.h * 0.52;
    const bob = Math.sin(time * 0.003) * 6;
    ctx.save();
    ctx.drawImage(sprite.image, box.x + box.w * 0.3 - h / 2, view.h * 0.72 + bob - h, h, h);
    ctx.restore();
  }

  // 战绩
  const lines = [
    `比分  ${input.state.wins.p1} : ${input.state.wins.p2}`,
    `造成伤害  ${Math.round(input.state.p1.damageDealt)}`,
    `最高连击  ${maxComboOf(input.state)}`,
  ];
  ctx.save();
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  const textX = box.x + box.w * 0.48;
  lines.forEach((line, index) => {
    shadowText(ctx, line, textX, view.h * 0.36 + index * 46, 'bold 24px sans-serif', '#ffffff', 4);
  });
  ctx.restore();

  for (const button of input.buttons) {
    drawMenuButton(ctx, button);
  }

  if (GAME_CONFIG.debugFakeAd) {
    ctx.save();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#ff5a68';
    ctx.font = 'bold 16px sans-serif';
    ctx.fillText('调试模式：未播放真实广告', cx, view.h - 14);
    ctx.restore();
  }
}

function maxComboOf(state: BattleState): number {
  return Math.max(state.p1.combo, state.p2.combo);
}

/* --------------------------------------------------------------- 加载页 */

export function drawLoading(
  ctx: CanvasRenderingContext2D,
  view: View,
  time: number,
  progress: number,
): void {
  drawBackdrop(ctx, view, time);

  const cx = view.w / 2;
  ctx.save();
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  shadowText(ctx, GAME_CONFIG.gameName, cx, view.h * 0.38, 'bold 46px sans-serif', '#ffffff', 10);

  const w = Math.min(view.w * 0.56, 560);
  const h = 12;
  const x = cx - w / 2;
  const y = view.h * 0.52;
  ctx.fillStyle = 'rgba(255,255,255,0.14)';
  rr(ctx, x, y, w, h, 6);
  ctx.fill();

  const fillW = Math.max(6, w * progress);
  const grad = ctx.createLinearGradient(x, y, x + w, y);
  grad.addColorStop(0, '#ff8ecb');
  grad.addColorStop(1, '#7ad9ff');
  ctx.fillStyle = grad;
  rr(ctx, x, y, fillW, h, 6);
  ctx.fill();

  ctx.fillStyle = 'rgba(255,255,255,0.6)';
  ctx.font = '15px sans-serif';
  ctx.fillText(`${Math.round(progress * 100)}%`, cx, y + 34);
  ctx.restore();
}
