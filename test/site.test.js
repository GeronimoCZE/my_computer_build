// Starts the real server and checks every public page, the crawler files, the security
// headers and the signed-in API, the way a browser or a search engine would see them.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { createSigner } from '../lib/auth.js';
import { PRESETS } from '../shared/presets.js';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const SITE = 'https://mycomputerbuild.test';
const SECRET = 'test-session-secret';
let base;
let proc;
let dataDir;

before(async () => {
  dataDir = await mkdtemp(path.join(tmpdir(), 'mcb-site-'));
  const port = 40000 + Math.floor(Math.random() * 20000);
  base = `http://127.0.0.1:${port}`;
  // Every setting is given explicitly, so a developer's own .env can't change the results.
  proc = spawn(process.execPath, ['server.js'], {
    cwd: ROOT,
    env: {
      PATH: process.env.PATH,
      PORT: String(port),
      NODE_ENV: 'test',
      SITE_URL: SITE,
      CREATOR_URL: 'https://creator.test/',
      CREATOR_NAME: 'Test Creator',
      CONTACT_EMAIL: '',
      OPERATOR_NAME: '',
      OPERATOR_COUNTRY: '',
      GOOGLE_CLIENT_ID: 'test-client.apps.googleusercontent.com',
      GOOGLE_CLIENT_SECRET: 'test-secret',
      SESSION_SECRET: SECRET,
      CORS_ORIGINS: '',
      TRUST_PROXY: 'loopback',
      RATE_LIMIT_PAGES: '100000',
      RATE_LIMIT_FLOOD: '100000',
      RATE_LIMIT_API: '100000',
      USER_DATA_DIR: dataDir,
      BESTBUY_API_KEY: '',
      EBAY_CLIENT_ID: '',
      EBAY_CLIENT_SECRET: '',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let log = '';
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`server did not start:\n${log}`)), 15000);
    const onData = (d) => { log += d; if (log.includes('running at')) { clearTimeout(timer); resolve(); } };
    proc.stdout.on('data', onData);
    proc.stderr.on('data', (d) => { log += d; });
    proc.on('exit', (code) => { clearTimeout(timer); reject(new Error(`server exited (${code}):\n${log}`)); });
  });
});

after(async () => {
  proc?.kill('SIGTERM');
  await rm(dataDir, { recursive: true, force: true });
});

const get = (p, init) => fetch(`${base}${p}`, { redirect: 'manual', ...init });
const local = (url) => url.replace(SITE, '');
const attr = (html, re) => html.match(re)?.[1];
const metaContent = (html, key) => attr(html, new RegExp(`<meta (?:name|property)="${key}" content="([^"]*)"`));
const decode = (s) => s?.replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>');

/* ------------------------------------------------------------------ crawler files */

let sitemapUrls = [];

test('sitemap.xml lists every page with absolute URLs and dates', async () => {
  const res = await get('/sitemap.xml');
  assert.equal(res.status, 200);
  assert.match(res.headers.get('content-type'), /application\/xml/);
  const xml = await res.text();
  assert.match(xml, /^<\?xml version="1.0" encoding="UTF-8"\?>/);
  sitemapUrls = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
  const lastmods = [...xml.matchAll(/<lastmod>([^<]+)<\/lastmod>/g)].map((m) => m[1]);
  assert.equal(lastmods.length, sitemapUrls.length);
  assert.ok(lastmods.every((d) => /^\d{4}-\d{2}-\d{2}/.test(d)));
  assert.ok(sitemapUrls.length > 150, `${sitemapUrls.length} urls`);
  assert.ok(sitemapUrls.every((u) => u.startsWith(`${SITE}/`)));
  assert.equal(new Set(sitemapUrls).size, sitemapUrls.length, 'no duplicates');
  for (const p of ['/', '/build', '/parts', '/parts/graphics-cards', '/builds', '/about', '/privacy', '/cookies', '/terms']) {
    assert.ok(sitemapUrls.includes(`${SITE}${p}`), p);
  }
  for (const preset of PRESETS) assert.ok(sitemapUrls.includes(`${SITE}/builds/${preset.slug}`), preset.slug);
});

test('robots.txt points at the sitemap and keeps crawlers out of the API', async () => {
  const txt = await (await get('/robots.txt')).text();
  assert.match(txt, new RegExp(`Sitemap: ${SITE}/sitemap.xml`));
  assert.match(txt, /Disallow: \/api\//);
  assert.match(txt, /Disallow: \/auth\//);
  assert.match(txt, /User-agent: GPTBot/);
});

test('llms.txt and the web manifest describe the site', async () => {
  const llms = await (await get('/llms.txt')).text();
  assert.match(llms, /^# My Computer Build/);
  assert.ok(llms.includes(`${SITE}/build`));
  const manifest = await (await get('/site.webmanifest')).json();
  assert.equal(manifest.name, 'My Computer Build');
  assert.ok(manifest.icons.some((i) => i.sizes === '512x512'));
  for (const icon of manifest.icons) assert.equal((await get(icon.src)).status, 200, icon.src);
});

/* ------------------------------------------------------------------ every page */

test('every sitemap page renders with unique, well-formed SEO tags', async () => {
  assert.ok(sitemapUrls.length, 'sitemap test ran first');
  const titles = new Map();
  const descriptions = new Map();
  const ogImages = new Set();
  for (const url of sitemapUrls) {
    const res = await get(local(url));
    assert.equal(res.status, 200, url);
    const html = await res.text();
    const title = decode(attr(html, /<title>([^<]*)<\/title>/));
    const desc = decode(metaContent(html, 'description'));
    assert.ok(title && title.length >= 15 && title.length <= 70, `${url} title length ${title?.length}: ${title}`);
    assert.ok(desc && desc.length >= 50 && desc.length <= 170, `${url} description length ${desc?.length}: ${desc}`);
    assert.equal(attr(html, /<link rel="canonical" href="([^"]+)"/), url, `${url} canonical`);
    assert.equal(metaContent(html, 'og:url'), url, `${url} og:url`);
    assert.ok(metaContent(html, 'og:title'), `${url} og:title`);
    const og = metaContent(html, 'og:image');
    assert.ok(og?.startsWith(`${SITE}/og/`), `${url} og:image`);
    ogImages.add(og);
    assert.equal(metaContent(html, 'twitter:card'), 'summary_large_image', url);
    assert.match(html, /<meta name="robots" content="index, follow/, url);
    assert.equal((html.match(/<h1[\s>]/g) || []).length, 1, `${url} has one h1`);
    assert.doesNotMatch(html, /undefined|NaN|\[object Object\]/, url);
    for (const [, json] of html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)) {
      const ld = JSON.parse(json);
      assert.equal(ld['@context'], 'https://schema.org', url);
    }
    titles.set(title, [...(titles.get(title) || []), url]);
    descriptions.set(desc, [...(descriptions.get(desc) || []), url]);
  }
  const dupTitles = [...titles].filter(([, u]) => u.length > 1);
  const dupDescs = [...descriptions].filter(([, u]) => u.length > 1);
  assert.deepEqual(dupTitles, [], 'duplicate titles');
  assert.deepEqual(dupDescs, [], 'duplicate descriptions');
  for (const og of ogImages) assert.equal((await get(local(og))).status, 200, og);
});

test('pages carry the creator credit, structured data and a strict CSP', async () => {
  const res = await get('/');
  const html = await res.text();
  assert.match(html, /Designed and built by <a href="https:\/\/creator.test\/" rel="author">Test Creator<\/a>/);
  const types = [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map((m) => JSON.parse(m[1])['@type']);
  for (const t of ['WebSite', 'Organization', 'WebApplication', 'FAQPage']) assert.ok(types.includes(t), t);
  const csp = res.headers.get('content-security-policy');
  // Every inline executable script must be allowed by its hash, and nothing else may be.
  const inline = [...html.matchAll(/<script(?![^>]*\bsrc=)(?![^>]*application\/ld\+json)[^>]*>([\s\S]*?)<\/script>/g)].map((m) => m[1]);
  assert.ok(inline.length >= 1);
  for (const code of inline) {
    const hash = `'sha256-${crypto.createHash('sha256').update(code).digest('base64')}'`;
    assert.ok(csp.includes(hash), `inline script not in CSP: ${code.slice(0, 40)}`);
  }
  assert.doesNotMatch(html, /\son[a-z]+="/, 'no inline event handlers');
  assert.equal(res.headers.get('x-content-type-options'), 'nosniff');
  assert.equal(res.headers.get('x-frame-options'), 'DENY');
  assert.equal(res.headers.get('x-powered-by'), null);
});

test('the builder page uses the import map and both inline scripts are allowed', async () => {
  const res = await get('/build');
  const html = await res.text();
  assert.match(html, /<script type="importmap">/);
  const csp = res.headers.get('content-security-policy');
  assert.equal((csp.match(/'sha256-/g) || []).length, 2);
});

test('unknown addresses get a real 404 page that is not indexed', async () => {
  for (const p of ['/nope', '/parts/not-a-category', '/parts/graphics-cards/not-a-card', '/builds/not-a-build']) {
    const res = await get(p);
    assert.equal(res.status, 404, p);
    const html = await res.text();
    assert.match(html, /noindex/, p);
    assert.match(html, /This page isn’t in the case/, p);
  }
  const api = await get('/api/nope');
  assert.equal(api.status, 404);
  assert.deepEqual(await api.json(), { error: 'Not found' });
});

test('old addresses redirect to the builder', async () => {
  const res = await get('/index.html');
  assert.equal(res.status, 301);
  assert.equal(res.headers.get('location'), '/build');
});

/* ------------------------------------------------------------------ sign-in and the account API */

const session = (sub = 'google-sub-1') => `mcb_session=${createSigner(SECRET).sign({ sub, name: 'Ada', exp: Math.floor(Date.now() / 1000) + 3600 })}`;
const jsonInit = (method, body, cookie, extra = {}) => ({ method, headers: { 'Content-Type': 'application/json', ...(cookie ? { cookie } : {}), ...extra }, body: body && JSON.stringify(body) });

test('/api/me says whether sign-in is available and who is signed in', async () => {
  assert.deepEqual(await (await get('/api/me')).json(), { user: null, signIn: true });
  assert.deepEqual(await (await get('/api/me', { headers: { cookie: session() } })).json(), { user: { name: 'Ada', picture: null }, signIn: true });
});

test('/auth/google sends people to Google with the public callback address', async () => {
  const res = await get('/auth/google?next=/build');
  assert.equal(res.status, 302);
  const to = new URL(res.headers.get('location'));
  assert.equal(to.hostname, 'accounts.google.com');
  assert.equal(to.searchParams.get('redirect_uri'), `${SITE}/auth/google/callback`);
});

test('signed-in pages show the account menu instead of the sign-in button', async () => {
  const anon = await (await get('/about')).text();
  assert.match(anon, /Sign in with Google/);
  const mine = await (await get('/about', { headers: { cookie: session() } })).text();
  assert.doesNotMatch(mine, /Sign in with Google/);
  assert.match(mine, /data-signed-in/);
  assert.match(mine, /Delete my saved data/);
});

test('saved builds: save, list, import, delete, and delete everything', async () => {
  const me = session('google-sub-2');
  assert.equal((await get('/api/builds')).status, 401);
  const put = await get('/api/builds/my-first', jsonInit('PUT', { name: 'First', build: PRESETS[0].build }, me));
  assert.equal(put.status, 200);
  assert.equal((await put.json()).build.name, 'First');
  const imp = await get('/api/builds/import', jsonInit('POST', { builds: [{ id: 'my-first', name: 'dupe', build: {} }, { id: 'from-browser', name: 'Local', build: PRESETS[1].build }, { id: 'bad id!', name: 'x' }] }, me));
  const imported = await imp.json();
  assert.equal(imported.imported, 1);
  assert.equal(imported.skipped.length, 1);
  assert.deepEqual(imported.builds.map((b) => b.id).sort(), ['from-browser', 'my-first']);
  assert.equal((await get('/api/builds/from-browser', { method: 'DELETE', headers: { cookie: me } })).status, 204);
  assert.equal((await get('/api/builds/from-browser', { method: 'DELETE', headers: { cookie: me } })).status, 404);
  const bad = await get('/api/builds/x', { method: 'PUT', headers: { cookie: me, 'Content-Type': 'application/json' }, body: '{not json' });
  assert.equal(bad.status, 400);
  assert.match((await bad.json()).error, /valid JSON/);
  const big = await get('/api/builds/x', jsonInit('PUT', { name: 'x'.repeat(20_000), build: {} }, me));
  assert.equal(big.status, 413);
  const del = await get('/api/me', { method: 'DELETE', headers: { cookie: me } });
  assert.equal(del.status, 204);
  assert.match(del.headers.getSetCookie().join(), /mcb_session=;/);
  assert.deepEqual((await (await get('/api/builds', { headers: { cookie: me } })).json()).builds, []);
});

test('the server survives bad saves (no crash from rejected writes)', async () => {
  const me = session('google-sub-3');
  for (let i = 0; i < 3; i++) assert.equal((await get('/api/builds/bad%20id', jsonInit('PUT', { name: 'x' }, me))).status, 400);
  assert.equal((await get('/api/me')).status, 200);
});

/* ------------------------------------------------------------------ CORS and rate limits, live */

test('cross-site writes are refused even with a valid session cookie', async () => {
  const res = await get('/api/builds/csrf', jsonInit('PUT', { name: 'x', build: {} }, session(), { Origin: 'https://evil.test' }));
  assert.equal(res.status, 403);
  const own = await get('/api/builds/ok', jsonInit('PUT', { name: 'x', build: {} }, session(), { Origin: SITE }));
  assert.equal(own.status, 200);
  assert.equal(own.headers.get('access-control-allow-origin'), SITE);
  const pre = await get('/api/builds/ok', { method: 'OPTIONS', headers: { Origin: 'https://evil.test', 'Access-Control-Request-Method': 'PUT' } });
  assert.equal(pre.status, 403);
  const read = await get('/api/catalog', { headers: { Origin: 'https://evil.test' } });
  assert.equal(read.status, 200);
  assert.equal(read.headers.get('access-control-allow-origin'), null, 'readable only by our own pages');
});

test('build evaluation is rate limited with Retry-After', async () => {
  let last;
  for (let i = 0; i < 31; i++) last = await get('/api/evaluate', jsonInit('POST', { build: PRESETS[0].build }, null));
  assert.equal(last.status, 429);
  assert.ok(Number(last.headers.get('retry-after')) > 0);
  assert.equal(last.headers.get('ratelimit-remaining'), '0');
  assert.equal((await last.json()).limit, 'evaluate');
});
