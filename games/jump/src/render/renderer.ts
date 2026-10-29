import { GAME_CONFIG } from '../config.ts';
import { MAX_REVIVES, PLATFORM_HEIGHT, PLAYER_SIZE } from '../core/constants.ts';
import type { GameState } from '../core/game.ts';
import type { Button } from '../core/layout.ts';
import { groundYOf, type View } from '../core/view.ts';

const STARS = Array.from({ length: 46 }, (_, i) => ({
  x: (i * 137.5) % 375,
  y: (i * 73.3) % 420,
  r: i % 3 === 0 ? 1.6 : 1,
  a: 0.2 + ((i * 37) % 45) / 100,
}));

export function draw(
  ctx: CanvasRenderingContext2D,
  state: GameState,
  view: View,
  buttons: Button[],
): void {
  drawBackground(ctx, view, state);
  drawPlatforms(ctx, view, state);
  drawPlayer(ctx, view, state);
  drawHud(ctx, view, state);
  drawPowerBar(ctx, view, state);

  if (state.phase === 'ready' || state.phase === 'dead' || state.phase === 'adLoading') {
    drawOverlay(ctx, view, state, buttons);
  }
}

function drawBackground(ctx: CanvasRenderingContext2D, view: View, state: GameState): void {
  const gradient = ctx.createLinearGradient(0, 0, 0, view.h);
  gradient.addColorStop(0, '#0d0f24');
  gradient.addColorStop(0.55, '#241a3f');
  gradient.addColorStop(1, '#3a2350');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, view.w, view.h);

  ctx.save();
  for (const star of STARS) {
    const x = mod(star.x - state.cameraX * 0.12, view.w);
    ctx.globalAlpha = star.a;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(x, star.y, star.r, star.r);
  }
  ctx.restore();

  ctx.save();
  ctx.globalAlpha = 0.92;
  ctx.beginPath();
  ctx.arc(view.w - 64, view.h * 0.15, 34, 0, Math.PI * 2);
  ctx.fillStyle = '#ffd166';
  ctx.fill();
  ctx.globalAlpha = 0.12;
  ctx.beginPath();
  ctx.arc(view.w - 64, view.h * 0.15, 54, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function drawPlatforms(ctx: CanvasRenderingContext2D, view: View, state: GameState): void {
  const groundY = groundYOf(view);
  const bottom = view.h;

  for (let i = 0; i < state.platforms.length; i += 1) {
    const platform = state.platforms[i];
    if (!platform) continue;

    const x = platform.x - state.cameraX;
    if (x + platform.w < -40 || x > view.w + 40) continue;

    ctx.fillStyle = '#1d1836';
    ctx.fillRect(x, groundY + PLATFORM_HEIGHT, platform.w, bottom - groundY);

    rr(ctx, x, groundY, platform.w, PLATFORM_HEIGHT + 10, 10);
    ctx.fillStyle = i === state.current ? '#4b3f8a' : '#352c5e';
    ctx.fill();

    ctx.fillStyle = i === state.current ? 'rgba(167,139,250,0.9)' : 'rgba(139,120,220,0.45)';
    ctx.fillRect(x + 4, groundY + 3, Math.max(0, platform.w - 8), 2.5);
  }
}

function drawPlayer(ctx: CanvasRenderingContext2D, view: View, state: GameState): void {
  const groundY = groundYOf(view);
  const cx = state.playerX - state.cameraX;
  const feetY = groundY + state.playerY;

  if (state.phase !== 'falling' && state.phase !== 'dead') {
    ctx.save();
    ctx.globalAlpha = 0.22;
    ctx.beginPath();
    ctx.ellipse(cx, groundY + 4, PLAYER_SIZE * 0.62, 5, 0, 0, Math.PI * 2);
    ctx.fillStyle = '#000000';
    ctx.fill();
    ctx.restore();
  }

  const squash = state.squash;
  const w = PLAYER_SIZE * (1 + 0.4 * squash);
  const h = PLAYER_SIZE * (1 - 0.32 * squash);

  ctx.save();
  ctx.shadowColor = 'rgba(255,209,102,0.55)';
  ctx.shadowBlur = 16;
  rr(ctx, cx - w / 2, feetY - h, w, h, 7);
  ctx.fillStyle = '#ffd166';
  ctx.fill();
  ctx.restore();

  const eyeY = feetY - h + PLAYER_SIZE * 0.34;
  ctx.fillStyle = '#241a3f';
  ctx.fillRect(cx - 5, eyeY, 3, 4);
  ctx.fillRect(cx + 2, eyeY, 3, 4);
}

function drawHud(ctx: CanvasRenderingContext2D, view: View, state: GameState): void {
  ctx.save();
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 46px sans-serif';
  ctx.fillText(String(state.score), view.w / 2, 74);

  ctx.textAlign = 'left';
  ctx.fillStyle = 'rgba(255,255,255,0.55)';
  ctx.font = 'bold 14px sans-serif';
  ctx.fillText(`最高 ${state.best}`, 20, 32);

  if (state.combo > 1) {
    ctx.textAlign = 'right';
    ctx.fillStyle = '#f472b6';
    ctx.font = 'bold 14px sans-serif';
    ctx.fillText(`连击 x${state.combo}`, view.w - 20, 32);
  }

  if (state.perfectFlash > 0) {
    ctx.globalAlpha = Math.min(1, state.perfectFlash / 0.4);
    ctx.textAlign = 'center';
    ctx.fillStyle = '#a78bfa';
    ctx.font = 'bold 18px sans-serif';
    ctx.fillText('完美 +2', view.w / 2, 118);
    ctx.globalAlpha = 1;
  }

  ctx.restore();
}

function drawPowerBar(ctx: CanvasRenderingContext2D, view: View, state: GameState): void {
  if (state.phase !== 'idle' && state.phase !== 'charging') return;

  const barW = 200;
  const barH = 12;
  const x = (view.w - barW) / 2;
  const y = view.h - 56;
  const active = state.phase === 'charging';

  ctx.save();
  ctx.globalAlpha = active ? 1 : 0.45;
  rr(ctx, x, y, barW, barH, barH / 2);
  ctx.fillStyle = 'rgba(255,255,255,0.16)';
  ctx.fill();

  if (state.power > 0.001) {
    const gradient = ctx.createLinearGradient(x, 0, x + barW, 0);
    gradient.addColorStop(0, '#34d399');
    gradient.addColorStop(0.6, '#fbbf24');
    gradient.addColorStop(1, '#f472b6');
    rr(ctx, x, y, Math.max(barH, barW * state.power), barH, barH / 2);
    ctx.fillStyle = gradient;
    ctx.fill();
  }

  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = 'rgba(255,255,255,0.65)';
  ctx.font = 'bold 13px sans-serif';
  ctx.fillText(active ? '松开跳跃' : '按住蓄力', view.w / 2, y - 16);
  ctx.restore();
}

function drawOverlay(
  ctx: CanvasRenderingContext2D,
  view: View,
  state: GameState,
  buttons: Button[],
): void {
  ctx.save();
  ctx.fillStyle = 'rgba(6,5,17,0.62)';
  ctx.fillRect(0, 0, view.w, view.h);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  if (state.phase === 'ready') {
    // 名字变长时自动缩小，避免超出画面
    const nameSize = Math.min(40, Math.floor((view.w - 48) / GAME_CONFIG.gameName.length));
    ctx.fillStyle = '#ffffff';
    ctx.font = `bold ${nameSize}px sans-serif`;
    ctx.fillText(GAME_CONFIG.gameName, view.w / 2, view.h * 0.34);

    ctx.fillStyle = 'rgba(255,255,255,0.7)';
    ctx.font = '15px sans-serif';
    ctx.fillText('按住屏幕蓄力，松开起跳', view.w / 2, view.h * 0.42);
    ctx.fillText('落在平台正中可获双倍分数', view.w / 2, view.h * 0.42 + 26);
  } else {
    const title = state.phase === 'adLoading' ? '广告加载中…' : '本局结束';
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 26px sans-serif';
    ctx.fillText(title, view.w / 2, view.h * 0.33);

    ctx.font = 'bold 56px sans-serif';
    ctx.fillStyle = '#ffd166';
    ctx.fillText(String(state.score), view.w / 2, view.h * 0.42);

    ctx.fillStyle = 'rgba(255,255,255,0.6)';
    ctx.font = '14px sans-serif';
    const reviveLeft = Math.max(0, MAX_REVIVES - state.revivesUsed);
    ctx.fillText(`最高 ${state.best} · 剩余复活 ${reviveLeft}`, view.w / 2, view.h * 0.475);

    if (state.phase === 'adLoading' && GAME_CONFIG.debugFakeAd) {
      ctx.fillStyle = 'rgba(248,113,113,0.8)';
      ctx.font = '12px sans-serif';
      ctx.fillText('调试模式：未播放真实广告', view.w / 2, view.h * 0.5 + 6);
    }
  }

  for (const button of buttons) drawButton(ctx, button);
  ctx.restore();
}

function drawButton(ctx: CanvasRenderingContext2D, button: Button): void {
  const radius = button.h / 2;
  rr(ctx, button.x, button.y, button.w, button.h, radius);

  if (button.primary) {
    const gradient = ctx.createLinearGradient(button.x, 0, button.x + button.w, 0);
    gradient.addColorStop(0, '#a78bfa');
    gradient.addColorStop(1, '#f472b6');
    ctx.fillStyle = gradient;
  } else {
    ctx.fillStyle = 'rgba(255,255,255,0.14)';
  }
  ctx.fill();

  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 18px sans-serif';
  ctx.fillText(button.label, button.x + button.w / 2, button.y + button.h / 2 + 1);
}

function rr(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
): void {
  const radius = Math.max(0, Math.min(r, w / 2, h / 2));
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.lineTo(x + w - radius, y);
  ctx.arcTo(x + w, y, x + w, y + radius, radius);
  ctx.lineTo(x + w, y + h - radius);
  ctx.arcTo(x + w, y + h, x + w - radius, y + h, radius);
  ctx.lineTo(x + radius, y + h);
  ctx.arcTo(x, y + h, x, y + h - radius, radius);
  ctx.lineTo(x, y + radius);
  ctx.arcTo(x, y, x + radius, y, radius);
  ctx.closePath();
}

function mod(value: number, base: number): number {
  return ((value % base) + base) % base;
}
