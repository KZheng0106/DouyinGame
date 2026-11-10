/**
 * 生成提审用截图。
 *
 * 平台后台的硬性要求（微信 / 抖音一致）：
 *   1. JPG/JPEG/PNG，体积 60KB ~ 5MB（低于 60KB 直接传不上去）；
 *   2. 画面内必须能看到小游戏名称，且与后台填写的名称一字不差；
 *   3. 不同模块要提交不一样的截图，同一画面不能重复使用。
 *
 * 所以这里按提审表单位逐张取景，出图后用灰度分区比较，
 * 保证 7 张图两两都有明显差异。用 headless Chrome + CDP 驱动真实游戏，
 * 3 倍像素密度出图，不引入 Playwright 依赖。
 *
 * 用法：先 npm run build，再在 games/fighter 目录执行 npm run shots
 * （或先 npm run dev 起 5174 端口，本脚本连的就是它）
 */
import { spawn } from 'node:child_process';
import { accessSync, mkdirSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const OUT_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'assets', 'screenshots');
const PORT = Number(process.env.SHOT_PORT ?? 9334);
const DEV_PORT = Number(process.env.PORT ?? 5174);
// 横屏 16:9，逻辑视图正好 STAGE_W x STAGE_H；2 倍密度出 1920x1080 的图。
const WIDTH = 960;
const HEIGHT = 540;
const SCALE = 2;

const MIN_BYTES = 60 * 1024;
const MAX_BYTES = 5 * 1024 * 1024;

/**
 * 判定「两张图是否看起来一样」用两个互补的检查：
 *
 *  1. 结构检查：每张图登记自己的界面与英雄对，八张必须互不相同。
 *     —— 同一对英雄的同一界面，怎么调血条都是「重复截图」，这是最硬的判据。
 *  2. 像素检查：整幅灰度差 ≥ MIN_GLOBAL_DIFF，且左/中/右三段里变化最大的一段
 *     ≥ MIN_REGION_CHANGE（只取最大段，不要求三段全变）。
 *
 * 阈值是按实测标定的，不要随手调大：
 *   - 固定镜头格斗游戏的左右两侧永远是同一片街景，换英雄也只让中段变化，
 *     所以「三段都变」这个要求在这类画面里根本达不到；
 *   - 真正的区分力在「整幅」：同英雄对只改血条/连击数字时整幅差实测 ≈ 4，
 *     而不同界面/不同英雄对实测都在 9 以上 → 阈值 8 正好卡在中间；
 *   - 「最大段」是兜底：最相似的合法组合（胜负两张结算页）实测 14.9%，取 12 留余量。
 */
const MIN_REGION_CHANGE = 12;
const MIN_GLOBAL_DIFF = 8;

function findChrome() {
  const candidates = [
    process.env.CHROME_PATH,
    join(homedir(), '.cache/ms-playwright/chromium-1248/chrome-linux64/chrome'),
    '/usr/bin/google-chrome',
    '/usr/bin/chromium',
  ].filter(Boolean);

  for (const path of candidates) {
    try {
      accessSync(path);
      return path;
    } catch {
      /* 继续找下一个 */
    }
  }
  throw new Error('找不到 Chrome，请用 CHROME_PATH 环境变量指定');
}

class Cdp {
  #socket;
  #nextId = 1;
  #pending = new Map();

  static async connect(url) {
    const client = new Cdp();
    client.#socket = new WebSocket(url);
    await new Promise((resolve, reject) => {
      client.#socket.addEventListener('open', resolve, { once: true });
      client.#socket.addEventListener('error', reject, { once: true });
    });
    client.#socket.addEventListener('message', (event) => {
      const message = JSON.parse(event.data);
      if (message.id && client.#pending.has(message.id)) {
        const { resolve, reject } = client.#pending.get(message.id);
        client.#pending.delete(message.id);
        if (message.error) reject(new Error(message.error.message));
        else resolve(message.result);
      }
    });
    return client;
  }

  send(method, params = {}) {
    const id = this.#nextId++;
    return new Promise((resolve, reject) => {
      this.#pending.set(id, { resolve, reject });
      this.#socket.send(JSON.stringify({ id, method, params }));
    });
  }

  close() {
    this.#socket.close();
  }
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function waitForEndpoint(url, attempts = 60) {
  for (let i = 0; i < attempts; i += 1) {
    try {
      const res = await fetch(url);
      if (res.ok) return await res.json();
    } catch {
      /* 端口还没起来 */
    }
    await sleep(200);
  }
  throw new Error(`等待 ${url} 超时`);
}

async function main() {
  mkdirSync(OUT_DIR, { recursive: true });

  const chrome = spawn(
    findChrome(),
    [
      '--headless=new',
      '--no-sandbox',
      '--disable-gpu',
      '--hide-scrollbars',
      `--remote-debugging-port=${PORT}`,
      '--user-data-dir=/tmp/chrome-fighter-shots',
      'about:blank',
    ],
    { stdio: 'ignore' },
  );

  let client;
  try {
    await waitForEndpoint(`http://127.0.0.1:${PORT}/json/version`);
    const targets = await waitForEndpoint(`http://127.0.0.1:${PORT}/json/list`);
    const page = targets.find((t) => t.type === 'page');
    client = await Cdp.connect(page.webSocketDebuggerUrl);

    await client.send('Page.enable');
    await client.send('Runtime.enable');
    await client.send('Emulation.setDeviceMetricsOverride', {
      width: WIDTH,
      height: HEIGHT,
      deviceScaleFactor: SCALE,
      mobile: true,
    });

    const shots = {};
    const hashes = {};

    const evaluate = async (expression) => {
      const { result } = await client.send('Runtime.evaluate', {
        expression,
        returnByValue: true,
        awaitPromise: true,
      });
      return result.value;
    };

    /** 画面指纹：降采样成 480×270 灰度图，用于分段比较。 */
    const visualSignature = () =>
      evaluate(`(() => {
        const c = document.querySelector('canvas');
        const ctx = c.getContext('2d', { willReadFrequently: true });
        const src = ctx.getImageData(0, 0, c.width, c.height).data;
        const TW = 480;
        const TH = 270;
        const bw = c.width / TW;
        const bh = c.height / TH;
        const out = [];
        for (let gy = 0; gy < TH; gy += 1) {
          const y0 = Math.floor(gy * bh);
          const y1 = Math.max(y0 + 1, Math.floor((gy + 1) * bh));
          for (let gx = 0; gx < TW; gx += 1) {
            const x0 = Math.floor(gx * bw);
            const x1 = Math.max(x0 + 1, Math.floor((gx + 1) * bw));
            let sum = 0;
            let n = 0;
            for (let y = y0; y < y1; y += 1) {
              for (let x = x0; x < x1; x += 1) {
                const i = (y * c.width + x) * 4;
                sum += src[i] * 0.299 + src[i + 1] * 0.587 + src[i + 2] * 0.114;
                n += 1;
              }
            }
            out.push(Math.round(sum / n));
          }
        }
        return { w: TW, h: TH, gray: out };
      })()`);

    /** meta.scene / meta.matchup 用于结构去重：八张图不能有相同的「界面 + 英雄对」。 */
    const metas = {};

    const capture = async (name, meta) => {
      const key = `${meta.scene}|${meta.matchup ?? '-'}`;
      const dup = Object.entries(metas).find(([, m]) => `${m.scene}|${m.matchup ?? '-'}` === key);
      if (dup) {
        throw new Error(
          `${name} 与 ${dup[0]} 是同一个界面 + 同一对英雄（${key}），属于重复截图，换一对英雄或换界面`,
        );
      }
      metas[name] = { ...meta };
      const { data } = await client.send('Page.captureScreenshot', { format: 'png' });
      const buffer = Buffer.from(data, 'base64');
      if (buffer.length < MIN_BYTES || buffer.length > MAX_BYTES) {
        throw new Error(`${name} 体积 ${(buffer.length / 1024).toFixed(1)}KB 不在 60KB~5MB 之间`);
      }
      shots[name] = buffer.length;
      hashes[name] = await visualSignature();
      writeFileSync(join(OUT_DIR, `${name}.png`), buffer);
      process.stdout.write(`  ${name}.png  ${(buffer.length / 1024).toFixed(1)} KB\n`);
    };

    const bridge = (body) => evaluate(`(() => { const b = window.__fighterShot; ${body} })()`);
    const getState = () => evaluate('JSON.parse(JSON.stringify(window.__fighterShot.state()))');

    const waitFor = async (predicate, label, timeout = 10000) => {
      const deadline = Date.now() + timeout;
      while (Date.now() < deadline) {
        if (await predicate()) return;
        await sleep(25);
      }
      throw new Error(`等待「${label}」超时`);
    };

    await client.send('Page.navigate', { url: `http://localhost:${DEV_PORT}/?shot=1` });
    await sleep(1500);
    await waitFor(() => evaluate('typeof window.__fighterShot === "object"'), '游戏调试入口');
    await waitFor(async () => (await evaluate('window.__fighterShot.progress()')) >= 1, '资源加载', 20000);
    await sleep(400);

    // ── 相关截图①：标题页，画面正中就是小游戏名称 ────────────────────
    await bridge('b.toTitle(); return true;');
    await sleep(500);
    await capture('relevant-1-title', { scene: 'title' });

    // ── 相关截图②：选人页，三位英雄并列 ─────────────────────────────
    await bridge('b.toSelect(); return true;');
    await sleep(500);
    await capture('relevant-2-select', { scene: 'select' });

    // 四张战斗场景图必须用四对不同的英雄，否则左右两侧的画面完全一致，
    // 只靠中间特效的差别撑不起来，后台会判「重复提交相同截图」。
    // 三英雄共 6 种有序对，下面 4 场互不重复。

    // ── 系统1：对战开场 READY，双方满血满状态（牛来 vs 奶娃）─────────
    await bridge("b.toFight('niu','gu'); return true;");
    await sleep(350);
    await capture('system-1-start', { scene: 'fight-ready', matchup: 'niu-gu' });

    // ── 系统2：中局，血条不满 + 能量满 + 连击数在屏幕上方（咕咕嘎嘎 vs 牛来）──
    await bridge("b.toFight('nai','niu'); return true;");
    await sleep(350);
    await bridge('b.set({ hp1: 0.62, hp2: 0.45, energy1: 100, energy2: 44, combo1: 3, timeLeft: 2280 }); return true;');
    await bridge('b.forceMove("heavy", 17); return true;');
    await bridge('b.spawnFx("heavy"); return true;');
    await sleep(140);
    await capture('system-2-combo', { scene: 'fight-combo', matchup: 'nai-niu' });

    // ── 相关截图③：大招释放瞬间，奶娃「魔性笑声」六段（奶娃 vs 咕咕嘎嘎）──
    await bridge("b.toFight('gu','nai'); return true;");
    await sleep(350);
    await bridge('b.set({ hp1: 0.83, hp2: 0.22, energy1: 100, energy2: 18, combo1: 6, timeLeft: 3450 }); return true;');
    await bridge('b.forceMove("ultimate", 30); return true;');
    await bridge('b.spawnFx("ultimate"); return true;');
    await sleep(150);
    await capture('relevant-3-ultimate', { scene: 'fight-ultimate', matchup: 'gu-nai' });

    // ── 系统3：回合切换，顶部胜点圆点亮起（牛来 vs 咕咕嘎嘎）──────────
    await bridge("b.toFight('niu','nai'); return true;");
    await sleep(350);
    await bridge('b.set({ hp1: 0.4, hp2: 0.72, energy2: 100, combo2: 4, timeLeft: 900 }); return true;');
    await bridge('b.forceMove("heavy", 12); return true;');
    await bridge('b.spawnFx("light", true); return true;');
    await sleep(140);
    await capture('system-3-vs', { scene: 'fight-round', matchup: 'niu-nai' });

    // ── 相关截图④：结算页（失败态，带看视频续关按钮）咕咕嘎嘎 vs 牛来 ──
    // 失败页立绘是「赢家」的 idle 姿势，所以这里让牛来赢，
    // 与相关截图⑤的奶娃胜利姿势形成不同角色，避免两张结算页看起来一样。
    await bridge("b.toFight('nai','niu'); return true;");
    await sleep(300);
    await bridge("b.toResult('p2'); return true;");
    await sleep(600);
    await capture('relevant-4-result', { scene: 'result-lose', matchup: 'nai-niu' });

    // ── 相关截图⑤：结算页胜利态，奶娃 vs 牛来 ─────────────────────
    await bridge("b.toFight('gu','niu'); return true;");
    await sleep(300);
    await bridge("b.toResult('p1'); return true;");
    await sleep(600);
    await capture('relevant-5-victory', { scene: 'result-win', matchup: 'gu-niu' });

    // 逐对比较，确保没有两张图看起来一样
    const { w: TW, h: TH } = hashes[Object.keys(hashes)[0]];
    const bands = [
      { label: '左', from: 0, to: Math.round(TW * 0.34) },
      { label: '中', from: Math.round(TW * 0.34), to: Math.round(TW * 0.66) },
      { label: '右', from: Math.round(TW * 0.66), to: TW },
    ];

    const compare = (a, b) => {
      const ranks = bands.map((band) => {
        let changed = 0;
        let total = 0;
        for (let y = 0; y < TH; y += 1) {
          for (let x = band.from; x < band.to; x += 1) {
            const i = y * TW + x;
            if (Math.abs(a.gray[i] - b.gray[i]) > 12) changed += 1;
            total += 1;
          }
        }
        return (changed / total) * 100;
      });
      let sum = 0;
      for (let i = 0; i < a.gray.length; i += 1) sum += Math.abs(a.gray[i] - b.gray[i]);
      const global = sum / a.gray.length;
      return { ranks, worst: Math.max(...ranks), global };
    };

    const names = Object.keys(shots);
    const rows = [];
    for (let i = 0; i < names.length; i += 1) {
      for (let j = i + 1; j < names.length; j += 1) {
        const { ranks, worst, global } = compare(hashes[names[i]], hashes[names[j]]);
        rows.push({ label: `${names[i]} | ${names[j]}`, ranks, worst, global });
      }
    }
    rows.sort((x, y) => x.worst - y.worst || x.global - y.global);

    console.log('\n画面差异（左/中/右三段的变化像素比例 + 整幅灰度差）：');
    for (const row of rows.slice(0, 8)) {
      const cells = row.ranks.map((v) => `${v.toFixed(1).padStart(5)}%`).join('  ');
      console.log(`  ${cells}  整幅 ${row.global.toFixed(1).padStart(5)}  ${row.label}`);
    }

    const offenders = rows.filter(
      (row) => row.worst < MIN_REGION_CHANGE || row.global < MIN_GLOBAL_DIFF,
    );
    if (offenders.length > 0) {
      const detail = offenders
        .map(
          (row) =>
            `  ${row.label}\n    最大段 ${row.worst.toFixed(1)}%（需 ≥ ${MIN_REGION_CHANGE}%），` +
            `整幅 ${row.global.toFixed(1)}（需 ≥ ${MIN_GLOBAL_DIFF}）`,
        )
        .join('\n');
      throw new Error(
        `以下截图过于相似，会被判「重复提交相同截图」：\n${detail}\n` +
          '  处理方式：换一对英雄（toFight 的双方），或换到另一个界面状态，不要只改血条数字。',
      );
    }

    console.log('\n完成，素材目录：', OUT_DIR);
  } finally {
    client?.close();
    chrome.kill('SIGKILL');
  }
}

main().catch((error) => {
  console.error('截图失败：', error.message);
  process.exitCode = 1;
});
