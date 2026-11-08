// eBay Browse API: live used prices from active Buy It Now listings.
// Docs: https://developer.ebay.com/api-docs/buy/browse/overview.html
// Needs EBAY_CLIENT_ID + EBAY_CLIENT_SECRET (production use of the Buy APIs requires
// approval from eBay). eBay's API licence limits how listing data may be used: we
// show the typical asking price with a link to the listings and keep it < 6 h old.
import { marketQuery, matchRule, titleMatches, robustMedian } from './match.js';

const HOSTS = { production: 'https://api.ebay.com', sandbox: 'https://api.sandbox.ebay.com' };

export function createEbay({ clientId, clientSecret, fetch, env = 'production', marketplace = 'EBAY_US', categories = {}, sources = {}, delayMs = 150, minListings = 3, host: hostOverride }) {
  const host = hostOverride || HOSTS[env] || HOSTS.production;
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  let token = null;

  async function getToken() {
    if (token && token.expires > Date.now()) return token.value;
    const res = await fetch(`${host}/identity/v1/oauth2/token`, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString('base64')}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: 'grant_type=client_credentials&scope=' + encodeURIComponent('https://api.ebay.com/oauth/api_scope'),
    });
    if (!res.ok) throw new Error(`eBay OAuth HTTP ${res.status}`);
    const body = await res.json();
    token = { value: body.access_token, expires: Date.now() + (body.expires_in - 120) * 1000 };
    return token.value;
  }

  async function search(q, categoryId) {
    const params = new URLSearchParams({
      q,
      limit: '50',
      filter: 'conditions:{USED},buyingOptions:{FIXED_PRICE},priceCurrency:USD',
    });
    if (categoryId) params.set('category_ids', String(categoryId));
    const res = await fetch(`${host}/buy/browse/v1/item_summary/search?${params}`, {
      headers: { Authorization: `Bearer ${await getToken()}`, 'X-EBAY-C-MARKETPLACE-ID': marketplace },
    });
    if (res.status === 401) { token = null; throw new Error('eBay token rejected'); }
    if (!res.ok) throw new Error(`eBay HTTP ${res.status}`);
    const body = await res.json();
    return body.itemSummaries || [];
  }

  const webSearchUrl = (q, categoryId) => `https://www.ebay.com/sch/i.html?${new URLSearchParams({ _nkw: q, LH_ItemCondition: '3000', LH_BIN: '1', ...(categoryId ? { _sacat: String(categoryId) } : {}) })}`;

  async function fetchPrices(parts, { onError } = {}) {
    const out = {};
    for (const p of parts) {
      const cfg = sources[p.id]?.ebay;
      if (cfg === false) continue;
      const query = cfg?.query || marketQuery(p);
      const rule = matchRule(p, query);
      const categoryId = cfg?.categoryId ?? categories[p.category];
      try {
        const items = await search(query, categoryId);
        const prices = items
          .filter((it) => it.price?.currency === 'USD')
          .filter((it) => titleMatches(it.title, rule, { used: true, exclude: cfg?.exclude || [] }))
          .map((it) => Number(it.price.value));
        const median = robustMedian(prices);
        out[p.id] = prices.length >= minListings && median
          ? { price: Math.round(median), low: Math.round(Math.min(...prices)), count: prices.length, url: webSearchUrl(query, categoryId), source: 'ebay' }
          : null;
      } catch (e) { onError?.(p, e); }
      await sleep(delayMs);
    }
    return out;
  }

  return { id: 'ebay', label: 'eBay', field: 'used', fetchPrices };
}
