/** 战斗舞台与回合参数。全部时间单位是帧（60fps）。 */

export const FPS = 60;

/** 舞台逻辑坐标系，渲染时等比缩放到屏幕。高度固定，宽度按设备比例扩展。 */
export const STAGE_W = 1280;
export const STAGE_H = 720;

/** 地面在舞台坐标系的 y。角色脚底贴在这条线上。 */
export const GROUND_Y = 560;

export const WALL_LEFT = 80;
export const WALL_RIGHT = STAGE_W - 80;

/** 角色碰撞体半宽，用于推挤与命中距离计算。 */
export const BODY_HALF_W = 46;

export const ROUND_SECONDS = 60;
export const ROUND_FRAMES = ROUND_SECONDS * FPS;

/** 三局两胜。 */
export const ROUNDS_TO_WIN = 2;

/**
 * 回合数硬上限。平局不记胜点，仅靠三局两胜可能永远打不完，
 * 到这个回合数就按剩余血量强行判定。
 */
export const MAX_ROUNDS = 5;

export const MAX_ENERGY = 100;

/** 连击窗口：命中后这么多帧内再命中算连击。 */
export const COMBO_WINDOW = 40;
/** 每层连击伤害加成，封顶 MAX_COMBO_BONUS。 */
export const COMBO_BONUS_STEP = 0.08;
export const MAX_COMBO_BONUS = 0.4;

/** 防御伤害倍率与硬直倍率。 */
export const BLOCK_DAMAGE_SCALE = 0.15;
export const BLOCK_STUN_SCALE = 0.5;

/** 回合间隔演出帧数。 */
export const KO_FRAMES = 90;

/** 命中力度达到这个值才算「重击」，用于震屏与音效分级。 */
export const HEAVY_HIT_DAMAGE = 14;
