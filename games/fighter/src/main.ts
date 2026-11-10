/**
 * 主循环：加载 → 标题 → 选人 → 对战 → 结算。
 *
 * 整个游戏只有一个 canvas、一个 raf 循环。场景切换只换「更新函数」和「绘制函数」，
 * 不重建 canvas，避免小游戏端反复 setTransform 造成的闪烁。
 */
import { preloadRewardedAd, showRewardedAd } from './ads.ts';
import { AssetStore } from './assets/loader.ts';
import { BGM, SFX, hitSfxPath } from './assets/manifest.ts';
import { STORAGE_KEY } from './config.ts';
import { AiBrain } from './core/ai.ts';
import type { Difficulty as AiDifficulty } from './core/ai.ts';
import { EMPTY_INPUT, createBattle, reviveFromResult, step } from './core/battle.ts';
import type { BattleState, HitEvent, Input } from './core/battle.ts';
import { GROUND_Y, STAGE_H, STAGE_W } from './core/constants.ts';
import { HERO_ORDER } from './core/heroes.ts';
import type { HeroKey } from './core/heroes.ts';
import {
  DIR_MID_X,
  getDifficultyButtons,
  getFightButton,
  getHeroCards,
  getOpponentRow,
  getPadButtons,
  getQuitButton,
  getResultButtons,
  getTitleButton,
  hitTestMenu,
  hitTestPad,
  hitTestRect,
} from './core/layout.ts';
import type { Difficulty, MenuButton, PadButton } from './core/layout.ts';
import type { View } from './core/view.ts';
import { createView, fitScale } from './core/view.ts';
import { installShotBridge } from './dev-bridge.ts';
import { createPlatform } from './platform/index.ts';
import type { TouchPoint } from './platform/types.ts';
import { drawHud } from './render/hud.ts';
import {
  drawLoading,
  drawResult,
  drawSelect,
  drawTitle,
} from './render/menu.ts';
import { drawPads } from './render/pad.ts';
import { clearHitFx, drawHitFx, spawnBurst, spawnHitFx } from './render/fx.ts';
import { drawStage } from './render/stage.ts';

type Scene = 'loading' | 'title' | 'select' | 'fight' | 'result';

interface Record {
  bestWins: number;
  bestCombo: number;
}

const platform = createPlatform();
const ctx = platform.ctx;

let scale = 1;
/** 舞台左上角在视口里的偏移（CSS 像素），由等比缩放后的留黑边产生。 */
let offsetX = 0;
let offsetY = 0;
let view: View = createView(STAGE_W, STAGE_H);
let scene: Scene = 'loading';
let time = 0;

const art = new AssetStore((path) => platform.loadImage(path));

// 素材一次性拉进内存，主循环靠 art.progress 决定何时离开 loading 场景。
void art.loadAll();

/* ------------------------------------------------------------ 玩家选择 */

let heroKey: HeroKey = 'niu';
let difficulty: Difficulty = 'normal';
let opponentKey: HeroKey = 'gu';

/* ------------------------------------------------------------ 战斗状态 */

let battle: BattleState | null = null;
let brain: AiBrain | null = null;
let reviveUsed = false;
let record: Record = { bestWins: 0, bestCombo: 0 };

/** 手指 → 按键归属。按下时锁定，滑动不换键，松手才释放。 */
const fingerOwner = new Map<number, PadButton['id']>();
/** 被按住的键集合，用于高亮。 */
const heldKeys = new Set<PadButton['id']>();
/** 本帧的输入。每次采样后重建。 */
let input: Input = { ...EMPTY_INPUT };
/** 上一帧已经消费过的动作键，用于把「按住」转成「按一下」。 */
const edgeKeys = new Set<PadButton['id']>();

let lastHp = { p1: 0, p2: 0 };

/* ------------------------------------------------------------------ 存档 */

function readRecord(): Record {
  const raw = platform.getItem(STORAGE_KEY);
  if (!raw) return { bestWins: 0, bestCombo: 0 };
  try {
    const parsed = JSON.parse(raw) as Partial<Record>;
    return {
      bestWins: Number(parsed.bestWins) || 0,
      bestCombo: Number(parsed.bestCombo) || 0,
    };
  } catch {
    return { bestWins: 0, bestCombo: 0 };
  }
}

function persistRecord(): void {
  platform.setItem(STORAGE_KEY, JSON.stringify(record));
}

/* ------------------------------------------------------------ 尺寸与坐标 */

function resize(): void {
  const viewport = platform.viewport();

  // 高度优先铺满：横屏时高度才是稀缺资源，宽度富余的机型左右多铺背景。
  scale = fitScale(viewport.width, viewport.height);

  const canvas = platform.canvas;
  canvas.width = Math.max(1, Math.round(viewport.width * viewport.dpr));
  canvas.height = Math.max(1, Math.round(viewport.height * viewport.dpr));

  offsetX = (viewport.width - STAGE_W * scale) / 2;
  offsetY = (viewport.height - STAGE_H * scale) / 2;

  ctx.setTransform(
    viewport.dpr * scale,
    0,
    0,
    viewport.dpr * scale,
    offsetX * viewport.dpr,
    offsetY * viewport.dpr,
  );

  view = createView(viewport.width, viewport.height);
}

function toLogical(point: TouchPoint): { x: number; y: number } {
  return { x: (point.x - offsetX) / scale, y: (point.y - offsetY) / scale };
}

/* ------------------------------------------------------------ 场景切换 */

function goTitle(): void {
  scene = 'title';
  battle = null;
  brain = null;
  clearHitFx();
  platform.playMusic(BGM.fight, 0.22);
}

function goSelect(): void {
  scene = 'select';
  battle = null;
  brain = null;
  clearHitFx();
  // 随机给一个和玩家不同的对手
  const pool = HERO_ORDER.filter((key) => key !== heroKey);
  opponentKey = pool[Math.floor(Math.random() * pool.length)] ?? 'gu';
}

function startFight(): void {
  battle = createBattle(heroKey, opponentKey, Date.now() >>> 0);
  brain = new AiBrain(difficulty as AiDifficulty);
  reviveUsed = false;
  clearHitFx();
  lastHp = { p1: battle.p1.hp, p2: battle.p2.hp };
  fingerOwner.clear();
  heldKeys.clear();
  edgeKeys.clear();
  input = { ...EMPTY_INPUT };
  scene = 'fight';
  prevPhase = 'ready';
  platform.playMusic(BGM.fight, 0.3);
  platform.vibrate('light');
}

function goResult(): void {
  scene = 'result';
  if (!battle) return;
  const won = battle.winner === 'p1';
  const maxCombo = Math.max(battle.p1.combo, battle.p2.combo);
  if (won) {
    record.bestWins += 1;
    if (maxCombo > record.bestCombo) record.bestCombo = maxCombo;
    persistRecord();
  }
  platform.playMusic(won ? BGM.win : BGM.lose, 0.32);
  platform.vibrate(won ? 'light' : 'heavy');
}

function backToSelect(): void {
  goSelect();
  platform.playMusic(BGM.fight, 0.22);
}

/* ------------------------------------------------------------ 触摸处理 */

/** 根据当前所有触控点重算输入。只在战斗场景调用。 */
function rebuildInput(): void {
  heldKeys.clear();
  let move: -1 | 0 | 1 = 0;

  for (const [fingerId, owner] of fingerOwner) {
    if (!fingerId) continue;
    heldKeys.add(owner);
  }

  const left = heldKeys.has('left');
  const right = heldKeys.has('right');
  if (left && !right) move = -1;
  else if (right && !left) move = 1;

  const next: Input = {
    move,
    light: false,
    heavy: false,
    ultimate: false,
    block: heldKeys.has('block'),
  };

  // 动作键走「按下即触发」：只有新按下的键才置 true，避免按住不放连续出招。
  const edgeMap: Array<[PadButton['id'], keyof Input]> = [
    ['light', 'light'],
    ['heavy', 'heavy'],
    ['ultimate', 'ultimate'],
  ];
  for (const [id, field] of edgeMap) {
    if (heldKeys.has(id) && !edgeKeys.has(id)) {
      (next as any)[field] = true;
      edgeKeys.add(id);
    }
  }
  for (const id of Array.from(edgeKeys)) {
    if (!heldKeys.has(id)) edgeKeys.delete(id);
  }

  input = next;
}

function onTouchStart(points: TouchPoint[]): void {
  for (const point of points) {
    if (fingerOwner.has(point.id)) continue;
    const local = toLogical(point);
    if (scene === 'fight' && battle) {
      if (hitTestRect(getQuitButton(view), local.x, local.y)) {
        handleTap(local.x, local.y);
        continue;
      }
      const pad = getPadButtons(battle.p1.energy, view);
      const button = hitTestPad(pad, local.x, local.y);
      if (button) {
        fingerOwner.set(point.id, button.id);
        continue;
      }
      // 没打到按键就当作方向滑动：按在屏幕左半边走左、右半边走右，跨过中线可换向
      fingerOwner.set(point.id, local.x < DIR_MID_X ? 'left' : 'right');
      continue;
    }
    handleTap(local.x, local.y);
  }
  rebuildInput();
}

function onTouchMove(points: TouchPoint[]): void {
  if (scene !== 'fight') return;
  // 方向键允许在左右之间滑动换向，动作键不换归属
  for (const point of points) {
    const owner = fingerOwner.get(point.id);
    if (owner !== 'left' && owner !== 'right') continue;
    const local = toLogical(point);
    fingerOwner.set(point.id, local.x < DIR_MID_X ? 'left' : 'right');
  }
  rebuildInput();
}

function onTouchEnd(points: TouchPoint[]): void {
  for (const point of points) {
    fingerOwner.delete(point.id);
  }
  rebuildInput();
}

/* ------------------------------------------------------------ 菜单点击 */

function handleTap(x: number, y: number): void {
  if (scene === 'title') {
    const button = getTitleButton(view);
    if (hitTestMenu([button], x, y)) {
      platform.playSound(SFX.confirm, 0.7);
      goSelect();
    }
    return;
  }

  if (scene === 'select') {
    const cards = getHeroCards(view);
    for (const card of cards) {
      if (hitTestRect(card, x, y)) {
        heroKey = card.key;
        platform.playSound(SFX.select, 0.7);
        return;
      }
    }

    const diffButtons = getDifficultyButtons(view, difficulty);
    const diffHit = hitTestMenu(diffButtons, x, y);
    if (diffHit) {
      difficulty = diffHit.id as Difficulty;
      platform.playSound(SFX.click, 0.7);
      return;
    }

    const row = getOpponentRow(view);
    if (hitTestRect(row.reroll, x, y)) {
      const pool = HERO_ORDER.filter((key) => key !== heroKey && key !== opponentKey);
      opponentKey = pool[Math.floor(Math.random() * pool.length)] ?? (heroKey === 'niu' ? 'gu' : 'niu');
      platform.playSound(SFX.click, 0.7);
      return;
    }

    if (hitTestMenu([getFightButton(view)], x, y)) {
      platform.playSound(SFX.confirm, 0.8);
      startFight();
    }
    return;
  }

  if (scene === 'fight') {
    if (hitTestRect(getQuitButton(view), x, y)) {
      platform.playSound(SFX.click, 0.7);
      backToSelect();
    }
    return;
  }

  if (scene === 'result') {
    const canRevive = !reviveUsed && battle?.winner === 'p2';
    const buttons = getResultButtons(view, canRevive);
    const hit = hitTestMenu(buttons, x, y);
    if (!hit) return;
    handleResultButton(hit);
  }
}

function handleResultButton(button: MenuButton): void {
  if (button.id === 'revive') {
    void requestRevive();
  } else if (button.id === 'rematch') {
    platform.playSound(SFX.confirm, 0.8);
    startFight();
  } else if (button.id === 'reselect') {
    platform.playSound(SFX.click, 0.7);
    backToSelect();
  }
}

async function requestRevive(): Promise<void> {
  if (!battle || reviveUsed || battle.winner !== 'p2') return;
  // 立刻锁住按钮，防止玩家连点重复拉广告
  reviveUsed = true;

  const result = await showRewardedAd(platform);
  if (result === 'completed') {
    reviveFromResult(battle);
    lastHp = { p1: battle.p1.hp, p2: battle.p2.hp };
    brain = new AiBrain(difficulty as AiDifficulty);
    scene = 'fight';
    platform.playMusic(BGM.fight, 0.3);
    platform.vibrate('light');
  } else {
    reviveUsed = false;
    platform.playSound(SFX.error, 0.7);
  }
}

/* ------------------------------------------------------------ 战斗推进 */

function playHit(event: HitEvent): void {
  if (event.blocked) {
    platform.playSound(SFX.block, 0.6);
    return;
  }
  const hero = event.attacker === 'p1' ? heroKey : opponentKey;
  platform.playSound(hitSfxPath(event.kind, hero), event.kind === 'ultimate' ? 0.9 : 0.7);
  if (event.counter) platform.playSound(SFX.counter, 0.5);
  platform.vibrate(event.kind === 'light' ? 'light' : 'heavy');
}

let prevPhase: BattleState['phase'] = 'ready';

function updateFight(): void {
  if (!battle || !brain) return;

  const aiInput = brain.think(battle);
  const events = step(battle, input, aiInput);

  for (const event of events) playHit(event);
  spawnHitFx(battle);

  if (battle.p1.hp < lastHp.p1 || battle.p2.hp < lastHp.p2) {
    lastHp = { p1: battle.p1.hp, p2: battle.p2.hp };
  }

  // 回合结束的那一帧播 KO 音效：phase 刚刚从 fight 翻到 ko。
  if (battle.phase === 'ko' && prevPhase === 'fight') {
    platform.playSound(SFX.ko, 0.9);
    platform.vibrate('heavy');
  }
  prevPhase = battle.phase;

  if (battle.phase === 'result') {
    goResult();
  }
}

/* ------------------------------------------------------------------ 绘制 */

function drawFight(): void {
  if (!battle) return;
  drawStage(ctx, battle, view, art.heroes, time);
  drawHitFx(ctx, view, art.fx, battle.shake);
  drawHud(ctx, battle, view);
  drawPads(ctx, getPadButtons(battle.p1.energy, view), { held: heldKeys });

  const quit = getQuitButton(view);
  ctx.save();
  ctx.fillStyle = 'rgba(0,0,0,0.35)';
  ctx.strokeStyle = 'rgba(255,255,255,0.35)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(quit.x + quit.w / 2, quit.y + quit.h / 2, quit.h / 2 - 2, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 20px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('✕', quit.x + quit.w / 2, quit.y + quit.h / 2 + 1);
  ctx.restore();
}

function draw(): void {
  if (scene === 'loading') {
    drawLoading(ctx, view, time, art.progress);
    return;
  }
  if (scene === 'title') {
    drawTitle(ctx, view, art.heroes, time, getTitleButton(view));
    return;
  }
  if (scene === 'select') {
    drawSelect(ctx, view, art.heroes, time, {
      cards: getHeroCards(view),
      selected: heroKey,
      difficulty,
      difficultyButtons: getDifficultyButtons(view, difficulty),
      opponent: opponentKey,
      opponentRow: getOpponentRow(view),
      fightButton: getFightButton(view),
    });
    return;
  }
  if (scene === 'fight') {
    drawFight();
    return;
  }
  if (scene === 'result' && battle) {
    drawResult(ctx, view, time, {
      state: battle,
      playerWon: battle.winner === 'p1',
      buttons: getResultButtons(view, !reviveUsed && battle.winner === 'p2'),
      reviveUsed,
      art: art.heroes,
    });
  }
}

/* ------------------------------------------------------------ 主循环入口 */

platform.onTouchStart(onTouchStart);
platform.onTouchMove(onTouchMove);
platform.onTouchEnd(onTouchEnd);
platform.onResize(resize);

resize();
record = readRecord();

let booted = false;
let lastTime = 0;

function frame(now: number): void {
  if (lastTime === 0) lastTime = now;
  time = now;
  lastTime = now;

  if (!booted) {
    draw();
    if (art.progress >= 1) {
      booted = true;
      goTitle();
      preloadRewardedAd(platform);
    }
    platform.raf(frame);
    return;
  }

  if (scene === 'fight') updateFight();
  draw();
  platform.raf(frame);
}

platform.raf(frame);

// 提审截图桥：只在 ?shot=1 时安装，小游戏端没有 location 自然跳过。
if (typeof location !== 'undefined' && location.search.includes('shot=1')) {
  installShotBridge({
    scene: () => scene,
    progress: () => art.progress,
    state: () => battle,
    toTitle: () => goTitle(),
    toSelect: () => {
      heroKey = 'niu';
      opponentKey = 'gu';
      difficulty = 'normal';
      goSelect();
    },
    toFight: (hero, opponent) => {
      heroKey = hero;
      opponentKey = opponent;
      startFight();
    },
    toResult: (winner) => {
      if (!battle) return;
      battle.wins = winner === 'p1' ? { p1: 2, p2: 1 } : { p1: 1, p2: 2 };
      battle.winner = winner;
      battle.phase = 'result';
      goResult();
    },
    spawnFx: (kind, blocked) => {
      if (!battle) return;
      const mid = (battle.p1.x + battle.p2.x) / 2;
      spawnBurst(battle, mid, GROUND_Y - 130, kind, blocked ?? false);
    },
  });
}
