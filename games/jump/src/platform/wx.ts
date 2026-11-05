import { createRewardedAdChannel } from './ad-channel.ts';
import type { PlatformAdapter, PointerHandler, Viewport } from './types.ts';

// 微信小游戏的 wx 全局对象没有随包提供 TS 类型，这里只声明用到的能力。
// 延迟到调用时读取：测试环境与部分容器会在模块加载之后才注入 wx。
export function createWxAdapter(): PlatformAdapter {
  const wx: any = (globalThis as any).wx;
  const canvas: any = wx.createCanvas();
  const ctx = canvas.getContext('2d') as CanvasRenderingContext2D;

  const downHandlers: PointerHandler[] = [];
  const upHandlers: PointerHandler[] = [];
  const resizeHandlers: Array<() => void> = [];

  const rewardedAd = createRewardedAdChannel(
    typeof wx.createRewardedVideoAd === 'function'
      ? (options) => wx.createRewardedVideoAd(options)
      : undefined,
  );

  let viewport: Viewport = readViewport();

  function readViewport(): Viewport {
    // getWindowInfo 为新接口，旧基础库回退到 getSystemInfoSync
    const info =
      typeof wx.getWindowInfo === 'function'
        ? wx.getWindowInfo()
        : typeof wx.getSystemInfoSync === 'function'
          ? wx.getSystemInfoSync()
          : {};

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

  if (typeof wx.onTouchStart === 'function') {
    wx.onTouchStart((event: any) => emit(downHandlers, event.touches && event.touches[0]));
  }
  if (typeof wx.onTouchEnd === 'function') {
    wx.onTouchEnd((event: any) => emit(upHandlers, event.changedTouches && event.changedTouches[0]));
  }
  if (typeof wx.onTouchCancel === 'function') {
    wx.onTouchCancel((event: any) => emit(upHandlers, event.changedTouches && event.changedTouches[0]));
  }
  if (typeof wx.onWindowResize === 'function') {
    wx.onWindowResize(() => {
      viewport = readViewport();
      resizeHandlers.forEach((handler) => handler());
    });
  }

  return {
    name: 'wx',
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
      if (typeof wx.vibrateShort !== 'function') return;
      try {
        wx.vibrateShort({ type: kind, fail: () => {} });
      } catch {
        /* 低版本基础库不支持 type 参数，忽略 */
      }
    },

    getItem(key) {
      try {
        const value = wx.getStorageSync(key);
        return typeof value === 'string' && value.length > 0 ? value : null;
      } catch {
        return null;
      }
    },
    setItem(key, value) {
      try {
        wx.setStorageSync(key, value);
      } catch {
        /* 存储失败不影响游戏进行 */
      }
    },

    preloadRewardedAd(adUnitId) {
      rewardedAd.preload(adUnitId);
    },

    showRewardedAd(adUnitId) {
      return rewardedAd.show(adUnitId);
    },

    raf(callback) {
      const request = (globalThis as any).requestAnimationFrame;
      if (typeof request === 'function') request(callback);
      else setTimeout(() => callback(Date.now()), 16);
    },
  };
}
