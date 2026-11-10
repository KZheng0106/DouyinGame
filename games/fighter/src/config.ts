/**
 * 上线前需要人工填写的配置。
 */
export const GAME_CONFIG = {
  /**
   * 小游戏名称，必须与平台后台「基本设置 → 名称」逐字一致。
   * 标题页会显示它，提审截图里能看到名字才符合审核要求。
   */
  gameName: '抽象大乱斗',

  /** 微信小游戏 · 流量主激励视频广告位 ID（形如 adunit-xxxxxxxx）。 */
  wxRewardedAdUnitId: '',

  /** 抖音小游戏 · 激励视频广告位 ID。 */
  rewardedAdUnitId: '',

  /** 插屏广告位 ID（当前版本未使用，预留）。 */
  interstitialAdUnitId: '',

  /**
   * 调试开关：为 true 时不请求真实广告，直接判定「完整观看」，并会在界面上显示红字提示。
   * 上线版本必须为 false。
   */
  debugFakeAd: false,
};

/** 本地最高连胜 / 最少用时的存储键。 */
export const STORAGE_KEY = 'dyfighter:record';
