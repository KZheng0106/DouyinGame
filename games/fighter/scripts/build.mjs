import { build } from 'esbuild';
import { cp, copyFile, mkdir, readFile, readdir, rm } from 'node:fs/promises';

const webOut = 'dist/web';
const wxOut = 'dist/wx';
const douyinOut = 'dist/douyin';

// 广告位 ID 填错（漏前缀、粘成广告位名称）不会报错，只会在真机上静默拉不到广告，
// 所以放在构建时拦住。
const configSource = await readFile('src/config.ts', 'utf8');
for (const field of ['wxRewardedAdUnitId', 'rewardedAdUnitId']) {
  const value = new RegExp(`${field}\\s*:\\s*'([^']*)'`).exec(configSource)?.[1] ?? '';
  if (value && !/^adunit-[0-9a-zA-Z]+$/.test(value)) {
    throw new Error(`${field} 格式不对：「${value}」应以 adunit- 开头，后面是广告位 ID 本身`);
  }
}

// 上线包里最不能容忍的是「调试假广告」。这里直接拦住，避免再次误提审。
if (new RegExp('debugFakeAd\\s*:\\s*true').test(configSource)) {
  throw new Error('config.ts 里 debugFakeAd 还是 true，上线版本必须改成 false');
}

// body/ 与 head/ 是早期用 Kenney 素材拼头像的遗留，渲染层并不读，不打包。
const ASSET_DIRS = ['hero', 'fx', 'sfx', 'bgm'];

await rm('dist', { recursive: true, force: true });
for (const dir of [webOut, wxOut, douyinOut]) await mkdir(dir, { recursive: true });

const common = {
  bundle: true,
  format: 'iife',
  target: ['es2019'],
  logLevel: 'info',
};

// 浏览器预览版
await build({
  ...common,
  entryPoints: ['src/main.ts'],
  outfile: `${webOut}/main.js`,
  sourcemap: true,
});
await copyFile('index.html', `${webOut}/index.html`);

// 微信小游戏版
await build({
  ...common,
  entryPoints: ['src/main.ts'],
  outfile: `${wxOut}/game.js`,
  minify: true,
});
await copyFile('game.json', `${wxOut}/game.json`);
await copyFile('project.wx.config.json', `${wxOut}/project.config.json`);

// 抖音小游戏版
await build({
  ...common,
  entryPoints: ['src/main.ts'],
  outfile: `${douyinOut}/game.js`,
  minify: true,
});
await copyFile('game.json', `${douyinOut}/game.json`);
await copyFile('project.config.json', `${douyinOut}/project.config.json`);

// 三份产物都要带素材。小游戏的 loadImage 走相对 game.js 的路径，
// 目录结构必须和 src/assets/manifest.ts 里写的一致。
for (const out of [webOut, wxOut, douyinOut]) {
  for (const dir of ASSET_DIRS) {
    await cp(`assets/${dir}`, `${out}/assets/${dir}`, { recursive: true });
  }
}

// 包体预算：小游戏主包上限 4MB（微信）/ 4MB（抖音），超了要拆分包。
const total = await dirSize(wxOut);
const limitMb = 4;
console.log(`\n包体 ${(total / 1024 / 1024).toFixed(2)} MB / ${limitMb} MB`);
if (total > limitMb * 1024 * 1024) {
  throw new Error('主包超过 4MB，需要把素材挪到分包或压缩贴图');
}

const heroCount = (await readdir(`${wxOut}/assets/hero`)).length;
console.log(`英雄贴图 ${heroCount} 张`);

console.log('\n构建完成：');
console.log(`  浏览器预览    ${webOut}/index.html`);
console.log(`  微信小游戏    ${wxOut}/     ← npm run upload -w games/fighter -- 1.0.0 "备注"`);
console.log(`  抖音小游戏    ${douyinOut}/     ← 用「抖音开发者工具」导入这个目录`);

async function dirSize(path) {
  let sum = 0;
  for (const entry of await readdir(path, { withFileTypes: true })) {
    const full = `${path}/${entry.name}`;
    if (entry.isDirectory()) sum += await dirSize(full);
    else sum += (await readFile(full)).byteLength;
  }
  return sum;
}
