// Best Buy Products API: live new prices (US).
// Docs: https://bestbuyapis.github.io/api-documentation/
// Needs BESTBUY_API_KEY. Parts can be pinned to exact SKUs in data/price-sources.json;
// otherwise we keyword-search and keep only listings whose titles match the part.
import { marketQuery, matchRule, titleMatches, normalize } from './match.js';

const BASE = 'https://api.bestbuy.com/v1/products';
const SHOW = 'sku,name,salePrice,regularPrice,onSale,url,onlineAvailability,manufacturer';

export function createBestBuy({ apiKey, fetch, sources = {}, delayMs = 260, base = BASE }) {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  async function call(selector) {
    const url = `${base}(${selector})?apiKey=${encodeURIComponent(apiKey)}&format=json&pageSize=25&show=${SHOW}`;
    for (let attempt = 0; attempt < 3; attempt++) {
      const res = await fetch(url);
      if (res.status === 429 || res.status === 403) { await sleep(1200 * (attempt + 1)); continue; }
      if (!res.ok) throw new Error(`Best Buy HTTP ${res.status}`);
      const body = await res.json();
      return body.products || [];
    }
    throw new Error('Best Buy rate limit or key rejected (HTTP 403/429)');
  }

  function toLive(p, matchedBy) {
    return {
      price: Math.round(p.salePrice),
      regular: p.regularPrice != null ? Math.round(p.regularPrice) : null,
      onSale: !!p.onSale,
      title: p.name,
      sku: p.sku,
      url: p.url,
      source: 'bestbuy',
      matchedBy,
    };
  }

  /** Returns { [partId]: live | null } */
  async function fetchPrices(parts, { onError } = {}) {
    const out = {};
    // 1) pinned SKUs, batched
    const pinned = parts.filter((p) => sources[p.id]?.bestbuy?.sku);
    for (let i = 0; i < pinned.length; i += 50) {
      const batch = pinned.slice(i, i + 50);
      try {
        const items = await call(`sku in(${batch.map((p) => Number(sources[p.id].bestbuy.sku)).join(',')})`);
        for (const p of batch) {
          const hit = items.find((it) => String(it.sku) === String(sources[p.id].bestbuy.sku));
          out[p.id] = hit && hit.salePrice ? toLive(hit, 'sku') : null;
        }
      } catch (e) { for (const p of batch) onError?.(p, e); }
      await sleep(delayMs);
    }
    // 2) keyword search for the rest
    for (const p of parts) {
      if (out[p.id] !== undefined || sources[p.id]?.bestbuy === false) continue;
      const cfg = sources[p.id]?.bestbuy || {};
      const query = cfg.query || marketQuery(p);
      const rule = matchRule(p, query);
      // search on the distinctive tokens only; titles are checked against the full rule afterwards
      const terms = (rule.required.length ? rule.required : normalize(query).split(' ')).filter(Boolean).slice(0, 6);
      try {
        const items = await call(terms.map((t) => `search=${encodeURIComponent(t)}`).join('&'));
        const hits = items
          .filter((it) => it.salePrice && it.onlineAvailability !== false)
          .filter((it) => titleMatches(it.name, rule, { exclude: cfg.exclude || [] }))
          .sort((a, b) => a.salePrice - b.salePrice);
        out[p.id] = hits.length ? toLive(hits[0], 'search') : null;
      } catch (e) { onError?.(p, e); }
      await sleep(delayMs);
    }
    return out;
  }

  return { id: 'bestbuy', label: 'Best Buy', field: 'new', fetchPrices };
}
