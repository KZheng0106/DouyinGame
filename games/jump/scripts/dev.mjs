import { context } from 'esbuild';
import { copyFile, mkdir } from 'node:fs/promises';

const outdir = 'dist/web';
const port = Number(process.env.PORT ?? 5173);

await mkdir(outdir, { recursive: true });
await copyFile('index.html', `${outdir}/index.html`);

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
