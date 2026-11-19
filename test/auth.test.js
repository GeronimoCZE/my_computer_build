import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { createSigner, parseCookies, safeNext, createAuth } from '../lib/auth.js';

/* ------------------------------------------------------------------ helpers */

test('signer: round-trips, rejects tampering, other keys and expired tokens', () => {
  const s = createSigner('secret-1');
  const tok = s.sign({ sub: '42', exp: 2_000_000_000 });
  assert.deepEqual(s.verify(tok, 1_000_000_000_000), { sub: '42', exp: 2_000_000_000 });
  assert.equal(createSigner('secret-2').verify(tok), null, 'other secret');
  const [data, sig] = tok.split('.');
  const forged = Buffer.from(JSON.stringify({ sub: '1', exp: 2_000_000_000 })).toString('base64url');
  assert.equal(s.verify(`${forged}.${sig}`), null, 'payload swapped');
  assert.equal(s.verify(`${data}.${sig.slice(0, -2)}xx`), null, 'signature changed');
  assert.equal(s.verify(s.sign({ sub: '42', exp: 100 }), 200_000), null, 'expired');
  for (const junk of [undefined, '', 'abc', '.', 'a.b.c', 'x'.repeat(5000), 42]) assert.equal(s.verify(junk), null, String(junk).slice(0, 10));
});

test('parseCookies: first value wins, bad encodings are skipped', () => {
  assert.deepEqual(parseCookies('a=1; b=hello%20world; a=2; c=%E0%A4%A; =x; d'), { a: '1', b: 'hello world' });
  assert.deepEqual(parseCookies(), {});
});

test('safeNext only allows same-site paths', () => {
  assert.equal(safeNext('/build?builds=1#b=abc'), '/build?builds=1#b=abc');
  for (const bad of ['https://evil.example', '//evil.example', '/\\evil.example', 'javascript:alert(1)', 'build', '', null, undefined, ['/'], `/${'a'.repeat(600)}`, '/ok\r\nSet-Cookie: x=1']) {
    assert.equal(safeNext(bad), '/', String(bad).slice(0, 20));
  }
});

/* ------------------------------------------------------------------ the sign-in flow, end to end */

const CLIENT_ID = 'client-123.apps.googleusercontent.com';
let tokenReply = null; // what the fake Google token endpoint answers next
let tokenRequest = null;
const fakeFetch = async (url, init) => {
  tokenRequest = { url, body: new URLSearchParams(String(init.body)) };
  const { status = 200, body } = tokenReply();
  return { ok: status < 400, status, json: async () => body };
};
const jwt = (claims) => ['e30', Buffer.from(JSON.stringify(claims)).toString('base64url'), 'sig'].join('.');
const quiet = { warn() {} };

function appWith(authOpts) {
  const auth = createAuth({
    clientId: CLIENT_ID, clientSecret: 'shh', secret: 'session-secret', origin: () => 'https://mcb.example',
    isHttps: () => false, fetch: fakeFetch, log: quiet, ...authOpts,
  });
  const app = express();
  app.use(auth.attachUser);
  app.get('/auth/google', auth.start);
  app.get('/auth/google/callback', auth.callback);
  app.post('/auth/logout', auth.logout);
  app.get('/whoami', (req, res) => res.json(req.user));
  return new Promise((resolve) => {
    const server = app.listen(0, '127.0.0.1', () => resolve({ base: `http://127.0.0.1:${server.address().port}`, server, auth }));
  });
}
const servers = [];
after(() => servers.forEach((s) => s.close()));

const cookieOf = (res, name) => res.headers.getSetCookie().find((c) => c.startsWith(`${name}=`));
const valueOf = (setCookie) => setCookie.split(';')[0];

async function beginSignIn(base, next = '/build?builds=1') {
  const res = await fetch(`${base}/auth/google?next=${encodeURIComponent(next)}`, { redirect: 'manual' });
  assert.equal(res.status, 302);
  const to = new URL(res.headers.get('location'));
  return { to, flow: cookieOf(res, 'mcb_oauth') };
}
const finish = (base, flow, query) => fetch(`${base}/auth/google/callback?${new URLSearchParams(query)}`, { redirect: 'manual', headers: flow ? { cookie: valueOf(flow) } : {} });

test('start: sends people to Google with PKCE, state and nonce, asking for no email', async () => {
  const { base, server } = await appWith();
  servers.push(server);
  const { to, flow } = await beginSignIn(base);
  assert.equal(to.origin + to.pathname, 'https://accounts.google.com/o/oauth2/v2/auth');
  assert.equal(to.searchParams.get('client_id'), CLIENT_ID);
  assert.equal(to.searchParams.get('redirect_uri'), 'https://mcb.example/auth/google/callback');
  assert.equal(to.searchParams.get('scope'), 'openid profile');
  assert.equal(to.searchParams.get('code_challenge_method'), 'S256');
  assert.ok(to.searchParams.get('state') && to.searchParams.get('nonce') && to.searchParams.get('code_challenge'));
  assert.match(flow, /Path=\/auth/);
  assert.match(flow, /HttpOnly/);
  assert.match(flow, /SameSite=Lax/);
});

test('callback: a valid code signs the visitor in and returns them where they were', async () => {
  const { base, server, auth } = await appWith();
  servers.push(server);
  const { to, flow } = await beginSignIn(base);
  tokenReply = () => ({ body: { id_token: jwt({ iss: 'https://accounts.google.com', aud: CLIENT_ID, sub: '1098', given_name: 'Ada', picture: 'https://lh3.googleusercontent.com/a/x', nonce: to.searchParams.get('nonce'), exp: Math.floor(Date.now() / 1000) + 3600 }) } });
  const res = await finish(base, flow, { state: to.searchParams.get('state'), code: 'the-code' });
  assert.equal(res.status, 302);
  assert.equal(res.headers.get('location'), '/build?builds=1&signin=ok');
  assert.equal(tokenRequest.url, 'https://oauth2.googleapis.com/token');
  assert.equal(tokenRequest.body.get('code'), 'the-code');
  assert.ok(tokenRequest.body.get('code_verifier'), 'PKCE verifier sent');
  const session = cookieOf(res, 'mcb_session');
  assert.match(session, /HttpOnly/);
  assert.match(session, /Max-Age=2592000/);
  assert.match(cookieOf(res, 'mcb_oauth'), /Expires=Thu, 01 Jan 1970/, 'flow cookie cleared');

  const me = await (await fetch(`${base}/whoami`, { headers: { cookie: valueOf(session) } })).json();
  assert.equal(me.name, 'Ada');
  assert.equal(me.sub, '1098');
  assert.equal(me.id, auth.userId('1098'));
  assert.match(me.id, /^[a-f0-9]{32}$/);
  assert.equal(me.picture, 'https://lh3.googleusercontent.com/a/x');

  const out = await fetch(`${base}/auth/logout`, { method: 'POST', headers: { cookie: valueOf(session) } });
  assert.equal(out.status, 204);
  assert.match(cookieOf(out, 'mcb_session'), /Expires=Thu, 01 Jan 1970/);
});

test('callback: wrong nonce, audience, issuer or an expired token fail safely', async () => {
  const { base, server } = await appWith();
  servers.push(server);
  const cases = {
    nonce: (n) => ({ nonce: `${n}x` }),
    audience: () => ({ aud: 'someone-else' }),
    issuer: () => ({ iss: 'https://evil.example' }),
    expired: () => ({ exp: Math.floor(Date.now() / 1000) - 3600 }),
    subject: () => ({ sub: '' }),
  };
  for (const [name, patch] of Object.entries(cases)) {
    const { to, flow } = await beginSignIn(base, '/');
    const nonce = to.searchParams.get('nonce');
    tokenReply = () => ({ body: { id_token: jwt({ iss: 'accounts.google.com', aud: [CLIENT_ID], sub: '7', nonce, exp: Math.floor(Date.now() / 1000) + 600, ...patch(nonce) }) } });
    const res = await finish(base, flow, { state: to.searchParams.get('state'), code: 'c' });
    assert.equal(res.headers.get('location'), '/?signin=failed', name);
    assert.equal(cookieOf(res, 'mcb_session'), undefined, name);
  }
  // Google refusing the code
  const { to, flow } = await beginSignIn(base, '/');
  tokenReply = () => ({ status: 400, body: { error: 'invalid_grant' } });
  const res = await finish(base, flow, { state: to.searchParams.get('state'), code: 'c' });
  assert.equal(res.headers.get('location'), '/?signin=failed');
});

test('callback: a missing or mismatched state is treated as an expired sign-in (CSRF)', async () => {
  const { base, server } = await appWith();
  servers.push(server);
  const { to, flow } = await beginSignIn(base, '/parts');
  const state = to.searchParams.get('state');
  const tampered = `${state.slice(0, -1)}${state.endsWith('A') ? 'B' : 'A'}`;
  const bad = await finish(base, flow, { state: tampered, code: 'c' });
  assert.equal(bad.headers.get('location'), '/parts?signin=expired');
  const noCookie = await finish(base, null, { state: to.searchParams.get('state'), code: 'c' });
  assert.equal(noCookie.headers.get('location'), '/?signin=expired');
});

test('callback: pressing Cancel at Google comes back as "cancelled"', async () => {
  const { base, server } = await appWith();
  servers.push(server);
  const { flow } = await beginSignIn(base, '/about');
  const res = await finish(base, flow, { error: 'access_denied' });
  assert.equal(res.headers.get('location'), '/about?signin=cancelled');
});

test('without Google credentials sign-in is off and cookies are ignored', async () => {
  const { base, server, auth } = await appWith({ clientId: '', clientSecret: '' });
  servers.push(server);
  assert.equal(auth.enabled, false);
  assert.equal((await fetch(`${base}/auth/google`, { redirect: 'manual' })).status, 404);
  const forged = createSigner('wrong').sign({ sub: '1', exp: 2_000_000_000 });
  assert.equal(await (await fetch(`${base}/whoami`, { headers: { cookie: `mcb_session=${forged}` } })).json(), null);
});
