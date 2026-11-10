export interface Viewport {
  width: number;
  height: number;
  dpr: number;
}

export type AdResult = 'completed' | 'skipped' | 'failed';

/** 一个触控点。多点触控必须带 id，否则松手时会认错手指。 */
export interface TouchPoint {
  id: number;
  x: number;
  y: number;
}

export type TouchHandler = (points: TouchPoint[]) => void;

/** 已解码的图片。wx/tt 的 Image 与浏览器 Image 都满足这个形状。 */
export interface Sprite {
  readonly image: any;
  readonly width: number;
  readonly height: number;
}

export interface PlatformAdapter {
  readonly name: 'tt' | 'wx' | 'web';
  readonly canvas: HTMLCanvasElement;
  readonly ctx: CanvasRenderingContext2D;
  viewport(): Viewport;

  /** 手指按下：回调里是当前全部触控点。 */
  onTouchStart(handler: TouchHandler): void;
  /** 手指移动：回调里是当前全部触控点。 */
  onTouchMove(handler: TouchHandler): void;
  /** 手指抬起：回调里是本次离开的触控点。 */
  onTouchEnd(handler: TouchHandler): void;

  onResize(handler: () => void): void;
  vibrate(kind: 'light' | 'heavy'): void;
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;

  /** 加载图片。失败返回 null，调用方需要有兜底绘制。 */
  loadImage(path: string): Promise<Sprite | null>;
  /** 播放一次音效。音频缺失时静默忽略，不影响游戏。 */
  playSound(path: string, volume?: number): void;
  /** 循环播放背景音乐，path 变化才会重播。 */
  playMusic(path: string, volume?: number): void;
  stopMusic(): void;
  setMuted(muted: boolean): void;

  showRewardedAd(adUnitId: string): Promise<AdResult>;
  preloadRewardedAd?(adUnitId: string): void;
  raf(callback: (time: number) => void): void;
}
