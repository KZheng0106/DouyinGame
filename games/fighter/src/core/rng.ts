/** 可复现的伪随机数发生器，AI 与画面抖动都用它，保证同种子下行为一致。 */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return function next() {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function clamp(value: number, min: number, max: number): number {
  return value < min ? min : value > max ? max : value;
}

export function approach(current: number, target: number, step: number): number {
  if (current < target) return Math.min(current + step, target);
  return Math.max(current - step, target);
}
