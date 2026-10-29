/**
 * 把微信小游戏 AppID 写进项目配置，避免手动改错。
 *   npm run appid -w games/jump -- wx1234567890abcdef
 * 只改 project.wx.config.json（构建时会被复制成 dist/wx/project.config.json）。
 */
import { readFile, writeFile } from 'node:fs/promises';

const CONFIG = 'project.wx.config.json';
const appid = (process.argv[2] || '').trim();

if (!/^wx[0-9a-f]{16}$/i.test(appid)) {
  console.error('AppID 格式不对，应为 wx 开头共 18 位，例如 wx1234567890abcdef');
  console.error('在后台「开发 → 开发管理 → 开发设置」里能找到 AppID。');
  process.exit(1);
}

const config = JSON.parse(await readFile(CONFIG, 'utf8'));
config.appid = appid;
await writeFile(CONFIG, `${JSON.stringify(config, null, 2)}\n`);
console.log(`已写入 ${CONFIG}：appid = ${appid}`);
console.log('接着跑 npm run build -w games/jump 重新生成 dist/wx/project.config.json');
