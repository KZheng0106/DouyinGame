import { createTtAdapter } from './tt.ts';
import type { PlatformAdapter } from './types.ts';
import { createWebAdapter } from './web.ts';

export function createPlatform(): PlatformAdapter {
  const tt: any = (globalThis as any).tt;
  if (tt && typeof tt.createCanvas === 'function') return createTtAdapter();
  return createWebAdapter();
}
