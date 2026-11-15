import express from 'express';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { readFileSync, statSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { loadCatalog, DATA_DIR } from './lib/catalog.js';
import { createPriceService, providersFromEnv, loadSources } from './lib/prices/service.js';
import { shopQuery } from './lib/prices/match.js';
import { evaluate, normalizeBuild, SLOTS } from './shared/engine.js';
import { presetBySlug } from './shared/presets.js';
import { categoryBySlug, partSlug } from './shared/format.js';
import { siteConfig, originFor } from './lib/site.js';
import { rateLimit, cors, securityHeaders } from './lib/security.js';
import { createAuth } from './lib/auth.js';
import { createUserStore } from './lib/userstore.js';
import { INLINE_SCRIPT_HASHES } from './lib/web/layout.js';
import * as pages from './lib/web/pages.js';
import { privacyPage, cookiesPage, termsPage } from './lib/web/legal.js';
import { sitemapEntries, sitemapXml, robotsTxt, llmsTxt, webManifest } from './lib/web/seo.js';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
try { process.loadEnvFile(path.join(ROOT, '.env')); } catch { /* no .env file: fine */ }
const PORT = Number(process.env.PORT) || 4030;
const PROD = process.env.NODE_ENV === 'production';
const site = siteConfig(process.env);

const catalog = await loadCatalog();
for (const w of catalog.warnings) console.warn(`[catalog] ${w}`);

// Everything the browser needs in one payload, rebuilt whenever live prices change.
let clientCatalog = '';
let catalogVersion = 0;
function rebuildClientCatalog() {
  catalogVersion++;
  clientCatalog = JSON.stringify({ meta: catalog.meta, parts: catalog.parts, games: catalog.games, resolutions: catalog.resolutions });
  pageCache.clear();
}
const pageCache = new Map();

// Live prices (Best Buy for new, eBay for used). Without API keys this stays idle
// and every price is the seeded estimate from data/prices.json.
const sources = await loadSources(path.join(DATA_DIR, 'price-sources.json'));
const providers = providersFromEnv(process.env, { fetch: globalThis.fetch, sources });

// Search text and category for the shopping list's eBay links. Overrides in price-sources.json apply here too.
for (const p of Object.values(catalog.byId)) {
  const cfg = sources.parts?.[p.id]?.ebay;
  p.shop = { q: shopQuery(p, cfg?.query), cat: cfg?.categoryId ?? sources.ebayCategories?.[p.category] ?? null };
}
const prices = createPriceService({
  catalog,
  providers,
  cacheFile: path.join(ROOT, '.cache', 'live-prices.json'),
  ttlHours: Number(process.env.PRICE_TTL_HOURS) || 6,
  plausible: sources.plausibleRange || [0.4, 2.5],
  onUpdate: rebuildClientCatalog,
});
await prices.start();

// Part pages are addressed by category slug + part slug.
const partIndex = {};
for (const s of SLOTS) partIndex[s.key] = new Map(catalog.parts[s.key].map((p) => [partSlug(p), p.id]));

// Last-modified dates for the sitemap: the newest data file, and the newest page template.
const newest = (dir, ext) => Math.max(...readdirSync(dir, { recursive: true }).filter((f) => f.endsWith(ext)).map((f) => statSync(path.join(dir, f)).mtimeMs));
const lastmod = { catalog: newest(DATA_DIR, '.json'), site: Math.max(newest(path.join(ROOT, 'lib/web'), '.js'), newest(path.join(ROOT, 'public/css'), '.css')) };

// Cache-busting version for stylesheets, from their contents.
const assetVersion = createHash('sha256')
  .update(['site.css', 'builder.css'].map((f) => { try { return readFileSync(path.join(ROOT, 'public/css', f)); } catch { return ''; } }).join(''))
  .digest('hex').slice(0, 10);

/* ------------------------------------------------------------------ app + hardening */

const app = express();
app.disable('x-powered-by');
// Behind nginx/Caddy on the same machine, "loopback" is right. Behind Cloudflare or a load
// balancer, set TRUST_PROXY to the number of proxies (e.g. 2) so rate limits see real visitor IPs.
app.set('trust proxy', parseTrustProxy(process.env.TRUST_PROXY ?? 'loopback'));

const isHttps = (req) => req.secure;
const auth = createAuth({
  clientId: process.env.GOOGLE_CLIENT_ID,
  clientSecret: process.env.GOOGLE_CLIENT_SECRET,
  secret: process.env.SESSION_SECRET,
  origin: (req) => originFor(site, req),
  isHttps,
});
const users = createUserStore({ dir: process.env.USER_DATA_DIR || path.join(ROOT, '.data', 'users'), byId: catalog.byId });

app.use(securityHeaders({ isHttps, scriptHashes: INLINE_SCRIPT_HASHES }));
app.use(auth.attachUser);
app.use(cors({
  selfOrigins: (req) => [site.url, `${req.protocol}://${req.get('host')}`].filter(Boolean),
  allowed: (process.env.CORS_ORIGINS || '').split(',').map((s) => s.trim()).filter(Boolean),
}));

// Rate limits, per visitor (IP, or account when signed in). The flood guard covers static files too.
const limits = {
  flood: rateLimit({ name: 'flood', windowMs: 60_000, max: Number(process.env.RATE_LIMIT_FLOOD) || 1200 }),
  pages: rateLimit({ name: 'pages', windowMs: 60_000, max: Number(process.env.RATE_LIMIT_PAGES) || 240 }), // ~4 pages a second: room for polite crawlers
  api: rateLimit({ name: 'api', windowMs: 60_000, max: Number(process.env.RATE_LIMIT_API) || 120 }),
  evaluate: rateLimit({ name: 'evaluate', windowMs: 60_000, max: 30 }),
  auth: rateLimit({ name: 'auth', windowMs: 10 * 60_000, max: 20, message: 'Too many sign-in attempts. Please wait a few minutes.' }),
  writes: rateLimit({ name: 'writes', windowMs: 60_000, max: 60 }),
};
app.use(limits.flood);

/* ------------------------------------------------------------------ static files */

const long = PROD ? '30d' : 0;
app.use('/fonts', express.static(path.join(ROOT, 'public/fonts'), { maxAge: long, immutable: PROD }));
app.use(express.static(path.join(ROOT, 'public'), {
  index: false,
  maxAge: 0, // revalidate with ETag: scripts are ES modules without hashed names
  setHeaders(res, file) {
    if (/\.(png|jpe?g|ico|webp)$/.test(file)) res.setHeader('Cache-Control', `public, max-age=${PROD ? 604800 : 0}`);
    if (file.endsWith('.css') && PROD) res.setHeader('Cache-Control', 'public, max-age=31536000, immutable'); // linked with ?v=<hash>
  },
}));
app.use('/shared', express.static(path.join(ROOT, 'shared'), { maxAge: 0 }));
app.use('/vendor/three', express.static(path.join(ROOT, 'node_modules/three'), { maxAge: PROD ? '7d' : 0 }));

/* ------------------------------------------------------------------ sign-in */

app.get('/auth/google', limits.auth, auth.start);
app.get('/auth/google/callback', limits.auth, auth.callback);
app.post('/auth/logout', limits.auth, auth.logout);

/* ------------------------------------------------------------------ API */

const json = express.json({ limit: '16kb' });
app.use('/api', limits.api, (req, res, next) => { res.set('Cache-Control', 'no-store'); next(); });

app.get('/api/catalog', (req, res) => {
  const etag = `"cat-${catalogVersion}"`;
  res.set({ 'Cache-Control': 'public, max-age=300', ETag: etag });
  if (req.headers['if-none-match'] === etag) return res.status(304).end();
  res.type('json').send(clientCatalog);
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
  const q = String(req.query.q || '').toLowerCase().slice(0, 100);
  res.json(q ? list.filter((p) => `${p.brand} ${p.name}`.toLowerCase().includes(q)) : list);
});

app.get('/api/parts/:category/:id', (req, res) => {
  const part = catalog.byId[req.params.id];
  if (!part || part.category !== req.params.category) return res.status(404).json({ error: 'Part not found' });
  res.json(part);
});

app.get('/api/games', (req, res) => res.json({ games: catalog.games, resolutions: catalog.resolutions, note: catalog.meta.gamesNote }));

// Evaluate a build server-side (same engine the browser uses).
app.post('/api/evaluate', limits.evaluate, json, (req, res) => {
  const build = normalizeBuild(req.body?.build, catalog.byId);
  const resolution = catalog.resolutions.includes(req.body?.resolution) ? req.body.resolution : '1440p';
  const r = evaluate(build, catalog, { resolution });
  res.json({ build, issues: r.issues, power: r.power, price: r.price, fps: r.fps, boot: r.boot });
});

// Who's signed in, and whether Google sign-in is available on this server.
app.get('/api/me', (req, res) => {
  res.json({ user: req.user ? { name: req.user.name, picture: req.user.picture } : null, signIn: auth.enabled });
});

const signedIn = (req, res, next) => (req.user ? next() : res.status(401).json({ error: 'Sign in to keep builds in your account.' }));

app.get('/api/builds', signedIn, async (req, res) => res.json({ builds: await users.list(req.user.id) }));
app.put('/api/builds/:id', limits.writes, signedIn, json, async (req, res) => res.json({ build: await users.put(req.user.id, req.params.id, req.body) }));
app.delete('/api/builds/:id', limits.writes, signedIn, async (req, res) => {
  if (!(await users.remove(req.user.id, req.params.id))) return res.status(404).json({ error: 'No saved build with that id.' });
  res.status(204).end();
});
// Moves builds saved in the browser into the account on first sign-in. Existing ids are left alone.
app.post('/api/builds/import', limits.writes, signedIn, express.json({ limit: '256kb' }), async (req, res) => {
  const list = Array.isArray(req.body?.builds) ? req.body.builds.slice(0, 100) : [];
  const have = new Set((await users.list(req.user.id)).map((b) => b.id));
  let imported = 0; const skipped = [];
  for (const b of list) {
    if (!b || typeof b.id !== 'string' || have.has(b.id)) continue;
    try { await users.put(req.user.id, b.id, b); imported++; } catch (e) { skipped.push({ id: String(b.id).slice(0, 40), error: e.message }); if (e.status === 409) break; }
  }
  res.json({ imported, skipped, builds: await users.list(req.user.id) });
});
// Deletes everything stored for this account and signs out.
app.delete('/api/me', limits.writes, signedIn, async (req, res) => {
  await users.removeAll(req.user.id);
  auth.clear(req, res);
  res.status(204).end();
});

app.use('/api', (req, res) => res.status(404).json({ error: 'Not found' }));

/* ------------------------------------------------------------------ pages */

const ctxFor = (req) => ({
  site,
  origin: originFor(site, req),
  path: req.path.replace(/\/+$/, '') || '/',
  user: req.user,
  authEnabled: auth.enabled,
  v: assetVersion,
});

/** Renders a page. Anonymous renders are cached per catalog version; signed-in ones show the account menu. */
function page(render) {
  return (req, res, next) => {
    const ctx = ctxFor(req);
    const key = !req.user && `${catalogVersion}|${ctx.origin}|${ctx.path}|${auth.enabled}`;
    let html = key && pageCache.get(key);
    if (!html) {
      html = render(ctx, { catalog }, req);
      if (html == null) return next();
      if (key) { if (pageCache.size > 500) pageCache.clear(); pageCache.set(key, html); }
    }
    res.set({ 'Cache-Control': 'no-cache', Vary: 'Cookie' }).type('html').send(html);
  };
}

// Everything from here on is a page, a crawler file or a 404.
app.use(limits.pages);

app.get('/', page(pages.homePage));
app.get('/build', page(pages.builderPage));
app.get('/parts', page(pages.partsIndexPage));
app.get('/parts/:cat', page((ctx, data, req) => {
  const cat = categoryBySlug(req.params.cat);
  return cat ? pages.partsCategoryPage(ctx, data, cat) : null;
}));
app.get('/parts/:cat/:slug', page((ctx, data, req) => {
  const cat = categoryBySlug(req.params.cat);
  const id = cat && partIndex[cat].get(req.params.slug);
  return id ? pages.partPage(ctx, data, catalog.byId[id]) : null;
}));
app.get('/builds', page(pages.buildsIndexPage));
app.get('/builds/:slug', page((ctx, data, req) => {
  const p = presetBySlug(req.params.slug);
  return p ? pages.buildPage(ctx, data, p) : null;
}));
app.get('/about', page(pages.aboutPage));
app.get('/privacy', page(privacyPage));
app.get('/cookies', page(cookiesPage));
app.get('/terms', page(termsPage));

// Old addresses: the builder used to live at the root.
app.get('/index.html', (req, res) => res.redirect(301, '/build'));

app.get('/sitemap.xml', (req, res) => {
  res.type('application/xml').set('Cache-Control', 'public, max-age=3600')
    .send(sitemapXml(originFor(site, req), sitemapEntries({ catalog, lastmod })));
});
app.get('/robots.txt', (req, res) => res.type('text/plain').set('Cache-Control', 'public, max-age=3600').send(robotsTxt(originFor(site, req))));
app.get('/llms.txt', (req, res) => res.type('text/plain; charset=utf-8').set('Cache-Control', 'public, max-age=3600').send(llmsTxt({ origin: originFor(site, req), site, catalog })));
app.get('/site.webmanifest', (req, res) => res.type('application/manifest+json').set('Cache-Control', 'public, max-age=86400').send(JSON.stringify(webManifest(site))));

// 404 for everything else, as a real page.
app.use((req, res) => {
  if (req.method !== 'GET' && req.method !== 'HEAD') return res.status(404).json({ error: 'Not found' });
  res.status(404).set('Cache-Control', 'no-cache').type('html').send(pages.notFoundPage(ctxFor(req)));
});

// Errors: JSON for the API, a short page otherwise. Validation errors carry their own status.
app.use((err, req, res, next) => { // eslint-disable-line no-unused-vars
  const status = err.status || err.statusCode || 500;
  if (status >= 500) console.error(err);
  const message = status >= 500 ? 'Something went wrong on our side. Please try again.' : err.type === 'entity.too.large' ? 'That request is too large.' : err.type === 'entity.parse.failed' ? 'That isn’t valid JSON.' : err.message;
  if (req.path.startsWith('/api') || req.path.startsWith('/auth')) return res.status(status).json({ error: message });
  res.status(status).type('text').send(message);
});

function parseTrustProxy(v) {
  if (v === 'true') return true;
  if (v === 'false' || v === '') return false;
  if (/^\d+$/.test(v)) return Number(v);
  return v; // "loopback", "uniquelocal", or a list of addresses/subnets
}

/* ------------------------------------------------------------------ start */

const server = app.listen(PORT, (err) => {
  if (err) return; // Express 5 passes listen errors here too; the 'error' handler below reports them
  const n = Object.values(catalog.meta.counts).reduce((a, b) => a + b, 0);
  const live = providers.length ? `live prices: ${providers.map((p) => p.label).join(' + ')}` : 'live prices off (no API keys set)';
  console.log(`My Computer Build running at http://localhost:${PORT}  (${n} parts, estimates as of ${catalog.meta.pricesAsOf}, ${live}, Google sign-in ${auth.enabled ? 'on' : 'off'})`);
  if (!site.url) console.log('  Set SITE_URL in .env to your public address so canonical links, the sitemap and Google sign-in use it.');
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

