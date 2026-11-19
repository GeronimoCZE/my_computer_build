import { test } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { clientKey, rateLimit, cors, normalizeOrigin, cspHash, securityHeaders } from '../lib/security.js';

// Minimal stand-ins for Express's req/res, enough for the middleware under test.
function mockReq({ method = 'GET', path = '/api/x', headers = {}, ip = '203.0.113.7', user = null, protocol = 'https', secure = true } = {}) {
  const h = Object.fromEntries(Object.entries(headers).map(([k, v]) => [k.toLowerCase(), v]));
  return { method, path, ip, user, protocol, secure, headers: h, get: (n) => h[n.toLowerCase()], accepts: () => 'json' };
}
function mockRes() {
  const res = { statusCode: 200, headers: {}, body: undefined, ended: false };
  res.set = (k, v) => { if (typeof k === 'object') for (const [a, b] of Object.entries(k)) res.headers[a.toLowerCase()] = b; else res.headers[k.toLowerCase()] = v; return res; };
  res.vary = (f) => { res.headers.vary = res.headers.vary ? `${res.headers.vary}, ${f}` : f; return res; };
  res.status = (c) => { res.statusCode = c; return res; };
  res.json = (b) => { res.body = b; res.ended = true; return res; };
  res.type = () => res;
  res.send = (b) => { res.body = b; res.ended = true; return res; };
  res.end = () => { res.ended = true; return res; };
  return res;
}
/** Runs middleware once; resolves to { res, passed } where passed means next() was called. */
function run(mw, req) {
  const res = mockRes();
  let passed = false;
  mw(req, res, () => { passed = true; });
  return { res, passed };
}

/* ------------------------------------------------------------------ clientKey */

test('clientKey counts signed-in users by account and everyone else by IP', () => {
  assert.equal(clientKey(mockReq({ user: { id: 'abc' } })), 'u:abc');
  assert.equal(clientKey(mockReq({ ip: '198.51.100.4' })), 'ip:198.51.100.4');
  assert.equal(clientKey(mockReq({ ip: '::ffff:198.51.100.4' })), 'ip:198.51.100.4', 'IPv4-mapped addresses are plain IPv4');
});

test('clientKey groups IPv6 addresses by /64', () => {
  const a = clientKey(mockReq({ ip: '2001:db8:1:2:aaaa::1' }));
  const b = clientKey(mockReq({ ip: '2001:DB8:1:2:ffff:ffff:ffff:ffff' }));
  const c = clientKey(mockReq({ ip: '2001:db8:1:3::1' }));
  assert.equal(a, 'ip:2001:db8:1:2::/64');
  assert.equal(a, b, 'same /64, any case');
  assert.notEqual(a, c, 'neighbouring /64 is someone else');
  assert.equal(clientKey(mockReq({ ip: '::1' })), 'ip:0:0:0:0::/64');
});

/* ------------------------------------------------------------------ rateLimit */

test('rateLimit allows max requests per window, then answers 429 with Retry-After', () => {
  let t = 1_000_000;
  const lim = rateLimit({ name: 't', windowMs: 60_000, max: 3, now: () => t });
  const req = mockReq();
  const results = [1, 2, 3, 4].map(() => run(lim, req));
  assert.deepEqual(results.map((r) => r.passed), [true, true, true, false]);
  assert.deepEqual(results.map((r) => r.res.headers['ratelimit-remaining']), ['2', '1', '0', '0']);
  const blocked = results[3].res;
  assert.equal(blocked.statusCode, 429);
  assert.equal(blocked.headers['retry-after'], '60');
  assert.equal(blocked.headers['ratelimit-policy'], '3;w=60');
  assert.equal(blocked.body.limit, 't');
  assert.match(blocked.body.error, /Too many requests/);
});

test('rateLimit keeps visitors apart', () => {
  const lim = rateLimit({ name: 't', windowMs: 60_000, max: 1, now: () => 5 });
  assert.equal(run(lim, mockReq({ ip: '192.0.2.1' })).passed, true);
  assert.equal(run(lim, mockReq({ ip: '192.0.2.1' })).passed, false);
  assert.equal(run(lim, mockReq({ ip: '192.0.2.2' })).passed, true);
  assert.equal(run(lim, mockReq({ ip: '192.0.2.1', user: { id: 'u1' } })).passed, true, 'signing in gives a separate bucket');
});

test('rateLimit slides: the previous window still counts, fading out over the next one', () => {
  let t = 0;
  const lim = rateLimit({ name: 't', windowMs: 60_000, max: 10, now: () => t });
  const req = mockReq();
  for (let i = 0; i < 10; i++) assert.equal(run(lim, req).passed, true);
  assert.equal(run(lim, req).passed, false);
  t = 60_000; // new window, but the full previous window still weighs 100%
  assert.equal(run(lim, req).passed, false);
  t = 90_000; // halfway: 10 * 0.5 = 5 used, so 5 more fit
  const passes = Array.from({ length: 8 }, () => run(lim, req).passed).filter(Boolean).length;
  assert.equal(passes, 5);
  t = 240_000; // two idle windows later: a clean slate
  assert.equal(run(lim, req).res.headers['ratelimit-remaining'], '9');
});

test('rateLimit stays within maxKeys under a flood of new visitors', () => {
  const lim = rateLimit({ name: 't', windowMs: 60_000, max: 5, maxKeys: 100, now: () => 1 });
  for (let i = 0; i < 1000; i++) run(lim, mockReq({ ip: `10.0.${i >> 8}.${i & 255}` }));
  assert.equal(lim.size(), 100);
  lim.reset();
  assert.equal(lim.size(), 0);
});

test('rateLimit uses a custom message', () => {
  const lim = rateLimit({ name: 'auth', windowMs: 1000, max: 0, now: () => 1, message: 'Slow down.' });
  assert.equal(run(lim, mockReq()).res.body.error, 'Slow down.');
});

/* ------------------------------------------------------------------ CORS */

const self = 'https://mycomputerbuild.example';
const mw = cors({ selfOrigins: () => [self], allowed: ['https://Partner.example/'] });

test('cors: requests without an Origin pass untouched', () => {
  const { res, passed } = run(mw, mockReq({ method: 'POST' }));
  assert.equal(passed, true);
  assert.equal(res.headers['access-control-allow-origin'], undefined);
  assert.equal(res.headers.vary, 'Origin');
});

test('cors: our own origin gets credentials and exposed rate-limit headers', () => {
  const { res, passed } = run(mw, mockReq({ method: 'PUT', headers: { Origin: self } }));
  assert.equal(passed, true);
  assert.equal(res.headers['access-control-allow-origin'], self);
  assert.equal(res.headers['access-control-allow-credentials'], 'true');
  assert.match(res.headers['access-control-expose-headers'], /Retry-After/);
});

test('cors: preflight from an allowed origin is answered with 204', () => {
  const { res, passed } = run(mw, mockReq({ method: 'OPTIONS', headers: { Origin: 'https://partner.example', 'Access-Control-Request-Method': 'PUT' } }));
  assert.equal(passed, false);
  assert.equal(res.statusCode, 204);
  assert.equal(res.headers['access-control-allow-methods'], 'GET, POST, PUT, DELETE');
  assert.equal(res.headers['access-control-max-age'], '600');
});

test('cors: a foreign origin can load public GETs but cannot read them', () => {
  const { res, passed } = run(mw, mockReq({ method: 'GET', headers: { Origin: 'https://evil.example' } }));
  assert.equal(passed, true);
  assert.equal(res.headers['access-control-allow-origin'], undefined);
});

test('cors: a foreign origin cannot write (CSRF) or preflight', () => {
  for (const method of ['POST', 'PUT', 'DELETE', 'PATCH']) {
    const { res, passed } = run(mw, mockReq({ method, headers: { Origin: 'https://evil.example' } }));
    assert.equal(passed, false, method);
    assert.equal(res.statusCode, 403, method);
  }
  const pre = run(mw, mockReq({ method: 'OPTIONS', headers: { Origin: 'https://evil.example', 'Access-Control-Request-Method': 'DELETE' } }));
  assert.equal(pre.res.statusCode, 403);
});

test('cors: lookalike and opaque origins are foreign', () => {
  for (const origin of ['null', 'https://mycomputerbuild.example.evil.com', 'http://mycomputerbuild.example', 'https://mycomputerbuild.example:8443', 'not a url']) {
    const { res } = run(mw, mockReq({ method: 'POST', headers: { Origin: origin } }));
    assert.equal(res.statusCode, 403, origin);
  }
});

test('normalizeOrigin lowercases and drops paths; null and junk give null', () => {
  assert.equal(normalizeOrigin('HTTPS://Example.COM/path?q'), 'https://example.com');
  assert.equal(normalizeOrigin('https://example.com:443'), 'https://example.com');
  assert.equal(normalizeOrigin('null'), null);
  assert.equal(normalizeOrigin(''), null);
  assert.equal(normalizeOrigin('::nope'), null);
});

/* ------------------------------------------------------------------ headers */

test('cspHash is the base64 sha256 of the script text', () => {
  const code = 'console.log(1)';
  assert.equal(cspHash(code), `'sha256-${crypto.createHash('sha256').update(code).digest('base64')}'`);
});

test('securityHeaders sets a strict CSP with script hashes, and HSTS only over https', () => {
  const mwh = securityHeaders({ isHttps: (req) => req.secure, scriptHashes: ["'sha256-abc'"] });
  const https = run(mwh, mockReq({ secure: true }));
  const csp = https.res.headers['content-security-policy'];
  assert.match(csp, /script-src 'self' 'sha256-abc'/);
  assert.match(csp, /frame-ancestors 'none'/);
  assert.match(csp, /object-src 'none'/);
  assert.doesNotMatch(csp, /unsafe-eval/);
  assert.doesNotMatch(csp, /script-src[^;]*unsafe-inline/);
  assert.equal(https.res.headers['x-frame-options'], 'DENY');
  assert.ok(https.res.headers['strict-transport-security']);
  const http = run(mwh, mockReq({ secure: false }));
  assert.equal(http.res.headers['strict-transport-security'], undefined);
});
