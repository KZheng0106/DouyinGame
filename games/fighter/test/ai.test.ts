import assert from 'node:assert/strict';
import { test } from 'node:test';

import { EMPTY_INPUT, createBattle, isFinished, step, winnerOf } from '../src/core/battle.ts';
import type { BattleState, Input } from '../src/core/battle.ts';
import { AiBrain } from '../src/core/ai.ts';
import type { Difficulty } from '../src/core/ai.ts';
import { HERO_ORDER } from '../src/core/heroes.ts';
import type { HeroKey } from '../src/core/heroes.ts';
import { MAX_ROUNDS } from '../src/core/constants.ts';

const DIFFICULTIES: Difficulty[] = ['easy', 'normal', 'hard'];
const FRAME_LIMIT = 30000;

interface Outcome {
  frames: number;
  winner: string | null;
  rounds: number;
  hp1: number;
  hp2: number;
}

/** AI 驱动 p2，p1 按给定策略出招，跑到结束或超帧。 */
function simulate(
  key1: HeroKey,
  key2: HeroKey,
  difficulty: Difficulty,
  p1Input: (state: BattleState) => Input,
  seed = 7,
): Outcome {
  const state = createBattle(key1, key2, seed);
  const brain = new AiBrain(difficulty);
  let frames = 0;
  while (!isFinished(state) && frames < FRAME_LIMIT) {
    step(state, p1Input(state), brain.think(state));
    frames += 1;
  }
  return {
    frames,
    winner: winnerOf(state),
    rounds: state.round,
    hp1: state.p1.hp,
    hp2: state.p2.hp,
  };
}

const idle = (): Input => ({ ...EMPTY_INPUT });
const retreat = (state: BattleState): Input => ({ ...EMPTY_INPUT, move: state.p1.x < 160 ? 0 : -1 });

test('AI 会主动进攻：站桩玩家在任一难度下都会被击倒', () => {
  for (const difficulty of DIFFICULTIES) {
    for (const [label, p1Input] of [
      ['站桩', idle],
      ['后退', retreat],
    ] as const) {
      const out = simulate('niu', 'gu', difficulty, p1Input);
      assert.ok(
        out.frames < FRAME_LIMIT,
        `${difficulty}/${label}：对局应当有结果，实际跑满 ${FRAME_LIMIT} 帧仍未结束`,
      );
      assert.equal(out.winner, 'p2', `${difficulty}/${label}：AI 应当赢下站桩玩家`);
      assert.equal(out.hp1, 0, `${difficulty}/${label}：玩家血量应当被打空`);
    }
  }
});

test('AI 对局不会超过回合上限', () => {
  for (const difficulty of DIFFICULTIES) {
    const out = simulate('niu', 'gu', difficulty, idle, 3);
    assert.ok(out.rounds <= MAX_ROUNDS, `${difficulty}：回合数 ${out.rounds} 超过上限 ${MAX_ROUNDS}`);
  }
});

test('难度梯度成立：hard 比 easy 更快解决站桩玩家', () => {
  const easy = simulate('niu', 'gu', 'easy', idle);
  const hard = simulate('niu', 'gu', 'hard', idle);
  assert.ok(hard.frames < easy.frames, `hard ${hard.frames} 帧应快于 easy ${easy.frames} 帧`);
});

test('AI 在每个英雄身上都能打出伤害', () => {
  for (const own of HERO_ORDER) {
    const foe = HERO_ORDER.find((k) => k !== own) as HeroKey;
    const out = simulate(foe, own, 'normal', idle);
    assert.ok(out.hp1 < 100, `${own} 作为 AI 应当打掉玩家血量，实际剩余 ${out.hp1}`);
  }
});
