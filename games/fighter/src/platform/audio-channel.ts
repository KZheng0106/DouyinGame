/**
 * 小游戏音效播放器。wx / tt 的 InnerAudioContext 行为一致，这里统一封装。
 * 关键点：
 * - 每个音效复用一个实例会互相打断，所以按路径建池；
 * - 池满了就复用最旧的那个，避免长时间游戏创建上千个实例；
 * - 音频加载失败一律吞掉，不能因为少一个文件就卡住主循环。
 */
export interface AudioContextLike {
  src: string;
  volume: number;
  loop: boolean;
  play(): void;
  stop(): void;
  destroy(): void;
  onError?(callback: () => void): void;
}

/** wx / tt 的 InnerAudioContext 与浏览器 Audio 结构接近，用一个宽松工厂统一。 */
export type AudioFactory = () => AudioContextLike;

export interface SoundPlayer {
  play(path: string, volume?: number): void;
  music(path: string, volume?: number): void;
  stopMusic(): void;
  setMuted(muted: boolean): void;
}

const POOL_SIZE = 4;

export function createSoundPlayer(factory: AudioFactory | undefined): SoundPlayer {
  const pools = new Map<string, { items: AudioContextLike[]; cursor: number }>();
  let musicTrack: AudioContextLike | null = null;
  let currentMusic = '';
  let musicVolume = 0.35;
  let muted = false;

  function make(): AudioContextLike | null {
    if (!factory) return null;
    try {
      return factory();
    } catch {
      return null;
    }
  }

  return {
    play(path, volume = 0.8) {
      if (muted || !factory) return;
      let pool = pools.get(path);
      if (!pool) {
        pool = { items: [], cursor: 0 };
        pools.set(path, pool);
      }
      if (pool.items.length < POOL_SIZE) {
        const item = make();
        if (!item) return;
        item.src = path;
        pool.items.push(item);
      }
      const instance = pool.items[pool.cursor % pool.items.length];
      pool.cursor += 1;
      try {
        instance.stop();
        instance.volume = volume;
        instance.loop = false;
        instance.play();
      } catch {
        /* 播放失败不影响玩法 */
      }
    },

    music(path, volume = musicVolume) {
      if (!factory) return;
      musicVolume = volume;
      if (currentMusic === path && musicTrack && !muted) return;
      currentMusic = path;
      if (!musicTrack) {
        musicTrack = make();
        if (!musicTrack) return;
      }
      try {
        musicTrack.stop();
        musicTrack.src = path;
        musicTrack.loop = true;
        musicTrack.volume = muted ? 0 : volume;
        if (!muted) musicTrack.play();
      } catch {
        /* 忽略 */
      }
    },

    stopMusic() {
      currentMusic = '';
      try {
        musicTrack?.stop();
      } catch {
        /* 忽略 */
      }
    },

    setMuted(next) {
      muted = next;
      try {
        if (!musicTrack) return;
        if (muted) musicTrack.stop();
        else if (currentMusic) {
          musicTrack.volume = musicVolume;
          musicTrack.play();
        }
      } catch {
        /* 忽略 */
      }
    },
  };
}
