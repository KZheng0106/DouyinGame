import {
  CAMERA_ANCHOR,
  CHARGE_TIME,
  GRAVITY,
  JUMP_DURATION_MAX,
  JUMP_DURATION_MIN,
  JUMP_HEIGHT,
  MAX_JUMP_DIST,
  MAX_REVIVES,
  MIN_JUMP_DIST,
  PERFECT_TOLERANCE,
} from './constants.ts';
import { clamp, mulberry32 } from './rng.ts';
import type { View } from './view.ts';

export type Phase = 'ready' | 'idle' | 'charging' | 'jumping' | 'falling' | 'dead' | 'adLoading';

export type LandingResult = 'perfect' | 'good' | 'same' | 'miss' | null;

export interface Platform {
  x: number;
  w: number;
}

export interface Flight {
  fromX: number;
  toX: number;
  duration: number;
  t: number;
}

export interface GameState {
  phase: Phase;
  score: number;
  best: number;
  combo: number;
  /** 当前蓄力值 0..1。 */
  power: number;
  platforms: Platform[];
  /** 玩家当前站立的平台下标。 */
  current: number;
  playerX: number;
  /** 相对地面高度，负值为腾空。 */
  playerY: number;
  /** 落地压扁动画 0..1。 */
  squash: number;
  flight: Flight | null;
  fallVy: number;
  cameraX: number;
  revivesUsed: number;
  /** "完美"提示剩余时长。 */
  perfectFlash: number;
  lastResult: LandingResult;
  rng: () => number;
}

export const INITIAL_PLATFORM: Platform = { x: 0, w: 92 };

export function createGame(best = 0, seed = Date.now() >>> 0): GameState {
  const state: GameState = {
    phase: 'ready',
    score: 0,
    best,
    combo: 0,
    power: 0,
    platforms: [{ ...INITIAL_PLATFORM }],
    current: 0,
    playerX: INITIAL_PLATFORM.x + INITIAL_PLATFORM.w / 2,
    playerY: 0,
    squash: 0,
    flight: null,
    fallVy: 0,
    cameraX: 0,
    revivesUsed: 0,
    perfectFlash: 0,
    lastResult: null,
    rng: mulberry32(seed),
  };
  ensureAhead(state);
  return state;
}

/** 从标题页进入可操作状态。 */
export function startRun(state: GameState): void {
  if (state.phase === 'ready') state.phase = 'idle';
}

export function startCharge(state: GameState): void {
  if (state.phase !== 'idle') return;
  state.phase = 'charging';
  state.power = 0;
}

export function releaseCharge(state: GameState): void {
  if (state.phase !== 'charging') return;
  const power = clamp(state.power, 0, 1);
  const distance = MIN_JUMP_DIST + power * (MAX_JUMP_DIST - MIN_JUMP_DIST);
  state.flight = {
    fromX: state.playerX,
    toX: state.playerX + distance,
    duration: JUMP_DURATION_MIN + power * (JUMP_DURATION_MAX - JUMP_DURATION_MIN),
    t: 0,
  };
  state.power = power;
  state.phase = 'jumping';
}

export function canRevive(state: GameState): boolean {
  return state.revivesUsed < MAX_REVIVES;
}

/** 复活：回到摔落前站立的平台，保留分数。 */
export function revive(state: GameState): boolean {
  if (!canRevive(state)) return false;
  const platform = state.platforms[state.current];
  if (!platform) return false;
  state.playerX = platform.x + platform.w / 2;
  state.playerY = 0;
  state.fallVy = 0;
  state.flight = null;
  state.power = 0;
  state.squash = 1;
  state.revivesUsed += 1;
  state.lastResult = null;
  state.phase = 'idle';
  return true;
}

export function update(state: GameState, dtRaw: number, view: View): void {
  const dt = Math.min(Math.max(dtRaw, 0), 0.05);

  if (state.perfectFlash > 0) state.perfectFlash = Math.max(0, state.perfectFlash - dt);
  if (state.squash > 0) state.squash = Math.max(0, state.squash - dt * 6);

  if (state.phase === 'charging') {
    state.power = Math.min(1, state.power + dt / CHARGE_TIME);
  } else if (state.phase === 'jumping' && state.flight) {
    const flight = state.flight;
    flight.t += dt / flight.duration;
    const t = Math.min(1, flight.t);
    state.playerX = flight.fromX + (flight.toX - flight.fromX) * t;
    state.playerY = -4 * JUMP_HEIGHT * t * (1 - t);
    if (flight.t >= 1) resolveLanding(state, flight.toX);
  } else if (state.phase === 'falling') {
    state.fallVy += GRAVITY * dt;
    state.playerY += state.fallVy * dt;
    if (state.playerY > view.h + 120) {
      state.playerY = view.h + 120;
      state.phase = 'dead';
    }
  }

  const target = state.playerX - view.w * CAMERA_ANCHOR;
  if (state.cameraX < target) {
    state.cameraX += (target - state.cameraX) * Math.min(1, dt * 7);
  }
}

function resolveLanding(state: GameState, x: number): void {
  const index = findPlatform(state.platforms, x);

  if (index < 0) {
    state.phase = 'falling';
    state.fallVy = 0;
    state.flight = null;
    state.combo = 0;
    state.lastResult = 'miss';
    return;
  }

  const platform = state.platforms[index];
  if (!platform) return;

  if (index > state.current) {
    const center = platform.x + platform.w / 2;
    const perfect = Math.abs(x - center) <= PERFECT_TOLERANCE;
    state.score += perfect ? 2 : 1;
    state.combo = perfect ? state.combo + 1 : 0;
    state.current = index;
    if (state.score > state.best) state.best = state.score;
    if (perfect) state.perfectFlash = 0.7;
    state.lastResult = perfect ? 'perfect' : 'good';
    ensureAhead(state);
  } else {
    state.combo = 0;
    state.lastResult = 'same';
  }

  state.playerX = x;
  state.playerY = 0;
  state.flight = null;
  state.power = 0;
  state.squash = 1;
  state.phase = 'idle';
}

function findPlatform(platforms: Platform[], x: number): number {
  for (let i = 0; i < platforms.length; i += 1) {
    const platform = platforms[i];
    if (!platform) continue;
    if (x >= platform.x && x <= platform.x + platform.w) return i;
  }
  return -1;
}

function ensureAhead(state: GameState): void {
  while (state.platforms.length < state.current + 5) addPlatform(state);
}

/**
 * 追加下一块平台。约束：从当前平台最左端起跳也一定能落到下一块平台上，
 * 即 (上一块宽 + 间隔) 必须小于最大跳跃距离。
 */
function addPlatform(state: GameState): void {
  const last = state.platforms[state.platforms.length - 1];
  if (!last) return;

  const w = clamp(104 - state.score * 1.4, 54, 104);
  const gapMax = clamp(96 + state.score * 3.2, 96, 150);
  const gapMin = Math.max(54, gapMax - 58);
  const gap = gapMin + state.rng() * (gapMax - gapMin);

  state.platforms.push({ x: last.x + last.w + gap, w });
}
