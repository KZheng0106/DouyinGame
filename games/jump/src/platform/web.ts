import type { AdResult, PlatformAdapter, PointerHandler } from './types.ts';

/** 浏览器预览适配器：仅用于开发调试，不参与抖音端运行。 */
export function createWebAdapter(): PlatformAdapter {
  const host = document.getElementById('app') ?? document.body;

  const canvas = document.createElement('canvas');
  canvas.style.cssText = 'display:block;width:100%;height:100%;touch-action:none;user-select:none;';
  host.appendChild(canvas);

  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('当前环境不支持 Canvas 2D');

  const downHandlers: PointerHandler[] = [];
  const upHandlers: PointerHandler[] = [];
  const resizeHandlers: Array<() => void> = [];

  canvas.addEventListener('pointerdown', (event: PointerEvent) => {
    event.preventDefault();
    const point = toLocal(event);
    downHandlers.forEach((handler) => handler(point));
  });

  window.addEventListener('pointerup', (event: PointerEvent) => {
    const point = toLocal(event);
    upHandlers.forEach((handler) => handler(point));
  });

  canvas.addEventListener('contextmenu', (event) => event.preventDefault());

  window.addEventListener('resize', () => resizeHandlers.forEach((handler) => handler()));

  function toLocal(event: PointerEvent): { x: number; y: number } {
    const rect = canvas.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  }

  return {
    name: 'web',
    canvas,
    ctx,

    viewport: () => ({
      width: host.clientWidth || window.innerWidth,
      height: host.clientHeight || window.innerHeight,
      dpr: Math.min(window.devicePixelRatio || 1, 2),
    }),

    onPointerDown(handler) {
      downHandlers.push(handler);
    },
    onPointerUp(handler) {
      upHandlers.push(handler);
    },
    onResize(handler) {
      resizeHandlers.push(handler);
    },

    vibrate() {
      window.navigator.vibrate?.(12);
    },

    getItem(key) {
      try {
        return window.localStorage.getItem(key);
      } catch {
        return null;
      }
    },
    setItem(key, value) {
      try {
        window.localStorage.setItem(key, value);
      } catch {
        /* 忽略隐私模式等存储异常 */
      }
    },

    showRewardedAd(): Promise<AdResult> {
      return Promise.resolve('failed');
    },

    raf(callback) {
      requestAnimationFrame(callback);
    },
  };
}
