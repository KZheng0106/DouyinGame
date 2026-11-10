import { BODY_HALF_W, MAX_ENERGY, STAGE_W } from './constants.ts';
import { getHero } from './heroes.ts';
import type { BattleState, Fighter, Input } from './battle.ts';
import { EMPTY_INPUT } from './battle.ts';
import { getMove } from './moves.ts';
import { clamp } from './rng.ts';

export type Difficulty = 'easy' | 'normal' | 'hard';

interface LevelConfig {
  /** 反应延迟帧数。越大越迟钝。 */
  reaction: number;
  /** 每帧出招概率基数。 */
  aggression: number;
  /** 血量低时更爱防御的概率。 */
  blockBias: number;
  /** 大招能量满后立即放的概率。 */
  ultimateEagerness: number;
  /** 走位时想保持的距离，单位是「轻拳射程的倍数」，必须小于 0.8 才够得着。 */
  preferredGap: number;
}

const LEVELS: Record<Difficulty, LevelConfig> = {
  easy: { reaction: 14, aggression: 0.012, blockBias: 0.25, ultimateEagerness: 0.2, preferredGap: 0.78 },
  normal: { reaction: 8, aggression: 0.03, blockBias: 0.45, ultimateEagerness: 0.55, preferredGap: 0.66 },
  hard: { reaction: 4, aggression: 0.055, blockBias: 0.6, ultimateEagerness: 0.85, preferredGap: 0.55 },
};

/** 环形缓冲：把「现在的战况」延后 reaction 帧才交给 AI，制造拟人迟钝。 */
export class AiBrain {
  private readonly cfg: LevelConfig;
  private readonly buffer: Input[] = [];
  private readonly size: number;
  private holdFrames = 0;
  private heldMove: -1 | 0 | 1 = 0;

  constructor(difficulty: Difficulty) {
    this.cfg = LEVELS[difficulty];
    this.size = this.cfg.reaction;
    for (let i = 0; i < this.size; i += 1) this.buffer.push({ ...EMPTY_INPUT });
  }

  /** 每帧调用，返回 AI 这一帧的输入。 */
  think(state: BattleState): Input {
    const me = state.p2;
    const foe = state.p1;

    // 记录对手当前动作，延迟 reaction 帧后被 AI 感知
    const sensed: Input = {
      move: foe.move ? 0 : foe.x > me.x ? 1 : foe.x < me.x ? -1 : 0,
      light: foe.move?.kind === 'light',
      heavy: foe.move?.kind === 'heavy',
      ultimate: foe.move?.kind === 'ultimate',
      block: foe.blocking,
    };
    this.buffer.push(sensed);
    if (this.buffer.length > this.size) this.buffer.shift();
    const perception = this.buffer[0];

    const out: Input = { ...EMPTY_INPUT };

    if (me.hp <= 0 || foe.hp <= 0) return out;
    if (state.phase !== 'fight') return out;

    const gap = Math.abs(foe.x - me.x);
    const reachGap = BODY_HALF_W * 2;
    const myHero = getHero(me.hero);

    // 1) 血少了、对手在贴脸出招 —— 防御
    const inDanger = perception.light || perception.heavy || perception.ultimate;
    const lowHp = me.hp / me.maxHp < 0.35;
    if (inDanger && gap < 260 && state.rng() < this.cfg.blockBias * (lowHp ? 1.6 : 1)) {
      out.block = true;
      return out;
    }

    // 2) 能量满就找机会放大招
    if (me.energy >= MAX_ENERGY && gap < 300 && state.rng() < this.cfg.ultimateEagerness) {
      out.ultimate = true;
      return out;
    }

    // 3) 进入射程内就出拳。射程判定必须先于走位，否则 AI 会一边走一边错过出手窗口。
    const lightReach = getMove(myHero, 'light').reach + reachGap;
    const heavyReach = getMove(myHero, 'heavy').reach + reachGap;

    if (gap < lightReach * 0.92) {
      if (state.rng() < this.cfg.aggression * 3) {
        out.heavy = true;
        return out;
      }
      if (state.rng() < this.cfg.aggression * 8) {
        out.light = true;
        return out;
      }
    } else if (gap < heavyReach * 0.95) {
      if (state.rng() < this.cfg.aggression * 4) {
        out.heavy = true;
        return out;
      }
    }

    // 4) 走路靠近/拉开，用 hold 减少抖动
    if (this.holdFrames > 0) {
      this.holdFrames -= 1;
      out.move = this.heldMove;
      return out;
    }

    // wantGap 落在轻拳射程之内，保证「走位停下来的地方」和「够得着的地方」重合。
    const wantGap = lightReach * this.cfg.preferredGap;
    let dir: -1 | 0 | 1 = 0;
    if (gap > wantGap * 1.15) dir = foe.x > me.x ? 1 : -1;
    else if (gap < wantGap * 0.55) dir = foe.x > me.x ? -1 : 1;

    // 别把自己挤到墙角。这里只停步、不反向，否则会被墙角卡成来回跑。
    const nextX = me.x + dir * myHero.speed;
    if (nextX < WALL_SAFE_LEFT || nextX > WALL_SAFE_RIGHT) dir = 0;

    this.heldMove = dir;
    this.holdFrames = 6 + Math.floor(state.rng() * 8);
    out.move = clamp(dir, -1, 1) as -1 | 0 | 1;
    return out;
  }
}

/** 贴墙会让 AI 卡死在角落，留出一段安全走廊。按舞台宽算，换分辨率不用改。 */
const WALL_SAFE_LEFT = STAGE_W * 0.125;
const WALL_SAFE_RIGHT = STAGE_W * 0.875;

/** 无状态简易 AI，测试里用。 */
export function simpleAiInput(state: BattleState, fighter: Fighter): Input {
  const foe = fighter === state.p1 ? state.p2 : state.p1;
  const out: Input = { ...EMPTY_INPUT };
  const gap = Math.abs(foe.x - fighter.x);
  if (gap > 150) out.move = foe.x > fighter.x ? 1 : -1;
  else out.light = true;
  return out;
}
