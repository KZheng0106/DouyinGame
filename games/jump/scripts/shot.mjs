/**
 * 生成提审用截图。
 *
 * 微信后台要求：JPG/JPEG/PNG、60KB~5MB、画面内能看到小游戏名称。
 * 直接用 headless Chrome + CDP 驱动真实游戏，按 3 倍像素密度出图，
 * 不在项目里引入 Playwright 依赖。
 *
 * 用法：先 npm run build，再在仓库根目录执行 npm run shots -w games/jump
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

    await client.send('Page.navigate', { url: 'http://localhost:5173/' });
    await sleep(1500);

    const shots = {};

    const capture = async (name) => {
      const { data } = await client.send('Page.captureScreenshot', { format: 'png' });
      const buffer = Buffer.from(data, 'base64');
      shots[name] = buffer.length;
      if (buffer.length < MIN_BYTES || buffer.length > MAX_BYTES) {
        throw new Error(`${name} 体积 ${(buffer.length / 1024).toFixed(1)}KB 不在 60KB~5MB 之间`);
      }
      writeFileSync(join(OUT_DIR, `${name}.png`), buffer);
      process.stdout.write(`  ${name}.png  ${(buffer.length / 1024).toFixed(1)} KB\n`);
    };

    // 直接在 DOM 里派发 pointer 事件：比模拟鼠标更贴近手机，也避开 headless 的输入限制。
    const evaluate = async (expression) => {
      const { result } = await client.send('Runtime.evaluate', { expression, returnByValue: true });
      return result.value;
    };

    const press = (ratio) =>
      evaluate(`(() => {
        const c = document.querySelector('canvas');
        const r = c.getBoundingClientRect();
        c.dispatchEvent(new PointerEvent('pointerdown', {
          clientX: r.left + r.width / 2,
          clientY: r.top + r.height * ${ratio},
          bubbles: true,
          pointerId: 1,
          isPrimary: true,
        }));
        return true;
      })()`);

    const release = () =>
      evaluate(`(() => {
        window.dispatchEvent(new PointerEvent('pointerup', {
          clientX: 0, clientY: 0, bubbles: true, pointerId: 1, isPrimary: true,
        }));
        return true;
      })()`);

    /** 结束页会画 56px 的金色分数（#ffd166），据此判断是否已坠落。 */
    const isDead = () =>
      evaluate(`(() => {
        const c = document.querySelector('canvas');
        const ctx = c.getContext('2d');
        const y0 = Math.round(c.height * 0.36);
        const y1 = Math.round(c.height * 0.48);
        const d = ctx.getImageData(0, y0, c.width, y1 - y0).data;
        for (let i = 0; i < d.length; i += 4) {
          if (Math.abs(d[i] - 255) < 12 && Math.abs(d[i + 1] - 209) < 12 && Math.abs(d[i + 2] - 102) < 12) {
            return true;
          }
        }
        return false;
      })()`);

    // 开始页：标题就是小游戏名称，满足「截图内需有游戏名」的要求
    await capture('00-start');

    // 先点「开始游戏」（按钮中心在画面高度 62% 处）
    await press(0.62);
    await sleep(80);
    await release();
    await sleep(300);

    // 蓄力中：按住不放，电量条约走到 65%
    await press(0.8);
    await sleep(600);
    await capture('01-charging');
    await release();

    // 起跳并落地，画面里有分数与多块平台
    await sleep(800);
    await capture('02-playing');

    // 结束页：反复短按直到坠落，落空即本局结束
    for (let i = 0; i < 60; i += 1) {
      if (await isDead()) break;
      await press(0.8);
      await sleep(100);
      await release();
      await sleep(700);
    }
    await sleep(400);
    await capture('03-gameover');

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
