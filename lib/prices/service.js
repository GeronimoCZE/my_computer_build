// Live price layer. Providers fetch prices on a schedule, results are cached on disk,
// and each part's price falls back to the seeded estimate when no fresh live price exists.
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { createBestBuy } from './bestbuy.js';
import { createEbay } from './ebay.js';

const HOUR = 3600_000;

export async function loadSources(file) {
  try { return JSON.parse(await readFile(file, 'utf8')); } catch { return { ebayCategories: {}, parts: {} }; }
}

export function providersFromEnv(env, { fetch, sources }) {
  const list = [];
  if (env.BESTBUY_API_KEY) list.push(createBestBuy({ apiKey: env.BESTBUY_API_KEY, fetch, sources: sources.parts || {}, ...(env.BESTBUY_API_BASE ? { base: env.BESTBUY_API_BASE } : {}) }));
  if (env.EBAY_CLIENT_ID && env.EBAY_CLIENT_SECRET) {
    list.push(createEbay({
      clientId: env.EBAY_CLIENT_ID, clientSecret: env.EBAY_CLIENT_SECRET, fetch,
      env: env.EBAY_ENV || 'production', marketplace: env.EBAY_MARKETPLACE || 'EBAY_US',
      categories: sources.ebayCategories || {}, sources: sources.parts || {}, host: env.EBAY_API_HOST || undefined,
    }));
  }
  return list;
}

/**
 * @param catalog  result of loadCatalog(); part.price is rewritten in place
 * @param providers  [{ id, label, field: 'new'|'used', fetchPrices(parts, {onError}) }]
 */
export function createPriceService({ catalog, providers, cacheFile, ttlHours = 6, maxAgeHours = 24, plausible = [0.4, 2.5], now = () => Date.now(), log = console, onUpdate = () => {} }) {
  const parts = Object.values(catalog.byId);
  for (const p of parts) p.price.estimate ??= { new: p.price.new, used: p.price.used, asOf: p.price.asOf };
  let cache = { entries: {}, runs: {} };
  let timer = null;
  let running = null;

  function apply() {
    const cutoff = now() - maxAgeHours * HOUR;
    let liveNew = 0; let liveUsed = 0;
    for (const p of parts) {
      const e = cache.entries[p.id] || {};
      const est = p.price.estimate;
      const ln = e.new && e.new.fetchedAt >= cutoff ? e.new : null;
      const lu = e.used && e.used.fetchedAt >= cutoff ? e.used : null;
      if (ln) liveNew++;
      if (lu) liveUsed++;
      p.price = {
        new: ln ? ln.price : est.new,
        used: lu ? lu.price : est.used,
        asOf: est.asOf,
        source: ln || lu ? 'mixed' : 'estimate',
        estimate: est,
        live: ln || lu ? { new: ln, used: lu } : null,
      };
    }
    catalog.meta.livePrices = {
      enabled: providers.map((p) => ({ id: p.id, label: p.label, field: p.field, lastRun: cache.runs[p.id] || null })),
      liveNew, liveUsed, total: parts.length,
    };
    onUpdate();
  }

  async function loadCache() {
    try { cache = JSON.parse(await readFile(cacheFile, 'utf8')); cache.entries ||= {}; cache.runs ||= {}; } catch { /* first run */ }
  }
  async function saveCache() {
    await mkdir(path.dirname(cacheFile), { recursive: true });
    await writeFile(cacheFile, JSON.stringify(cache));
  }

  async function refresh(providerIds = null) {
    if (running) return running;
    running = (async () => {
      for (const prov of providers) {
        if (providerIds && !providerIds.includes(prov.id)) continue;
        const started = now();
        const errors = [];
        let results = {};
        try {
          results = await prov.fetchPrices(parts, { onError: (part, err) => errors.push(`${part.id}: ${err.message}`) });
        } catch (err) { errors.push(err.message); }
        let matched = 0;
        let rejected = 0;
        for (const [id, found] of Object.entries(results)) {
          cache.entries[id] ||= {};
          // A price far from the estimate is usually a mismatched listing (an empty box, another
          // model), so it is ignored. Widen plausibleRange in data/price-sources.json if a market moves.
          const est = catalog.byId[id]?.price.estimate?.[prov.field];
          let live = found;
          if (found && est && (found.price < est * plausible[0] || found.price > est * plausible[1])) {
            rejected++;
            errors.push(`${id}: ${prov.label} $${found.price} vs estimate $${est}, ignored`);
            live = null;
          }
          if (live) { cache.entries[id][prov.field] = { ...live, fetchedAt: started }; matched++; }
          else if (cache.entries[id][prov.field]?.source === prov.id) delete cache.entries[id][prov.field];
        }
        cache.runs[prov.id] = { at: started, ms: now() - started, matched, rejected, checked: Object.keys(results).length, errors: errors.length, sampleErrors: errors.slice(0, 5) };
        log.info?.(`[prices] ${prov.label}: ${matched}/${parts.length} matched, ${errors.length} errors`);
        if (errors.length) log.warn?.(`[prices] ${prov.label} errors: ${errors.slice(0, 3).join(' | ')}`);
      }
      await saveCache().catch((e) => log.warn?.(`[prices] cache not saved: ${e.message}`));
      apply();
    })().finally(() => { running = null; });
    return running;
  }

  async function start() {
    await loadCache();
    apply();
    if (!providers.length) return;
    const stale = providers.some((p) => !cache.runs[p.id] || now() - cache.runs[p.id].at > ttlHours * HOUR);
    if (stale) refresh().catch((e) => log.warn?.(`[prices] refresh failed: ${e.message}`));
    timer = setInterval(() => refresh().catch(() => {}), ttlHours * HOUR);
    timer.unref?.();
  }

  function stop() { if (timer) clearInterval(timer); }

  function status() {
    return { ttlHours, maxAgeHours, refreshing: !!running, ...catalog.meta.livePrices };
  }

  return { start, stop, refresh, status, apply };
}
