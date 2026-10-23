/**
 * 上线前需要人工填写的配置。
 */
export const GAME_CONFIG = {
  /** 抖音开放平台 → 小游戏 → 流量主 → 激励视频广告位 ID。留空则无法拉取真实广告。 */
  rewardedAdUnitId: '',

  /** 插屏广告位 ID（当前版本未使用，预留）。 */
  interstitialAdUnitId: '',

  /**
   * 调试开关：为 true 时不请求真实广告，直接判定"完整观看"。
   * ⚠️ 上线前必须改为 false，否则用户不看广告也能复活。
   */
  debugFakeAd: true,
};
