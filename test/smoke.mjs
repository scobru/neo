// Smoke test: serves the repo statically, opens NEO in headless Chromium and checks
// that the page boots without script errors and exposes the handlers used by inline onclick="...".
// Usage: node test/smoke.mjs   (needs `playwright` resolvable and Chromium installed)
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
let chromium;
try { ({ chromium } = require('playwright')); }
catch { ({ chromium } = require(path.join(process.env.NODE_PATH || '/opt/node22/lib/node_modules', 'playwright'))); }

const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css',
  '.svg': 'image/svg+xml', '.webmanifest': 'application/manifest+json', '.json': 'application/json' };
const server = http.createServer((req, res) => {
  let p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  if (p.endsWith('/')) p += 'index.html';
  const f = path.join(root, p);
  if (!f.startsWith(root) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'content-type': TYPES[path.extname(f)] || 'application/octet-stream' });
  fs.createReadStream(f).pipe(res);
});
await new Promise(r => server.listen(0, '127.0.0.1', r));
const url = `http://127.0.0.1:${server.address().port}/`;

const exe = process.env.CHROMIUM_PATH || undefined;
const browser = await chromium.launch({ executablePath: exe, args: ['--no-sandbox'] });
const page = await browser.newPage();
const errors = [];
page.on('pageerror', e => errors.push('pageerror: ' + e.message));
page.on('console', m => { if (m.type() === 'error' && !/Failed to load resource|net::ERR/.test(m.text())) errors.push('console: ' + m.text()); });

// The real WebLLM comes from a CDN (and needs WebGPU): replace it with a tiny stub so the app boots offline.
const WEBLLM_STUB = `export const prebuiltAppConfig = { model_list: [
  { model_id: 'Stub-A-q4f16_1-MLC', model_lib: 'https://example.invalid/a.wasm', vram_required_MB: 300 },
  { model_id: 'Stub-B-q4f16_1-MLC', model_lib: 'https://example.invalid/b.wasm', vram_required_MB: 900 }] };
export const CreateMLCEngine = async () => { throw new Error('stub'); };
export const CreateWebWorkerMLCEngine = CreateMLCEngine;`;
await page.route(/esm\.run\/@mlc-ai\/web-llm/, r => r.fulfill({ contentType: 'text/javascript', body: WEBLLM_STUB }));

const checks = [];
const check = (name, ok, extra = '') => { checks.push(ok); console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${extra ? ' — ' + extra : ''}`); };

await page.goto(url, { waitUntil: 'load' });
await page.waitForTimeout(3000);

check('title is set', (await page.title()).length > 0, await page.title());
const ids = ['ag-dialog', 'st-dialog', 'gpu-warning'];
for (const id of ids) check(`#${id} present`, await page.locator('#' + id).count() === 1);
// every inline onclick="fn(" must resolve to a global function
const missing = await page.evaluate(() => {
  const names = new Set();
  for (const el of document.querySelectorAll('[onclick]'))
    for (const m of el.getAttribute('onclick').matchAll(/(?<![.\w$])([A-Za-z_$][\w$]*)\s*\(/g)) names.add(m[1]);
  return [...names].filter(n => typeof window[n] !== 'function' && !['confirm', 'alert', 'prompt', 'if'].includes(n));
});
check('inline onclick handlers resolve', missing.length === 0, missing.join(', '));
const mods = await page.evaluate(async () => {
  const ops = await import('./ops.js'), fmt = await import('./format.js');
  return { ops: Object.keys(ops.OPS).length, sys: typeof ops.SYSTEM, bp: Object.values(ops.OPS).every(([, action, param]) => ops.buildPrompt(action, param, 'ciao').includes('TESTO:')),
    md: fmt.fmtMsg('**a** `b`'), esc: fmt.escHtml('<a href="x">&') };
});
check('ops.js exports', mods.ops > 0 && mods.sys === 'string' && mods.bp === true, JSON.stringify([mods.ops, mods.sys, mods.bp]));
check('format.js output', mods.md === '<p><strong>a</strong> <code>b</code></p>' && mods.esc === '&lt;a href=&quot;x&quot;&gt;&amp;', mods.md);
const body = await page.locator('body').innerText();
check('model list rendered', /Stub-A|Stub-B/i.test(body) || (await page.locator('[onclick*="startModel"], [data-model]').count()) > 0);
check('no script errors', errors.length === 0, errors.join(' | '));

await browser.close();
server.close();
process.exit(checks.every(Boolean) ? 0 : 1);
