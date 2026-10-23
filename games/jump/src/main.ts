import { showRewardedAd } from './ads.ts';
import { DESIGN_WIDTH } from './core/constants.ts';
import {
  canRevive,
  createGame,
  releaseCharge,
  revive,
  startCharge,
  startRun,
  update,
  type GameState,
} from './core/game.ts';
import { getButtons, hitTest, type Button } from './core/layout.ts';
import type { View } from './core/view.ts';
import { createPlatform } from './platform/index.ts';
import { draw } from './render/renderer.ts';

const BEST_KEY = 'dyjump:best';

const platform = createPlatform();
const ctx = platform.ctx;

let scale = 1;
let view: View = { w: DESIGN_WIDTH, h: 667 };
let game: GameState = createGame(readBest());

function readBest(): number {
  const raw = platform.getItem(BEST_KEY);
  const parsed = raw ? Number.parseInt(raw, 10) : 0;
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}

function persistBest(): void {
  platform.setItem(BEST_KEY, String(game.best));
}

function resize(): void {
  const viewport = platform.viewport();
  scale = viewport.width / DESIGN_WIDTH;

  const canvas = platform.canvas;
  canvas.width = Math.max(1, Math.round(viewport.width * viewport.dpr));
  canvas.height = Math.max(1, Math.round(viewport.height * viewport.dpr));

  const ratio = viewport.dpr * scale;
  ctx.setTransform(ratio, 0, 0, ratio, 0, 0);

  view = { w: DESIGN_WIDTH, h: viewport.height / scale };
}

function toLogical(position: { x: number; y: number }): { x: number; y: number } {
  return { x: position.x / scale, y: position.y / scale };
}

async function requestRevive(): Promise<void> {
  if (!canRevive(game) || game.phase !== 'dead') return;
  game.phase = 'adLoading';

  const result = await showRewardedAd(platform);
  if (result === 'completed' && canRevive(game)) {
    revive(game);
  } else {
    game.phase = 'dead';
  }
}

function handleButton(button: Button): void {
  if (button.id === 'start') {
    startRun(game);
  } else if (button.id === 'restart') {
    const best = game.best;
    game = createGame(best, Date.now() >>> 0);
    startRun(game);
    persistBest();
  } else if (button.id === 'revive') {
    void requestRevive();
  }
}

platform.onPointerDown((position) => {
  const point = toLogical(position);
  const button = hitTest(getButtons(game, view), point.x, point.y);
  if (button) {
    handleButton(button);
    return;
  }
  startCharge(game);
});

platform.onPointerUp(() => {
  releaseCharge(game);
});

platform.onResize(resize);

resize();

let lastPhase = game.phase;
let lastTime = 0;

function frame(time: number): void {
  if (lastTime === 0) lastTime = time;
  const dt = (time - lastTime) / 1000;
  lastTime = time;

  update(game, dt, view);
  draw(ctx, game, view, getButtons(game, view));

  if (game.phase !== lastPhase) {
    if (game.phase === 'dead') {
      persistBest();
      platform.vibrate('heavy');
    } else if (lastPhase === 'jumping' && game.phase === 'idle') {
      platform.vibrate('light');
    }
    lastPhase = game.phase;
  }

  platform.raf(frame);
}

platform.raf(frame);

