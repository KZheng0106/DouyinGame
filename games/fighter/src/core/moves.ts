import { moveStartupMod } from './heroes.ts';
import type { Hero } from './heroes.ts';

export type MoveKind = 'light' | 'heavy' | 'ultimate';

export interface MoveFrameData {
  kind: MoveKind;
  /** 前摇帧数：这段时间内被打会取消招式。 */
  startup: number;
  /** 判定帧数：只有这几帧能命中。 */
  active: number;
  /** 后摇帧数：不能行动。 */
  recovery: number;
  /** 命中判定向前延伸的距离（舞台像素）。 */
  reach: number;
  /** 判定框高度。 */
  height: number;
  /** 消耗的能量。 */
  energyCost: number;
  /** 命中后给对手的硬直帧数。 */
  hitStun: number;
  /** 一段招式最多命中几次，1 表示单段。 */
  hits: number;
  /** 多段命中之间的间隔帧数。 */
  hitInterval: number;
}

const BASE: Record<MoveKind, MoveFrameData> = {
  light: {
    kind: 'light',
    startup: 5,
    active: 3,
    recovery: 7,
    reach: 95,
    height: 150,
    energyCost: 0,
    hitStun: 11,
    hits: 1,
    hitInterval: 0,
  },
  heavy: {
    kind: 'heavy',
    startup: 13,
    active: 4,
    recovery: 16,
    reach: 110,
    height: 170,
    energyCost: 0,
    hitStun: 20,
    hits: 1,
    hitInterval: 0,
  },
  ultimate: {
    kind: 'ultimate',
    startup: 22,
    active: 10,
    recovery: 26,
    reach: 190,
    height: 260,
    energyCost: 100,
    hitStun: 40,
    hits: 1,
    hitInterval: 0,
  },
};

/** 拿到该英雄的招式帧数据（前摇按英雄微调，最短 2 帧；多段参数按英雄覆盖）。 */
export function getMove(hero: Hero, kind: MoveKind): MoveFrameData {
  const base = BASE[kind];
  const extra = hero.extras?.[kind];
  const startup = Math.max(2, base.startup + moveStartupMod(hero, kind));
  return {
    ...base,
    startup,
    active: extra?.active ?? base.active,
    hits: extra?.hits ?? base.hits,
    hitInterval: extra?.hitInterval ?? base.hitInterval,
    hitStun: extra?.hitStun ?? base.hitStun,
  };
}

/** 招式总帧数。 */
export function moveTotalFrames(move: MoveFrameData): number {
  return move.startup + move.active + move.recovery;
}

/** 某一帧是否处于判定窗口（0 为招式第一帧）。 */
export function isActiveFrame(move: MoveFrameData, elapsed: number): boolean {
  return elapsed >= move.startup && elapsed < move.startup + move.active;
}

/** 某一帧是否仍处于前摇（可被 counter hit 取消）。 */
export function isStartupFrame(move: MoveFrameData, elapsed: number): boolean {
  return elapsed < move.startup;
}

/** 一次判定窗口理论上最多能打出几段。 */
export function maxHitsInWindow(move: MoveFrameData): number {
  if (move.hits <= 1 || move.hitInterval <= 0) return 1;
  const span = move.active - 1;
  return Math.min(move.hits, Math.floor(span / move.hitInterval) + 1);
}
