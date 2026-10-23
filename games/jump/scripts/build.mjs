import { build } from 'esbuild';
import { copyFile, mkdir, rm } from 'node:fs/promises';

const webOut = 'dist/web';
const gameOut = 'dist/game';

await rm('dist', { recursive: true, force: true });
await mkdir(webOut, { recursive: true });
await mkdir(gameOut, { recursive: true });

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

// 抖音小游戏版（dist/game 即为开发者工具要导入的项目根目录）
await build({
  ...common,
  entryPoints: ['src/main.ts'],
  outfile: `${gameOut}/game.js`,
  minify: true,
});
await copyFile('game.json', `${gameOut}/game.json`);
await copyFile('project.config.json', `${gameOut}/project.config.json`);

console.log('\n构建完成：');
console.log(`  浏览器预览  ${webOut}/index.html`);
console.log(`  抖音小游戏  ${gameOut}/  ← 用「抖音开发者工具」导入这个目录`);
