/**
 * 界面几何。渲染与点击判定共用同一份数据，避免画在一个地方、点在另一个地方。
 *
 * 全部坐标都是横屏逻辑坐标：高度恒为 STAGE_H(720)，宽度 >= STAGE_W(1280)。
 * 菜单类界面统一收在屏幕中央 1280 宽的内容区里，超宽屏只加左右留白，元素尺寸不变；
 * 战斗操作键则贴在真正的屏幕四角，按 view.w 定位，保证大屏手机手指也够得到。
 */
import { MAX_ENERGY, STAGE_W } from './constants.ts';
import type { HeroKey } from './heroes.ts';
import { HERO_ORDER } from './heroes.ts';
import type { View } from './view.ts';

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** 菜单内容区：居中、最宽不超过舞台宽。 */
export function contentBox(view: View): { x: number; w: number } {
  const w = Math.min(view.w, STAGE_W);
  return { x: (view.w - w) / 2, w };
}

/* ---------------------------------------------------------------- 战斗操作区 */

export type PadId = 'left' | 'right' | 'light' | 'heavy' | 'block' | 'ultimate';

export interface PadButton {
  id: PadId;
  cx: number;
  cy: number;
  /** 绘制半径。判定半径会再放大一点，见 hitTestPad。 */
  r: number;
  label: string;
  /** 大招能量不足时为 false：不响应按下，并画成置灰。 */
  enabled: boolean;
}

const DIR_R = 54;
const ACT_R = 58;
const SUB_R = 48;
/** 左方向键圆心到左沿的距离。 */
const DIR_EDGE_X = 90;
const DIR_GAP = 30;
/** 右下「拳」键圆心到右沿的距离。 */
const ACT_EDGE_X = 86;
/** 下排「盾 / 拳」的水平间距。 */
const ACT_GAP = 124;
/** 上排相对下排的抬升量。 */
const ACT_RISE = 106;
const BOTTOM_MARGIN = 82;

/** 左右方向键的横向中线，滑动跨过它就换向。 */
export const DIR_MID_X = DIR_EDGE_X + DIR_R + DIR_GAP / 2;

/** 操作键的中心线。贴底但给手指留下沿空间。 */
export function padBaseY(view: View): number {
  return view.h - Math.min(BOTTOM_MARGIN, view.h * 0.12);
}

/**
 * 左下两个方向键、右下 2x2 动作键：
 * 下排「盾 / 拳」，上排「大招 / 重拳」。上排半径略小，避免压住地面上角色的头。
 */
export function getPadButtons(energy: number, view: View): PadButton[] {
  const cy = padBaseY(view);
  const rightX = view.w - ACT_EDGE_X;
  const leftX = rightX - ACT_GAP;
  const topY = cy - ACT_RISE;
  return [
    { id: 'left', cx: DIR_EDGE_X, cy, r: DIR_R, label: '←', enabled: true },
    { id: 'right', cx: DIR_EDGE_X + DIR_R * 2 + DIR_GAP, cy, r: DIR_R, label: '→', enabled: true },
    { id: 'block', cx: leftX, cy, r: ACT_R, label: '盾', enabled: true },
    { id: 'light', cx: rightX, cy, r: ACT_R, label: '拳', enabled: true },
    { id: 'ultimate', cx: leftX, cy: topY, r: SUB_R, label: '大招', enabled: energy >= MAX_ENERGY },
    { id: 'heavy', cx: rightX, cy: topY, r: SUB_R, label: '重拳', enabled: true },
  ];
}

/** 方向键判定半径放宽一半，动作键放宽一成：手指落点没准头也不会点空。 */
export function padHitRadius(button: PadButton): number {
  return button.id === 'left' || button.id === 'right' ? button.r * 1.5 : button.r * 1.12;
}

export function hitTestPad(buttons: readonly PadButton[], x: number, y: number): PadButton | null {
  for (const button of buttons) {
    if (!button.enabled) continue;
    const dx = x - button.cx;
    const dy = y - button.cy;
    const r = padHitRadius(button);
    if (dx * dx + dy * dy <= r * r) return button;
  }
  return null;
}

/** 战斗中左上角返回按钮。放在血条下方，避开横屏侧边的刘海。 */
export function getQuitButton(view: View): Rect {
  void view;
  return { x: 18, y: 98, w: 60, h: 44 };
}

/* ------------------------------------------------------------------- 选人页 */

export interface HeroCard extends Rect {
  key: HeroKey;
}

const CARD_GAP = 22;

export function getHeroCards(view: View): HeroCard[] {
  const box = contentBox(view);
  const top = view.h * 0.2;
  const height = view.h * 0.34;
  const width = (box.w - 80 - CARD_GAP * (HERO_ORDER.length - 1)) / HERO_ORDER.length;
  return HERO_ORDER.map((key, index) => ({
    key,
    x: box.x + 40 + index * (width + CARD_GAP),
    y: top,
    w: width,
    h: height,
  }));
}

/* --------------------------------------------------------------- 通用按钮 */

export type MenuId =
  | 'title-start'
  | 'easy'
  | 'normal'
  | 'hard'
  | 'reroll'
  | 'fight'
  | 'rematch'
  | 'reselect'
  | 'revive';

export type Difficulty = 'easy' | 'normal' | 'hard';

export interface MenuButton extends Rect {
  id: MenuId;
  label: string;
  /** 主按钮走彩色渐变，次要按钮走半透明白。 */
  primary: boolean;
  /** 难度选择用：当前选中项高亮。 */
  active: boolean;
}

const SMALL_W = 128;
const SMALL_H = 52;
const SMALL_GAP = 20;

function smallButton(
  id: MenuId,
  label: string,
  x: number,
  y: number,
  w: number,
  active = false,
): MenuButton {
  return { id, label, primary: false, active, x, y, w, h: SMALL_H };
}

export function getDifficultyButtons(view: View, current: Difficulty): MenuButton[] {
  const items: Array<{ id: MenuId; label: string; difficulty: Difficulty }> = [
    { id: 'easy', label: '简单', difficulty: 'easy' },
    { id: 'normal', label: '普通', difficulty: 'normal' },
    { id: 'hard', label: '困难', difficulty: 'hard' },
  ];
  const total = items.length * SMALL_W + (items.length - 1) * SMALL_GAP;
  const x0 = (view.w - total) / 2;
  const cards = getHeroCards(view);
  const last = cards[cards.length - 1];
  const y = last.y + last.h + 20;
  return items.map((item, index) =>
    smallButton(item.id, item.label, x0 + index * (SMALL_W + SMALL_GAP), y, SMALL_W, current === item.difficulty),
  );
}

/** 「对手」一行：左侧头像框、中间名字、右侧换人按钮。 */
export interface OpponentRow extends Rect {
  bust: Rect;
  reroll: MenuButton;
}

export function getOpponentRow(view: View): OpponentRow {
  const diff = getDifficultyButtons(view, 'normal');
  const last = diff[diff.length - 1];
  const y = last.y + last.h + 20;
  const h = 96;
  const w = Math.min(view.w - 80, 760);
  const x = (view.w - w) / 2;
  return {
    x,
    y,
    w,
    h,
    bust: { x: x + 16, y: y + 8, w: h - 16, h: h - 16 },
    reroll: smallButton('reroll', '换一个', x + w - SMALL_W - 16, y + (h - SMALL_H) / 2, SMALL_W),
  };
}

const BIG_W = 320;
const BIG_H = 70;
const BIG_GAP = 26;

function bigButton(id: MenuId, label: string, primary: boolean, centerY: number, view: View): MenuButton {
  return {
    id,
    label,
    primary,
    active: false,
    x: (view.w - BIG_W) / 2,
    y: centerY - BIG_H / 2,
    w: BIG_W,
    h: BIG_H,
  };
}

export function getTitleButton(view: View): MenuButton {
  return bigButton('title-start', '开始游戏', true, view.h * 0.78, view);
}

export function getFightButton(view: View): MenuButton {
  return bigButton('fight', '开始对战', true, view.h - 72, view);
}

/** 结算页按钮横排一行，最多三个，互不遮挡。 */
export function getResultButtons(view: View, canRevive: boolean): MenuButton[] {
  const specs: Array<{ id: MenuId; label: string; primary: boolean }> = [];
  if (canRevive) specs.push({ id: 'revive', label: '看视频续关', primary: true });
  specs.push({ id: 'rematch', label: '再来一局', primary: !canRevive });
  specs.push({ id: 'reselect', label: '换英雄', primary: false });

  const total = specs.length * BIG_W + (specs.length - 1) * BIG_GAP;
  const x0 = (view.w - total) / 2;
  const y = view.h * 0.79 - BIG_H / 2;
  return specs.map((spec, index) => ({
    id: spec.id,
    label: spec.label,
    primary: spec.primary,
    active: false,
    x: x0 + index * (BIG_W + BIG_GAP),
    y,
    w: BIG_W,
    h: BIG_H,
  }));
}

export function hitTestMenu(buttons: readonly MenuButton[], x: number, y: number): MenuButton | null {
  for (const button of buttons) {
    if (x >= button.x && x <= button.x + button.w && y >= button.y && y <= button.y + button.h) {
      return button;
    }
  }
  return null;
}

export function hitTestRect(rect: Rect, x: number, y: number): boolean {
  return x >= rect.x && x <= rect.x + rect.w && y >= rect.y && y <= rect.y + rect.h;
}
