# 跳跳小光（games/jump）

按住蓄力 → 松开跳跃 → 落到下一块平台上得分；落空坠落即结束，可看激励视频复活（单局最多 2 次）。

## 运行

在**仓库根目录**执行：

```bash
npm install
npm run dev   -w games/jump     # 浏览器预览 http://localhost:5173
npm run check -w games/jump     # 类型检查 + 逻辑测试
npm run build -w games/jump     # 产出 dist/web、dist/wx、dist/douyin
```

| 产物 | 导入到 |
|---|---|
| `games/jump/dist/wx/` | 微信开发者工具（**当前上架目标**） |
| `games/jump/dist/douyin/` | 抖音开发者工具 |
| `games/jump/dist/web/` | 任意浏览器打开 `index.html` |

微信上架材料与逐字段文案见 [docs/WECHAT.md](../../docs/WECHAT.md)。

## 手感参数

全部集中在 `src/core/constants.ts`：

| 参数 | 含义 |
|---|---|
| `CHARGE_TIME` | 蓄满力所需秒数 |
| `MIN_JUMP_DIST` / `MAX_JUMP_DIST` | 最短 / 最远跳跃距离 |
| `JUMP_DURATION_MIN` / `MAX` | 空中停留时间（影响节奏感） |
| `PERFECT_TOLERANCE` | 落点距平台中心多少像素内算「完美」 |
| `MAX_REVIVES` | 单局复活上限 |

难度曲线在 `src/core/game.ts` 的 `addPlatform()`：平台宽度与间距随分数收敛，
但始终保证「从当前平台最左端起跳也能落到下一块」，这条不变式由 `test/game.test.ts` 守护。

## 平台适配

`src/platform/` 下三套适配，`createPlatform()` 按 `wx` → `tt` → 浏览器顺序探测，同一份代码三端运行：

| 文件 | 平台 |
|---|---|
| `wx.ts` | 微信小游戏 |
| `tt.ts` | 抖音小游戏 |
| `web.ts` | 浏览器预览 |

## 上线前必改

| 位置 | 改成什么 |
|---|---|
| `project.wx.config.json` → `appid` | 微信小程序 AppID（`wx` 开头） |
| `project.config.json` → `appid` | 抖音小游戏 AppID（`tt` 开头） |
| `src/config.ts` → `debugFakeAd` | `false`（否则不看广告也能复活） |
| `src/config.ts` → `wxRewardedAdUnitId` | 微信流量主激励视频广告位（`adunit-` 开头） |
| `src/config.ts` → `rewardedAdUnitId` | 抖音流量主激励视频广告位 |

## 素材

`assets/icon.html` 是图标 SVG 源文件（改完用浏览器打开截图即可导出），
`assets/icon-144.png` / `icon-512.png` / `icon-600.png` 为导出结果，
`assets/screenshots/` 下为提审用游戏内截图。
