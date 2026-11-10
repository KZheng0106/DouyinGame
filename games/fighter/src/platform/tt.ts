import { createRewardedAdChannel } from './ad-channel.ts';
import { createSoundPlayer } from './audio-channel.ts';
import type { PlatformAdapter, Sprite, TouchHandler, TouchPoint, Viewport } from './types.ts';

// 抖音小游戏的 tt 全局对象没有官方 TS 类型随包提供，这里只声明用到的能力。
// 延迟到调用时读取：测试环境与部分容器会在模块加载之后才注入 tt。
export function createTtAdapter(): PlatformAdapter {
  const tt: any = (globalThis as any).tt;
  const canvas: any = tt.createCanvas();
  const ctx = canvas.getContext('2d') as CanvasRenderingContext2D;

  const startHandlers: TouchHandler[] = [];
  const moveHandlers: TouchHandler[] = [];
  const endHandlers: TouchHandler[] = [];
  const resizeHandlers: Array<() => void> = [];

  const rewardedAd = createRewardedAdChannel(
    typeof tt.createRewardedVideoAd === 'function'
      ? (options) => tt.createRewardedVideoAd(options)
      : undefined,
  );

  const sound = createSoundPlayer(
    typeof tt.createInnerAudioContext === 'function' ? () => tt.createInnerAudioContext() : undefined,
  );

  let viewport: Viewport = readSystemInfo();

  function readSystemInfo(): Viewport {
    const info = typeof tt.getSystemInfoSync === 'function' ? tt.getSystemInfoSync() : {};
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

  if (typeof tt.onTouchStart === 'function') {
    tt.onTouchStart((event: any) => emit(startHandlers, toPoints(event.touches)));
  }
  if (typeof tt.onTouchMove === 'function') {
    tt.onTouchMove((event: any) => emit(moveHandlers, toPoints(event.touches)));
  }
  if (typeof tt.onTouchEnd === 'function') {
    tt.onTouchEnd((event: any) => emit(endHandlers, toPoints(event.changedTouches)));
  }
  if (typeof tt.onTouchCancel === 'function') {
    tt.onTouchCancel((event: any) => emit(endHandlers, toPoints(event.changedTouches)));
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

    loadImage(path) {
      return new Promise<Sprite | null>((resolve) => {
        if (typeof tt.createImage !== 'function') {
          resolve(null);
          return;
        }
        const image = tt.createImage();
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
