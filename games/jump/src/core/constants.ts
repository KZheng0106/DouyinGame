/** 逻辑设计宽度：所有坐标与尺寸都以 375 宽为基准，再按屏幕等比缩放。 */
export const DESIGN_WIDTH = 375;

/** 地面（平台顶面）在可视区域中的纵向比例。 */
export const GROUND_RATIO = 0.72;

/** 摄像机锚点：玩家停在屏幕宽度的这个比例处。 */
export const CAMERA_ANCHOR = 0.34;

export const PLAYER_SIZE = 26;
export const PLATFORM_HEIGHT = 20;

/** 蓄力到满所需的秒数。 */
export const CHARGE_TIME = 0.9;

/** 松开瞬间的最小/最大跳跃距离（逻辑像素）。 */
export const MIN_JUMP_DIST = 45;
export const MAX_JUMP_DIST = 285;

export const JUMP_DURATION_MIN = 0.32;
export const JUMP_DURATION_MAX = 0.6;

/** 跳跃抛物线顶点高度。 */
export const JUMP_HEIGHT = 82;

/** 落点距平台中心在该范围内判定为"完美"。 */
export const PERFECT_TOLERANCE = 8;

/** 单局最多可复活次数。 */
export const MAX_REVIVES = 2;

export const GRAVITY = 2400;
