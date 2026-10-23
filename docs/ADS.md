# 广告接入说明

> 本文所有接口与规则均已对照抖音官方文档核对（2026-10）。
> 官方文档入口：[小游戏 JavaScript API 概览](https://developer.open-douyin.com/docs/resource/zh-CN/mini-game/develop/api/overview)

---

## 一、先搞懂顺序：不是写代码就能有广告收入

```
主体资质认证 + 对公验证
        ↓
申请开通【流量主】（控制台 → 商业化 → 流量主）
        ↓
在【流量主 → 广告管理】创建广告位 → 拿到 adUnitId
        ↓
代码里用 adUnitId 调 tt.createRewardedVideoAd 等接口
        ↓
用户看广告 → 平台计费 → 流量主后台看收益数据
```

**没有 adUnitId，代码一行都跑不通。** 所以顺序是：先开通流量主 → 建广告位 → 再回来填配置。

按官方文档（[发布小游戏](https://developer.open-douyin.com/docs/resource/zh-CN/mini-game/guide/minigame/release)）：
> 开发者在完成相关主体资质认证和对公验证后，即可在后台的 **抖音开放平台 → 商业化 → 流量主** 进行申请开通操作。

---

## 二、三种广告形式，能力差异

| 广告形式 | API | 位置 | 收益 | 本项目是否用 |
|---|---|---|---|---|
| **激励视频** | `tt.createRewardedVideoAd` | 全屏覆盖，用户主动触发 | 最高 | ✅ 复活用 |
| 插屏 | `tt.createInterstitialAd` | 全屏，局间弹出 | 中 | 预留 |
| Banner | `tt.createBannerAd` | 常驻条幅 | 最低 | 未用 |

官方文档：

- [tt.createRewardedVideoAd](https://developer.open-douyin.com/docs/resource/zh-CN/mini-game/develop/open-capacity/ads/tt-create-rewarded-video-ad)
- [RewardedVideoAd 对象](https://developer.open-douyin.com/docs/resource/zh-CN/mini-game/develop/open-capacity/ads/rewarded-video-ad/rewarded-video-ad)
- [tt.createInterstitialAd](https://developer.open-douyin.com/docs/resource/zh-CN/mini-game/develop/open-capacity/ads/tt-create-interstitial-ad)
- [tt.createBannerAd](https://developer.open-douyin.com/docs/resource/zh-CN/mini-game/develop/open-capacity/ads/tt-create-banner-ad)

---

## 三、本项目现在怎么接入（3 步）

### 第 1 步：把广告位 ID 填进配置

打开 [`games/jump/src/config.ts`](../games/jump/src/config.ts)：

```ts
export const GAME_CONFIG = {
  rewardedAdUnitId: '你的激励视频广告位ID',  // ← 填这里
  interstitialAdUnitId: '',
  debugFakeAd: false,                        // ← 上线必须改 false
};
```

### 第 2 步：重新构建上传

```bash
npm run build -w games/jump
# 然后用抖音开发者工具导入 games/jump/dist/game/ 上传
```

### 第 3 步：真机验证

**开发者工具里通常不展示真实广告**，必须用手机扫码真机测试。

---

## 四、代码里已经封装好了什么

| 文件 | 作用 |
|---|---|
| [`src/ads.ts`](../games/jump/src/ads.ts) | 统一入口，隔离"真实广告 / 调试假广告" |
| [`src/platform/tt.ts`](../games/jump/src/platform/tt.ts) | `tt.createRewardedVideoAd` 的 Promise 封装 + 降级 |
| [`src/core/game.ts`](../games/jump/src/core/game.ts) | `revive()` 判断复活是否合法 |

**核心逻辑：只有 `isEnded === true` 才发奖励。**

```ts
const onClose = (res) => finish(res && res.isEnded === true ? 'completed' : 'skipped');
```

用户中途关掉广告（`skipped`）或拉取失败（`failed`），一律不给复活 —— 这是**必须的**，否则等于白送。

---

## 五、自己写广告代码时的关键点

### 5.1 激励视频

```js
const videoAd = tt.createRewardedVideoAd({ adUnitId: 'xxx' });

videoAd.onError((err) => {
  // 必须注册！官方文档明确要求：始终注册 onError 保证异常可处理
  console.warn('广告错误', err.errNo, err.errMsg);
});

videoAd.onClose((res) => {
  if (res && res.isEnded) {
    grantReward();     // 完整观看 → 发奖励
  } else {
    toast('需要看完才能获得奖励');  // 中途关闭 → 不发
  }
});

videoAd.show().catch(() => {
  // 首次 show 失败通常是还没加载好，先 load 再 show
  videoAd.load().then(() => videoAd.show()).catch(() => {});
});
```

### 5.2 五个必须知道的细节（官方文档明示）

1. **全局只能有一个激励视频实例**。重复 `create` 无效，需 `destroy()` 后再建。
2. **播放期间 JS 逻辑和渲染全部暂停**，用户不能操作游戏 —— 不要让动画依赖时间戳累加，回来后要做一次时间跳跃处理。
3. **iOS 播放/关闭会触发 `onShow` / `onHide`，安卓不会**。如果你在这两个回调里做存档或暂停，必须兼容两端差异。
4. **广告支持竖屏展示**；横屏游戏展示时会先切竖屏。本项目是竖屏，无影响。
5. **基础库 1.3.0+** 支持，`multiton`（再得广告）需 2.74.0+。

### 5.3 常见错误码

| errNo | errMsg | 含义 / 处理 |
|---|---|---|
| 1001 | The adUnitId is empty | 没填 adUnitId |
| 1002 | The adUnitId is invalid | 广告位 ID 错 / 不属于该小游戏 |
| 1006 | The scene does not support advertising | 当前场景不支持 |
| 1007 | The adUnitId is prohibit | 广告位被封禁 |
| 1008 | The adUnitId is closed | 广告位已关闭 |
| 1000 / 1003 | request ad failed @N | 拉取失败，多为无广告库存，做降级即可 |
| 1004 | — | 无广告可播，平台会自动兜底为「录屏分享」替代 |

> 1004 的兜底行为：无广告时自动拉起录屏/好友分享，用户分享完成后同样回调 `onClose` 且 `isEnded === true`。所以你的发奖励逻辑不用改。

---

## 六、合规红线（这份是审核打回重灾区）

依据官方 [广告小游戏运营规范](https://developer.open-douyin.com/docs/resource/zh-CN/mini-game/operation1/norms/norms)，以下每一条都有人在审核时被打回：

**绝对不要做**

- ❌ 把看广告设成**关卡解锁的前置条件**（不看广告就没法正常玩）
- ❌ 默认勾选「看广告开始游戏」
- ❌ 看多次广告才给**一次**奖励
- ❌ 未经过用户允许自动弹广告
- ❌ 关闭按钮延迟超过 3 秒出现
- ❌ 广告按钮移位 / 突然出现，制造误触
- ❌ 「付费去广告」「自定义广告关闭按钮」—— 这属于三级违规
- ❌ 单屏放多个广告位
- ❌ Banner 遮挡游戏按钮或操作热区；Banner 放在游戏主场景

**必须做**

- ✅ 触发广告的按钮上要有**明显的视频广告标识或文字提示**（本项目按钮文案「看视频复活」已满足文字要求；建议后续补官方 icon）
- ✅ 始终注册 `onError`
- ✅ 广告拉取失败时游戏必须能继续
- ✅ 插屏不要过于频繁，不能阻断游戏进程

> 官方还提供广告 icon 模板（38×28px，有 PDF / PSD），在广告运营规范页可下载，尺寸/配色/位置都有硬性规则，接入时按规范放。

---

## 七、变现参数怎么调

代码里这三个地方控制"看得多不多"：

| 位置 | 参数 | 建议 |
|---|---|---|
| `src/core/constants.ts` | `MAX_REVIVES = 2` | 1~2 次，再多用户反感 |
| `src/core/game.ts` | `addPlatform()` 难度 | 平台越难 → 复活率越高 → 广告次数越多，但留存会掉，要平衡 |
| `src/ui` 文案 | 复活按钮文案 | 「看视频复活」比「复活」转化高，也更合规 |

**核心指标**：人均日看广告次数（行业经验 2~4 次算健康）、eCPM、ARPDAU。
先在流量主后台跑一周拿真实数据，再决定要不要加插屏。

---

## 八、一句话检查表

上线前逐条打勾：

- [ ] 流量主已开通，广告位已创建
- [ ] `rewardedAdUnitId` 已填
- [ ] `debugFakeAd` 已改 `false`
- [ ] 真机上完整观看 → 复活成功
- [ ] 真机上中途关闭 → 不复活，且能重新开始
- [ ] 断网 / 无广告库存 → 不复活，游戏不卡死
- [ ] 复活按钮带「看视频」文字提示
- [ ] 没有任何"不看广告不能玩"的阻塞
