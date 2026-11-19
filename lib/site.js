// Site identity and public settings, read once from the environment (.env).
// Anything left empty falls back to something safe for local development.

const clean = (v) => (typeof v === 'string' ? v.trim() : '');

export function siteConfig(env = process.env) {
  const url = clean(env.SITE_URL).replace(/\/+$/, '');
  const creatorUrl = clean(env.CREATOR_URL);
  let creatorLabel = clean(env.CREATOR_NAME);
  if (!creatorLabel && creatorUrl) {
    try { creatorLabel = new URL(creatorUrl).hostname.replace(/^www\./, ''); } catch { /* not a URL */ }
  }
  return {
    name: 'My Computer Build',
    shortName: 'MyComputerBuild',
    tagline: 'Plan your PC in 3D',
    description: 'Build a PC part by part in 3D. Live compatibility checks, new and used price estimates, power draw and FPS estimates for popular games, for current and older hardware.',
    // Public origin, e.g. https://mycomputerbuild.com. Used for canonical links, the sitemap and Google sign-in.
    url: url || null,
    creator: { name: creatorLabel || null, url: creatorUrl || null },
    contactEmail: clean(env.CONTACT_EMAIL) || null,
    operator: clean(env.OPERATOR_NAME) || creatorLabel || null,
    country: clean(env.OPERATOR_COUNTRY) || 'the Czech Republic',
    lang: 'en',
    themeColor: { light: '#ffffff', dark: '#0b0c0f' },
  };
}

/** The origin to put in absolute links: SITE_URL when set, otherwise the request's own origin (local development). */
export function originFor(site, req) {
  if (site.url) return site.url;
  return `${req.protocol}://${req.get('host')}`;
}
