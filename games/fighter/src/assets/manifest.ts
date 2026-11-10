/**
 * 素材路径常量表。
 *
 * 小游戏里 loadImage/playSound 拿到的都是相对 game.js 的路径，
 * 由构建脚本把 assets/ 原样拷进 dist，所以这里写的路径必须与实际目录一致。
 */
import type { HeroKey } from '../core/heroes.ts';
import type { PoseName } from '../generated/hero-poses.ts';

const HERO_DIR = 'assets/hero';
export const SFX_DIR = 'assets/sfx';
export const BGM_DIR = 'assets/bgm';
const FX_DIR = 'assets/fx';

/** 命中特效贴图。命名沿用素材包原始文件名。 */
export const FX = {
  slash1: `${FX_DIR}/slash_01.png`,
  slash2: `${FX_DIR}/slash_02.png`,
  slash3: `${FX_DIR}/slash_03.png`,
  spark1: `${FX_DIR}/spark_01.png`,
  spark2: `${FX_DIR}/spark_02.png`,
  star: `${FX_DIR}/star_01.png`,
  magic1: `${FX_DIR}/magic_01.png`,
  magic2: `${FX_DIR}/magic_02.png`,
  smoke: `${FX_DIR}/smoke_01.png`,
  light: `${FX_DIR}/light_01.png`,
} as const;

export type FxName = keyof typeof FX;

/** 姿态图序号，与 scripts/slice_hero.py 的输出顺序严格对应。 */
const POSE_INDEX: Record<PoseName, number> = {
  idle: 0,
  walk: 1,
  attack: 2,
  hurt: 3,
  down: 4,
  win: 5,
};

export function posePath(key: HeroKey, pose: PoseName): string {
  return `${HERO_DIR}/${key}_sheet_${POSE_INDEX[pose]}.png`;
}

export function bustPath(key: HeroKey): string {
  return `${HERO_DIR}/${key}_bust.png`;
}

export const SFX = {
  light: `${SFX_DIR}/punch_mid.mp3`,
  heavy: `${SFX_DIR}/punch_heavy.mp3`,
  ultimate: `${SFX_DIR}/sfx_summon.mp3`,
  block: `${SFX_DIR}/sfx_shield.mp3`,
  ko: `${SFX_DIR}/sfx_ko.mp3`,
  counter: `${SFX_DIR}/sfx_counter.mp3`,
  click: `${SFX_DIR}/ui_click.mp3`,
  confirm: `${SFX_DIR}/ui_confirm.mp3`,
  select: `${SFX_DIR}/ui_select.mp3`,
  error: `${SFX_DIR}/ui_error.mp3`,
  bell: `${SFX_DIR}/bell.mp3`,
  mama: `${SFX_DIR}/voice_mama.mp3`,
} as const;

export const BGM = {
  fight: `${BGM_DIR}/fight_start.mp3`,
  win: `${BGM_DIR}/ko_win.mp3`,
  lose: `${BGM_DIR}/ko_lose.mp3`,
} as const;

/** 每招命中时的音效，按招式与英雄挑。 */
export function hitSfxPath(kind: 'light' | 'heavy' | 'ultimate', hero: HeroKey): string {
  if (kind === 'ultimate') return hero === 'niu' ? SFX.mama : SFX.ultimate;
  return kind === 'heavy' ? SFX.heavy : SFX.light;
}
