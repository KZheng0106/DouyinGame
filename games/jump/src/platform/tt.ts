import type { AdResult, PlatformAdapter, PointerHandler, Viewport } from './types.ts';

// 抖音小游戏的 tt 全局对象没有官方 TS 类型随包提供，这里只声明用到的能力。
const tt: any = (globalThis as any).tt;

export function createTtAdapter(): PlatformAdapter {
  const canvas: any = tt.createCanvas();
  const ctx = canvas.getContext('2d') as CanvasRenderingContext2D;

  const downHandlers: PointerHandler[] = [];
  const upHandlers: PointerHandler[] = [];
  const resizeHandlers: Array<() => void> = [];

  let viewport: Viewport = readSystemInfo();

  function readSystemInfo(): Viewport {
    const info = typeof tt.getSystemInfoSync === 'function' ? tt.getSystemInfoSync() : {};
    return {
      width: info.windowWidth || info.screenWidth || 375,
      height: info.windowHeight || info.screenHeight || 667,
      dpr: info.pixelRatio || 1,
    };
  }

  function emit(handlers: PointerHandler[], touch: any): void {
    if (!touch) return;
    handlers.forEach((handler) => handler({ x: touch.clientX, y: touch.clientY }));
  }

  if (typeof tt.onTouchStart === 'function') {
    tt.onTouchStart((event: any) => emit(downHandlers, event.touches && event.touches[0]));
  }
  if (typeof tt.onTouchEnd === 'function') {
    tt.onTouchEnd((event: any) => emit(upHandlers, event.changedTouches && event.changedTouches[0]));
  }
  if (typeof tt.onTouchCancel === 'function') {
    tt.onTouchCancel((event: any) => emit(upHandlers, event.changedTouches && event.changedTouches[0]));
  }
  if (typeof tt.onWindowResize === 'function') {
    tt.onWindowResize(() => {
      viewport = readSystemInfo();
      resizeHandlers.forEach((handler) => handler());
    });
  }

  return {
    name: 'tt',
    canvas: canvas as HTMLCanvasElement,
    ctx,
    viewport: () => viewport,

    onPointerDown(handler) {
      downHandlers.push(handler);
    },
    onPointerUp(handler) {
      upHandlers.push(handler);
    },
    onResize(handler) {
      resizeHandlers.push(handler);
    },

    vibrate(kind) {
      if (typeof tt.vibrateShort !== 'function') return;
      try {
        tt.vibrateShort({ type: kind, fail: () => {} });
      } catch {
        /* 部分基础库不支持 type 参数，忽略 */
      }
    },

    getItem(key) {
      try {
        const value = tt.getStorageSync(key);
        return typeof value === 'string' && value.length > 0 ? value : null;
      } catch {
        return null;
      }
    },
    setItem(key, value) {
      try {
        tt.setStorageSync(key, value);
      } catch {
        /* 存储失败不影响游戏进行 */
      }
    },

    showRewardedAd(adUnitId) {
      return new Promise<AdResult>((resolve) => {
        if (typeof tt.createRewardedVideoAd !== 'function') {
          resolve('failed');
          return;
        }

        let settled = false;
        let ad: any;
        const finish = (result: AdResult): void => {
          if (settled) return;
          settled = true;
          try {
            ad?.offClose?.(onClose);
            ad?.offError?.(onError);
          } catch {
            /* 忽略解绑异常 */
          }
          resolve(result);
        };

        const onClose = (res: any): void => finish(res && res.isEnded === true ? 'completed' : 'skipped');
        const onError = (): void => finish('failed');

        try {
          ad = tt.createRewardedVideoAd({ adUnitId });
          ad.onClose(onClose);
          ad.onError(onError);
          ad.show().catch(() => {
            ad.load()
              .then(() => ad.show())
              .catch(() => finish('failed'));
          });
        } catch {
          finish('failed');
        }
      });
    },

    raf(callback) {
      const request = (globalThis as any).requestAnimationFrame;
      if (typeof request === 'function') request(callback);
      else setTimeout(() => callback(Date.now()), 16);
    },
  };
}
