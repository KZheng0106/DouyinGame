import { canRevive, type GameState } from './game.ts';
import type { View } from './view.ts';

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export type ButtonId = 'start' | 'revive' | 'restart';

export interface Button extends Rect {
  id: ButtonId;
  label: string;
  primary: boolean;
}

const BUTTON_W = 200;
const BUTTON_H = 54;
const BUTTON_GAP = 20;

function makeButton(id: ButtonId, label: string, primary: boolean, centerY: number, view: View): Button {
  return {
    id,
    label,
    primary,
    x: (view.w - BUTTON_W) / 2,
    y: centerY - BUTTON_H / 2,
    w: BUTTON_W,
    h: BUTTON_H,
  };
}

/** 当前阶段可点击的按钮；渲染与点击判定共用同一份几何信息。 */
export function getButtons(state: GameState, view: View): Button[] {
  if (state.phase === 'ready') {
    return [makeButton('start', '开始游戏', true, view.h * 0.62, view)];
  }

  if (state.phase === 'dead') {
    const reviveAvailable = canRevive(state);
    const buttons: Button[] = [];
    const firstY = view.h * 0.55;
    if (reviveAvailable) buttons.push(makeButton('revive', '看视频复活', true, firstY, view));
    const restartY = reviveAvailable ? firstY + BUTTON_H + BUTTON_GAP : firstY;
    buttons.push(makeButton('restart', '重新开始', !reviveAvailable, restartY, view));
    return buttons;
  }

  return [];
}

export function hitTest(buttons: Button[], x: number, y: number): Button | null {
  for (const button of buttons) {
    if (x >= button.x && x <= button.x + button.w && y >= button.y && y <= button.y + button.h) {
      return button;
    }
  }
  return null;
}
