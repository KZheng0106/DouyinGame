import { GAME_CONFIG } from './config.ts';
import type { AdResult, PlatformAdapter } from './platform/types.ts';

const FAKE_AD_MS = 900;

function adUnitIdFor(platform: PlatformAdapter): string {
  return platform.name === 'wx' ? GAME_CONFIG.wxRewardedAdUnitId : GAME_CONFIG.rewardedAdUnitId;
}

/**
 * 拉取激励视频。只有 'completed' 才应发放奖励；
 * 'skipped'（提前关闭）与 'failed'（无广告/加载失败）都必须拒绝发放。
 */
export async function showRewardedAd(platform: PlatformAdapter): Promise<AdResult> {
  if (GAME_CONFIG.debugFakeAd) {
    await new Promise((resolve) => setTimeout(resolve, FAKE_AD_MS));
    return 'completed';
  }
  const adUnitId = adUnitIdFor(platform);
  if (!adUnitId) return 'failed';
  return platform.showRewardedAd(adUnitId);
}
