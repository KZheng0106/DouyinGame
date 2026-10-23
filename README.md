# DouyinGame

抖音小游戏合集。每个游戏是 `games/` 下的**独立子包**，共用根目录的工具链、依赖与文档。

## 游戏列表

| 游戏 | 目录 | 玩法 | 状态 |
|---|---|---|---|
| 跳一跳 | [games/jump](games/jump) | 按住蓄力、松开跳跃，落空可看广告复活 | 原型完成 |

## 文档

| 文档 | 内容 |
|---|---|
| [docs/PLAN.md](docs/PLAN.md) | 开发与变现总体方案、分阶段计划、风险清单 |
| [docs/TECH-STACK.md](docs/TECH-STACK.md) | Cocos Creator 3.x 与原生 TS + Canvas 的选型对比与结论 |
| [docs/LAUNCH.md](docs/LAUNCH.md) | 上架 12 步详解（含官方链接）、提审自查清单、常见打回原因 |
| [docs/ADS.md](docs/ADS.md) | 广告接入说明：流量主开通、三种广告 API、合规红线、错误码 |

## 仓库结构

```
DouyinGame/
├── docs/                    方案与上线文档（全仓库共用）
├── games/
│   └── jump/                一个游戏 = 一个独立 npm 子包
│       ├── src/
│       │   ├── core/        纯逻辑：状态机、关卡生成、布局（可单测）
│       │   ├── render/      Canvas 绘制层
│       │   ├── platform/    tt 与浏览器双适配
│       │   ├── config.ts    广告位 ID 与调试开关（上线前必改）
│       │   ├── ads.ts       激励视频封装
│       │   └── main.ts      入口：主循环、输入、存档
│       ├── test/            逻辑测试
│       ├── scripts/         dev / build
│       ├── index.html       浏览器预览入口
│       ├── game.json / project.config.json
│       └── tsconfig.json
├── package.json             npm workspaces（games/*）+ 共享 devDependencies
└── README.md
```

## 快速开始

```bash
npm install            # 根目录一次装齐所有依赖
npm run check          # 所有游戏：类型检查 + 逻辑测试
npm run build          # 所有游戏：产出 dist/web 与 dist/game
npm run dev            # 启动 games/jump 的浏览器预览（http://localhost:5173）
```

只针对单个游戏时，用 `-w` 指定子包，输出更干净：

```bash
npm run dev   -w games/jump
npm run check -w games/jump
npm run build -w games/jump
```

## 新增一个游戏

1. 复制 `games/jump` 作为模板，重命名为 `games/<slug>`；
2. 改 `games/<slug>/package.json` 的 `name` 为 `@douyin-games/<slug>`；
3. 改 `games/<slug>/project.config.json` 的 `appid`（**每个游戏是独立的小游戏应用，AppID 不同**）；
4. 根目录执行 `npm install`，再 `npm run check -w games/<slug>` 验证；
5. 在本文档「游戏列表」里登记一行。

## 上线前必须修改

以下路径按游戏区分（示例为 `games/jump`）：

1. `games/jump/project.config.json` 的 `appid` 填该游戏真实的 AppID；
2. `games/jump/src/config.ts` 的 `debugFakeAd` 改为 `false`（否则用户不看广告也能复活）；
3. `games/jump/src/config.ts` 的 `rewardedAdUnitId` 填流量主创建的激励视频广告位 ID。

详见 [docs/LAUNCH.md](docs/LAUNCH.md)。

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
