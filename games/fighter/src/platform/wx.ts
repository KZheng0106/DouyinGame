import { createRewardedAdChannel } from './ad-channel.ts';
import { createSoundPlayer } from './audio-channel.ts';
import type { PlatformAdapter, Sprite, TouchHandler, TouchPoint, Viewport } from './types.ts';

// 微信小游戏的 wx 全局对象没有随包提供 TS 类型，这里只声明用到的能力。
// 延迟到调用时读取：测试环境与部分容器会在模块加载之后才注入 wx。
export function createWxAdapter(): PlatformAdapter {
  const wx: any = (globalThis as any).wx;
  const canvas: any = wx.createCanvas();
  const ctx = canvas.getContext('2d') as CanvasRenderingContext2D;

  const startHandlers: TouchHandler[] = [];
  const moveHandlers: TouchHandler[] = [];
  const endHandlers: TouchHandler[] = [];
  const resizeHandlers: Array<() => void> = [];

  const rewardedAd = createRewardedAdChannel(
    typeof wx.createRewardedVideoAd === 'function'
      ? (options) => wx.createRewardedVideoAd(options)
      : undefined,
  );

  const sound = createSoundPlayer(
    typeof wx.createInnerAudioContext === 'function' ? () => wx.createInnerAudioContext() : undefined,
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

  function toPoints(list: any): TouchPoint[] {
    if (!list || typeof list.length !== 'number') return [];
    const points: TouchPoint[] = [];
    for (let i = 0; i < list.length; i += 1) {
      const touch = list[i];
      if (!touch) continue;
      points.push({
        // identifier 在部分基础库上是 0，用下标兜底保证唯一
        id: typeof touch.identifier === 'number' ? touch.identifier : i,
        x: touch.clientX ?? touch.pageX ?? 0,
        y: touch.clientY ?? touch.pageY ?? 0,
      });
    }
    return points;
  }

  function emit(handlers: TouchHandler[], points: TouchPoint[]): void {
    if (points.length === 0) return;
    handlers.forEach((handler) => handler(points));
  }

  if (typeof wx.onTouchStart === 'function') {
    wx.onTouchStart((event: any) => emit(startHandlers, toPoints(event.touches)));
  }
  if (typeof wx.onTouchMove === 'function') {
    wx.onTouchMove((event: any) => emit(moveHandlers, toPoints(event.touches)));
  }
  if (typeof wx.onTouchEnd === 'function') {
    wx.onTouchEnd((event: any) => emit(endHandlers, toPoints(event.changedTouches)));
  }
  if (typeof wx.onTouchCancel === 'function') {
    wx.onTouchCancel((event: any) => emit(endHandlers, toPoints(event.changedTouches)));
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

    onTouchStart(handler) {
      startHandlers.push(handler);
    },
    onTouchMove(handler) {
      moveHandlers.push(handler);
    },
    onTouchEnd(handler) {
      endHandlers.push(handler);
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

    loadImage(path) {
      return new Promise<Sprite | null>((resolve) => {
        if (typeof wx.createImage !== 'function') {
          resolve(null);
          return;
        }
        const image = wx.createImage();
        image.onload = () => resolve({ image, width: image.width, height: image.height });
        image.onerror = () => resolve(null);
        image.src = path;
      });
    },

    playSound(path, volume) {
      sound.play(path, volume);
    },
    playMusic(path, volume) {
      sound.music(path, volume);
    },
    stopMusic() {
      sound.stopMusic();
    },
    setMuted(muted) {
      sound.setMuted(muted);
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
