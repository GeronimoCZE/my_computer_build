// Search and AI-crawler plumbing: sitemap.xml, robots.txt, llms.txt, the web app manifest
// and the site-wide structured data.
import { SLOTS } from '../../shared/engine.js';
import { PRESETS } from '../../shared/presets.js';
import { CATEGORY, partPath, partTitle } from '../../shared/format.js';
import { esc, monthName } from './html.js';

export const STATIC_PAGES = [
  { path: '/', priority: 1.0, changefreq: 'weekly' },
  { path: '/build', priority: 0.9, changefreq: 'weekly' },
  { path: '/parts', priority: 0.8, changefreq: 'weekly' },
  { path: '/builds', priority: 0.8, changefreq: 'monthly' },
  { path: '/about', priority: 0.6, changefreq: 'monthly' },
  { path: '/privacy', priority: 0.2, changefreq: 'yearly' },
  { path: '/cookies', priority: 0.2, changefreq: 'yearly' },
  { path: '/terms', priority: 0.2, changefreq: 'yearly' },
];

/** Every indexable URL with its last-modified date. Built from the live catalog, so new parts appear on their own. */
export function sitemapEntries({ catalog, lastmod }) {
  const urls = STATIC_PAGES.map((p) => ({ ...p, lastmod: lastmod.site }));
  for (const s of SLOTS) urls.push({ path: `/parts/${CATEGORY[s.key].slug}`, priority: 0.7, changefreq: 'weekly', lastmod: lastmod.catalog });
  for (const p of PRESETS) urls.push({ path: `/builds/${p.slug}`, priority: 0.7, changefreq: 'monthly', lastmod: lastmod.catalog });
  for (const s of SLOTS) {
    for (const p of catalog.parts[s.key]) urls.push({ path: partPath(p), priority: 0.5, changefreq: 'monthly', lastmod: lastmod.catalog });
  }
  return urls;
}

export function sitemapXml(origin, entries) {
  const day = (d) => new Date(d).toISOString().slice(0, 10);
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${entries.map((u) => `  <url><loc>${esc(origin + u.path)}</loc><lastmod>${day(u.lastmod)}</lastmod><changefreq>${u.changefreq}</changefreq><priority>${u.priority.toFixed(1)}</priority></url>`).join('\n')}
</urlset>
`;
}

/** Open to search engines and to AI assistants (answers that cite the site are traffic too); API and sign-in stay out. */
export function robotsTxt(origin) {
  return `# ${origin}
User-agent: *
Allow: /
Disallow: /api/
Disallow: /auth/

# AI search and assistant crawlers are welcome: the parts and build pages are written to be quoted.
User-agent: GPTBot
User-agent: OAI-SearchBot
User-agent: ChatGPT-User
User-agent: ClaudeBot
User-agent: Claude-SearchBot
User-agent: Claude-User
User-agent: PerplexityBot
User-agent: Google-Extended
User-agent: Applebot-Extended
Allow: /
Disallow: /api/
Disallow: /auth/

Sitemap: ${origin}/sitemap.xml
`;
}

/** llms.txt (llmstxt.org): a plain-language map of the site for language models. */
export function llmsTxt({ origin, site, catalog }) {
  const counts = catalog.meta.counts;
  const total = Object.values(counts).reduce((a, b) => a + b, 0);
  const years = Object.values(catalog.byId).map((p) => p.released);
  const live = catalog.meta.livePrices?.enabled?.length;
  return `# ${site.name}

> ${site.name} is a free 3D PC builder at ${origin}. You pick parts one at a time and see them go into a 3D case, while the site checks compatibility and estimates the price (new and used), power draw and FPS in ${catalog.games.length} popular games. The catalog has ${total} parts released from ${Math.min(...years)} to ${Math.max(...years)}, so it also covers older and used hardware.

Key facts:
- Free to use, no account needed. Builds save in the browser; signing in with Google keeps them across devices.
- Compatibility checks: CPU socket and chipset support, memory type and slots, board, case and power supply form factors, graphics card length, cooler height and radiator mounts, M.2 slots, SATA ports, drive bays, PCIe slot spacing for several graphics cards, and power supply headroom.
- Prices are in USD (with EUR and CZK at fixed rates). ${live ? 'Some are live (new from Best Buy, used from eBay asking prices); the rest are' : 'They are'} hand-compiled street-price estimates as of ${monthName(catalog.meta.pricesAsOf)}, not quotes.
- FPS figures come from a model that scales per-game reference results by each part's performance index, with a soft CPU/GPU bottleneck. Treat them as ±15% or wider.
- Power estimates add typical gaming and peak draw; the recommended power supply adds 30% headroom.
- Each build can become a shopping list with eBay searches for every part (used, new or any condition).

## Main pages
- [3D PC builder](${origin}/build): the interactive builder
- [Example builds](${origin}/builds): complete, checked builds from budget 1080p to a 4K RTX 5090 rig, plus used 2014 and 2017 builds
- [Parts catalog](${origin}/parts): every part with specs, price estimates and what it works with
- [About and methodology](${origin}/about): how the estimates work, FAQ, who makes the site

## Example builds
${PRESETS.map((p) => `- [${p.title}](${origin}/builds/${p.slug}): ${p.summary}`).join('\n')}

## Parts by category
${SLOTS.map((s) => `- [${CATEGORY[s.key].many}](${origin}/parts/${CATEGORY[s.key].slug}): ${counts[s.key]} parts`).join('\n')}

## Optional
- [Privacy policy](${origin}/privacy)
- [Terms of service](${origin}/terms)
- Public JSON API: GET ${origin}/api/catalog (all parts with prices), POST ${origin}/api/evaluate with {"build": {...}, "resolution": "1440p"} (rate limited)
- Popular parts: ${['gpu', 'cpu'].flatMap((k) => catalog.parts[k].slice(0, 4)).map((p) => `[${partTitle(p)}](${origin}${partPath(p)})`).join(', ')}
`;
}

export function webManifest(site) {
  return {
    name: site.name,
    short_name: site.shortName,
    description: site.description,
    start_url: '/build',
    scope: '/',
    display: 'standalone',
    background_color: site.themeColor.dark,
    theme_color: site.themeColor.dark,
    icons: [
      { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
      { src: '/icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  };
}

/** WebSite + Organization (+ the creator, when known), on the home page. */
export function siteJsonLd({ origin, site }) {
  const org = {
    '@type': 'Organization',
    '@id': `${origin}/#organization`,
    name: site.name,
    url: `${origin}/`,
    logo: { '@type': 'ImageObject', url: `${origin}/icons/icon-512.png`, width: 512, height: 512 },
  };
  if (site.creator.url) org.founder = { '@type': 'Person', name: site.creator.name || site.creator.url, url: site.creator.url };
  if (site.contactEmail) org.email = site.contactEmail;
  return [
    {
      '@context': 'https://schema.org',
      '@type': 'WebSite',
      '@id': `${origin}/#website`,
      name: site.name,
      alternateName: 'MyComputerBuild',
      url: `${origin}/`,
      description: site.description,
      inLanguage: 'en',
      publisher: { '@id': `${origin}/#organization` },
    },
    { '@context': 'https://schema.org', ...org },
  ];
}

/** The builder itself, as a free web application. */
export function appJsonLd({ origin, site, catalog }) {
  const total = Object.values(catalog.meta.counts).reduce((a, b) => a + b, 0);
  return {
    '@context': 'https://schema.org',
    '@type': 'WebApplication',
    '@id': `${origin}/build#app`,
    name: `${site.name} 3D PC builder`,
    url: `${origin}/build`,
    applicationCategory: 'UtilitiesApplication',
    operatingSystem: 'Any (runs in a web browser with WebGL)',
    browserRequirements: 'Requires JavaScript. The 3D view needs WebGL.',
    isAccessibleForFree: true,
    offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' },
    description: `Build a PC in 3D from ${total} parts. Live compatibility checks, new and used price estimates, power draw and FPS estimates for ${catalog.games.length} games.`,
    featureList: [
      'Interactive 3D case that fills as you add parts',
      'Compatibility checks for sockets, memory, form factors, clearances, slots and power',
      'New and used price estimates in USD, EUR and CZK',
      'Power draw and recommended power supply',
      `Estimated FPS in ${catalog.games.map((g) => g.name).join(', ')}`,
      'Shopping list with eBay searches for every part',
      'Shareable build links, and builds saved to your Google account',
    ],
    screenshot: `${origin}/og/builder.png`,
    publisher: { '@id': `${origin}/#organization` },
  };
}

export function faqJsonLd(faqs) {
  return {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: faqs.map((f) => ({ '@type': 'Question', name: f.q, acceptedAnswer: { '@type': 'Answer', text: f.text || f.a.replace(/<[^>]+>/g, '') } })),
  };
}
