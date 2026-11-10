/** 战斗虚拟按键。几何数据全部来自 layout.ts，这里只负责画。 */
import type { PadButton } from '../core/layout.ts';
import { shadowText } from './draw.ts';

export interface PadVisual {
  /** 当前被按住的键，用于加亮。 */
  held: ReadonlySet<string>;
}

function keyStyle(id: PadButton['id']): { fill: string; ring: string; text: string } {
  switch (id) {
    case 'left':
    case 'right':
      return { fill: 'rgba(140,190,255,0.20)', ring: 'rgba(150,205,255,0.75)', text: '#dcefff' };
    case 'light':
      return { fill: 'rgba(255,140,180,0.22)', ring: 'rgba(255,150,195,0.85)', text: '#ffe3ef' };
    case 'heavy':
      return { fill: 'rgba(255,180,120,0.20)', ring: 'rgba(255,195,140,0.8)', text: '#ffeeda' };
    case 'block':
      return { fill: 'rgba(120,235,255,0.18)', ring: 'rgba(140,240,255,0.8)', text: '#dcfbff' };
    default:
      return { fill: 'rgba(255,215,90,0.22)', ring: 'rgba(255,225,120,0.9)', text: '#fff6d2' };
  }
}

export function drawPads(
  ctx: CanvasRenderingContext2D,
  buttons: readonly PadButton[],
  visual: PadVisual,
): void {
  ctx.save();
  for (const button of buttons) {
    const held = visual.held.has(button.id);
    const style = keyStyle(button.id);
    const alpha = button.enabled ? 1 : 0.3;

    ctx.globalAlpha = alpha;

    if (held) {
      ctx.shadowColor = style.ring;
      ctx.shadowBlur = 22;
    }

    const grad = ctx.createRadialGradient(
      button.cx,
      button.cy - button.r * 0.4,
      button.r * 0.15,
      button.cx,
      button.cy,
      button.r,
    );
    grad.addColorStop(0, held ? 'rgba(255,255,255,0.34)' : style.fill);
    grad.addColorStop(1, 'rgba(10,6,22,0.42)');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(button.cx, button.cy, button.r, 0, Math.PI * 2);
    ctx.fill();

    ctx.shadowBlur = 0;
    ctx.strokeStyle = style.ring;
    ctx.lineWidth = held ? 4 : 2.5;
    ctx.beginPath();
    ctx.arc(button.cx, button.cy, button.r - 1, 0, Math.PI * 2);
    ctx.stroke();

    const size = button.label.length > 1 ? button.r * 0.52 : button.r * 0.8;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    shadowText(
      ctx,
      button.label,
      button.cx,
      button.cy + 1,
      `bold ${Math.round(size)}px sans-serif`,
      style.text,
      4,
    );
  }
  ctx.restore();
}
