/**
 * 生成微信提审用截图。
 *
 * 微信后台的三条硬性要求：
 *   1. JPG/JPEG/PNG，体积 60KB ~ 5MB（低于 60KB 直接传不上去）；
 *   2. 画面内必须能看到小游戏名称，且与后台填写的名称一字不差；
 *   3. 「请勿重复提交相同截图，不同模块需提交不一样的截图」——同一个画面不能
 *      同时用于「相关截图」和「系统1/2/3截图」，系统1/2/3 之间也不能重复。
 *
 * 所以这里按提审表单位分别取景，出图后用 16×16 均值哈希逐对比较，
 * 保证 7 张图两两都有明显差异。直接用 headless Chrome + CDP 驱动真实游戏，
 * 按 3 倍像素密度出图（裸 414×800 只有 20~40KB，过不了体积门槛），
 * 不在项目里引入 Playwright 依赖。
 *
 * 用法：先 npm run build（或 npm run dev），再在仓库根目录执行
 * npm run shots -w games/jump
 *
 * 产物与后台表单位的对应关系见 docs/WECHAT.md 第四节。
 */
import { spawn } from 'node:child_process';
import { accessSync, mkdirSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const OUT_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'assets', 'screenshots');
const PORT = 9333;
const WIDTH = 414;
const HEIGHT = 800;
const SCALE = 3;

/** 微信后台对截图的要求，出图后自检。 */
const MIN_BYTES = 60 * 1024;
const MAX_BYTES = 5 * 1024 * 1024;

/**
 * 两张截图的最低差异门槛：上/中/下三段中，至少有一段的变化像素比例达到该值。
 * 游戏画面大半是静态夜空，用全图比例会被稀释；分段统计才能反映「一眼看出不同」。
 */
const MIN_REGION_CHANGE = 12;

// 与 src/core/constants.ts 保持一致，用于反算「正好落在平台正中」所需的蓄力
const MIN_JUMP_DIST = 45;
const MAX_JUMP_DIST = 285;
const JUMP_DURATION_MIN = 0.32;
const JUMP_DURATION_MAX = 0.6;

const clamp = (value, lo, hi) => Math.min(hi, Math.max(lo, value));

function findChrome() {
  const candidates = [
    process.env.CHROME_PATH,
    join(homedir(), '.cache/ms-playwright/chromium-1248/chrome-linux64/chrome'),
    '/usr/bin/google-chrome',
    '/usr/bin/chromium',
  ].filter(Boolean);

  for (const path of candidates) {
    try {
      // 只要文件存在即可，实际能否启动由下面的 spawn 决定
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
      '--user-data-dir=/tmp/chrome-shots',
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

    /**
     * 画面指纹：把整张画面降采样成 207×400 灰度图。
     * 后台判的是「看起来是不是同一张」，所以要按区域统计变化比例，
     * 不能被大面积不变的夜空背景稀释。
     */
    const visualSignature = () =>
      evaluate(`(() => {
        const c = document.querySelector('canvas');
        const ctx = c.getContext('2d', { willReadFrequently: true });
        const src = ctx.getImageData(0, 0, c.width, c.height).data;
        const TW = 207;
        const TH = 400;
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

    const capture = async (name) => {
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

    // 页面在 ?shot=1 时会挂出 __jumpShot，用它精确控制蓄力值，画面才可复现
    const bridge = (body) => evaluate(`(() => { const b = window.__jumpShot; ${body} })()`);
    const getState = () => evaluate('JSON.parse(JSON.stringify(window.__jumpShot.state()))');

    const waitFor = async (predicate, label, timeout = 10000) => {
      const deadline = Date.now() + timeout;
      while (Date.now() < deadline) {
        if (await predicate()) return;
        await sleep(25);
      }
      throw new Error(`等待「${label}」超时`);
    };

    /** 反算落到下一块平台正中所需的蓄力，误差为 0，必定判定「完美 +2」。 */
    const powerForNextCenter = async () => {
      const state = await getState();
      const next = state.platforms[state.current + 1];
      if (!next) throw new Error('平台链异常：找不到下一块平台');
      const center = next.x + next.w / 2;
      return clamp((center - state.playerX - MIN_JUMP_DIST) / (MAX_JUMP_DIST - MIN_JUMP_DIST), 0, 1);
    };

    const jump = (power) =>
      bridge(`b.charge(); b.setPower(${clamp(power, 0, 1)}); b.release(); return true;`);

    const jumpPerfect = async () => jump(await powerForNextCenter());

    /** 等待跳跃动作结束（落地成 idle 或落空成 falling）。 */
    const waitLanded = () =>
      waitFor(async () => (await getState()).phase !== 'jumping', '落地');

    const waitIdle = () =>
      waitFor(async () => (await getState()).phase === 'idle', '回到可操作状态');

    // ── 取景流程：每个表单位一段，互不复用画面 ────────────────────────────

    await client.send('Page.navigate', { url: 'http://localhost:5173/?shot=1' });
    await sleep(1200);
    await waitFor(() => evaluate('typeof window.__jumpShot === "object"'), '游戏调试入口');
    await sleep(300);

    // 相关截图①：开始页，标题就是小游戏名称
    await capture('relevant-1-start');

    await bridge('b.start(); return true;');
    await sleep(200);

    // 相关截图②：开局第一次蓄力，电量条接近满格（绿→黄→粉），分数 0
    await bridge('b.charge(); return true;');
    await sleep(880);
    await capture('relevant-2-charging');
    // 收尾时把力度改成正好落中，避免这一跳真的摔掉
    await bridge(`b.setPower(${await powerForNextCenter()}); b.release(); return true;`);
    await waitIdle();

    /** 连续完美落地 n 次，把分数与连击推上去。 */
    const perfectRun = async (n) => {
      for (let i = 0; i < n; i += 1) {
        await jumpPerfect();
        await waitLanded();
        const phase = (await getState()).phase;
        if (phase !== 'idle') throw new Error(`完美落地失败，phase=${phase}`);
      }
    };

    const chargeShot = async (name, ms) => {
      await bridge('b.charge(); return true;');
      await sleep(ms);
      await capture(name);
      await bridge(`b.setPower(${await powerForNextCenter()}); b.release(); return true;`);
      await waitIdle();
    };

    const jumpShot = async (name, power) => {
      await jump(power);
      const duration = JUMP_DURATION_MIN + power * (JUMP_DURATION_MAX - JUMP_DURATION_MIN);
      await sleep(Math.round(duration * 480));
      await capture(name);
      await waitIdle();
    };

    // 系统1截图（蓄力跳跃系统）：分数很小、平台还宽，蓄力只走三分之一，电量条是绿色
    await chargeShot('system-1-charge', 330); // 分数 4

    await perfectRun(10); // 分数 24，连击 x11，平台已收窄

    // 系统2截图（计分与连击系统）：落地瞬间「完美 +2」+ 右上角「连击 x11」同屏
    await capture('system-2-score');

    await perfectRun(7); // 分数 38

    // 相关截图③：跳跃途中，角色悬在空中、底部电量条完全不显示
    await jumpShot('relevant-3-jumping', await powerForNextCenter()); // 分数 40

    await perfectRun(4); // 分数 48

    // 相关截图④：高分局蓄力中，平台最窄最密，电量条过半呈橙粉色
    await chargeShot('relevant-4-hiscore', 500);

    // 系统3截图（激励视频复活系统）：故意蓄力不足落进缝隙，进入结束页
    await jump(0.02);
    await waitFor(async () => (await getState()).phase === 'dead', '结束页');
    await sleep(400);
    await capture('system-3-revive');

    // 逐对比较，确保没有两张图看起来一样（后台会拒收重复截图）
    const { w: TW, h: TH } = hashes[Object.keys(hashes)[0]];
    // 按上（分数/最高分/连击）、中（平台与角色）、下（电量条与按钮）三段分别统计
    const bands = [
      { label: '上', from: 0, to: Math.round(TH * 0.2) },
      { label: '中', from: Math.round(TH * 0.2), to: Math.round(TH * 0.72) },
      { label: '下', from: Math.round(TH * 0.72), to: TH },
    ];

    /** 返回三段各自「明显变化的像素占比」（灰度差 > 12 记一次）。 */
    const compare = (a, b) => {
      const ranks = bands.map((band) => {
        let changed = 0;
        let total = 0;
        for (let y = band.from; y < band.to; y += 1) {
          for (let x = 0; x < TW; x += 1) {
            const i = y * TW + x;
            if (Math.abs(a.gray[i] - b.gray[i]) > 12) changed += 1;
            total += 1;
          }
        }
        return (changed / total) * 100;
      });
      return { ranks, worst: Math.max(...ranks) };
    };

    const names = Object.keys(shots);
    const rows = [];
    for (let i = 0; i < names.length; i += 1) {
      for (let j = i + 1; j < names.length; j += 1) {
        const { ranks, worst } = compare(hashes[names[i]], hashes[names[j]]);
        rows.push({ label: `${names[i]} | ${names[j]}`, ranks, worst });
      }
    }
    rows.sort((x, y) => x.worst - y.worst);

    console.log('\n画面差异（上/中/下三段的变化像素比例，取最大段判定）：');
    for (const row of rows.slice(0, 8)) {
      const cells = row.ranks.map((v) => `${v.toFixed(1).padStart(5)}%`).join('  ');
      console.log(`  ${cells}  ${row.label}`);
    }

    const closest = rows[0];
    if (closest.worst < MIN_REGION_CHANGE) {
      throw new Error(
        `截图过于相似：${closest.label}，最大段变化仅 ${closest.worst.toFixed(1)}%，` +
          `需 ≥ ${MIN_REGION_CHANGE}%`,
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
