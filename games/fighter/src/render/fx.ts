/**
 * 命中特效。
 *
 * 素材包里的 10 张特效图此前只是被 loadAll 拉进内存，一帧都没画过，
 * 命中时只有闪白和震屏，视觉上分不出轻拳、重拳、大招。这里补上贴图粒子：
 * 命中点炸开放大淡出的图，加上四处飞散的星屑，让三种招式的力度能一眼读出。
 */
import type { AssetStore, FxKey } from '../assets/loader.ts';
import type { BattleState } from '../core/battle.ts';
import type { MoveKind } from '../core/moves.ts';
import type { View } from '../core/view.ts';
import { toScreenX, toScreenY } from '../core/view.ts';

/** 单条特效的存活帧数。 */
const LIFE = 22;

/**
 * 招式 → 表现参数。
 *
 * 素材包里的 slash / spark 系列不透明像素只有 5%~11%，单独放大依然「薄」，
 * 测出来的画面变化只有 5%，玩家看不出挨了拳头。所以主爆点改为代码绘制的
 * 实心星形 + 径向光晕，贴图只做外围星屑，力度靠 radius 和 tint 区分。
 */
const STYLE: Record<MoveKind, {
  key: FxKey;
  scale: number;
  color: string;
  tint: string;
  radius: number;
}> = {
  light: { key: 'slash2', scale: 0.9, color: '255,236,150', tint: '255,244,196', radius: 46 },
  heavy: { key: 'slash1', scale: 1.25, color: '255,150,90', tint: '255,186,120', radius: 64 },
  ultimate: { key: 'star', scale: 1.9, color: '255,110,220', tint: '255,158,236', radius: 96 },
};

const SHARD_KEYS: FxKey[] = ['spark1', 'spark2', 'light', 'magic1'];

interface Burst {
  /** 舞台坐标的命中点；绘制时再换算成屏幕坐标。 */
  x: number;
  stageY: number;
  kind: MoveKind;
  blocked: boolean;
  age: number;
  /** 飞散星屑的方向与速度，生成时算一次，避免每帧抖动。 */
  shards: Array<{ angle: number; speed: number; size: number; key: FxKey }>;
}

const bursts: Burst[] = [];

/** 在当前帧的命中事件上生成特效。 */
export function spawnHitFx(state: BattleState): void {
  for (const event of state.events) {
    spawnBurst(state, event.x, event.y, event.kind, event.blocked);
  }
}

/** 在指定舞台坐标生成一簇特效。截图脚本靠它摆拍。 */
export function spawnBurst(
  state: BattleState,
  x: number,
  stageY: number,
  kind: MoveKind,
  blocked = false,
): void {
  const count = blocked ? 2 : kind === 'ultimate' ? 6 : 4;
  const shards: Burst['shards'] = [];
  for (let i = 0; i < count; i += 1) {
    shards.push({
      angle: (Math.PI * 2 * i) / count + state.rng() * 0.7,
      speed: (blocked ? 1.2 : 2.4) + state.rng() * 2.6,
      size: (blocked ? 22 : 30) + state.rng() * 26,
      key: SHARD_KEYS[Math.floor(state.rng() * SHARD_KEYS.length)],
    });
  }
  bursts.push({ x, stageY, kind, blocked, age: 0, shards });
}

/** 场景切换时清空，避免上一局的残留特效出现在标题页。 */
export function clearHitFx(): void {
  bursts.length = 0;
}

export function drawHitFx(
  ctx: CanvasRenderingContext2D,
  view: View,
  art: AssetStore['fx'],
  shake: number,
): void {
  if (bursts.length === 0) return;

  ctx.save();
  // 跟着震屏一起抖，打击感才连得上
  if (shake > 0.2) {
    ctx.translate((Math.random() - 0.5) * shake, (Math.random() - 0.5) * shake * 0.6);
  }

  for (let i = bursts.length - 1; i >= 0; i -= 1) {
    const burst = bursts[i];
    burst.age += 1;
    if (burst.age > LIFE) {
      bursts.splice(i, 1);
      continue;
    }
    const t = burst.age / LIFE;
    const style = STYLE[burst.kind];
    const cx = toScreenX(view, burst.x);
    const cy = toScreenY(view, burst.stageY);

    // 主爆点：实心星形 + 径向光晕，前 8 帧冲到最大再收
    const grow = burst.age <= 8 ? burst.age / 8 : 1;
    const fade = burst.age <= 8 ? 1 : 1 - (burst.age - 8) / (LIFE - 8);
    const radius = style.radius * (0.5 + grow * 0.7) * (1 + (1 - fade) * 0.5);

    // 光晕垫在最底下，把命中点从背景里拎出来
    const glow = ctx.createRadialGradient(cx, cy, 0, cx, cy, radius * 2.2);
    glow.addColorStop(0, `rgba(${style.color},${0.55 * fade})`);
    glow.addColorStop(0.45, `rgba(${style.color},${0.22 * fade})`);
    glow.addColorStop(1, `rgba(${style.color},0)`);
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = 1;
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(cx, cy, radius * 2.2, 0, Math.PI * 2);
    ctx.fill();

    // 尖角星：八个角，随年龄轻微旋转，读起来像“炸开”
    const spin = burst.age * 0.06 + (burst.kind === 'ultimate' ? 0.4 : 0);
    ctx.fillStyle = `rgba(${style.tint},${0.9 * fade})`;
    ctx.beginPath();
    for (let k = 0; k < 16; k += 1) {
      const angle = spin + (Math.PI * 2 * k) / 16;
      const r = k % 2 === 0 ? radius : radius * 0.42;
      const px = cx + Math.cos(angle) * r;
      const py = cy + Math.sin(angle) * r * 0.9;
      if (k === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.closePath();
    ctx.fill();

    // 高光核心
    ctx.fillStyle = `rgba(255,255,255,${0.85 * fade})`;
    ctx.beginPath();
    ctx.arc(cx, cy, radius * 0.34 * (0.6 + grow * 0.6), 0, Math.PI * 2);
    ctx.fill();

    // 素材贴图叠在外围做装饰，缺图不影响上述主爆点
    const sprite = art[style.key];
    if (sprite) {
      const size = radius * 3.4 * style.scale;
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = Math.max(0, 0.75 * fade);
      try {
        ctx.drawImage(sprite.image, cx - size / 2, cy - size / 2, size, size);
      } catch {
        /* 贴图坏掉就只画代码图形 */
      }
    }

    // 星屑：沿固定方向抛射，带一点重力下坠
    ctx.globalCompositeOperation = 'lighter';
    for (const shard of burst.shards) {
      const fly = art[shard.key];
      if (!fly) continue;
      const dist = shard.speed * burst.age * (1.6 - t * 0.6);
      const px = cx + Math.cos(shard.angle) * dist;
      const py = cy + Math.sin(shard.angle) * dist + t * t * 26;
      const size = shard.size * (1 - t * 0.55);
      ctx.globalAlpha = Math.max(0, 0.9 - t);
      try {
        ctx.drawImage(fly.image, px - size / 2, py - size / 2, size, size);
      } catch {
        /* 忽略单张失败 */
      }
    }

    // 闪光环：只在前 8 帧，强调命中瞬间
    ctx.globalCompositeOperation = 'source-over';
    if (burst.age <= 8) {
      const r = radius * 0.8 + burst.age * 18;
      ctx.globalAlpha = 1;
      ctx.strokeStyle = `rgba(${style.color},${0.7 * (1 - burst.age / 8)})`;
      ctx.lineWidth = 6;
      ctx.beginPath();
      ctx.ellipse(cx, cy, r, r * 0.86, 0, 0, Math.PI * 2);
      ctx.stroke();
    }
  }

  ctx.restore();
}
