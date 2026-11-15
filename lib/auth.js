// "Sign in with Google" (OpenID Connect, authorization code flow with PKCE) and a
// signed session cookie. No extra dependencies: Node's crypto and fetch only.
//
// Privacy by design: we ask Google only for "openid profile" (no email address) and keep
// just the account id, first name and profile picture in the cookie.
import crypto from 'node:crypto';

const GOOGLE_AUTH = 'https://accounts.google.com/o/oauth2/v2/auth';
const GOOGLE_TOKEN = 'https://oauth2.googleapis.com/token';
const ISSUERS = new Set(['https://accounts.google.com', 'accounts.google.com']);
const SESSION_COOKIE = 'mcb_session';
const FLOW_COOKIE = 'mcb_oauth';
const SESSION_DAYS = 30;

const b64url = (buf) => Buffer.from(buf).toString('base64url');

/* ------------------------------------------------------------------ signed cookies */

export function createSigner(secret) {
  const key = crypto.createHash('sha256').update(String(secret)).digest();
  const mac = (data) => crypto.createHmac('sha256', key).update(data).digest('base64url');
  return {
    sign(obj) {
      const data = b64url(JSON.stringify(obj));
      return `${data}.${mac(data)}`;
    },
    verify(token, now = Date.now()) {
      if (typeof token !== 'string' || token.length > 4096) return null;
      const [data, sig] = token.split('.');
      if (!data || !sig) return null;
      const want = Buffer.from(mac(data));
      const got = Buffer.from(sig);
      if (want.length !== got.length || !crypto.timingSafeEqual(want, got)) return null;
      try {
        const obj = JSON.parse(Buffer.from(data, 'base64url').toString('utf8'));
        if (!obj || typeof obj !== 'object' || (obj.exp && obj.exp * 1000 < now)) return null;
        return obj;
      } catch { return null; }
    },
  };
}

export function parseCookies(header = '') {
  const out = {};
  for (const part of header.split(';')) {
    const i = part.indexOf('=');
    if (i < 0) continue;
    const k = part.slice(0, i).trim();
    if (!k || k in out) continue;
    try { out[k] = decodeURIComponent(part.slice(i + 1).trim()); } catch { /* malformed: skip */ }
  }
  return out;
}

/** Only same-site relative paths, so ?next= can't bounce people to another site. */
export function safeNext(next) {
  if (typeof next !== 'string' || !next.startsWith('/') || next.startsWith('//') || next.startsWith('/\\') || next.length > 512) return '/';
  if (/[\u0000-\u001f]/.test(next)) return '/';
  return next;
}

/* ------------------------------------------------------------------ the auth module */

/**
 * @param {object} o
 * @param {string} o.clientId / o.clientSecret  Google OAuth client (Web application)
 * @param {string} o.secret      SESSION_SECRET, signs cookies
 * @param {(req) => string} o.origin  public origin, for the redirect URI
 * @param {(req) => boolean} o.isHttps
 */
export function createAuth({ clientId, clientSecret, secret, origin, isHttps, fetch = globalThis.fetch, log = console, now = Date.now }) {
  const enabled = Boolean(clientId && clientSecret);
  if (enabled && !secret) log.warn('[auth] SESSION_SECRET is not set: sign-ins will be lost whenever the server restarts.');
  const signer = createSigner(secret || crypto.randomBytes(32).toString('hex'));

  const cookieOpts = (req, extra = {}) => ({ httpOnly: true, sameSite: 'lax', secure: isHttps(req), path: '/', ...extra });
  const redirectUri = (req) => `${origin(req)}/auth/google/callback`;

  /** Reads the session cookie; sets req.user = { id, sub, name, picture } or null. */
  function attachUser(req, res, next) {
    const s = signer.verify(parseCookies(req.headers.cookie)[SESSION_COOKIE], now());
    req.user = s?.sub ? { id: userId(s.sub), sub: s.sub, name: s.name || 'You', picture: s.picture || null } : null;
    next();
  }

  /** Stable, non-reversible id for storage paths and API responses. */
  function userId(sub) {
    return crypto.createHash('sha256').update(`google:${sub}`).digest('hex').slice(0, 32);
  }

  function start(req, res) {
    if (!enabled) return res.status(404).type('text').send('Google sign-in is not configured on this server.');
    const state = b64url(crypto.randomBytes(16));
    const nonce = b64url(crypto.randomBytes(16));
    const verifier = b64url(crypto.randomBytes(32));
    const challenge = b64url(crypto.createHash('sha256').update(verifier).digest());
    const exp = Math.floor(now() / 1000) + 600;
    res.cookie(FLOW_COOKIE, signer.sign({ state, nonce, verifier, next: safeNext(req.query.next), exp }), cookieOpts(req, { path: '/auth', maxAge: 600_000 }));
    const q = new URLSearchParams({
      client_id: clientId,
      redirect_uri: redirectUri(req),
      response_type: 'code',
      scope: 'openid profile',
      state,
      nonce,
      code_challenge: challenge,
      code_challenge_method: 'S256',
      prompt: 'select_account',
    });
    res.set('Cache-Control', 'no-store').redirect(302, `${GOOGLE_AUTH}?${q}`);
  }

  async function callback(req, res) {
    res.set('Cache-Control', 'no-store');
    const flow = signer.verify(parseCookies(req.headers.cookie)[FLOW_COOKIE], now());
    res.clearCookie(FLOW_COOKIE, cookieOpts(req, { path: '/auth' }));
    const back = (status) => res.redirect(302, `${flow?.next || '/'}${(flow?.next || '/').includes('?') ? '&' : '?'}signin=${status}`);
    if (!enabled) return res.status(404).type('text').send('Google sign-in is not configured on this server.');
    if (req.query.error) return back(req.query.error === 'access_denied' ? 'cancelled' : 'failed');
    const state = String(req.query.state || '');
    if (!flow || !state || state.length !== flow.state.length || !crypto.timingSafeEqual(Buffer.from(state), Buffer.from(flow.state))) {
      return back('expired');
    }
    try {
      const r = await fetch(GOOGLE_TOKEN, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          code: String(req.query.code || ''),
          client_id: clientId,
          client_secret: clientSecret,
          redirect_uri: redirectUri(req),
          grant_type: 'authorization_code',
          code_verifier: flow.verifier,
        }),
      });
      const tok = await r.json().catch(() => ({}));
      if (!r.ok || !tok.id_token) throw new Error(`token endpoint ${r.status} ${tok.error || ''}`);
      // The ID token came straight from Google's token endpoint over TLS, so per OpenID
      // Connect Core 3.1.3.7 TLS stands in for the signature check; the claims still must match.
      const claims = decodeJwt(tok.id_token);
      const t = Math.floor(now() / 1000);
      if (!ISSUERS.has(claims.iss)) throw new Error('issuer');
      if (claims.aud !== clientId && !(Array.isArray(claims.aud) && claims.aud.includes(clientId))) throw new Error('audience');
      if (!claims.exp || claims.exp < t - 60) throw new Error('expired');
      if (claims.nonce !== flow.nonce) throw new Error('nonce');
      if (!claims.sub) throw new Error('subject');
      const session = {
        sub: String(claims.sub),
        name: String(claims.given_name || claims.name || '').slice(0, 60),
        picture: /^https:\/\/lh\d\.googleusercontent\.com\//.test(claims.picture || '') ? claims.picture : null,
        iat: t,
        exp: t + SESSION_DAYS * 86400,
      };
      res.cookie(SESSION_COOKIE, signer.sign(session), cookieOpts(req, { maxAge: SESSION_DAYS * 86400_000 }));
      return back('ok');
    } catch (err) {
      log.warn(`[auth] Google sign-in failed: ${err.message}`);
      return back('failed');
    }
  }

  function logout(req, res) {
    res.clearCookie(SESSION_COOKIE, cookieOpts(req));
    res.set('Cache-Control', 'no-store').status(204).end();
  }

  function clear(req, res) { res.clearCookie(SESSION_COOKIE, cookieOpts(req)); }

  return { enabled, attachUser, start, callback, logout, clear, userId, signer };
}

function decodeJwt(jwt) {
  const part = String(jwt).split('.')[1];
  if (!part) throw new Error('malformed id_token');
  return JSON.parse(Buffer.from(part, 'base64url').toString('utf8'));
}
