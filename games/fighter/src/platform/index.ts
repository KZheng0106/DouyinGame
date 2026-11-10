import { createTtAdapter } from './tt.ts';
import type { PlatformAdapter } from './types.ts';
import { createWebAdapter } from './web.ts';
import { createWxAdapter } from './wx.ts';

export function createPlatform(): PlatformAdapter {
  const g = globalThis as any;
  if (g.wx && typeof g.wx.createCanvas === 'function') return createWxAdapter();
  if (g.tt && typeof g.tt.createCanvas === 'function') return createTtAdapter();
  return createWebAdapter();
}
