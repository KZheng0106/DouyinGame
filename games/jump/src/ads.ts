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
  // 流量主未开通、广告位未配置时退化为直接复活：
  // 此时没有任何广告可放，若返回 'failed' 会让「看视频复活」按钮点了毫无反应。
  // 一旦填入广告位 ID，就会走真实激励视频流程。
  if (!adUnitId) return 'completed';

  return platform.showRewardedAd(adUnitId);
}
