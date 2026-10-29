/**
 * 上线前需要人工填写的配置。
 */
export const GAME_CONFIG = {
  /**
   * 小游戏名称，必须与微信后台「设置 → 基本设置 → 名称」逐字一致。
   * 开始页会显示它，提审截图里能看到名字才符合审核要求。
   */
  gameName: '跳跳小光',

  /** 微信小游戏 · 流量主激励视频广告位 ID（形如 adunit-xxxxxxxx）。上线前必填。 */
  wxRewardedAdUnitId: '',

  /** 抖音小游戏 · 激励视频广告位 ID。 */
  rewardedAdUnitId: '',

  /** 插屏广告位 ID（当前版本未使用，预留）。 */
  interstitialAdUnitId: '',

  /**
   * 调试开关：为 true 时不请求真实广告，直接判定"完整观看"。
   * ⚠️ 上线前必须改为 false，否则用户不看广告也能复活。
   */
  debugFakeAd: true,
};
