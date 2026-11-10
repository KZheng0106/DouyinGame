/**
 * 逻辑视图与屏幕坐标换算。
 *
 * 游戏跑在固定高度的舞台坐标系里：高度恒为 STAGE_H(720)，宽度至少 STAGE_W(1280)。
 * 更宽的屏幕（19.5:9、20:9 这类全面屏）会横向扩展 view.w，多出来的部分交给背景铺满；
 * 战斗世界仍然严格占中间 1280 宽，靠 stageOffsetX 补上这段左右余量，保证构图居中。
 */
import { GROUND_Y, STAGE_H, STAGE_W } from './constants.ts';

export interface View {
  w: number;
  h: number;
}

/** 地面在屏幕上的纵向比例。下半部分要留给操作键，所以地面不能贴底。 */
export const GROUND_RATIO = 0.8;

/** 等比缩放：高度优先铺满，宽度不足 1280 时（4:3 平板）改由宽度决定。 */
export function fitScale(viewportW: number, viewportH: number): number {
  const byWidth = viewportW / STAGE_W;
  const byHeight = viewportH / STAGE_H;
  const scale = Math.min(byWidth, byHeight);
  return scale > 0 ? scale : 1;
}

/** 由视口尺寸得到逻辑视图。高度恒为 STAGE_H，宽度只增不减。 */
export function createView(viewportW: number, viewportH: number): View {
  const scale = fitScale(viewportW, viewportH);
  return { w: Math.max(STAGE_W, viewportW / scale), h: STAGE_H };
}

/** 舞台左右多出来的余量（单边）。世界坐标加上它才落到屏幕正中。 */
export function stageOffsetX(view: View): number {
  const pad = (view.w - STAGE_W) / 2;
  return pad > 0 ? pad : 0;
}

/** 地面在屏幕上的 y。 */
export function groundScreenY(view: View): number {
  return Math.round(view.h * GROUND_RATIO);
}

/** 舞台坐标 x -> 屏幕 x。 */
export function toScreenX(view: View, stageX: number): number {
  return stageX + stageOffsetX(view);
}

/** 舞台坐标 y -> 屏幕 y。角色贴地绘制，只需要纵向平移。 */
export function toScreenY(view: View, stageY: number): number {
  return groundScreenY(view) - (GROUND_Y - stageY);
}
