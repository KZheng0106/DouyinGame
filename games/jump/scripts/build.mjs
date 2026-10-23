import { build } from 'esbuild';
import { copyFile, mkdir, rm } from 'node:fs/promises';

const webOut = 'dist/web';
const wxOut = 'dist/wx';
const douyinOut = 'dist/douyin';

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
console.log(`  微信小游戏    ${wxOut}/     ← 用「微信开发者工具」导入这个目录`);
console.log(`  抖音小游戏    ${douyinOut}/     ← 用「抖音开发者工具」导入这个目录`);
