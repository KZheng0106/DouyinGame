/**
 * 用微信官方 miniprogram-ci 上传小游戏代码，等价于开发者工具右上角「上传」。
 * 不需要微信开发者工具，也不需要图形界面，Linux / macOS / Windows 都能跑。
 *
 *   npm run upload -w games/jump -- 1.0.0 "首个版本"
 *
 * 前置：
 *   1) 微信公众平台 → 管理 → 开发管理 → 开发设置 → 小程序代码上传 → 生成并下载密钥
 *   2) 把下载到的 .key 文件放到 games/jump/private.wx.key（已在 .gitignore 里）
 *   3) 若开启了 IP 白名单，需把本机公网 IP 加进去，或临时关闭白名单
 */
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';

const PROJECT_DIR = path.resolve('dist/wx');
const CONFIG_FILE = path.join(PROJECT_DIR, 'project.config.json');
const KEY_FILE = path.resolve('private.wx.key');

const version = (process.argv[2] || '').trim();
const desc = (process.argv[3] || '自动上传').trim();

if (!/^\d+\.\d+\.\d+$/.test(version)) {
  console.error('版本号格式不对，应为 1.0.0 这种三段式：');
  console.error('  npm run upload -w games/jump -- 1.0.0 "首个版本说明"');
  process.exit(1);
}

if (!existsSync(CONFIG_FILE)) {
  console.error(`找不到 ${CONFIG_FILE}，先跑：npm run build -w games/jump`);
  process.exit(1);
}

const config = JSON.parse(await readFile(CONFIG_FILE, 'utf8'));
if (!/^wx[0-9a-f]{16}$/i.test(config.appid || '')) {
  console.error(`dist/wx/project.config.json 里的 appid 无效：${config.appid}`);
  console.error('先跑：npm run appid -w games/jump -- wx你的AppID');
  process.exit(1);
}

if (!existsSync(KEY_FILE)) {
  console.error(`缺少上传密钥：${KEY_FILE}`);
  console.error('');
  console.error('获取方式：');
  console.error('  微信公众平台 → 管理 → 开发管理 → 开发设置 → 小程序代码上传');
  console.error('  点「生成」后下载，把 .key 文件改名为 private.wx.key 放进 games/jump/');
  console.error('  官方文档：https://developers.weixin.qq.com/miniprogram/dev/devtools/ci.html');
  process.exit(1);
}

const require = createRequire(import.meta.url);
let ci;
try {
  ci = require('miniprogram-ci');
} catch {
  console.error('缺少 miniprogram-ci，先跑：npm i -D miniprogram-ci -w games/jump');
  process.exit(1);
}

const project = new ci.Project({
  appid: config.appid,
  type: 'miniGame',
  projectPath: PROJECT_DIR,
  privateKeyPath: KEY_FILE,
  ignores: ['node_modules/**/*'],
});

console.log(`上传中：appid=${config.appid}  version=${version}  desc=${desc}`);

try {
  const result = await ci.upload({
    project,
    version,
    desc,
    setting: { es6: true, minify: true, urlCheck: false },
    onProgressUpdate: (task) => {
      const message = typeof task === 'string' ? task : task?._msg || task?.message;
      if (message) process.stdout.write(`  ${message}\n`);
    },
  });
  console.log('\n上传成功。');
  if (result?.subPackageInfo?.length) {
    for (const info of result.subPackageInfo) console.log(`  ${info.name}: ${info.size} 字节`);
  }
  console.log('\n接着在公众平台「管理 → 版本管理 → 开发版本」里选为体验版或提交审核。');
} catch (error) {
  console.error('\n上传失败：', error?.message || error);
  if (String(error?.message || '').includes('ip')) {
    console.error('多半是 IP 白名单：到开发设置里把本机公网 IP 加进去，或临时关闭白名单。');
  }
  process.exit(1);
}
