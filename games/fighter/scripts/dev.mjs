import { context } from 'esbuild';
import { cp, copyFile, mkdir } from 'node:fs/promises';

const outdir = 'dist/web';
const port = Number(process.env.PORT ?? 5174);

await mkdir(outdir, { recursive: true });
await copyFile('index.html', `${outdir}/index.html`);
// 素材不走 esbuild，直接硬链/拷贝进 dist，浏览器才能按 manifest 里的相对路径取到。
for (const dir of ['hero', 'fx', 'sfx', 'bgm']) {
  await cp(`assets/${dir}`, `${outdir}/assets/${dir}`, { recursive: true });
}

const ctx = await context({
  entryPoints: ['src/main.ts'],
  bundle: true,
  outfile: `${outdir}/main.js`,
  format: 'iife',
  target: ['es2019'],
  sourcemap: true,
  logLevel: 'info',
});

await ctx.watch();
const served = await ctx.serve({ servedir: outdir, port });
console.log(`\n浏览器预览：http://localhost:${served.port}/`);
