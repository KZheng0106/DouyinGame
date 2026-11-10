import type { AdResult } from './types.ts';

/** 激励视频实例的最小接口，wx 与 tt 的返回对象结构一致。 */
interface RewardedVideoAd {
  onClose(callback: (res: { isEnded?: boolean }) => void): void;
  offClose?(callback: (res: { isEnded?: boolean }) => void): void;
  onError(callback: () => void): void;
  offError?(callback: () => void): void;
  load(): Promise<void>;
  show(): Promise<void>;
}

type AdFactory = (options: { adUnitId: string }) => RewardedVideoAd;

export interface RewardedAdChannel {
  /** 提前 load，玩家点「看视频复活」时直接 show，不用等下载。 */
  preload(adUnitId: string): void;
  show(adUnitId: string): Promise<AdResult>;
}

/**
 * 广告实例按官方建议只创建一次并复用：重复 create 会各自持有播放状态，
 * 容易出现「第一次能播，后面一直 failed」。
 */
export function createRewardedAdChannel(factory: AdFactory | undefined): RewardedAdChannel {
  let ad: RewardedVideoAd | null = null;
  let currentId = '';
  let pending: Promise<void> | null = null;

  function ensure(adUnitId: string): RewardedVideoAd | null {
    if (!factory) return null;
    if (ad && currentId === adUnitId) return ad;
    ad = factory({ adUnitId });
    currentId = adUnitId;
    pending = null;
    return ad;
  }

  function load(adUnitId: string): Promise<void> {
    const instance = ensure(adUnitId);
    if (!instance) return Promise.reject(new Error('rewarded ad unavailable'));
    if (pending) return pending;
    pending = instance.load().catch((error) => {
      // 失败后清空，下次 show 会重新尝试 load
      pending = null;
      throw error;
    });
    return pending;
  }

  return {
    preload(adUnitId) {
      void load(adUnitId).catch(() => {
        /* 预加载失败不影响游戏，点击时再试一次 */
      });
    },

    show(adUnitId) {
      return new Promise<AdResult>((resolve) => {
        const instance = ensure(adUnitId);
        if (!instance) {
          resolve('failed');
          return;
        }

        let settled = false;
        const finish = (result: AdResult): void => {
          if (settled) return;
          settled = true;
          try {
            instance.offClose?.(onClose);
            instance.offError?.(onError);
          } catch {
            /* 忽略解绑异常 */
          }
          resolve(result);
        };

        // 只有看完才发奖励；中途关闭只能算 skipped
        const onClose = (res: { isEnded?: boolean }): void =>
          finish(res?.isEnded === true ? 'completed' : 'skipped');
        const onError = (): void => finish('failed');

        instance.onClose(onClose);
        instance.onError(onError);

        instance
          .show()
          .catch(() => load(adUnitId).then(() => instance.show()))
          .catch(() => finish('failed'));
      });
    },
  };
}
