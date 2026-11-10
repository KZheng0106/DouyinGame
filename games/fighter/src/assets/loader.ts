/**
 * 素材装载。
 *
 * 小游戏的 loadImage 是异步的，但战局中不能等图。所以开局先把
 * 3 个英雄的全部姿态 + 特效贴图一次性拉进内存，之后只做同步查表。
 * 任何一张图失败都不阻断启动（返回 null，渲染层画色块兜底）。
 */
import type { Sprite } from '../platform/types.ts';
import type { HeroKey } from '../core/heroes.ts';
import { HERO_ORDER } from '../core/heroes.ts';
import type { PoseName } from '../generated/hero-poses.ts';
import { FX, bustPath, posePath } from './manifest.ts';

const POSES: PoseName[] = ['idle', 'walk', 'attack', 'hurt', 'down', 'win'];

export type PoseSheet = Record<PoseName, Sprite | null>;

export interface HeroArt {
  poses: PoseSheet;
  bust: Sprite | null;
}

export type FxKey = keyof typeof FX;

export class AssetStore {
  readonly heroes = {} as Record<HeroKey, HeroArt>;
  readonly fx = {} as Record<FxKey, Sprite | null>;
  /** 已完成的资源占比 0~1，用于加载条。 */
  progress = 0;

  constructor(private readonly load: (path: string) => Promise<Sprite | null>) {}

  async loadAll(): Promise<void> {
    const jobs: Array<Promise<void>> = [];
    let done = 0;
    const total = HERO_ORDER.length * (POSES.length + 1) + Object.keys(FX).length;
    const tick = (): void => {
      done += 1;
      this.progress = done / total;
    };

    for (const key of HERO_ORDER) {
      const art: HeroArt = { poses: {} as PoseSheet, bust: null };
      this.heroes[key] = art;
      for (const pose of POSES) {
        jobs.push(
          this.load(posePath(key, pose)).then((sprite) => {
            art.poses[pose] = sprite;
            tick();
          }),
        );
      }
      jobs.push(
        this.load(bustPath(key)).then((sprite) => {
          art.bust = sprite;
          tick();
        }),
      );
    }

    for (const name of Object.keys(FX) as FxKey[]) {
      jobs.push(
        this.load(FX[name]).then((sprite) => {
          this.fx[name] = sprite;
          tick();
        }),
      );
    }

    await Promise.all(jobs);
    this.progress = 1;
  }
}
