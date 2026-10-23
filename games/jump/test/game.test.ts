import assert from 'node:assert/strict';
import { test } from 'node:test';

import { CHARGE_TIME, MAX_JUMP_DIST, MAX_REVIVES, MIN_JUMP_DIST } from '../src/core/constants.ts';
import {
  canRevive,
  createGame,
  releaseCharge,
  revive,
  startCharge,
  startRun,
  update,
  type GameState,
} from '../src/core/game.ts';
import { getButtons } from '../src/core/layout.ts';
import type { View } from '../src/core/view.ts';

const VIEW: View = { w: 375, h: 667 };
const FRAME = 1 / 60;

function step(state: GameState, seconds: number): void {
  const frames = Math.max(1, Math.round(seconds / FRAME));
  for (let i = 0; i < frames; i += 1) update(state, FRAME, VIEW);
}

function powerForDistance(distance: number): number {
  return (distance - MIN_JUMP_DIST) / (MAX_JUMP_DIST - MIN_JUMP_DIST);
}

function jumpWithPower(state: GameState, power: number): void {
  startCharge(state);
  state.power = power;
  releaseCharge(state);
}

/** 跳到下一块平台的正中央。 */
function jumpToNextCenter(state: GameState): void {
  const next = state.platforms[state.current + 1];
  assert.ok(next, '应当已经生成下一块平台');
  const power = powerForDistance(next.x + next.w / 2 - state.playerX);
  assert.ok(power <= 1 + 1e-9, `所需蓄力 ${power.toFixed(3)} 超出上限，关卡不可达`);
  jumpWithPower(state, Math.min(1, power));
  step(state, 1.2);
}

/** 站到当前平台右缘，用最短跳跃必然落进空隙。 */
function fallIntoGap(state: GameState): void {
  const platform = state.platforms[state.current];
  assert.ok(platform);
  state.playerX = platform.x + platform.w - 1;
  jumpWithPower(state, 0);
  step(state, 2);
}

test('蓄力在 CHARGE_TIME 后达到满值并封顶', () => {
  const state = createGame(0, 1);
  startRun(state);
  startCharge(state);

  step(state, CHARGE_TIME * 0.5);
  assert.equal(state.phase, 'charging');
  assert.ok(state.power > 0.4 && state.power < 0.6);

  step(state, CHARGE_TIME);
  assert.equal(state.power, 1);
});

test('落到下一块平台正中央判定为完美并得 2 分', () => {
  const state = createGame(0, 7);
  startRun(state);

  jumpToNextCenter(state);

  assert.equal(state.phase, 'idle');
  assert.equal(state.current, 1);
  assert.equal(state.score, 2);
  assert.equal(state.lastResult, 'perfect');
  assert.equal(state.combo, 1);
  assert.equal(state.playerY, 0);
});

test('落点偏离中心只得 1 分且连击清零', () => {
  const state = createGame(0, 9);
  startRun(state);
  jumpToNextCenter(state);

  const next = state.platforms[state.current + 1];
  assert.ok(next);
  const power = powerForDistance(next.x + 4 - state.playerX);
  jumpWithPower(state, power);
  step(state, 1.2);

  assert.equal(state.phase, 'idle');
  assert.equal(state.current, 2);
  assert.equal(state.score, 3);
  assert.equal(state.lastResult, 'good');
  assert.equal(state.combo, 0);
});

test('跳空后坠落并进入结束状态', () => {
  const state = createGame(0, 3);
  startRun(state);

  fallIntoGap(state);

  assert.equal(state.phase, 'dead');
  assert.equal(state.score, 0);
  assert.equal(state.lastResult, 'miss');
});

test('复活后保留分数并回到安全平台', () => {
  const state = createGame(0, 11);
  startRun(state);
  jumpToNextCenter(state);

  const score = state.score;
  const platformIndex = state.current;
  fallIntoGap(state);
  assert.equal(state.phase, 'dead');

  assert.equal(canRevive(state), true);
  assert.equal(revive(state), true);

  const platform = state.platforms[platformIndex];
  assert.ok(platform);
  assert.equal(state.phase, 'idle');
  assert.equal(state.score, score);
  assert.equal(state.current, platformIndex);
  assert.equal(state.revivesUsed, 1);
  assert.equal(state.playerX, platform.x + platform.w / 2);
  assert.equal(state.playerY, 0);
});

test('复活次数用尽后不再允许复活', () => {
  const state = createGame(0, 13);
  startRun(state);
  state.revivesUsed = MAX_REVIVES;
  state.phase = 'dead';

  assert.equal(canRevive(state), false);
  assert.equal(revive(state), false);
  assert.equal(state.phase, 'dead');
});

test('关卡生成始终可达，难度随分数收敛', () => {
  const state = createGame(0, 2024);
  startRun(state);

  for (let i = 0; i < 30; i += 1) {
    jumpToNextCenter(state);
    assert.equal(state.phase, 'idle', `第 ${i + 1} 跳后状态异常`);
  }

  for (let i = 0; i + 1 < state.platforms.length; i += 1) {
    const current = state.platforms[i];
    const next = state.platforms[i + 1];
    assert.ok(current && next);
    assert.ok(
      next.x - current.x <= MAX_JUMP_DIST,
      `平台 ${i} 到 ${i + 1} 的距离 ${(next.x - current.x).toFixed(1)} 超过最大跳跃距离`,
    );
    assert.ok(next.w >= 54 && next.w <= 104);
  }
});

test('相同种子生成完全一致的关卡', () => {
  const a = createGame(0, 42);
  const b = createGame(0, 42);
  assert.deepEqual(a.platforms, b.platforms);

  const c = createGame(0, 43);
  assert.notDeepEqual(a.platforms, c.platforms);
});

test('未处于蓄力状态时松开不会触发跳跃', () => {
  const state = createGame(0, 5);
  releaseCharge(state);
  assert.equal(state.phase, 'ready');
  assert.equal(state.flight, null);
});

test('结束界面按钮随剩余复活次数变化', () => {
  const state = createGame(0, 17);
  state.phase = 'dead';

  const withRevive = getButtons(state, VIEW).map((button) => button.id);
  assert.deepEqual(withRevive, ['revive', 'restart']);

  state.revivesUsed = MAX_REVIVES;
  const withoutRevive = getButtons(state, VIEW).map((button) => button.id);
  assert.deepEqual(withoutRevive, ['restart']);
});

test('标题页只有开始按钮', () => {
  const state = createGame(0, 19);
  assert.deepEqual(getButtons(state, VIEW).map((button) => button.id), ['start']);
  startRun(state);
  assert.deepEqual(getButtons(state, VIEW), []);
});
