# 跳一跳（games/jump）

按住蓄力 → 松开跳跃 → 落到下一块平台上得分；落空坠落即结束，可看激励视频复活（单局最多 2 次）。

## 运行

在**仓库根目录**执行：

```bash
npm install
npm run dev   -w games/jump     # 浏览器预览 http://localhost:5173
npm run check -w games/jump     # 类型检查 + 逻辑测试
npm run build -w games/jump     # 产出 dist/web 与 dist/game
```

在抖音开发者工具中导入 `games/jump/dist/game/`。

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

## 上线前必改

1. `project.config.json` → `appid`
2. `src/config.ts` → `debugFakeAd: false`
3. `src/config.ts` → `rewardedAdUnitId`
