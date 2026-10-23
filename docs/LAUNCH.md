# 上架操作手册（含官方链接）

> 所有链接均为抖音开放平台官方文档，2026-10 核对有效。
> 总入口：[小游戏接入指南](https://developer.open-douyin.com/docs/resource/zh-CN/mini-game/guide/minigame/introduction)

---

## 谁做什么

| 环节 | 谁做 | 原因 |
|---|---|---|
| 注册、实名、创建小游戏、备案、提交审核、发布 | **你** | 需人脸/短信验证、电子签名、法律主体确认 |
| 改配置、修代码、按驳回理由整改 | **我** | 你说一声即可 |
| 真机自测 | **你操作，我给清单** | 需要真机扫码 |

> ⚠️ 你的账号密码曾在对话中明文出现，**请立刻修改密码并开启二次验证**。之后需要我协助时，登录后截图给我即可。

---

## 步骤总览

| # | 步骤 | 预计耗时 | 阻塞后续 |
|---|---|---|---|
| 1 | 注册 / 入驻开发者平台 | 10 分钟 | ✅ 必须 |
| 2 | 创建小游戏，拿 AppID | 20 分钟 | ✅ 必须 |
| 3 | 小游戏备案申报 | **3~20 个工作日** | ✅ **最大卡点** |
| 4 | 接入必接能力（侧边栏复访） | 0.5~1 天 | ✅ 必须 |
| 5 | 本地配置 AppID / 广告位 | 5 分钟 | ✅ 必须 |
| 6 | 下载安装抖音开发者工具 | 10 分钟 | ✅ 必须 |
| 7 | 导入项目 + 真机预览 | 30 分钟 | ✅ 必须 |
| 8 | 上传测试版本 | 5 分钟 | ✅ 必须 |
| 9 | 提交审核（首次 QA 1~3 个工作日） | 15 分钟 + 等待 | ✅ 必须 |
| 10 | 发布上线（全量 / 灰度） | 10 分钟 | — |
| 11 | 开通流量主 + 创建广告位 | 1~3 个工作日 | 变现前提 |
| 12 | 看数据迭代 | 持续 | — |

**关键提醒：第 3 步备案是唯一会卡你几周的事，今天就该启动，其它步骤可以并行。**

---

## 第 1 步｜注册 / 入驻开发者平台

📖 [注册与入驻（官方）](https://developer.open-douyin.com/docs/resource/zh-CN/mini-game/guide/minigame/register)

1. 打开 <https://developer.open-douyin.com>，右上角「登录注册」
2. 用抖音扫码或手机号注册
3. 进入控制台，完成**开发者入驻**：选择主体类型（个人 / 企业）
4. 完成**实名认证**

> 你已有账号，这一步大概率已完成，只需确认主体类型。

---

## 第 2 步｜创建小游戏，拿到 AppID

🔗 [控制台 · 创建小游戏](https://developer.open-douyin.com/console/apply/game)
📖 [创建与信息完善（官方）](https://developer.open-douyin.com/docs/resource/zh-CN/mini-game/guide/minigame/improve-information)

1. 控制台 → 小游戏 → 「创建小游戏」
2. 填写：名称、简介、类目（休闲游戏）、头像
3. 进入「设置 / 开发设置」，复制 **AppID**（形如 `ttxxxxxxxxxxxxxxxx`）

**把 AppID 发我**，我改 `games/jump/project.config.json`。

---

## 第 3 步｜小游戏备案申报（最大卡点）

📖 [小游戏备案申报（官方）](https://developer.open-douyin.com/docs/resource/zh-CN/mini-game/guide/minigame/game-filing-application-works)

国内小游戏上线前必须完成备案。准备材料通常包括：

- 主体证件（个人身份证 / 企业营业执照）
- 游戏名称、玩法说明
- 软件著作权（部分情形需要）
- 服务器与域名信息（如涉及网络请求）

**建议今天就提交，边等备案边开发。** 具体材料与控制台入口以官方文档为准。

---

## 第 4 步｜接入「必接能力」

📖 [必接能力（官方）](https://developer.open-douyin.com/docs/resource/zh-CN/mini-game/guide/minigame/essential-skills)
📖 [侧边栏复访能力（官方）](https://developer.open-douyin.com/docs/resource/zh-CN/mini-game/operation1/ability/-retention/sidebar)

官方明确：**所有小游戏必须接入「侧边栏复访能力」**。

| 必接能力 | 是否适用本项目 |
|---|---|
| 侧边栏复访能力 | ✅ **必须**，当前代码尚未接入 |
| 客服能力 | ❌ 仅内购游戏需要 |
| 敏感词 | ❌ 仅在允许用户自定义输入时需要 |

> 这是当前项目**唯一的功能性缺口**，我在提审前会补上。你把备案提交完、AppID 给我后告诉我，我一起做。

---

## 第 5 步｜本地配置（我负责，你只需给两个 ID）

```ts
// games/jump/src/config.ts
export const GAME_CONFIG = {
  rewardedAdUnitId: '激励视频广告位ID',   // 第 11 步拿到后填
  interstitialAdUnitId: '',
  debugFakeAd: false,                     // ← 上线红线
};
```

```json
// games/jump/project.config.json
{ "appid": "tt你的AppID" }
```

然后：

```bash
npm run check -w games/jump
npm run build -w games/jump     # 产出 games/jump/dist/douyin/
```

---

## 第 6 步｜下载并安装抖音开发者工具

📖 [开发者工具下载（官方）](https://developer.open-douyin.com/docs/resource/zh-CN/mini-game/develop/developer-instrument/developer-instrument-update-and-download)

1. 打开上面的链接，按系统（Windows / macOS）下载安装
2. 启动后用**抖音扫码登录**（用小游戏所属账号）

---

## 第 7 步｜导入项目 + 真机预览

📖 [开发小游戏（官方）](https://developer.open-douyin.com/docs/resource/zh-CN/mini-game/guide/minigame/develop)

1. 工具首页 → 「导入项目」
2. **目录选择 `games/jump/dist/douyin/`**（不是仓库根目录，不是 `src/`）
3. AppID 会自动从 `project.config.json` 读取
4. 点「编译」，左侧模拟器出画面
5. 点「预览」→ 手机抖音扫码 → **真机测试**

### 真机自测清单

- [ ] 冷启动到可操作 < 3 秒
- [ ] 长按蓄力跟手，松手落点准确
- [ ] 落空 → 坠落 → 结束 → 复活全链路正常
- [ ] 广告：完整观看 → 复活；中途关闭 → 不复活；加载失败 → 不复活且能重开
- [ ] 最高分重启后仍在
- [ ] 不同分辨率机型 UI 不遮挡、不出屏
- [ ] 连续玩 10 分钟无卡顿/闪退

---

## 第 8 步｜上传测试版本

📖 [版本提审指引（官方）](https://developer.open-douyin.com/docs/resource/zh-CN/mini-game/guide/minigame/examineguide)

1. 开发者工具右上角「上传」
2. 填写 **「上传版本」**（如 `1.0.0`）和 **「更新日志」** → 确定
3. 上传成功后，工具会引导跳转控制台

> 官方支持最多 25 个测试通道（默认通道 + 通道 1~24）。**扫码预览只会打开「默认通道」的版本**，要真机扫的版本务必传默认通道。

---

## 第 9 步｜提交审核

1. 控制台 → 左侧「**开发版本管理**」
2. 找到刚上传的测试版本 → 扫码再确认一遍
3. 点「**提交审核**」
4. 按要求提供 **3 张游戏内截图**
5. 若需要灰度，**不要**勾选「自动发布」（否则审核通过直接全量）

### 提审前必读

- 📖 [自审自查指引](https://developer.open-douyin.com/docs/resource/zh-CN/mini-game/operation1/agreement-and-norms/norms/standards)
- 📖 [版本提审指引](https://developer.open-douyin.com/docs/resource/zh-CN/mini-game/guide/minigame/examineguide)
- 📖 [广告小游戏运营规范](https://developer.open-douyin.com/docs/resource/zh-CN/mini-game/operation1/norms/norms)

### 官方明确的三个硬性要求

1. **首次上线前必须做 QA 回归，预计 1~3 个工作日**
2. 自 2026-04-20 起，提审会**自动上线到所有合作 App**（多端同时回归），任一宿主端不通过就要重新提审
3. **用了网络功能就必须配「安全域名」白名单**，且必须是 `https://` / `wss://`（本项目当前无网络请求，不受影响）

---

## 第 10 步｜发布上线

📖 [发布小游戏（官方）](https://developer.open-douyin.com/docs/resource/zh-CN/mini-game/guide/minigame/release)

1. 审核通过 → 控制台「版本管理」→「发布」
2. **发布前先配好两样东西**（否则会弹提示要求你去配）：
   - 能力中心 → 运营能力 → **分享设置**（分享标题 / 文案 / 图案）
   - 能力中心 → 运营能力 → **搜索资源配置**（搜索关键词）
3. 选择发布方式：
   - **全量发布**：立即对全部用户可见
   - **灰度发布**：可设灰度比例，**灰度满 15 天自动全量**

> 建议第一次先灰度，观察崩溃率和留存再全量。

---

## 第 11 步｜开通流量主 + 创建广告位（变现开关）

📖 [广告接入说明（本项目文档）](./ADS.md)
📖 [tt.createRewardedVideoAd（官方）](https://developer.open-douyin.com/docs/resource/zh-CN/mini-game/develop/open-capacity/ads/tt-create-rewarded-video-ad)

1. 完成**主体资质认证 + 对公验证**
2. 控制台 →「**商业化**」→「**流量主**」→ 申请开通
3. 开通后 →「流量主」→「**广告管理**」→ 新建广告位
   - 类型：**激励视频**（必建）
   - 可选：插屏、Banner
4. 复制 `adUnitId` 发我 → 我填进配置并重新构建上传

> 注意：**广告位只在真机生效**，开发者工具里通常看不到真实广告。

---

## 第 12 步｜看数据迭代

📖 [运营指引](https://developer.open-douyin.com/docs/resource/zh-CN/mini-game/guide/minigame/operationalguidelines)
📖 [性能优化](https://developer.open-douyin.com/docs/resource/zh-CN/mini-game/guide/minigame/optimization)
📖 [防沉迷 / 实名认证绑定](https://developer.open-douyin.com/docs/resource/zh-CN/mini-game/guide/minigame/realnameauthentication)

控制台「总览」可看线上版 / 灰度版的昨日关键数据；「用户分析」「性能分析」可分版本查看。

必须盯的指标：`次留`、`7 留`、`人均广告观看次数`、`eCPM`、`ARPDAU`。

---

## 提审自查清单（本项目专用）

**功能**

- [ ] 首屏 3 秒内可操作
- [ ] 无崩溃、无黑屏
- [ ] 最高分持久化正常
- [ ] 侧边栏复访能力已接入

**广告合规**

- [ ] 首屏不弹插屏
- [ ] 复活按钮有「看视频」文字提示
- [ ] 不存在「不看广告不能玩」
- [ ] 看 1 次广告给 1 次奖励（不能要求看多次）
- [ ] 广告关闭按钮可正常点
- [ ] 广告失败时游戏不卡死
- [ ] 无「付费去广告」「自定义关闭按钮」

**其他**

- [ ] 无诱导分享 / 诱导关注
- [ ] 无外部跳转、无未备案域名
- [ ] 有隐私政策（如涉及信息收集）
- [ ] 未成年人保护提示就位

---

## 常见打回原因与处理

| 打回原因 | 处理方式 |
|---|---|
| 缺备案 / 资质不全 | 补备案，可能需补软著 |
| 类目选错 | 改选「休闲游戏」等相符类目 |
| 诱导分享 | 删除分享奖励逻辑 |
| 广告遮挡 / 强制观看 / 无广告标识 | 按[广告运营规范](https://developer.open-douyin.com/docs/resource/zh-CN/mini-game/operation1/norms/norms)整改 |
| 首屏加载过久 | 压缩首包、加 loading |
| 缺隐私政策 | 补隐私政策并挂链接 |
| 未接侧边栏复访 | 接入后重新提审 |

**把驳回原文发我，我直接改代码并重新构建。**
