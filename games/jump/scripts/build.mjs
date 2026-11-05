import { build } from 'esbuild';
import { copyFile, mkdir, readFile, rm } from 'node:fs/promises';

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

console.log('\n构建完成：');
console.log(`  浏览器预览    ${webOut}/index.html`);
console.log(`  微信小游戏    ${wxOut}/     ← npm run upload -w games/jump -- 1.0.0 "备注"`);
console.log(`  抖音小游戏    ${douyinOut}/     ← 用「抖音开发者工具」导入这个目录`);
