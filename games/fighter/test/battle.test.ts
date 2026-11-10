import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  EMPTY_INPUT,
  createBattle,
  isFinished,
  reviveFromResult,
  step,
  winnerOf,
} from '../src/core/battle.ts';
import type { BattleState, Input } from '../src/core/battle.ts';
import {
  COMBO_WINDOW,
  KO_FRAMES,
  MAX_ENERGY,
  MAX_ROUNDS,
  ROUND_FRAMES,
  ROUNDS_TO_WIN,
  STAGE_H,
  STAGE_W,
  WALL_LEFT,
  WALL_RIGHT,
} from '../src/core/constants.ts';
import { HEROES, HERO_ORDER } from '../src/core/heroes.ts';
import {
  DIR_MID_X,
  getDifficultyButtons,
  getFightButton,
  getHeroCards,
  getOpponentRow,
  getPadButtons,
  getQuitButton,
  getResultButtons,
  getTitleButton,
  hitTestMenu,
  hitTestPad,
  hitTestRect,
  padHitRadius,
} from '../src/core/layout.ts';
import {
  getMove,
  isActiveFrame,
  isStartupFrame,
  maxHitsInWindow,
  moveTotalFrames,
} from '../src/core/moves.ts';
import type { MoveKind } from '../src/core/moves.ts';
import type { View } from '../src/core/view.ts';
import { createView, groundScreenY, stageOffsetX } from '../src/core/view.ts';

const VIEW: View = { w: STAGE_W, h: STAGE_H };

/** 三种典型横屏视口：16:9、4:3 平板、20:9 全面屏。逻辑视图统一高 720。 */
const VIEWPORTS: Array<[number, number]> = [
  [1280, 720],
  [1024, 768],
  [1600, 720],
];

const light = (): Input => ({ ...EMPTY_INPUT, light: true });
const ultimate = (): Input => ({ ...EMPTY_INPUT, ultimate: true });
const attackWith = (state: BattleState, input: Input): void => {
  state.p1.x = 300;
  state.p2.x = 300 + 60;
  step(state, input, EMPTY_INPUT);
};

/** 把双方血量调到相同的百分比，用来构造平局。 */
function tieHp(state: BattleState): void {
  state.p1.hp = state.p1.maxHp * 0.5;
  state.p2.hp = state.p2.maxHp * 0.5;
}

/** 跳过 ready 阶段，直接进入 fight。 */
function toFight(state: BattleState): BattleState {
  while (state.phase === 'ready') step(state, EMPTY_INPUT, EMPTY_INPUT);
  return state;
}

/* ------------------------------------------------------------ 帧数据 */

test('三段招式的帧数、伤害、射程与设计表一致', () => {
  const hero = HEROES.niu;
  const expected: Record<MoveKind, { startup: number; active: number; recovery: number; reach: number }> = {
    light: { startup: 6, active: 3, recovery: 7, reach: 95 },
    heavy: { startup: 15, active: 4, recovery: 16, reach: 110 },
    ultimate: { startup: 22, active: 10, recovery: 26, reach: 190 },
  };

  for (const kind of ['light', 'heavy', 'ultimate'] as MoveKind[]) {
    const move = getMove(hero, kind);
    const want = expected[kind];
    assert.equal(move.startup, want.startup, `${kind} 前摇`);
    assert.equal(move.active, want.active, `${kind} 判定`);
    assert.equal(move.recovery, want.recovery, `${kind} 后摇`);
    assert.equal(move.reach, want.reach, `${kind} 射程`);
    assert.equal(
      moveTotalFrames(move),
      want.startup + want.active + want.recovery,
      `${kind} 总帧`,
    );
  }
});

test('判定帧区间是 [startup, startup+active)', () => {
  const move = getMove(HEROES.gu, 'light');
  assert.equal(isStartupFrame(move, 0), true);
  assert.equal(isStartupFrame(move, move.startup - 1), true);
  assert.equal(isStartupFrame(move, move.startup), false);
  assert.equal(isActiveFrame(move, move.startup - 1), false);
  assert.equal(isActiveFrame(move, move.startup), true);
  assert.equal(isActiveFrame(move, move.startup + move.active), false);
});

test('速度型英雄的前摇比力量型短', () => {
  const gu = HEROES.gu;
  const niu = HEROES.niu;
  assert.ok(
    getMove(gu, 'light').startup < getMove(niu, 'light').startup,
    '奶娃的轻拳应当更快',
  );
  assert.ok(getMove(gu, 'heavy').startup < getMove(niu, 'heavy').startup);
});

/* ------------------------------------------------------------ 基础战局 */

test('开局双方满血、面向对方、处于 ready', () => {
  const state = createBattle('niu', 'gu', 1);
  assert.equal(state.phase, 'ready');
  assert.equal(state.p1.hp, HEROES.niu.maxHp);
  assert.equal(state.p2.hp, HEROES.gu.maxHp);
  assert.equal(state.p1.facing, 1);
  assert.equal(state.p2.facing, -1);
  assert.ok(state.p1.x < state.p2.x);
});

test('ready 阶段不接受任何输入', () => {
  const state = createBattle('niu', 'gu', 1);
  for (let i = 0; i < 50; i += 1) step(state, ultimate(), ultimate());
  assert.equal(state.p1.energy, 0, 'ready 阶段不应扣能量');
  assert.equal(state.p1.move, null);
  assert.equal(state.p2.hp, HEROES.gu.maxHp);
});

test('轻拳命中造成伤害并扣血', () => {
  const state = toFight(createBattle('niu', 'gu', 1));
  const before = state.p2.hp;
  attackWith(state, light());
  // 推进到判定帧
  for (let i = 0; i < 12; i += 1) step(state, EMPTY_INPUT, EMPTY_INPUT);
  assert.ok(state.p2.hp < before, '轻拳应当造成伤害');
});

test('轻拳是单段，不会因为判定帧多而多打', () => {
  const state = toFight(createBattle('niu', 'gu', 1));
  const before = state.p2.hp;
  attackWith(state, light());
  for (let i = 0; i < 30; i += 1) step(state, EMPTY_INPUT, EMPTY_INPUT);
  const damage = before - state.p2.hp;
  assert.ok(damage > 0);
  assert.ok(damage < HEROES.niu.tuning.light.damage * 2, `单次轻拳不应多段，实际伤害 ${damage}`);
});

test('咕咕嘎嘎大招是 3 段弹幕，总伤害高于单段', () => {
  const state = toFight(createBattle('nai', 'gu', 1));
  state.p1.energy = MAX_ENERGY;
  state.p1.x = 300;
  state.p2.x = 330;
  state.p2.maxHp = 9999;
  state.p2.hp = 9999;
  step(state, ultimate(), EMPTY_INPUT);
  for (let i = 0; i < 40; i += 1) step(state, EMPTY_INPUT, EMPTY_INPUT);
  const perHit = HEROES.nai.tuning.ultimate.damage;
  const total = 9999 - state.p2.hp;
  assert.ok(total >= perHit * 2, `鸽群弹幕应当多段，实际总伤害 ${total}`);
  // 3 段上限 + 连击加成最多 40%
  assert.ok(total <= perHit * 3 * 1.4, `超过 3 段上限，实际 ${total}`);
});

test('奶娃大招每段伤害低但硬直短，不会无限锁', () => {
  const move = getMove(HEROES.gu, 'ultimate');
  assert.equal(move.hits, 6);
  assert.ok(move.hitStun < HEROES.gu.tuning.heavy.damage, '硬直应短于重拳伤害值');
  assert.ok(move.hitStun <= 20, `硬直 ${move.hitStun} 过长会导致无限连`);
  assert.equal(maxHitsInWindow(move), 6);
});

test('大招不会在判定窗内无限连击', () => {
  const state = toFight(createBattle('gu', 'nai', 1));
  state.p1.energy = MAX_ENERGY;
  state.p1.x = 300;
  state.p2.x = 330;
  state.p2.maxHp = 9999;
  state.p2.hp = 9999;
  step(state, ultimate(), EMPTY_INPUT);
  for (let i = 0; i < 120; i += 1) step(state, EMPTY_INPUT, EMPTY_INPUT);
  const total = 9999 - state.p2.hp;
  assert.ok(
    total <= HEROES.gu.tuning.ultimate.damage * 6 * 1.4,
    `超过 6 段上限，实际 ${total}`,
  );
});

test('超出射程打不到人', () => {
  const state = toFight(createBattle('niu', 'gu', 1));
  state.p1.x = WALL_LEFT;
  state.p2.x = WALL_RIGHT;
  const before = state.p2.hp;
  step(state, light(), EMPTY_INPUT);
  for (let i = 0; i < 30; i += 1) step(state, EMPTY_INPUT, EMPTY_INPUT);
  assert.equal(state.p2.hp, before, '远距离轻拳不应命中');
});

test('防御把伤害压到 15% 左右', () => {
  const open = toFight(createBattle('niu', 'gu', 1));
  const openBefore = open.p2.hp;
  attackWith(open, light());
  for (let i = 0; i < 20; i += 1) step(open, EMPTY_INPUT, EMPTY_INPUT);
  const openDamage = openBefore - open.p2.hp;

  const guarded = toFight(createBattle('niu', 'gu', 1));
  const guardedBefore = guarded.p2.hp;
  guarded.p1.x = 300;
  guarded.p2.x = 360;
  guarded.p2.blocking = true;
  step(guarded, light(), { ...EMPTY_INPUT, block: true });
  for (let i = 0; i < 20; i += 1) step(guarded, EMPTY_INPUT, { ...EMPTY_INPUT, block: true });
  const guardedDamage = guardedBefore - guarded.p2.hp;

  assert.ok(guardedDamage > 0, '防御不是无敌');
  assert.ok(guardedDamage <= Math.ceil(openDamage * 0.3), `防御伤害 ${guardedDamage} 应远小于 ${openDamage}`);
});

test('能量不足时大招不启动、也不消耗能量', () => {
  const state = toFight(createBattle('niu', 'gu', 1));
  state.p1.energy = 40;
  step(state, ultimate(), EMPTY_INPUT);
  assert.equal(state.p1.energy, 40);
  assert.equal(state.p1.move, null);
});

test('满能量可放大招并清空能量', () => {
  const state = toFight(createBattle('niu', 'gu', 1));
  state.p1.energy = MAX_ENERGY;
  step(state, ultimate(), EMPTY_INPUT);
  assert.equal(state.p1.energy, 0);
  assert.equal(state.p1.move?.kind, 'ultimate');
});

test('出招优先级：大招 > 重拳 > 轻拳', () => {
  const state = toFight(createBattle('niu', 'gu', 1));
  state.p1.energy = MAX_ENERGY;
  step(state, { move: 0, light: true, heavy: true, ultimate: true, block: false }, EMPTY_INPUT);
  assert.equal(state.p1.move?.kind, 'ultimate');
});

/* ------------------------------------------------------------ 连击 */

test('连击在窗口内累积、窗口外清零', () => {
  const battle = toFight(createBattle('gu', 'nai', 1));
  // 手动制造一次命中
  battle.p1.x = 300;
  battle.p2.x = 340;
  step(battle, light(), EMPTY_INPUT);
  for (let i = 0; i < 10; i += 1) step(battle, EMPTY_INPUT, EMPTY_INPUT);
  assert.equal(battle.p1.combo, 1);
  assert.ok(battle.p1.comboTimer > 0);

  // 等超过窗口
  for (let i = 0; i < COMBO_WINDOW + 2; i += 1) step(battle, EMPTY_INPUT, EMPTY_INPUT);
  assert.equal(battle.p1.combo, 0, '超窗后连击清零');
  assert.equal(battle.p1.comboTimer, 0);
});

test('连击加成封顶在 40%', () => {
  const battle = toFight(createBattle('gu', 'nai', 1));
  battle.p1.combo = 50;
  battle.p1.comboTimer = COMBO_WINDOW;
  battle.p1.x = 300;
  battle.p2.x = 340;
  const before = battle.p2.hp;
  step(battle, light(), EMPTY_INPUT);
  for (let i = 0; i < 12; i += 1) step(battle, EMPTY_INPUT, EMPTY_INPUT);
  const damage = before - battle.p2.hp;
  const base = HEROES.gu.tuning.light.damage;
  assert.ok(damage <= Math.ceil(base * 1.4) + 1, `伤害 ${damage} 超过 1.4 倍上限 ${base * 1.4}`);
});

/* ------------------------------------------------------------ 边界与碰撞 */

test('角色不能走出墙外', () => {
  const state = toFight(createBattle('niu', 'gu', 1));
  for (let i = 0; i < 400; i += 1) step(state, { ...EMPTY_INPUT, move: -1 }, { ...EMPTY_INPUT, move: 1 });
  assert.ok(state.p1.x >= WALL_LEFT - 0.001, `p1.x=${state.p1.x}`);
  assert.ok(state.p2.x <= WALL_RIGHT + 0.001, `p2.x=${state.p2.x}`);
});

test('双方不会重叠', () => {
  const state = toFight(createBattle('niu', 'gu', 1));
  for (let i = 0; i < 200; i += 1) {
    step(state, { ...EMPTY_INPUT, move: 1 }, { ...EMPTY_INPUT, move: -1 });
    assert.ok(state.p2.x - state.p1.x >= 90, `间隙 ${state.p2.x - state.p1.x} 过小`);
  }
});

test('朝向自动跟随对手', () => {
  const state = toFight(createBattle('niu', 'gu', 1));
  for (let i = 0; i < 120; i += 1) step(state, { ...EMPTY_INPUT, move: 1 }, { ...EMPTY_INPUT, move: -1 });
  assert.equal(state.p1.facing, state.p2.x >= state.p1.x ? 1 : -1);
});

/* ------------------------------------------------------------ 回合与结算 */

test('打到 0 血进入 ko，再进入 result', () => {
  const state = toFight(createBattle('niu', 'gu', 1));
  state.p2.hp = 1;
  state.p2.maxHp = HEROES.gu.maxHp;
  state.p1.x = 300;
  state.p2.x = 360;
  step(state, light(), EMPTY_INPUT);
  for (let i = 0; i < 12; i += 1) step(state, EMPTY_INPUT, EMPTY_INPUT);
  assert.equal(state.phase, 'ko');
  assert.equal(state.wins.p1, 1);

  for (let i = 0; i < 120; i += 1) step(state, EMPTY_INPUT, EMPTY_INPUT);
  assert.notEqual(state.phase, 'ko', 'ko 演出结束后应离开 ko');
});

test('超时按血量百分比判定', () => {
  const state = toFight(createBattle('niu', 'gu', 1));
  state.p1.hp = state.p1.maxHp;
  state.p2.hp = Math.floor(state.p2.maxHp * 0.5);
  state.timeLeft = 1;
  step(state, EMPTY_INPUT, EMPTY_INPUT);
  assert.equal(state.phase, 'ko');
  assert.equal(state.lastRound?.reason, 'timeout');
  assert.equal(state.lastRound?.winner, 'p1');
});

test('两胜即结束整场', () => {
  const state = createBattle('niu', 'gu', 1);
  state.wins.p1 = ROUNDS_TO_WIN - 1;
  toFight(state);
  state.p2.hp = 1;
  state.p1.x = 300;
  state.p2.x = 360;
  step(state, light(), EMPTY_INPUT);
  for (let i = 0; i < 400; i += 1) step(state, EMPTY_INPUT, EMPTY_INPUT);
  assert.equal(state.phase, 'result');
  assert.equal(winnerOf(state), 'p1');
  assert.equal(isFinished(state), true);
});

test('续关把对手的胜场吐回来并重置回合', () => {
  const state = createBattle('niu', 'gu', 1);
  state.wins = { p1: 1, p2: 2 };
  state.round = 3;
  state.phase = 'result';
  state.winner = 'p2';
  reviveFromResult(state);

  assert.equal(state.wins.p2, 1);
  assert.equal(state.wins.p1, 1);
  assert.equal(state.phase, 'ready');
  assert.equal(state.round, 3);
  assert.ok(state.p1.hp > state.p2.hp, '续关的一方应当更有利');
});

test('打满回合数不超过设计上限', () => {
  const state = createBattle('niu', 'gu', 1);
  // 每回合都打成平局（血量比例完全相同），逼回合数往上顶。
  let guard = 0;
  while (!isFinished(state) && guard < MAX_ROUNDS * KO_FRAMES * 4) {
    if (state.phase === 'ready') toFight(state);
    tieHp(state);
    state.timeLeft = 1;
    for (let i = 0; i < KO_FRAMES + 2 && !isFinished(state); i += 1) {
      step(state, EMPTY_INPUT, EMPTY_INPUT);
      guard += 1;
    }
  }

  assert.equal(isFinished(state), true, '平局连打也必须收敛到结算');
  assert.ok(state.round <= MAX_ROUNDS, `回合数 ${state.round} 不应超过 ${MAX_ROUNDS}`);
  assert.equal(state.phase, 'result');
});

test('平局双方各记一分，不会互相抵消', () => {
  const state = toFight(createBattle('niu', 'gu', 1));
  tieHp(state);
  state.timeLeft = 1;
  step(state, EMPTY_INPUT, EMPTY_INPUT);
  assert.equal(state.lastRound?.winner, 'draw');
  assert.equal(state.wins.p1, 1);
  assert.equal(state.wins.p2, 1);
});

test('重拳击退把对手整体推开一段可见距离', () => {
  const state = toFight(createBattle('niu', 'gu', 1));
  state.p1.x = 300;
  state.p2.x = 450;
  state.p1.facing = 1;
  state.p2.facing = -1;
  state.timeLeft = ROUND_FRAMES;

  const from = state.p2.x;
  const input: Input = { ...EMPTY_INPUT, heavy: true };
  step(state, input, EMPTY_INPUT);
  for (let i = 0; i < 60; i += 1) step(state, EMPTY_INPUT, EMPTY_INPUT);

  const moved = state.p2.x - from;
  assert.ok(moved > 30, `击退净位移应当明显（实际 ${moved.toFixed(1)}px）`);
  assert.ok(moved < 90, `击退不应把对手弹飞太远（实际 ${moved.toFixed(1)}px）`);
});

/* ------------------------------------------------------------ 英雄数值 */

test('三位英雄数值完整且互不相同', () => {
  assert.equal(HERO_ORDER.length, 3);
  const names = new Set<string>();
  for (const key of HERO_ORDER) {
    const hero = HEROES[key];
    assert.ok(hero.maxHp > 0);
    assert.ok(hero.speed > 0);
    assert.ok(hero.ultimateName.length > 0);
    names.add(hero.name);
  }
  assert.equal(names.size, 3, '英雄名不应重复');
});

test('大招总伤害显著高于重拳', () => {
  for (const key of HERO_ORDER) {
    const hero = HEROES[key];
    const move = getMove(hero, 'ultimate');
    const total = hero.tuning.ultimate.damage * maxHitsInWindow(move);
    assert.ok(total > hero.tuning.heavy.damage, `${hero.name} 大招总伤害应当高于重拳`);
  }
});

test('速度型靠段数、力量型靠单段，定位有区分', () => {
  assert.equal(getMove(HEROES.gu, 'ultimate').hits, 6);
  assert.equal(getMove(HEROES.nai, 'ultimate').hits, 3);
  assert.equal(getMove(HEROES.niu, 'ultimate').hits, 1);
  assert.ok(
    HEROES.niu.tuning.ultimate.damage > HEROES.gu.tuning.ultimate.damage,
    '牛来单段要最痛',
  );
});

/* ------------------------------------------------------------ 布局 */

test('操作键都在屏幕内且不重叠', () => {
  for (const [vw, vh] of VIEWPORTS) {
    const view = createView(vw, vh);
    const buttons = getPadButtons(MAX_ENERGY, view);
    assert.equal(buttons.length, 6);

    for (const button of buttons) {
      assert.ok(button.cx - button.r >= 0, `${button.id} 左边越界`);
      assert.ok(button.cx + button.r <= view.w, `${button.id} 右边越界`);
      assert.ok(button.cy - button.r >= 0, `${button.id} 上边越界`);
      assert.ok(button.cy + button.r <= view.h, `${button.id} 下边越界`);
    }

    // 任意两个动作键的圆心距离必须大于半径和的 0.95（允许视觉微贴）
    for (let i = 0; i < buttons.length; i += 1) {
      for (let j = i + 1; j < buttons.length; j += 1) {
        const a = buttons[i];
        const b = buttons[j];
        const d = Math.hypot(a.cx - b.cx, a.cy - b.cy);
        assert.ok(d > (a.r + b.r) * 0.92, `${a.id} 与 ${b.id} 重叠：${d.toFixed(1)}`);
      }
    }
  }
});

test('能量不足时大招键置灰且点不到', () => {
  const buttons = getPadButtons(0, VIEW);
  const ult = buttons.find((b) => b.id === 'ultimate');
  assert.ok(ult);
  assert.equal(ult.enabled, false);
  assert.equal(hitTestPad(buttons, ult.cx, ult.cy), null);

  const full = getPadButtons(MAX_ENERGY, VIEW);
  const ultFull = full.find((b) => b.id === 'ultimate');
  assert.ok(ultFull);
  assert.equal(ultFull.enabled, true);
  assert.equal(hitTestPad(full, ultFull.cx, ultFull.cy)?.id, 'ultimate');
});

test('方向键中线在左右键之间', () => {
  const buttons = getPadButtons(MAX_ENERGY, VIEW);
  const left = buttons.find((b) => b.id === 'left')!;
  const right = buttons.find((b) => b.id === 'right')!;
  assert.ok(DIR_MID_X > left.cx && DIR_MID_X < right.cx, `中线 ${DIR_MID_X} 不在 ${left.cx}~${right.cx}`);
});

test('命中测试按放宽后的判定半径，半径外返回 null', () => {
  const buttons = getPadButtons(MAX_ENERGY, VIEW);
  const lightBtn = buttons.find((b) => b.id === 'light')!;
  const hit = padHitRadius(lightBtn);
  assert.ok(hit > lightBtn.r, '判定半径应比绘制半径宽松');
  assert.equal(hitTestPad(buttons, lightBtn.cx, lightBtn.cy)?.id, 'light');
  assert.equal(hitTestPad(buttons, lightBtn.cx + hit - 2, lightBtn.cy)?.id, 'light');
  assert.equal(hitTestPad(buttons, lightBtn.cx + hit + 4, lightBtn.cy), null);
});

test('所有菜单按钮都在屏幕内且互不重叠', () => {
  for (const [vw, vh] of VIEWPORTS) {
    const view = createView(vw, vh);
    const tag = `${vw}x${vh}`;
    const groups: Array<{ name: string; buttons: Array<{ x: number; y: number; w: number; h: number }> }> = [
      { name: 'title', buttons: [getTitleButton(view)] },
      { name: 'heroCards', buttons: getHeroCards(view) },
      { name: 'difficulty', buttons: getDifficultyButtons(view, 'normal') },
      { name: 'opponent', buttons: [getOpponentRow(view)] },
      { name: 'reroll', buttons: [getOpponentRow(view).reroll] },
      { name: 'fight', buttons: [getFightButton(view)] },
      { name: 'result-revive', buttons: getResultButtons(view, true) },
      { name: 'result-plain', buttons: getResultButtons(view, false) },
    ];

    for (const group of groups) {
      for (const button of group.buttons) {
        assert.ok(button.x >= 0, `${group.name} 左边越界 ${tag}`);
        assert.ok(button.x + button.w <= view.w + 0.001, `${group.name} 右边越界 ${tag}`);
        assert.ok(button.y >= 0, `${group.name} 上边越界 ${tag}`);
        assert.ok(button.y + button.h <= view.h + 0.001, `${group.name} 下边越界 ${tag}`);
      }
      for (let i = 0; i < group.buttons.length; i += 1) {
        for (let j = i + 1; j < group.buttons.length; j += 1) {
          const a = group.buttons[i];
          const b = group.buttons[j];
          const overlapX = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
          const overlapY = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
          assert.ok(overlapX <= 0 || overlapY <= 0, `${group.name} 内按钮重叠 ${tag}`);
        }
      }
    }
  }
});

test('选人页各区块纵向不重叠', () => {
  for (const [vw, vh] of VIEWPORTS) {
    const view = createView(vw, vh);
    const tag = `${vw}x${vh}`;
    const cards = getHeroCards(view);
    const diff = getDifficultyButtons(view, 'normal');
    const row = getOpponentRow(view);
    const fight = getFightButton(view);

    const cardsBottom = cards[0].y + cards[0].h;
    assert.ok(diff[0].y >= cardsBottom, `难度行压住了卡片 ${tag}`);
    const diffBottom = diff[0].y + diff[0].h;
    assert.ok(row.y >= diffBottom, `对手行压住了难度行 ${tag}`);
    const rowBottom = row.y + row.h;
    assert.ok(fight.y >= rowBottom, `开战按钮压住了对手行 ${tag}`);
  }
});

test('结算按钮随是否可续关重排', () => {
  const withRevive = getResultButtons(VIEW, true);
  const without = getResultButtons(VIEW, false);
  assert.equal(withRevive[0].id, 'revive');
  assert.equal(without[0].id, 'rematch');
  assert.equal(withRevive.length, 3);
  assert.equal(without.length, 2);
  assert.equal(hitTestMenu(withRevive, -10, -10), null);
  assert.equal(hitTestMenu(withRevive, withRevive[0].x + 4, withRevive[0].y + 4)?.id, 'revive');
});

test('返回按钮不与血条重叠', () => {
  const quit = getQuitButton(VIEW);
  assert.ok(quit.y >= 80, '返回键要避开顶部血条');
  assert.ok(hitTestRect(quit, quit.x + 1, quit.y + 1));
  assert.ok(!hitTestRect(quit, quit.x - 1, quit.y));
});

test('地面在屏幕上的比例稳定', () => {
  for (const [vw, vh] of VIEWPORTS) {
    const view = createView(vw, vh);
    const y = groundScreenY(view);
    assert.ok(y > view.h * 0.5 && y < view.h * 0.9, `地面 y=${y} 不在合理区间 ${vw}x${vh}`);
  }
});

test('横屏视图：高度恒定，宽度不超过舞台时不留偏移', () => {
  for (const [vw, vh] of VIEWPORTS) {
    const view = createView(vw, vh);
    assert.equal(view.h, STAGE_H, `${vw}x${vh} 逻辑高度应为 STAGE_H`);
    assert.ok(view.w >= STAGE_W, `${vw}x${vh} 逻辑宽度不应小于舞台宽`);
    const offset = stageOffsetX(view);
    assert.ok(offset >= 0);
    // 战斗世界必须完整落在逻辑视图里
    assert.ok(offset + STAGE_W <= view.w + 0.001, `${vw}x${vh} 舞台越界`);
  }
});
