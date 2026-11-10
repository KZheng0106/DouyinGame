import { createSoundPlayer } from './audio-channel.ts';
import type { AudioContextLike, AudioFactory } from './audio-channel.ts';
import type { AdResult, PlatformAdapter, Sprite, TouchHandler, TouchPoint } from './types.ts';

/** 浏览器预览适配器：仅用于开发调试，不参与抖音端运行。 */
export function createWebAdapter(): PlatformAdapter {
  const host = document.getElementById('app') ?? document.body;

  const canvas = document.createElement('canvas');
  canvas.style.cssText = 'display:block;width:100%;height:100%;touch-action:none;user-select:none;';
  host.appendChild(canvas);

  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('当前环境不支持 Canvas 2D');

  const startHandlers: TouchHandler[] = [];
  const moveHandlers: TouchHandler[] = [];
  const endHandlers: TouchHandler[] = [];
  const resizeHandlers: Array<() => void> = [];

  // 浏览器 Audio 元素与 InnerAudioContext 的接口足够接近，直接适配
  const audioFactory: AudioFactory | undefined =
    typeof Audio !== 'undefined' ? () => new Audio() as unknown as AudioContextLike : undefined;
  const sound = createSoundPlayer(audioFactory);

  // 用 PointerEvent 统一鼠标与触摸，active 记录当前全部按下的手指
  const active = new Map<number, TouchPoint>();

  function toLocal(event: PointerEvent): TouchPoint {
    const rect = canvas.getBoundingClientRect();
    return { id: event.pointerId, x: event.clientX - rect.left, y: event.clientY - rect.top };
  }

  canvas.addEventListener('pointerdown', (event) => {
    event.preventDefault();
    const point = toLocal(event);
    active.set(point.id, point);
    startHandlers.forEach((handler) => handler([...active.values()]));
  });

  canvas.addEventListener('pointermove', (event) => {
    if (!active.has(event.pointerId)) return;
    event.preventDefault();
    const point = toLocal(event);
    active.set(point.id, point);
    moveHandlers.forEach((handler) => handler([...active.values()]));
  });

  function release(event: PointerEvent): void {
    if (!active.has(event.pointerId)) return;
    const point = toLocal(event);
    active.delete(event.pointerId);
    endHandlers.forEach((handler) => handler([point]));
  }

  canvas.addEventListener('pointerup', release);
  canvas.addEventListener('pointercancel', release);
  canvas.addEventListener('contextmenu', (event) => event.preventDefault());

  window.addEventListener('resize', () => resizeHandlers.forEach((handler) => handler()));

  return {
    name: 'web',
    canvas,
    ctx,

    viewport: () => ({
      width: host.clientWidth || window.innerWidth,
      height: host.clientHeight || window.innerHeight,
      dpr: Math.min(window.devicePixelRatio || 1, 2),
    }),

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
      window.navigator.vibrate?.(kind === 'heavy' ? 24 : 10);
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

    loadImage(path) {
      return new Promise<Sprite | null>((resolve) => {
        const image = new Image();
        image.onload = () => resolve({ image, width: image.naturalWidth, height: image.naturalHeight });
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

    showRewardedAd(): Promise<AdResult> {
      return Promise.resolve('failed');
    },

    raf(callback) {
      requestAnimationFrame(callback);
    },
  };
}
