/**
 * 提审截图专用的调试桥。
 *
 * 截图脚本需要在无人操作的 headless 浏览器里把画面「摆」到指定状态
 * （满能量、连击 5、残血、结算页……），靠手点无法复现。
 * 这段代码只在 URL 带 ?shot=1 时安装，小游戏端没有 location 不会加载到。
 */
import type { BattleState } from './core/battle.ts';
import { getHero } from './core/heroes.ts';
import type { HeroKey } from './core/heroes.ts';
import { getMove } from './core/moves.ts';
import type { MoveKind } from './core/moves.ts';

export type SceneName = 'loading' | 'title' | 'select' | 'fight' | 'result';

export interface ShotHooks {
  scene(): SceneName;
  toTitle(): void;
  toSelect(): void;
  toFight(hero: HeroKey, opponent: HeroKey): void;
  toResult(winner: 'p1' | 'p2'): void;
  state(): BattleState | null;
  progress(): number;
  /** 在两名角色之间摆一簇命中特效，用于截图取景。 */
  spawnFx(kind: MoveKind, blocked?: boolean): void;
}

export interface ShotBridge extends ShotHooks {
  set(patch: ShotPatch): void;
  forceMove(kind: MoveKind, elapsed: number): void;
}

export interface ShotPatch {
  hp1?: number;
  hp2?: number;
  energy1?: number;
  energy2?: number;
  combo1?: number;
  combo2?: number;
  timeLeft?: number;
  flash1?: number;
  blocking1?: boolean;
}

export function installShotBridge(hooks: ShotHooks): void {
  const bridge: ShotBridge = {
    ...hooks,
    set(patch: ShotPatch): void {
      const state = hooks.state();
      if (!state) return;
      if (patch.hp1 !== undefined) state.p1.hp = Math.round(state.p1.maxHp * patch.hp1);
      if (patch.hp2 !== undefined) state.p2.hp = Math.round(state.p2.maxHp * patch.hp2);
      if (patch.energy1 !== undefined) state.p1.energy = patch.energy1;
      if (patch.energy2 !== undefined) state.p2.energy = patch.energy2;
      if (patch.combo1 !== undefined) {
        state.p1.combo = patch.combo1;
        state.p1.comboTimer = patch.combo1 > 0 ? 30 : 0;
      }
      if (patch.combo2 !== undefined) {
        state.p2.combo = patch.combo2;
        state.p2.comboTimer = patch.combo2 > 0 ? 30 : 0;
      }
      if (patch.timeLeft !== undefined) state.timeLeft = patch.timeLeft;
      if (patch.flash1 !== undefined) state.p1.flash = patch.flash1;
      if (patch.blocking1 !== undefined) state.p1.blocking = patch.blocking1;
    },
    forceMove(kind: MoveKind, elapsed: number): void {
      const state = hooks.state();
      if (!state) return;
      const hero = getHero(state.p1.hero);
      state.p1.move = { kind, data: getMove(hero, kind), elapsed, hitCount: 0, hitCooldown: 0, interrupted: false };
      state.p1.pose = 'attack';
      state.p1.blocking = false;
    },
  };

  (globalThis as any).__fighterShot = bridge;
}
