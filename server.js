import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadCatalog, DATA_DIR } from './lib/catalog.js';
import { createPriceService, providersFromEnv, loadSources } from './lib/prices/service.js';
import { evaluate, normalizeBuild, SLOTS } from './shared/engine.js';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
try { process.loadEnvFile(path.join(ROOT, '.env')); } catch { /* no .env file: fine */ }
const PORT = Number(process.env.PORT) || 4030;

const catalog = await loadCatalog();
for (const w of catalog.warnings) console.warn(`[catalog] ${w}`);

// Everything the browser needs in one payload, rebuilt whenever live prices change.
let clientCatalog = '';
let catalogVersion = 0;
function rebuildClientCatalog() {
  catalogVersion++;
  clientCatalog = JSON.stringify({ meta: catalog.meta, parts: catalog.parts, games: catalog.games, resolutions: catalog.resolutions });
}

// Live prices (Best Buy for new, eBay for used). Without API keys this stays idle
// and every price is the seeded estimate from data/prices.json.
const sources = await loadSources(path.join(DATA_DIR, 'price-sources.json'));
const providers = providersFromEnv(process.env, { fetch: globalThis.fetch, sources });
const prices = createPriceService({
  catalog,
  providers,
  cacheFile: path.join(ROOT, '.cache', 'live-prices.json'),
  ttlHours: Number(process.env.PRICE_TTL_HOURS) || 6,
  plausible: sources.plausibleRange || [0.4, 2.5],
  onUpdate: rebuildClientCatalog,
});
await prices.start();

const app = express();
app.disable('x-powered-by');
app.use(express.json({ limit: '16kb' }));

const staticOpts = { maxAge: process.env.NODE_ENV === 'production' ? '7d' : 0 };
app.use(express.static(path.join(ROOT, 'public'), { ...staticOpts, maxAge: 0 }));
app.use('/shared', express.static(path.join(ROOT, 'shared'), { maxAge: 0 }));
app.use('/vendor/three', express.static(path.join(ROOT, 'node_modules/three'), staticOpts));

app.get('/api/catalog', (req, res) => {
  const etag = `"cat-${catalogVersion}"`;
  if (req.headers['if-none-match'] === etag) return res.status(304).end();
  res.type('json').set({ 'Cache-Control': 'public, max-age=300', ETag: etag }).send(clientCatalog);
});

app.get('/api/meta', (req, res) => res.json(catalog.meta));

app.get('/api/prices/status', (req, res) => res.json(prices.status()));

// Manual refresh, protected by a token so the public can't burn the API quota.
app.post('/api/prices/refresh', (req, res) => {
  if (!process.env.ADMIN_TOKEN || req.get('authorization') !== `Bearer ${process.env.ADMIN_TOKEN}`) return res.status(401).json({ error: 'Set ADMIN_TOKEN and send it as a Bearer token.' });
  prices.refresh().catch(() => {});
  res.status(202).json({ started: true });
});

app.get('/api/parts/:category', (req, res) => {
  const list = catalog.parts[req.params.category];
  if (!list) return res.status(404).json({ error: `Unknown category. Use one of: ${SLOTS.map((s) => s.key).join(', ')}` });
  const q = String(req.query.q || '').toLowerCase();
  res.json(q ? list.filter((p) => `${p.brand} ${p.name}`.toLowerCase().includes(q)) : list);
});

app.get('/api/parts/:category/:id', (req, res) => {
  const part = catalog.byId[req.params.id];
  if (!part || part.category !== req.params.category) return res.status(404).json({ error: 'Part not found' });
  res.json(part);
});

app.get('/api/games', (req, res) => res.json({ games: catalog.games, resolutions: catalog.resolutions, note: catalog.meta.gamesNote }));

// Evaluate a build server-side (same engine the browser uses).
app.post('/api/evaluate', (req, res) => {
  const build = normalizeBuild(req.body?.build, catalog.byId);
  const resolution = catalog.resolutions.includes(req.body?.resolution) ? req.body.resolution : '1440p';
  const r = evaluate(build, catalog, { resolution });
  res.json({ build, issues: r.issues, power: r.power, price: r.price, fps: r.fps, boot: r.boot });
});

app.use('/api', (req, res) => res.status(404).json({ error: 'Not found' }));

const server = app.listen(PORT, (err) => {
  if (err) return; // Express 5 passes listen errors here too; the 'error' handler below reports them
  const n = Object.values(catalog.meta.counts).reduce((a, b) => a + b, 0);
  const live = providers.length ? `live prices: ${providers.map((p) => p.label).join(' + ')}` : 'live prices off (no API keys set)';
  console.log(`My Computer Build running at http://localhost:${PORT}  (${n} parts, estimates as of ${catalog.meta.pricesAsOf}, ${live})`);
});
server.on('error', (err) => {
  console.error(err.code === 'EADDRINUSE' ? `Port ${PORT} is already in use. Stop the other copy, or set PORT in .env to another port.` : err);
  process.exit(1);
});

// pm2 (and Ctrl+C) send SIGINT, Docker and systemd send SIGTERM: finish open requests, then exit
let closing = false;
for (const sig of ['SIGINT', 'SIGTERM']) {
  process.on(sig, () => {
    if (closing) return;
    closing = true;
    prices.stop();
    server.close(() => process.exit(0));
    server.closeIdleConnections?.();
    setTimeout(() => process.exit(0), 4000).unref();
  });
}
