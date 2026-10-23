export interface Viewport {
  width: number;
  height: number;
  dpr: number;
}

export interface PointerPosition {
  x: number;
  y: number;
}

export type PointerHandler = (position: PointerPosition) => void;

export type AdResult = 'completed' | 'skipped' | 'failed';

export interface PlatformAdapter {
  readonly name: 'tt' | 'web';
  readonly canvas: HTMLCanvasElement;
  readonly ctx: CanvasRenderingContext2D;
  viewport(): Viewport;
  onPointerDown(handler: PointerHandler): void;
  onPointerUp(handler: PointerHandler): void;
  onResize(handler: () => void): void;
  vibrate(kind: 'light' | 'heavy'): void;
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  showRewardedAd(adUnitId: string): Promise<AdResult>;
  raf(callback: (time: number) => void): void;
}
