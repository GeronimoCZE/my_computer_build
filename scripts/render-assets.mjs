// Renders the site's raster images with a headless browser: the home page screenshots of the
// builder, the social share (Open Graph) images and the app icons.
//
//   npm start                                   # in one terminal
//   node scripts/render-assets.mjs http://localhost:4030
//
// Needs Playwright with Chromium (npm i -g playwright && npx playwright install chromium).
// It isn't a dependency of the site: run this only after changing the look or the example builds.
import { createRequire } from 'node:module';
import { writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadCatalog } from '../lib/catalog.js';
import { evaluate, normalizeBuild, SLOTS } from '../shared/engine.js';
import { PRESETS } from '../shared/presets.js';
import { encodeShare } from '../public/js/store.js';
import { CAT_ICONS, MARK } from '../lib/web/icons.js';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PUB = path.join(ROOT, 'public');
const base = (process.argv[2] || 'http://localhost:4030').replace(/\/$/, '');
const only = process.argv[3] || 'all'; // shots | og | icons | all

const catalog = await loadCatalog();
const total = Object.values(catalog.meta.counts).reduce((a, b) => a + b, 0);
const years = Object.values(catalog.byId).map((p) => p.released);
const [y0, y1] = [Math.min(...years), Math.max(...years)];
const usd = (v) => `$${Math.round(v).toLocaleString('en-US')}`;
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });

/* ------------------------------------------------------------------ builder screenshots */
async function shots() {
  const demo = PRESETS[1];
  const hash = encodeShare(normalizeBuild(demo.build, catalog.byId), demo.title);
  for (const theme of ['light', 'dark']) {
    const ctx = await browser.newContext({ viewport: { width: 1600, height: 1060 }, deviceScaleFactor: 1, colorScheme: theme });
    const page = await ctx.newPage();
    await page.goto(`${base}/build${hash}`, { waitUntil: 'networkidle' });
    await page.waitForSelector('#stage-loading.done', { timeout: 30000 });
    await page.waitForTimeout(3500); // parts fly in and settle
    const navH = await page.evaluate(() => document.getElementById('nav').getBoundingClientRect().height);
    const buf = await page.screenshot({ type: 'jpeg', quality: 84, clip: { x: 0, y: navH, width: 1600, height: 1000 } });
    await writeFile(path.join(PUB, 'img', `builder-${theme}.jpg`), buf);
    // the 3D stage alone, for the share images
    const stage = await page.$('#stage');
    await writeFile(path.join(PUB, 'img', `stage-${theme}.png`), await stage.screenshot({ type: 'png' }));
    await ctx.close();
    console.log(`img/builder-${theme}.jpg, img/stage-${theme}.png`);
  }
}

/* ------------------------------------------------------------------ share images */
const OG_CSS = `
@font-face { font-family: Geist; src: url(${base}/fonts/Geist-Variable.woff2) format("woff2"); font-weight: 100 900; }
@font-face { font-family: "Geist Mono"; src: url(${base}/fonts/GeistMono-Variable.woff2) format("woff2"); font-weight: 100 900; }
* { box-sizing: border-box; margin: 0; }
html, body { width: 1200px; height: 630px; overflow: hidden; }
body { position: relative; background: #0b0c0f; color: #eef0f4; font-family: Geist, sans-serif; letter-spacing: -0.01em; -webkit-font-smoothing: antialiased; }
body::before { content: ""; position: absolute; inset: 0; background-image: linear-gradient(rgba(255,255,255,.05) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.05) 1px, transparent 1px); background-size: 48px 48px; background-position: -1px -1px; -webkit-mask-image: radial-gradient(ellipse 80% 90% at 75% 40%, #000 10%, transparent 75%); }
.brand { position: absolute; left: 72px; top: 60px; display: flex; align-items: center; gap: 14px; font-weight: 600; font-size: 26px; letter-spacing: -0.02em; }
.mark { width: 40px; height: 40px; color: #eef0f4; }
.mark .mark-lid { fill: #4d78ff; } .mark .mark-lid-l { fill: #2d50e6; } .mark .mark-lid-r { fill: #3c62f5; }
.copy { position: absolute; left: 72px; bottom: 64px; width: 510px; }
.kicker { font: 500 18px "Geist Mono", monospace; letter-spacing: .08em; text-transform: uppercase; color: #8ba7ff; }
h1 { margin-top: 18px; font-size: 64px; line-height: 1.0; font-weight: 600; letter-spacing: -0.045em; }
h1 em { font-style: normal; color: #4d78ff; }
p { margin-top: 20px; font-size: 24px; line-height: 1.4; color: #9ba3b2; }
.mono { font-family: "Geist Mono", monospace; letter-spacing: -0.02em; }
.visual { position: absolute; right: 56px; top: 64px; width: 536px; height: 502px; border-radius: 22px; overflow: hidden; border: 1px solid #2d323c; background: #111318; box-shadow: 0 40px 80px -20px rgba(0,0,0,.6); }
.visual img { width: 100%; height: 100%; object-fit: cover; object-position: 50% 55%; }
.chips { display: flex; gap: 10px; margin-top: 26px; flex-wrap: wrap; }
.chip { padding: 8px 14px; border-radius: 10px; border: 1px solid #2d323c; background: #111318; font: 500 18px "Geist Mono", monospace; color: #c4c9d3; }
.tiles { position: absolute; right: 64px; top: 120px; display: grid; grid-template-columns: repeat(4, 112px); gap: 16px; }
.tile { height: 112px; border-radius: 22px; border: 1px solid #2d323c; background: #111318; display: grid; place-items: center; color: #eef0f4; }
.tile svg { width: 58px; height: 58px; fill: none; stroke: currentColor; stroke-width: 1.3; stroke-linecap: round; stroke-linejoin: round; }
.tile.on { border-color: rgba(110,145,255,.6); background: rgba(77,120,255,.14); color: #8ba7ff; }
.card { position: absolute; right: 72px; width: 420px; padding: 24px 26px; border-radius: 20px; border: 1px solid #2d323c; background: #111318; }
.card .t { font-size: 24px; font-weight: 600; letter-spacing: -0.02em; }
.card .s { margin-top: 6px; font-size: 18px; color: #9ba3b2; }
.card .n { margin-top: 18px; display: flex; gap: 22px; font: 500 22px "Geist Mono", monospace; }
.card .n span { color: #6b7383; font-size: 16px; }
.stats { position: absolute; right: 72px; top: 150px; width: 470px; padding: 30px; border-radius: 22px; border: 1px solid #2d323c; background: #111318; }
.row { display: flex; justify-content: space-between; align-items: baseline; padding: 12px 0; border-bottom: 1px solid #20242c; font-size: 22px; color: #c4c9d3; }
.row:last-child { border-bottom: 0; }
.row b { font: 500 26px "Geist Mono", monospace; color: #eef0f4; }
.row.big b { font-size: 40px; letter-spacing: -0.04em; }
.fps { margin-top: 6px; }
.fps .row { font-size: 20px; }
.fps .row b { font-size: 22px; color: #8ba7ff; }
`;
const brand = `<div class="brand">${MARK}<span>My Computer Build</span></div>`;
const tileSvg = (k) => `<svg viewBox="0 0 24 24">${CAT_ICONS[k]}</svg>`;

async function og() {
  const ctx = await browser.newContext({ viewport: { width: 1200, height: 630 }, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  await page.goto(`${base}/__og`, { waitUntil: 'domcontentloaded' }); // any same-origin page, so fonts and images load under the site's CSP
  const render = async (file, body) => {
    await page.setContent(`<!doctype html><html><head><meta charset="utf-8"><style>${OG_CSS}</style></head><body>${brand}${body}</body></html>`, { waitUntil: 'networkidle' });
    await page.evaluate(() => document.fonts.ready);
    await mkdir(path.join(PUB, 'og'), { recursive: true });
    await page.screenshot({ path: path.join(PUB, 'og', file), type: 'png' });
    console.log(`og/${file}`);
  };
  const stage = `${base}/img/stage-dark.png`;

  await render('default.png', `
    <div class="visual"><img src="${stage}"></div>
    <div class="copy"><div class="kicker">Free 3D PC builder</div><h1>Plan your next PC <em>in 3D.</em></h1><p>Compatibility, new and used prices, power and FPS estimates for ${total} parts.</p></div>`);
  await render('builder.png', `
    <div class="visual" style="background:#e8ecf2"><img src="${base}/img/stage-light.png" style="transform:scale(1.08)"></div>
    <div class="copy"><div class="kicker">The builder</div><h1>Watch every part go in.</h1><p>Live checks for sockets, memory, clearances, slots and power.</p></div>`);
  await render('parts.png', `
    <div class="tiles">${SLOTS.map((s, i) => `<div class="tile${i === 5 ? ' on' : ''}">${tileSvg(s.key)}</div>`).join('')}</div>
    <div class="copy"><div class="kicker">Parts catalog</div><h1>${total} PC parts, <em>${y0}–${y1}.</em></h1><p>Specs, new and used prices, and what each part works with.</p></div>`);
  const pick = [PRESETS[0], PRESETS[1], PRESETS[2]];
  await render('builds.png', `${pick.map((p, i) => {
    const r = evaluate(normalizeBuild(p.build, catalog.byId), catalog, { resolution: p.resolution });
    return `<div class="card" style="top:${96 + i * 150}px;right:${56 + (2 - i) * 36}px;height:134px"><div class="t">${esc(p.name)}</div><div class="s">${esc(r.parts.cpu.name)} · ${esc(p.tag)}</div><div class="n">${usd(r.price.retail)}<span>new</span>${usd(r.price.used)}<span>used</span></div></div>`;
  }).join('')}
    <div class="copy" style="width:500px"><div class="kicker">Example builds</div><h1>Start from a <em>checked</em> build.</h1><p>From budget 1080p to a 4K RTX 5090 rig, plus used classics.</p></div>`);
  await render('about.png', `
    <div class="stats"><div class="row"><span>Compatibility</span><b>live</b></div><div class="row"><span>Prices</span><b>new + used</b></div><div class="row"><span>Power</span><b>+30% headroom</b></div><div class="row"><span>FPS</span><b>±15%</b></div></div>
    <div class="copy"><div class="kicker">About</div><h1>How the estimates work.</h1><p>Prices, power and FPS, explained without the fine print.</p></div>`);

  for (const p of PRESETS) {
    const r = evaluate(normalizeBuild(p.build, catalog.byId), catalog, { resolution: p.resolution });
    const games = r.fps.results.filter((g) => !g.capped).slice(0, 3);
    await render(`build-${p.slug}.png`, `
      <div class="stats" style="top:120px">
        <div class="row big"><span>New</span><b>${usd(r.price.retail)}</b></div>
        <div class="row big"><span>Used</span><b>${usd(r.price.used)}</b></div>
        <div class="row"><span>Gaming draw</span><b>${r.power.gaming} W</b></div>
        <div class="fps">${games.map((g) => `<div class="row"><span>${esc(g.name)} · ${esc(p.resolution)}</span><b>${g.fps} fps</b></div>`).join('')}</div>
      </div>
      <div class="copy" style="width:540px"><div class="kicker">Example build · ${esc(p.tag)}</div><h1 style="font-size:56px">${esc(p.title)}</h1><p>${esc(r.parts.cpu.name)} with ${esc(r.parts.gpu.name.replace(/ Founders Edition| Limited Edition/, ''))}</p></div>`);
  }
  await ctx.close();
}

/* ------------------------------------------------------------------ icons */
async function icons() {
  const page = await browser.newPage({ deviceScaleFactor: 1 });
  const tile = (size, pad, radius) => `<!doctype html><html><head><style>html,body{margin:0;width:${size}px;height:${size}px;overflow:hidden;background:transparent}
    div{width:${size}px;height:${size}px;border-radius:${radius}px;background:#0b0c0f;display:grid;place-items:center}
    svg{width:${size - pad * 2}px;height:${size - pad * 2}px;color:#eef0f4}.mark-lid{fill:#4d78ff}.mark-lid-l{fill:#2d50e6}.mark-lid-r{fill:#3c62f5}</style></head><body><div>${MARK}</div></body></html>`;
  const shot = async (file, size, pad, radius, omitBackground = true) => {
    await page.setViewportSize({ width: size, height: size });
    await page.setContent(tile(size, pad, radius));
    const buf = await page.screenshot({ type: 'png', omitBackground });
    await writeFile(path.join(PUB, file), buf);
    console.log(file);
    return buf;
  };
  await mkdir(path.join(PUB, 'icons'), { recursive: true });
  await shot('apple-touch-icon.png', 180, 30, 0, false); // iOS rounds the corners itself
  await shot('icons/icon-192.png', 192, 30, 42);
  await shot('icons/icon-512.png', 512, 80, 112);
  await shot('icons/icon-maskable-512.png', 512, 128, 0, false); // safe zone: the mark stays inside the middle 60%
  const png32 = await shot('icons/favicon-32.png', 32, 3, 7);
  // favicon.ico: an ICO container holding the 32 px PNG (supported by every current browser)
  const header = Buffer.alloc(22);
  header.writeUInt16LE(0, 0); header.writeUInt16LE(1, 2); header.writeUInt16LE(1, 4);
  header.writeUInt8(32, 6); header.writeUInt8(32, 7); header.writeUInt8(0, 8); header.writeUInt8(0, 9);
  header.writeUInt16LE(1, 10); header.writeUInt16LE(32, 12); header.writeUInt32LE(png32.length, 14); header.writeUInt32LE(22, 18);
  await writeFile(path.join(PUB, 'favicon.ico'), Buffer.concat([header, png32]));
  console.log('favicon.ico');
  await page.close();
}

try {
  if (only === 'all' || only === 'shots') await shots();
  if (only === 'all' || only === 'og') await og();
  if (only === 'all' || only === 'icons') await icons();
} finally {
  await browser.close();
}
