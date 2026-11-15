// Request hardening: per-visitor rate limits, a CORS allowlist that doubles as CSRF
// protection for cookie-authenticated calls, and security headers (inline scripts allowed by hash).
import crypto from 'node:crypto';
import net from 'node:net';

/* ------------------------------------------------------------------ client identity */

/**
 * Who is calling, for rate limiting. Signed-in users are counted by account, everyone
 * else by IP. IPv6 addresses are grouped by /64, since one household or server usually
 * owns a whole /64 and could otherwise rotate through it to dodge the limit.
 */
export function clientKey(req) {
  if (req.user?.id) return `u:${req.user.id}`;
  let ip = req.ip || req.socket?.remoteAddress || 'unknown';
  if (ip.startsWith('::ffff:')) ip = ip.slice(7); // IPv4 mapped into IPv6
  if (net.isIPv6(ip)) ip = `${expandV6(ip).slice(0, 4).join(':')}::/64`;
  return `ip:${ip}`;
}

function expandV6(ip) {
  const [head, tail = ''] = ip.split('::');
  const h = head ? head.split(':') : [];
  const t = tail ? tail.split(':') : [];
  const fill = Array(Math.max(0, 8 - h.length - t.length)).fill('0');
  return [...h, ...fill, ...t].map((x) => x.toLowerCase());
}

/* ------------------------------------------------------------------ rate limiting */

/**
 * Sliding-window rate limiter kept in memory (one process, see ecosystem.config.cjs).
 * Weighted two-window counter: cheap, and no burst of 2x at window edges.
 * Sends RateLimit-* headers on every response and Retry-After on 429.
 */
export function rateLimit({ name, windowMs, max, key = clientKey, maxKeys = 50_000, now = Date.now, message } = {}) {
  const hits = new Map(); // key -> { start, count, prev }
  const sweep = setInterval(() => {
    const t = now();
    for (const [k, v] of hits) if (t - v.start > windowMs * 2) hits.delete(k);
  }, Math.min(windowMs, 60_000));
  sweep.unref?.();

  const limiter = (req, res, next) => {
    const t = now();
    const k = key(req);
    let e = hits.get(k);
    if (!e) {
      if (hits.size >= maxKeys) hits.delete(hits.keys().next().value); // oldest first: bounded memory under a flood
      e = { start: t, count: 0, prev: 0 };
      hits.set(k, e);
    }
    const elapsed = t - e.start;
    if (elapsed >= windowMs) {
      e.prev = elapsed >= windowMs * 2 ? 0 : e.count;
      e.start = t - (elapsed % windowMs);
      e.count = 0;
    }
    const weight = 1 - (t - e.start) / windowMs;
    const used = e.prev * weight + e.count;
    const reset = Math.max(1, Math.ceil((e.start + windowMs - t) / 1000));
    res.set('RateLimit-Policy', `${max};w=${Math.round(windowMs / 1000)}`);
    if (used + 1 > max) {
      const remaining = 0;
      res.set({ 'RateLimit-Limit': String(max), 'RateLimit-Remaining': String(remaining), 'RateLimit-Reset': String(reset), 'Retry-After': String(reset) });
      const text = message || 'Too many requests. Please wait a moment and try again.';
      if (req.path.startsWith('/api') || req.accepts(['json', 'html']) === 'json') return res.status(429).json({ error: text, retryAfter: reset, limit: name });
      return res.status(429).type('text').send(text);
    }
    e.count++;
    res.set({ 'RateLimit-Limit': String(max), 'RateLimit-Remaining': String(Math.max(0, Math.floor(max - used - 1))), 'RateLimit-Reset': String(reset) });
    next();
  };
  limiter.reset = () => hits.clear();
  limiter.size = () => hits.size;
  return limiter;
}

/* ------------------------------------------------------------------ CORS + CSRF */

const SAFE = new Set(['GET', 'HEAD', 'OPTIONS']);

/**
 * Same-origin by default. Extra origins (another front end, a staging site) go in
 * CORS_ORIGINS. Edge cases handled:
 *  - no Origin header (same-origin GET, curl, server-to-server): allowed, no CORS headers
 *  - Origin "null" (sandboxed iframes, file://): treated as foreign
 *  - foreign origin + safe method: served without CORS headers, so the browser blocks reading it
 *  - foreign origin + unsafe method, or a preflight from one: 403, which also stops CSRF
 *    against the signed-in endpoints even in browsers that ignore SameSite cookies
 */
export function cors({ selfOrigins, allowed = [] }) {
  const allow = new Set(allowed.map(normalizeOrigin).filter(Boolean));
  return (req, res, next) => {
    res.vary('Origin');
    const origin = req.get('origin');
    if (!origin) return next();
    const o = normalizeOrigin(origin);
    const ok = Boolean(o) && (allow.has(o) || selfOrigins(req).some((s) => normalizeOrigin(s) === o));
    const preflight = req.method === 'OPTIONS' && req.get('access-control-request-method');
    if (!ok) {
      if (preflight || !SAFE.has(req.method)) return res.status(403).json({ error: 'Cross-origin request blocked.' });
      return next();
    }
    res.set({
      'Access-Control-Allow-Origin': origin,
      'Access-Control-Allow-Credentials': 'true',
      'Access-Control-Expose-Headers': 'RateLimit-Limit, RateLimit-Remaining, RateLimit-Reset, Retry-After',
    });
    if (preflight) {
      res.set({
        'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Max-Age': '600',
      });
      return res.status(204).end();
    }
    next();
  };
}

export function normalizeOrigin(o) {
  if (!o || o === 'null') return null;
  try { return new URL(o).origin.toLowerCase(); } catch { return null; }
}

/* ------------------------------------------------------------------ headers */

/** sha256 source for an inline <script>, for the CSP. Pages stay cacheable (no per-request nonce). */
export const cspHash = (code) => `'sha256-${crypto.createHash('sha256').update(code).digest('base64')}'`;

/** Security headers for every response. Inline scripts are allowed only by hash. */
export function securityHeaders({ isHttps, scriptHashes = [] }) {
  const csp = [
    "default-src 'self'",
    ["script-src 'self'", ...scriptHashes].join(' '),
    "style-src 'self' 'unsafe-inline'", // the builder sets bar widths inline
    "img-src 'self' data: blob: https://*.googleusercontent.com", // Google profile pictures
    "font-src 'self'",
    "connect-src 'self'",
    "manifest-src 'self'",
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "object-src 'none'",
  ].join('; ');
  return (req, res, next) => {
    res.set({
      'Content-Security-Policy': csp,
      'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'strict-origin-when-cross-origin',
      'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), payment=(), usb=()',
      'Cross-Origin-Opener-Policy': 'same-origin',
      'X-Frame-Options': 'DENY',
    });
    if (isHttps(req)) res.set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
    next();
  };
}
