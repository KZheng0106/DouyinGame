import type { MoveKind } from './moves.ts';

export type HeroKey = 'niu' | 'gu' | 'nai';

export interface Hero {
  key: HeroKey;
  /** 显示名。改名只改这一处。 */
  name: string;
  /** 一句话人设，用于选人页。 */
  tagline: string;
  /** 大招名字，用于 HUD 与 KO 演出。 */
  ultimateName: string;
  /** 定位，仅用于选人页展示。 */
  role: '力量' | '速度' | '控制';
  maxHp: number;
  /** 每帧移动像素（舞台坐标系）。 */
  speed: number;
  /** 受击时额外获得的能量倍数。落后方回能更快。 */
  energyOnHurt: number;
  /** 造成伤害时的能量倍数。 */
  energyOnDeal: number;
  /** 各招式的伤害与击退微调。 */
  tuning: Record<MoveKind, { damage: number; knockback: number }>;
  /** 各招式额外前摇帧数，负值为更快的快手。 */
  startupMod: Record<MoveKind, number>;
  /** 各招式的多段覆盖，不写则用 moves.ts 的基础表。 */
  extras?: Partial<Record<MoveKind, { active?: number; hits?: number; hitInterval?: number; hitStun?: number }>>;
}

const BASE_TUNING: Record<MoveKind, { damage: number; knockback: number }> = {
  light: { damage: 7, knockback: 12 },
  heavy: { damage: 16, knockback: 34 },
  ultimate: { damage: 34, knockback: 90 },
};

const NEUTRAL_STARTUP: Record<MoveKind, number> = { light: 0, heavy: 0, ultimate: 0 };

export const HEROES: Record<HeroKey, Hero> = {
  niu: {
    key: 'niu',
    name: '牛来',
    tagline: '一声「妈妈——」，全场抖三抖。',
    ultimateName: '妈妈——',
    role: '力量',
    maxHp: 115,
    speed: 2.8,
    energyOnHurt: 1,
    energyOnDeal: 1,
    tuning: {
      light: { damage: 9, knockback: 14 },
      heavy: { damage: 20, knockback: 42 },
      ultimate: { damage: 38, knockback: 110 },
    },
    startupMod: { light: 1, heavy: 2, ultimate: 0 },
  },
  gu: {
    key: 'gu',
    name: '奶娃',
    tagline: '笑得越开心，打得越狠。',
    ultimateName: '魔性笑声',
    role: '控制',
    maxHp: 100,
    speed: 3.4,
    energyOnHurt: 1.4,
    energyOnDeal: 1,
    tuning: {
      light: { damage: 7, knockback: 12 },
      heavy: { damage: 16, knockback: 34 },
      ultimate: { damage: 6, knockback: 0 },
    },
    startupMod: { light: 0, heavy: 0, ultimate: 0 },
    // 魔性笑声：判定窗拉到 60 帧，每 10 帧笑一下，硬直短于基础值以免无限锁。
    extras: { ultimate: { active: 60, hits: 6, hitInterval: 10, hitStun: 12 } },
  },
  nai: {
    key: 'nai',
    name: '咕咕嘎嘎',
    tagline: '鸽群过境，一帧都不给你留。',
    ultimateName: '鸽群弹幕',
    role: '速度',
    maxHp: 90,
    speed: 4,
    energyOnHurt: 1,
    energyOnDeal: 1,
    tuning: {
      light: { damage: 6, knockback: 10 },
      heavy: { damage: 14, knockback: 30 },
      ultimate: { damage: 12, knockback: 20 },
    },
    startupMod: { light: -2, heavy: -1, ultimate: 0 },
    // 鸽群弹幕：拉长判定窗，每 3 帧落一段，总共 3 段远程伤害。
    extras: { ultimate: { active: 10, hits: 3, hitInterval: 3 } },
  },
};

export const HERO_ORDER: HeroKey[] = ['niu', 'gu', 'nai'];

export function getHero(key: HeroKey): Hero {
  return HEROES[key];
}

/** 招式最终伤害：英雄微调 + 该英雄基础表。 */
export function moveDamage(hero: Hero, kind: MoveKind): number {
  return hero.tuning[kind]?.damage ?? BASE_TUNING[kind].damage;
}

export function moveKnockback(hero: Hero, kind: MoveKind): number {
  return hero.tuning[kind]?.knockback ?? BASE_TUNING[kind].knockback;
}

export function moveStartupMod(hero: Hero, kind: MoveKind): number {
  return hero.startupMod[kind] ?? NEUTRAL_STARTUP[kind];
}
