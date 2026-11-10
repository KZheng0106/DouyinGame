# DouyinGame

小游戏合集（微信小游戏 / 抖音小游戏 / 浏览器预览）。每个游戏是 `games/` 下的**独立子包**，共用根目录的工具链、依赖与文档。

## 游戏列表

| 游戏 | 目录 | 玩法 | 状态 |
|---|---|---|---|
| 跳跳小光 | [games/jump](games/jump) | 按住蓄力、松开跳跃，落空可看广告复活 | 微信小游戏已上线 `1.0.2`（2026-11-10） |
| 奶娃大作战 | [games/fighter](games/fighter) | 网络抽象梗 1v1 横屏格斗，3 位英雄、单机 AI 对战 | 开发中（浏览器可玩，待提审） |

## 文档

| 文档 | 内容 |
|---|---|
| [docs/WECHAT.md](docs/WECHAT.md) | **微信小游戏上架材料包**：IAA 免软著条件、逐字段文案、图标/截图素材、发布流程 |
| [docs/PLAN.md](docs/PLAN.md) | 开发与变现总体方案、分阶段计划、风险清单 |
| [docs/TECH-STACK.md](docs/TECH-STACK.md) | Cocos Creator 3.x 与原生 TS + Canvas 的选型对比与结论 |
| [docs/LAUNCH.md](docs/LAUNCH.md) | 抖音上架 12 步详解（含官方链接）、提审自查清单 |
| [docs/ADS.md](docs/ADS.md) | 广告接入说明：流量主开通、三种广告 API、合规红线、错误码 |
| [games/fighter/docs/DESIGN.md](games/fighter/docs/DESIGN.md) | **奶娃大作战设计稿**：英雄、帧数据、战斗状态机、AI、界面布局 |
| [games/fighter/docs/HERO_PROMPTS.md](games/fighter/docs/HERO_PROMPTS.md) | 英雄立绘的 AI 出图提示词与切图规范 |
| [games/fighter/docs/WECHAT-FIGHTER.md](games/fighter/docs/WECHAT-FIGHTER.md) | **奶娃大作战微信提审材料包**：逐字段最终取值、适龄改写、8 张截图分配、发布命令 |

## 仓库结构

```
DouyinGame/
├── docs/                    方案与上线文档（全仓库共用）
├── games/
│   ├── jump/                一个游戏 = 一个独立 npm 子包
│   │   ├── src/
│   │   │   ├── core/        纯逻辑：状态机、关卡生成、布局（可单测）
│   │   │   ├── render/      Canvas 绘制层
│   │   │   ├── platform/    wx / tt / 浏览器三端适配
│   │   │   ├── config.ts    广告位 ID 与调试开关（上线前必改）
│   │   │   ├── ads.ts       激励视频封装
│   │   │   └── main.ts      入口：主循环、输入、存档
│   │   ├── assets/          图标（icon.html 为 SVG 源）+ 提审截图
│   │   ├── test/            逻辑测试
│   │   ├── scripts/         dev / build / upload / shot
│   │   ├── index.html       浏览器预览入口
│   │   ├── game.json
│   │   ├── project.wx.config.json    微信项目配置
│   │   ├── project.config.json       抖音项目配置
│   │   └── tsconfig.json
│   └── fighter/             奶娃大作战（结构同上，另含）
│       ├── docs/            DESIGN.md 设计稿、HERO_PROMPTS.md 出图提示词
│       ├── src/assets/      manifest.ts 素材清单、loader.ts 加载器
│       ├── src/generated/   measure_hero.py 量出的立绘包围盒
│       └── assets/hero|fx|sfx|bgm|screenshots
├── package.json             npm workspaces（games/*）+ 共享 devDependencies
└── README.md
```

## 快速开始

```bash
npm install            # 根目录一次装齐所有依赖
npm run check          # 所有游戏：类型检查 + 逻辑测试
npm run build          # 所有游戏：产出 dist/web、dist/wx、dist/douyin
npm run dev                  # 启动 games/jump 的浏览器预览（http://localhost:5173）
npm run dev   -w games/fighter  # 奶娃大作战预览（http://localhost:5174）
```

构建产物：

| 目录 | 用途 |
|---|---|
| `dist/web/` | 浏览器预览（`index.html`） |
| `dist/wx/` | **微信小游戏包**，用微信开发者工具导入 |
| `dist/douyin/` | 抖音小游戏包，用抖音开发者工具导入 |

只针对单个游戏时，用 `-w` 指定子包，输出更干净：

```bash
npm run dev   -w games/jump
npm run check -w games/jump
npm run build -w games/jump
```

奶娃大作战的提审截图由脚本自动生成（**脚本自己不会起 dev server**，必须先在另一个终端跑 5174）：

```bash
npm run dev   -w games/fighter                  # 终端 A：http://localhost:5174
npm run shots -w games/fighter                  # 终端 B：产出 8 张 1920×1080 横屏截图
```

## 新增一个游戏

1. 复制 `games/jump` 作为模板，重命名为 `games/<slug>`；
2. 改 `games/<slug>/package.json` 的 `name` 为 `@douyin-games/<slug>`；
3. 改 `games/<slug>/project.config.json` 的 `appid`（**每个游戏是独立的小游戏应用，AppID 不同**）；
4. 根目录执行 `npm install`，再 `npm run check -w games/<slug>` 验证；
5. 在本文档「游戏列表」里登记一行。

## 上线前必须修改

以下路径按游戏区分（示例为 `games/jump`）：

1. `games/jump/project.wx.config.json` 的 `appid` 填**微信**小程序 AppID（`wx` 开头）；
2. `games/jump/project.config.json` 的 `appid` 填**抖音**小游戏 AppID（`tt` 开头）；
3. `games/jump/src/config.ts` 的 `debugFakeAd` 改为 `false`（否则用户不看广告也能复活）；
4. `games/jump/src/config.ts` 的 `wxRewardedAdUnitId`（微信）/ `rewardedAdUnitId`（抖音）填流量主广告位 ID。

详见 [docs/WECHAT.md](docs/WECHAT.md)（微信）与 [docs/LAUNCH.md](docs/LAUNCH.md)（抖音）。

## 代码提交流程

本项目使用 Git 管理，远程仓库为 GitHub。每次完成一轮改动后，按以下顺序提交并推送：

```bash
git add .
git commit -m "Initial project setup"
git push origin main
```

### 说明

- `git add .`：把当前目录下的所有改动（新增、修改、删除）加入暂存区。
- `git commit -m "..."`：生成一次提交。`-m` 后面换成本次改动的真实描述，例如
  `feat: 新增游戏主界面`、`fix: 修复跳跃判定失效`。
- `git push origin main`：把本地 `main` 分支推送到远程 `origin`。

### 提交前建议

```bash
git status        # 确认改动范围，避免误提交 node_modules、dist、.env 等
git diff          # 确认改动内容
git pull --rebase origin main   # 远程有其他提交时，先同步再推送
```

### 注意

- `.gitignore` 已忽略 `node_modules/`、`dist/`、`.env` 等，不要强行提交这些文件。
- 首次推送到新仓库需要先确认远程地址：`git remote -v`，必要时用
  `git remote add origin <仓库地址>` 设置。
- 提交信息建议使用 `feat:` / `fix:` / `docs:` / `chore:` 前缀，便于回溯。
