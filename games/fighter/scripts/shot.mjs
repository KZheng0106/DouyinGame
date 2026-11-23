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
 *   - 「整幅」是兜底判据：同一对英雄只改血条/连击数字时实测 ≈ 4，
 *     而不同英雄对/不同界面实测最低 5.2 → 阈值取 5，卡在两种情形之间；
 *   - 「最大段」取 12：最相似的合法组合实测 14% 以上，留 ~2 个点余量。
 *
 * 阈值只是兜底。真正的硬判据是上面的「结构去重」：
 * 同一界面 + 同一对英雄，无论数字怎么改都不允许出现两张。
 * 九张图分属三个上传位，英雄对已排到「同一张图里左右双方都尽量不重复」。
 */
const MIN_REGION_CHANGE = 12;
const MIN_GLOBAL_DIFF = 5;

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

    /**
     * meta 用于结构去重：12 张图的「界面 + 英雄对 + 摆拍状态」必须互不相同。
     * state 是显式声明的差异点（ready / ultimate / blocking / ko …），
     * 也就是「这张图靠什么和别的图区分开」，不能只靠血条数字。
     */
    const metas = {};

    const capture = async (name, meta) => {
      const key = `${meta.scene}|${meta.matchup ?? '-'}|${meta.state}`;
      const dup = Object.entries(metas).find(
        ([, m]) => `${m.scene}|${m.matchup ?? '-'}|${m.state}` === key,
      );
      if (dup) {
        throw new Error(
          `${name} 与 ${dup[0]} 完全同构（${key}），属于重复截图：换英雄对或换摆拍状态`,
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

    /** 开局有 READY / FIGHT! 过场大字，会盖住角色。等它结束再摆姿势。 */
    const startFight = async (hero, opponent) => {
      await bridge(`b.toFight('${hero}','${opponent}'); return true;`);
      await waitFor(async () => {
        const state = await getState();
        return state?.phase === 'fight';
      }, '过场结束');
    };

    await client.send('Page.navigate', { url: `http://localhost:${DEV_PORT}/?shot=1` });
    await sleep(1500);
    await waitFor(() => evaluate('typeof window.__fighterShot === "object"'), '游戏调试入口');
    await waitFor(async () => (await evaluate('window.__fighterShot.progress()')) >= 1, '资源加载', 20000);
    await sleep(400);

    // ─────────────────────────────────────────────────────────────
    // 后台「游戏内容说明」页有 4 个截图上传位，每个都要 ≥3 张（系统位 ≥1 张）：
    //   1. 场景       → 3 张   2. 玩法   → 3 张
    //   3. 游戏背景   → 3 张   4. 系统功能 → 系统 1/2/3 各 1 张
    // 合计 12 张，且跨模块不许重复。文件名前缀即上传位：
    //   scene- = 1.场景  play- = 2.玩法  story- = 3.游戏背景  sys- = 4.系统功能
    // ─────────────────────────────────────────────────────────────

    // ══════════ 1. 场景 → 相关截图（3 张，展示界面与舞台的视觉风格）══════════

    // ① 标题页：画面正中就是小游戏名称
    await bridge('b.toTitle(); return true;');
    await sleep(500);
    await capture('scene-1-title', { scene: 'title', state: 'title' });

    // ② 选人页：三位英雄并列，展示角色立绘风格
    await bridge('b.toSelect(); return true;');
    await sleep(500);
    await capture('scene-2-select', { scene: 'select', state: 'select' });

    // ③ 战斗舞台全景：奶娃「魔性笑声」大招，全屏紫色光效
    await startFight('gu', 'nai');
    await bridge('b.set({ hp1: 0.83, hp2: 0.22, energy1: 100, energy2: 18, combo1: 6, timeLeft: 3450 }); return true;');
    await bridge('b.forceMove("ultimate", 30); return true;');
    await bridge('b.spawnFx("ultimate"); return true;');
    await sleep(150);
    await capture('scene-3-arena', { scene: 'fight-arena', matchup: 'gu-nai', state: 'ultimate' });

    // ══════════ 2. 玩法 → 相关截图（3 张，展示操作方式与胜负规则）══════════

    // ① 开场对峙：方向键 + 四技能键完整可见
    await bridge("b.toFight('niu','gu'); return true;");
    await sleep(350);
    await capture('play-1-ready', { scene: 'fight-ready', matchup: 'niu-gu', state: 'ready' });

    // ② 近身出拳命中：血条不满、连击已起
    await startFight('nai', 'niu');
    await bridge('b.set({ hp1: 0.74, hp2: 0.38, energy1: 46, energy2: 78, combo1: 2, timeLeft: 2760 }); return true;');
    await bridge('b.forceMove("light", 8); return true;');
    await bridge('b.spawnFx("light"); return true;');
    await sleep(140);
    await capture('play-2-combo', { scene: 'fight-combo', matchup: 'nai-niu', state: 'light-hit' });

    // ③ 胜利结算：比分 / 造成伤害 / 最高连击
    await bridge("b.toFight('nai','niu'); return true;");
    await sleep(300);
    await bridge("b.toResult('p1'); return true;");
    await sleep(600);
    await capture('play-3-win', { scene: 'result-win', matchup: 'nai-niu', state: 'win' });

    // ══════════ 3. 游戏背景 → 相关截图（3 张，展示架空霓虹街区的世界观）══════════

    // ① 夜色街区对峙：两角色隔着霓虹楼群对立
    await startFight('gu', 'niu');
    await bridge('b.set({ hp1: 0.9, hp2: 0.7, energy1: 30, energy2: 55, timeLeft: 3300 }); return true;');
    await sleep(200);
    await capture('story-1-street', { scene: 'fight-street', matchup: 'gu-niu', state: 'standoff' });

    // ② 击倒瞬间：红色 K.O. 大字 + 一方倒地、一方胜利姿势
    await startFight('niu', 'nai');
    await bridge('b.set({ hp1: 0.55, hp2: 0.02, timeLeft: 620 }); return true;');
    await bridge('b.set({ hp2: 0 }); return true;');
    await waitFor(async () => (await getState())?.phase === 'ko', 'K.O. 判定');
    await sleep(120);
    await capture('story-2-ko', { scene: 'fight-ko', matchup: 'niu-nai', state: 'ko' });

    // ③ 街区的另一个角落：同角色镜像对局，双方残血、计时器进入红色危急态
    // 系统 3 已经占用了失败结算页，这里不放结算页，避免两张结果页过于雷同
    await startFight('nai', 'nai');
    await bridge('b.set({ hp1: 0.18, hp2: 0.14, energy1: 88, energy2: 64, combo1: 3, combo2: 2, timeLeft: 360 }); return true;');
    await sleep(200);
    await capture('story-3-corner', { scene: 'fight-corner', matchup: 'nai-nai', state: 'last-seconds' });

    // ══════════ 4. 系统功能 → 系统 1 / 2 / 3 各 1 张 ══════════

    // 系统1 战斗系统：按下格挡，角色身前出现护盾
    await startFight('nai', 'gu');
    await bridge('b.set({ hp1: 0.66, hp2: 0.81, energy1: 35, energy2: 20, timeLeft: 2100 }); return true;');
    await bridge('b.hold({ blocking1: true }); return true;');
    await sleep(150);
    await capture('sys-1-block', { scene: 'fight-block', matchup: 'nai-gu', state: 'blocking' });

    // 系统2 连击与能量：能量满格 → 大招键点亮，5 连击
    // 用同角色镜像对局，保证与其余 11 张的英雄组合都不同。
    await startFight('gu', 'gu');
    await bridge('b.set({ hp1: 0.72, hp2: 0.34, energy1: 100, energy2: 8, combo1: 5, timeLeft: 1560 }); return true;');
    await bridge('b.forceMove("heavy", 17); return true;');
    await bridge('b.spawnFx("heavy"); return true;');
    await sleep(140);
    await capture('sys-2-energy', { scene: 'fight-energy', matchup: 'gu-gu', state: 'energy-full' });

    // 系统3 回合续关：失败结算，带「看视频续关」按钮
    // 比分 1:2 惜败、伤害低、连击少 —— 与 story-3 的 0:2 完败形成明显差异
    await bridge("b.toFight('nai','gu'); return true;");
    await sleep(300);
    await bridge("b.toResult('p2'); return true;");
    await bridge('b.set({ wins1: 1, wins2: 2, damage1: 148, combo1: 2 }); return true;');
    await sleep(600);
    await capture('sys-3-revive', { scene: 'result-revive', matchup: 'nai-gu', state: 'revive' });

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
    rows.sort((x, y) => x.global - y.global || x.worst - y.worst);

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
