// The page shell shared by every server-rendered page: <head> with SEO and social tags,
// the nav bar, the footer and the icon sprite.
import { cspHash } from '../security.js';
import { esc, jsonForScript } from './html.js';
import { SPRITE, MARK, icon, GOOGLE_G } from './icons.js';

// The only inline scripts on the site. The CSP allows them by hash, so pages stay cacheable.
export const THEME_INIT = "try{var t=localStorage.getItem('mcb.theme');if(t==='light'||t==='dark')document.documentElement.dataset.theme=t}catch(e){}";
export const IMPORT_MAP = JSON.stringify({ imports: { three: '/vendor/three/build/three.module.js', 'three/addons/': '/vendor/three/examples/jsm/' } });
export const INLINE_SCRIPT_HASHES = [cspHash(THEME_INIT), cspHash(IMPORT_MAP)];

const NAV = [
  { href: '/build', label: 'Builder' },
  { href: '/parts', label: 'Parts' },
  { href: '/builds', label: 'Example builds' },
  { href: '/about', label: 'About' },
];

/**
 * @param {object} ctx   per-request context: { site, origin, path, user, authEnabled, v }
 * @param {object} o
 * @param {string} o.title        page title without the site name (home passes fullTitle)
 * @param {string} o.description  meta description, 50–160 characters
 * @param {string} o.body         the page's <main> content
 */
export function renderPage(ctx, o) {
  const { site, origin } = ctx;
  const path = o.canonicalPath ?? ctx.path;
  const canonical = `${origin}${path === '/' ? '/' : path}`;
  const fullTitle = o.fullTitle || `${o.title} · ${site.name}`;
  const ogImage = `${origin}${o.ogImage || '/og/default.png'}`;
  const ogAlt = o.ogAlt || `${site.name}: ${site.tagline}`;
  const jsonLd = (Array.isArray(o.jsonLd) ? o.jsonLd : o.jsonLd ? [o.jsonLd] : [])
    .map((d) => `<script type="application/ld+json">${jsonForScript(d)}</script>`).join('\n');
  const v = ctx.v ? `?v=${ctx.v}` : '';
  return `<!doctype html>
<html lang="${site.lang}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>${esc(fullTitle)}</title>
<meta name="description" content="${esc(o.description)}">
<link rel="canonical" href="${esc(canonical)}">
<meta name="robots" content="${o.noindex ? 'noindex, follow' : 'index, follow, max-image-preview:large, max-snippet:-1'}">
<meta name="color-scheme" content="light dark">
<meta name="theme-color" content="${site.themeColor.light}" media="(prefers-color-scheme: light)">
<meta name="theme-color" content="${site.themeColor.dark}" media="(prefers-color-scheme: dark)">
<meta property="og:type" content="${o.ogType || 'website'}">
<meta property="og:site_name" content="${esc(site.name)}">
<meta property="og:title" content="${esc(o.ogTitle || o.title || fullTitle)}">
<meta property="og:description" content="${esc(o.description)}">
<meta property="og:url" content="${esc(canonical)}">
<meta property="og:image" content="${esc(ogImage)}">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta property="og:image:alt" content="${esc(ogAlt)}">
<meta property="og:locale" content="en_US">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${esc(o.ogTitle || o.title || fullTitle)}">
<meta name="twitter:description" content="${esc(o.description)}">
<meta name="twitter:image" content="${esc(ogImage)}">
${site.creator.name ? `<meta name="author" content="${esc(site.creator.name)}">\n` : ''}<meta name="application-name" content="${esc(site.name)}">
<meta name="apple-mobile-web-app-title" content="${esc(site.shortName)}">
<link rel="icon" href="/favicon.ico" sizes="32x32">
<link rel="icon" href="/favicon.svg" type="image/svg+xml">
<link rel="apple-touch-icon" href="/apple-touch-icon.png">
<link rel="manifest" href="/site.webmanifest">
<link rel="preload" href="/fonts/Geist-Variable.woff2" as="font" type="font/woff2" crossorigin>
<link rel="stylesheet" href="/css/site.css${v}">
${(o.styles || []).map((s) => `<link rel="stylesheet" href="${s}${v}">`).join('\n')}
<script>${THEME_INIT}</script>
${o.importMap ? `<script type="importmap">${IMPORT_MAP}</script>\n` : ''}${o.head || ''}
${jsonLd}
</head>
<body class="${esc(o.bodyClass || '')}">
${SPRITE}
<a class="skip" href="#main">Skip to content</a>
${nav(ctx, o)}
<main id="main"${o.mainClass ? ` class="${esc(o.mainClass)}"` : ''}>
${o.body}
</main>
${footer(ctx, o)}
${o.afterFooter || ''}
<div class="toasts" id="toasts" aria-live="polite"></div>
${(o.scripts || ['/js/site.js']).map((s) => `<script type="module" src="${s}"></script>`).join('\n')}
</body>
</html>`;
}

function nav(ctx, o) {
  const here = (href) => ctx.path === href || (href !== '/' && ctx.path.startsWith(`${href}/`));
  const links = NAV.map((l) => `<a href="${l.href}"${here(l.href) ? ' aria-current="page"' : ''}>${esc(l.label)}</a>`).join('');
  return `<header class="nav${o.navClass ? ` ${o.navClass}` : ''}" id="nav">
  <div class="nav-inner">
    <a class="brand" href="/" aria-label="${esc(ctx.site.name)} home">${MARK}<span class="brand-name">${esc(ctx.site.name)}</span></a>
    <nav class="nav-links" id="nav-links" aria-label="Main">${links}</nav>
    <div class="nav-end">
      <button class="icon-btn theme-toggle" type="button" data-theme-toggle aria-label="Switch colour theme" title="Switch colour theme">${icon('sun', 'when-dark')}${icon('moon', 'when-light')}</button>
      ${account(ctx)}
      ${o.hideCta ? '' : `<a class="btn primary sm nav-cta" href="/build">Open builder</a>`}
      <button class="icon-btn nav-menu" type="button" aria-expanded="false" aria-controls="nav-links" aria-label="Menu">${icon('menu')}</button>
    </div>
  </div>
</header>`;
}

/** Signed in: an avatar button with a menu. Signed out: a Google sign-in button (when it's configured). */
function account(ctx) {
  const next = encodeURIComponent(ctx.path || '/');
  if (ctx.user) {
    const u = ctx.user;
    const avatar = u.picture
      ? `<img src="${esc(u.picture)}" alt="" width="28" height="28" referrerpolicy="no-referrer">`
      : `<span class="avatar-initial">${esc((u.name || '?').slice(0, 1).toUpperCase())}</span>`;
    return `<div class="account" data-account data-signed-in>
      <button class="avatar-btn" type="button" aria-haspopup="menu" aria-expanded="false" aria-controls="account-menu" title="Your account">${avatar}<span class="sr-only">Account menu for ${esc(u.name)}</span></button>
      <div class="menu" id="account-menu" role="menu" hidden>
        <p class="menu-head">Signed in as <b>${esc(u.name)}</b><small>with Google</small></p>
        <a role="menuitem" href="/build?builds=1">${icon('folder')}My builds</a>
        <button role="menuitem" type="button" data-signout>${icon('logout')}Sign out</button>
        <hr>
        <button role="menuitem" type="button" class="danger" data-delete-account>${icon('trash')}Delete my saved data</button>
      </div>
    </div>`;
  }
  if (!ctx.authEnabled) return '';
  return `<div class="account" data-account><a class="btn line sm signin" href="/auth/google?next=${next}" data-signin rel="nofollow">${GOOGLE_G}<span class="signin-long">Sign in with Google</span></a></div>`;
}

function footer(ctx, o) {
  const { site } = ctx;
  const year = new Date().getUTCFullYear();
  const credit = site.creator.url
    ? `<p class="credit">Designed and built by <a href="${esc(site.creator.url)}" rel="author">${esc(site.creator.name || site.creator.url)}</a></p>`
    : site.creator.name ? `<p class="credit">Designed and built by ${esc(site.creator.name)}</p>` : '';
  return `<footer class="footer${o.footerClass ? ` ${o.footerClass}` : ''}">
  <div class="footer-inner">
    <div class="footer-brand">
      <a class="brand" href="/">${MARK}<span class="brand-name">${esc(site.name)}</span></a>
      <p>Plan a PC part by part in 3D, with compatibility checks and new and used price, power and FPS estimates. Free, and no account needed.</p>
    </div>
    <nav class="footer-cols" aria-label="Footer">
      <div><h2>Build</h2><a href="/build">3D PC builder</a><a href="/builds">Example builds</a><a href="/parts">Parts catalog</a></div>
      <div><h2>Parts</h2><a href="/parts/graphics-cards">Graphics cards</a><a href="/parts/cpus">Processors</a><a href="/parts/motherboards">Motherboards</a><a href="/parts/power-supplies">Power supplies</a></div>
      <div><h2>Site</h2><a href="/about">About</a><a href="/about#faq">FAQ</a><a href="/privacy">Privacy</a><a href="/cookies">Cookies</a><a href="/terms">Terms</a></div>
    </nav>
  </div>
  <div class="footer-base">
    <p>© ${year} ${esc(site.name)}. Prices, power and FPS are estimates. Check before you buy.</p>
    ${credit}
  </div>
</footer>`;
}

/** Breadcrumb trail: visible links plus BreadcrumbList structured data. */
export function breadcrumbs(ctx, trail) {
  const items = [{ name: 'Home', path: '/' }, ...trail];
  const html = `<nav class="crumbs" aria-label="Breadcrumb"><ol>${items.map((c, i) => i === items.length - 1
    ? `<li aria-current="page">${esc(c.name)}</li>`
    : `<li><a href="${esc(c.path)}">${esc(c.name)}</a></li>`).join('')}</ol></nav>`;
  const ld = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: items.map((c, i) => ({ '@type': 'ListItem', position: i + 1, name: c.name, item: `${ctx.origin}${c.path}` })),
  };
  return { html, ld };
}
