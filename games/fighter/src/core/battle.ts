import {
  BLOCK_DAMAGE_SCALE,
  BLOCK_STUN_SCALE,
  BODY_HALF_W,
  COMBO_BONUS_STEP,
  COMBO_WINDOW,
  GROUND_Y,
  KO_FRAMES,
  MAX_COMBO_BONUS,
  MAX_ENERGY,
  MAX_ROUNDS,
  ROUND_FRAMES,
  ROUNDS_TO_WIN,
  STAGE_W,
  WALL_LEFT,
  WALL_RIGHT,
} from './constants.ts';
import { getHero, moveDamage, moveKnockback } from './heroes.ts';
import type { HeroKey } from './heroes.ts';
import { getMove, isActiveFrame, isStartupFrame, moveTotalFrames } from './moves.ts';
import type { MoveFrameData, MoveKind } from './moves.ts';
import { clamp, mulberry32 } from './rng.ts';

export type Phase = 'ready' | 'fight' | 'ko' | 'result';

export type Pose = 'idle' | 'walk' | 'attack' | 'hurt' | 'down' | 'win';

/** 玩家输入，每帧由平台层采集后塞进 step。 */
export interface Input {
  /** -1 左 / 0 不动 / 1 右 */
  move: -1 | 0 | 1;
  light: boolean;
  heavy: boolean;
  ultimate: boolean;
  block: boolean;
}

export const EMPTY_INPUT: Input = { move: 0, light: false, heavy: false, ultimate: false, block: false };

export interface ActiveMove {
  kind: MoveKind;
  data: MoveFrameData;
  /** 招式已进行的帧数，0 为第一帧。 */
  elapsed: number;
  /** 本次招式已命中的段数，超过 data.hits 就不再判。 */
  hitCount: number;
  /** 距离下一段判定可用的剩余帧数，多段招用。 */
  hitCooldown: number;
  /** 若被 counter hit 取消，标记为 true 用于特效。 */
  interrupted: boolean;
}

export interface Fighter {
  side: 'p1' | 'p2';
  hero: HeroKey;
  x: number;
  /** 站立的 y，恒为 GROUND_Y；下落后由掉落动画覆盖。 */
  hp: number;
  maxHp: number;
  energy: number;
  facing: 1 | -1;
  move: ActiveMove | null;
  /** 剩余硬直帧数，> 0 时不能行动。 */
  stun: number;
  blocking: boolean;
  /** 当前表现姿态，由派生函数决定，这里只做缓存。 */
  pose: Pose;
  /** 走路动画计时。 */
  walkTimer: number;
  /** 受击闪白剩余帧。 */
  flash: number;
  /** 击退位移残余，每帧衰减。 */
  pushback: number;
  combo: number;
  comboTimer: number;
  /** 本轮已造成的总伤害，用于结算面板。 */
  damageDealt: number;
}

export interface RoundResult {
  winner: 'p1' | 'p2' | 'draw';
  reason: 'ko' | 'timeout';
}

export interface BattleState {
  phase: Phase;
  frame: number;
  /** 当前回合剩余帧数。 */
  timeLeft: number;
  round: number;
  wins: { p1: number; p2: number };
  p1: Fighter;
  p2: Fighter;
  koTimer: number;
  lastRound: RoundResult | null;
  winner: 'p1' | 'p2' | null;
  /** 震屏强度，渲染层读取后每帧衰减。 */
  shake: number;
  rng: () => number;
  /** 本帧产生的命中事件，渲染层用来播特效和音效。 */
  events: HitEvent[];
}

export interface HitEvent {
  attacker: 'p1' | 'p2';
  kind: MoveKind;
  damage: number;
  x: number;
  y: number;
  blocked: boolean;
  /** 是否是 counter hit（打断对手前摇）。 */
  counter: boolean;
}

function createFighter(side: 'p1' | 'p2', heroKey: HeroKey, x: number, facing: 1 | -1): Fighter {
  const hero = getHero(heroKey);
  return {
    side,
    hero: heroKey,
    x,
    hp: hero.maxHp,
    maxHp: hero.maxHp,
    energy: 0,
    facing,
    move: null,
    stun: 0,
    blocking: false,
    pose: 'idle',
    walkTimer: 0,
    flash: 0,
    pushback: 0,
    combo: 0,
    comboTimer: 0,
    damageDealt: 0,
  };
}

export function createBattle(p1Hero: HeroKey, p2Hero: HeroKey, seed = Date.now() >>> 0): BattleState {
  return {
    phase: 'ready',
    frame: 0,
    timeLeft: ROUND_FRAMES,
    round: 1,
    wins: { p1: 0, p2: 0 },
    p1: createFighter('p1', p1Hero, STAGE_W * 0.4, 1),
    p2: createFighter('p2', p2Hero, STAGE_W * 0.6, -1),
    koTimer: 0,
    lastRound: null,
    winner: null,
    shake: 0,
    rng: mulberry32(seed),
    events: [],
  };
}

/** 开始新回合：回满血、清能量，站位重置。 */
function resetRound(state: BattleState): void {
  for (const fighter of [state.p1, state.p2]) {
    const hero = getHero(fighter.hero);
    fighter.hp = hero.maxHp;
    fighter.maxHp = hero.maxHp;
    fighter.energy = 0;
    fighter.move = null;
    fighter.stun = 0;
    fighter.blocking = false;
    fighter.pose = 'idle';
    fighter.flash = 0;
    fighter.pushback = 0;
    fighter.combo = 0;
    fighter.comboTimer = 0;
    fighter.damageDealt = 0;
  }
  state.p1.x = STAGE_W * 0.4;
  state.p2.x = STAGE_W * 0.6;
  state.p1.facing = 1;
  state.p2.facing = -1;
  state.timeLeft = ROUND_FRAMES;
  state.koTimer = 0;
  state.shake = 0;
  state.events = [];
}

/** 能量加成：受击涨得快，落后方有翻盘机会。 */
function gainEnergy(fighter: Fighter, amount: number, scale: number): void {
  fighter.energy = clamp(fighter.energy + amount * scale, 0, MAX_ENERGY);
}

function facingLock(state: BattleState): void {
  for (const self of [state.p1, state.p2]) {
    const other = self === state.p1 ? state.p2 : state.p1;
    // 出招和硬直期间不转身，避免抖动
    if (!self.move && self.stun === 0) {
      self.facing = other.x >= self.x ? 1 : -1;
    }
  }
}

function tryStartMove(fighter: Fighter, input: Input): void {
  if (fighter.move || fighter.stun > 0) return;

  let kind: MoveKind | null = null;
  if (input.ultimate) kind = 'ultimate';
  else if (input.heavy) kind = 'heavy';
  else if (input.light) kind = 'light';

  if (!kind) return;

  const hero = getHero(fighter.hero);
  const data = getMove(hero, kind);
  if (data.energyCost > fighter.energy) return;

  fighter.energy -= data.energyCost;
  fighter.move = { kind, data, elapsed: 0, hitCount: 0, hitCooldown: 0, interrupted: false };
  fighter.pose = 'attack';
  fighter.blocking = false;
}

function moveFighter(fighter: Fighter, input: Input, hero: ReturnType<typeof getHero>): void {
  if (fighter.stun > 0 || fighter.move) {
    fighter.blocking = false;
    return;
  }

  fighter.blocking = input.block;
  if (input.block) return;

  if (input.move !== 0) {
    fighter.x += input.move * hero.speed;
    fighter.walkTimer += 1;
    fighter.pose = 'walk';
  } else {
    fighter.walkTimer = 0;
    fighter.pose = 'idle';
  }
}

/** 两人不能重叠，也不能出界。 */
function resolveCollision(state: BattleState): void {
  const { p1, p2 } = state;
  const minGap = BODY_HALF_W * 2;

  let gap = p2.x - p1.x;
  if (gap < minGap) {
    const overlap = minGap - gap;
    p1.x -= overlap / 2;
    p2.x += overlap / 2;
    const gap2 = p2.x - p1.x;
    if (gap2 < minGap) {
      // 被墙夹住时全部推给能动的那个
      if (p1.x <= WALL_LEFT) p2.x = Math.min(WALL_RIGHT, p1.x + minGap);
      else if (p2.x >= WALL_RIGHT) p1.x = Math.max(WALL_LEFT, p2.x - minGap);
    }
  }

  p1.x = clamp(p1.x, WALL_LEFT, WALL_RIGHT);
  p2.x = clamp(p2.x, WALL_LEFT, WALL_RIGHT);
}

function boxOf(fighter: Fighter, move: MoveFrameData): { x0: number; x1: number; y0: number; y1: number } {
  const front = fighter.x + fighter.facing * BODY_HALF_W;
  const x1 = front + fighter.facing * move.reach;
  return {
    x0: Math.min(front, x1),
    x1: Math.max(front, x1),
    y0: GROUND_Y - move.height,
    y1: GROUND_Y,
  };
}

function bodyOf(fighter: Fighter): { x0: number; x1: number; y0: number; y1: number } {
  return {
    x0: fighter.x - BODY_HALF_W,
    x1: fighter.x + BODY_HALF_W,
    y0: GROUND_Y - 170,
    y1: GROUND_Y,
  };
}

function overlaps(
  a: { x0: number; x1: number; y0: number; y1: number },
  b: { x0: number; x1: number; y0: number; y1: number },
): boolean {
  return a.x0 < b.x1 && a.x1 > b.x0 && a.y0 < b.y1 && a.y1 > b.y0;
}

function applyHit(
  state: BattleState,
  attacker: Fighter,
  defender: Fighter,
  kind: MoveKind,
  counter: boolean,
): void {
  const hero = getHero(attacker.hero);

  let damage = moveDamage(hero, kind);
  let knockback = moveKnockback(hero, kind);
  let stun = getMove(hero, kind).hitStun;

  // 连击加成
  if (attacker.comboTimer > 0) {
    attacker.combo += 1;
  } else {
    attacker.combo = 1;
  }
  attacker.comboTimer = COMBO_WINDOW;
  const bonus = Math.min(MAX_COMBO_BONUS, (attacker.combo - 1) * COMBO_BONUS_STEP);
  damage *= 1 + bonus;

  if (counter) damage *= 1.2;

  const blocked = defender.blocking;
  if (blocked) {
    damage *= BLOCK_DAMAGE_SCALE;
    knockback *= 0.4;
    stun = Math.round(stun * BLOCK_STUN_SCALE);
  }

  damage = Math.max(1, Math.round(damage));
  defender.hp = Math.max(0, defender.hp - damage);
  attacker.damageDealt += damage;

  defender.flash = 6;
  defender.combo = 0;
  defender.comboTimer = 0;

  if (!blocked) {
    defender.stun = Math.max(defender.stun, stun);
    defender.move = null;
    defender.pose = 'hurt';
    defender.pushback = knockback * defender.facing * -1;
  }

  gainEnergy(attacker, damage * 0.6, hero.energyOnDeal);
  gainEnergy(defender, damage * 0.9, getHero(defender.hero).energyOnHurt);

  state.shake = Math.max(state.shake, blocked ? 4 : clamp(damage * 0.6, 6, 22));

  state.events.push({
    attacker: attacker.side,
    kind,
    damage,
    x: defender.x,
    y: GROUND_Y - 130,
    blocked,
    counter,
  });
}

function resolveHits(state: BattleState): void {
  for (const attacker of [state.p1, state.p2]) {
    const move = attacker.move;
    if (!move) continue;
    if (move.hitCooldown > 0) {
      move.hitCooldown -= 1;
      continue;
    }
    if (move.hitCount >= move.data.hits) continue;
    if (!isActiveFrame(move.data, move.elapsed)) continue;

    const defender = attacker === state.p1 ? state.p2 : state.p1;
    if (defender.hp <= 0) continue;

    if (!overlaps(boxOf(attacker, move.data), bodyOf(defender))) continue;

    // 只有第一段算 counter hit，后续段不叠加 1.2 倍。
    const counter =
      move.hitCount === 0 &&
      defender.move !== null &&
      isStartupFrame(defender.move.data, defender.move.elapsed);

    applyHit(state, attacker, defender, move.kind, counter);

    move.hitCount += 1;
    move.hitCooldown = move.data.hitInterval;
  }
}

function advanceMoves(state: BattleState): void {
  for (const fighter of [state.p1, state.p2]) {
    const move = fighter.move;
    if (!move) continue;
    move.elapsed += 1;
    if (move.elapsed >= moveTotalFrames(move.data)) {
      fighter.move = null;
      if (fighter.pose === 'attack') fighter.pose = 'idle';
    }
  }
}

function decayTimers(state: BattleState): void {
  for (const fighter of [state.p1, state.p2]) {
    if (fighter.stun > 0) {
      fighter.stun -= 1;
      if (fighter.stun === 0 && fighter.pose === 'hurt') fighter.pose = 'idle';
    }
    if (fighter.flash > 0) fighter.flash -= 1;
    if (fighter.comboTimer > 0) {
      fighter.comboTimer -= 1;
      if (fighter.comboTimer === 0) fighter.combo = 0;
    }
    if (fighter.pushback !== 0) {
      fighter.x += fighter.pushback;
      fighter.pushback *= 0.3;
      if (Math.abs(fighter.pushback) < 0.6) fighter.pushback = 0;
    }
  }
  if (state.shake > 0) state.shake = Math.max(0, state.shake - 1.6);
}

function checkRoundEnd(state: BattleState): void {
  const dead = state.p1.hp <= 0 || state.p2.hp <= 0;
  const timeout = state.timeLeft <= 0;
  if (!dead && !timeout) return;

  let winner: RoundResult['winner'];
  if (state.p1.hp <= 0 && state.p2.hp <= 0) winner = 'draw';
  else if (state.p2.hp <= 0) winner = 'p1';
  else if (state.p1.hp <= 0) winner = 'p2';
  else {
    const r1 = state.p1.hp / state.p1.maxHp;
    const r2 = state.p2.hp / state.p2.maxHp;
    if (Math.abs(r1 - r2) < 0.001) winner = 'draw';
    else winner = r1 > r2 ? 'p1' : 'p2';
  }

  state.lastRound = { winner, reason: dead ? 'ko' : 'timeout' };
  state.phase = 'ko';
  state.koTimer = KO_FRAMES;

  if (winner === 'p1') state.wins.p1 += 1;
  else if (winner === 'p2') state.wins.p2 += 1;
  else {
    // 平局双方各记一分，避免「谁都不掉血」时无限打平。
    state.wins.p1 += 1;
    state.wins.p2 += 1;
  }

  const loser = winner === 'p1' ? state.p2 : winner === 'p2' ? state.p1 : null;
  const victor = winner === 'p1' ? state.p1 : winner === 'p2' ? state.p2 : null;
  if (loser) loser.pose = 'down';
  if (victor) victor.pose = 'win';
}

/**
 * 推进一步。纯函数式地修改 state 并返回命中事件，不产生任何渲染副作用。
 * 调用方负责每帧清空 state.events 之后再 step。
 */
export function step(state: BattleState, input1: Input, input2: Input): HitEvent[] {
  state.events = [];
  state.frame += 1;

  if (state.phase === 'ready') {
    // 开场 60 帧准备，之后进入战斗
    if (state.frame > 60) state.phase = 'fight';
    return state.events;
  }

  if (state.phase === 'ko') {
    state.koTimer -= 1;
    decayTimers(state);
    if (state.koTimer <= 0) {
      const reached = state.wins.p1 >= ROUNDS_TO_WIN || state.wins.p2 >= ROUNDS_TO_WIN;
      const exhausted = state.round >= MAX_ROUNDS;
      if (reached || exhausted) {
        state.phase = 'result';
        if (state.wins.p1 !== state.wins.p2) {
          state.winner = state.wins.p1 > state.wins.p2 ? 'p1' : 'p2';
        } else {
          // 胜场相同（回合打满或全平局）时，先比剩余血量比例，再比造成伤害。
          // 必须给出确定的胜方，否则结算页会拿 `null` 当「玩家失败」显示。
          const r1 = state.p1.hp / state.p1.maxHp;
          const r2 = state.p2.hp / state.p2.maxHp;
          if (Math.abs(r1 - r2) > 0.001) state.winner = r1 > r2 ? 'p1' : 'p2';
          else state.winner = state.p1.damageDealt >= state.p2.damageDealt ? 'p1' : 'p2';
        }
      } else {
        state.round += 1;
        resetRound(state);
        state.phase = 'ready';
        state.frame = 0;
      }
    }
    return state.events;
  }

  if (state.phase !== 'fight') return state.events;

  state.timeLeft = Math.max(0, state.timeLeft - 1);

  facingLock(state);
  tryStartMove(state.p1, input1);
  tryStartMove(state.p2, input2);
  moveFighter(state.p1, input1, getHero(state.p1.hero));
  moveFighter(state.p2, input2, getHero(state.p2.hero));

  resolveCollision(state);
  advanceMoves(state);
  resolveHits(state);
  decayTimers(state);
  checkRoundEnd(state);
  facingLock(state);

  return state.events;
}

/**
 * 失败后看广告续关：把对手刚拿到的这一胜吐回来，
 * 玩家满血、对手残血重打本回合，制造真实翻盘空间。
 */
export function reviveFromResult(state: BattleState): void {
  if (state.phase !== 'result') return;
  const winner = state.winner;
  if (winner === 'p2' && state.wins.p2 > 0) state.wins.p2 -= 1;
  else if (winner === 'p1' && state.wins.p1 > 0) state.wins.p1 -= 1;

  resetRound(state);
  // 续关的一方是「刚倒下的人」：这里始终优待玩家（p1）。
  state.p1.hp = Math.round(state.p1.maxHp * 0.75);
  state.p2.hp = Math.round(state.p2.maxHp * 0.55);
  // 扣掉一胜后回合序号要跟着回退，否则第 3 回合会显示成第 4 回合。
  state.round = state.wins.p1 + state.wins.p2 + 1;
  state.phase = 'ready';
  state.frame = 0;
  state.winner = null;
  state.lastRound = null;
}

/** 是否已经打完（用于结算跳转）。 */
export function isFinished(state: BattleState): boolean {
  return state.phase === 'result';
}

export function winnerOf(state: BattleState): 'p1' | 'p2' | null {
  return state.winner;
}
