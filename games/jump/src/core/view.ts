import { GROUND_RATIO } from './constants.ts';

/** 逻辑视口：宽固定为设计宽度，高随屏幕比例变化。 */
export interface View {
  w: number;
  h: number;
}

/** 平台顶面的纵坐标。 */
export function groundYOf(view: View): number {
  return view.h * GROUND_RATIO;
}
