// usage: node render.mjs stills 0.5 1.5 ...   |   node render.mjs video out.mp4 [fps] [sub]
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';

const dir = path.dirname(new URL(import.meta.url).pathname);
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.woff2': 'font/woff2', '.webp': 'image/webp' };
const server = http.createServer((req, res) => {
  const f = path.join(dir, decodeURIComponent(req.url.split('?')[0]));
  fs.readFile(f, (e, d) => { if (e) { res.writeHead(404); res.end(); return; } res.writeHead(200, { 'content-type': types[path.extname(f)] || 'application/octet-stream' }); res.end(d); });
}).listen(0);
const port = server.address().port;

const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--force-color-profile=srgb', '--disable-gpu-vsync'] }).catch(() => chromium.launch());
const page = await browser.newPage({ viewport: { width: +(process.env.W||1920), height: +(process.env.H||1080) }, deviceScaleFactor: 1 });
page.on('console', m => console.log('[page]', m.text()));
page.on('pageerror', e => console.log('[pageerror]', e.message));
await page.goto(`http://localhost:${port}/${process.env.PAGE||"index.html"}`);
await page.evaluate(() => window.__ready);
await page.waitForTimeout(500);

const mode = process.argv[2];
if (mode === 'stills') {
  fs.mkdirSync(path.join(dir, 'stills'), { recursive: true });
  for (const ts of process.argv.slice(3)) {
    const t = parseFloat(ts);
    await page.evaluate(t => window.render(t), t);
    await page.screenshot({ path: path.join(dir, 'stills', `t${t.toFixed(2)}.png`) });
  }
} else {
  const out = process.argv[3] || 'out.mp4', fps = +(process.argv[4] || 60), sub = +(process.argv[5] || 1);
  const ff = process.env.FFMPEG;
  const vf = sub > 1 ? ['-vf', `tmix=frames=${sub}:weights=${Array(sub).fill(1).join(' ')},select='not(mod(n\\,${sub}))',setpts=N/${fps}/TB`] : [];
  const proc = spawn(ff, ['-y', '-f', 'image2pipe', '-framerate', String(fps * sub), '-i', '-', ...vf, '-r', String(fps), '-c:v', 'libx264', '-preset', 'slow', '-crf', '15', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', out], { stdio: ['pipe', 'inherit', 'inherit'] });
  const N = Math.round(+(process.env.DUR||30) * fps * sub);
  const t0 = Date.now();
  for (let i = 0; i < N; i++) {
    const t = i / (fps * sub);
    await page.evaluate(t => window.render(t), t);
    const buf = await page.screenshot({ type: 'jpeg', quality: 95 });
    if (!proc.stdin.write(buf)) await new Promise(r => proc.stdin.once('drain', r));
    if (i % 120 === 0) console.log(`frame ${i}/${N}  ${((Date.now() - t0) / 1000).toFixed(0)}s`);
  }
  proc.stdin.end();
  await new Promise(r => proc.on('close', r));
}
await browser.close();
server.close();
