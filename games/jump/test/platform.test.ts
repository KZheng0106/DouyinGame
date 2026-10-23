import assert from 'node:assert/strict';
import { test } from 'node:test';

import { createPlatform } from '../src/platform/index.ts';
import { createWxAdapter } from '../src/platform/wx.ts';

interface FakeAd {
  show(): Promise<void>;
  load(): Promise<void>;
  onClose(cb: (res: unknown) => void): void;
  onError(cb: (err: unknown) => void): void;
  offClose(cb: (res: unknown) => void): void;
  offError(cb: (err: unknown) => void): void;
}

function installWx(adFactory: () => Partial<FakeAd>): void {
  const ctx = {
    canvas: {},
    lineTo() {},
  };

  const wx = {
    createCanvas: () => ({ getContext: () => ctx }),
    getWindowInfo: () => ({ windowWidth: 375, windowHeight: 667, pixelRatio: 2 }),
    onTouchStart() {},
    onTouchEnd() {},
    onTouchCancel() {},
    onWindowResize() {},
    vibrateShort() {},
    getStorageSync: (key: string) => (key === 'best' ? '12' : ''),
    setStorageSync() {},
    createRewardedVideoAd: () => adFactory() as FakeAd,
  };

  (globalThis as any).wx = wx;
}

test('createPlatform 在存在 wx 时选用微信适配器', () => {
  installWx(() => ({}));
  try {
    assert.equal(createPlatform().name, 'wx');
  } finally {
    delete (globalThis as any).wx;
  }
});

test('微信适配器读取存储与视口', () => {
  installWx(() => ({}));
  try {
    const adapter = createWxAdapter();
    assert.equal(adapter.getItem('best'), '12');
    assert.equal(adapter.getItem('missing'), null);
    assert.deepEqual(adapter.viewport(), { width: 375, height: 667, dpr: 2 });
  } finally {
    delete (globalThis as any).wx;
  }
});

test('激励视频完整观看返回 completed', async () => {
  installWx(() => {
    let close: ((res: unknown) => void) | null = null;
    return {
      onClose(cb) {
        close = cb;
      },
      onError() {},
      offClose() {},
      offError() {},
      show: async () => close?.({ isEnded: true }),
      load: async () => {},
    };
  });
  try {
    assert.equal(await createWxAdapter().showRewardedAd('adunit-1'), 'completed');
  } finally {
    delete (globalThis as any).wx;
  }
});

test('激励视频中途关闭返回 skipped，不发奖励', async () => {
  installWx(() => {
    let close: ((res: unknown) => void) | null = null;
    return {
      onClose(cb) {
        close = cb;
      },
      onError() {},
      offClose() {},
      offError() {},
      show: async () => close?.({ isEnded: false }),
      load: async () => {},
    };
  });
  try {
    assert.equal(await createWxAdapter().showRewardedAd('adunit-1'), 'skipped');
  } finally {
    delete (globalThis as any).wx;
  }
});

test('广告拉取失败时先 load 再 show，仍失败则返回 failed', async () => {
  const order: string[] = [];
  installWx(() => ({
    onClose() {},
    onError() {},
    offClose() {},
    offError() {},
    show: async () => {
      order.push('show');
      throw new Error('not ready');
    },
    load: async () => {
      order.push('load');
      throw new Error('no fill');
    },
  }));
  try {
    assert.equal(await createWxAdapter().showRewardedAd('adunit-1'), 'failed');
    assert.deepEqual(order, ['show', 'load']);
  } finally {
    delete (globalThis as any).wx;
  }
});

test('缺少 createRewardedVideoAd 时返回 failed', async () => {
  installWx(() => ({}));
  try {
    delete (globalThis as any).wx.createRewardedVideoAd;
    assert.equal(await createWxAdapter().showRewardedAd('adunit-1'), 'failed');
  } finally {
    delete (globalThis as any).wx;
  }
});
