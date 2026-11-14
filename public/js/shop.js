// Shopping list: one line per part (drives and stacked kits/cards carry a quantity), each with an
// eBay search link. Pure functions, no DOM, so the server tests can import them too.

export const EBAY_SITES = {
  us: { label: 'eBay.com', region: 'US', host: 'www.ebay.com', categories: true },
  de: { label: 'eBay.de', region: 'EU', host: 'www.ebay.de' },
  uk: { label: 'eBay.co.uk', region: 'UK', host: 'www.ebay.co.uk' },
};

// eBay condition ids: 1000 new, 3000 used
export const CONDITIONS = {
  used: { label: 'Used', ebay: '3000' },
  new: { label: 'New', ebay: '1000' },
  any: { label: 'Any', ebay: null },
};

/** Lines in slot order. Identical drives share a line; memory kits and graphics cards use the build's quantity. */
export function shopLines(parts, slots) {
  const lines = [];
  for (const s of slots) {
    if (s.multi) {
      const seen = new Map();
      for (const d of parts[s.key] || []) {
        if (seen.has(d.id)) seen.get(d.id).qty++;
        else { const l = { key: `${s.key}:${d.id}`, slot: s.key, code: s.code, label: s.label, part: d, qty: 1 }; seen.set(d.id, l); lines.push(l); }
      }
    } else if (parts[s.key]) {
      const p = parts[s.key];
      lines.push({ key: `${s.key}:${p.id}`, slot: s.key, code: s.code, label: s.label, part: p, qty: parts.qty?.[s.key] || 1 });
    }
  }
  return lines;
}

/**
 * The price to aim for, per unit, in USD. `basis` says which estimate it is;
 * `note` explains a fallback (a part no longer sold new is priced used).
 */
export function targetPrice(part, cond) {
  const n = part.price?.new ?? null;
  const u = part.price?.used ?? null;
  if (cond === 'new') return n != null ? { value: n, basis: 'new' } : { value: u, basis: 'used', note: 'not sold new' };
  if (cond === 'used') return u != null ? { value: u, basis: 'used' } : { value: n, basis: 'new', note: 'new only' };
  if (n != null && u != null) return u <= n ? { value: u, basis: 'used' } : { value: n, basis: 'new' };
  return n != null ? { value: n, basis: 'new' } : { value: u, basis: 'used' };
}

/** eBay search for one line: Buy It Now, the chosen condition, US categories only on eBay.com. */
export function ebayUrl(part, cond, siteKey) {
  const site = EBAY_SITES[siteKey] || EBAY_SITES.us;
  const p = new URLSearchParams({ _nkw: part.shop?.q || `${part.brand} ${part.name}` });
  if (site.categories && part.shop?.cat) p.set('_sacat', String(part.shop.cat));
  if (CONDITIONS[cond]?.ebay) p.set('LH_ItemCondition', CONDITIONS[cond].ebay);
  p.set('LH_BIN', '1');
  return `https://${site.host}/sch/i.html?${p}`;
}

export function listTotals(lines, cond, bought = new Set()) {
  let total = 0; let got = 0; let missing = 0;
  for (const l of lines) {
    const t = targetPrice(l.part, cond);
    if (t.value == null) { missing++; continue; }
    total += t.value * l.qty;
    if (bought.has(l.key)) got += t.value * l.qty;
  }
  const boughtCount = lines.filter((l) => bought.has(l.key)).length;
  return { total, bought: got, left: total - got, count: lines.length, boughtCount, missing };
}

/** Plain text for pasting into a chat or a note. `money` formats a USD amount in the viewer's currency. */
export function toText(lines, { name, cond, site, money, link, asOf, bought = new Set() }) {
  const s = EBAY_SITES[site] || EBAY_SITES.us;
  const out = [`${name} · shopping list`, `${CONDITIONS[cond].label} parts on ${s.label} · prices are estimates${asOf ? ` (${asOf})` : ''}`, ''];
  for (const l of lines) {
    const t = targetPrice(l.part, cond);
    const qty = l.qty > 1 ? `${l.qty}× ` : '';
    const mark = bought.has(l.key) ? '[x]' : '[ ]';
    out.push(`${mark} ${l.code} ${l.label}: ${qty}${l.part.brand} ${l.part.name} · ~${money(t.value == null ? null : t.value * l.qty)}${t.note ? ` (${t.note})` : ''}`);
    out.push(`    ${ebayUrl(l.part, cond, site)}`);
  }
  const tot = listTotals(lines, cond, bought);
  out.push('', `Total: ~${money(tot.total)}`);
  if (link) out.push(`Build: ${link}`);
  return out.join('\n');
}

const cell = (v) => {
  const s = String(v ?? '');
  return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

/** CSV with a BOM so Excel reads the × and currency signs. Amounts are in the viewer's currency. */
export function toCsv(lines, { cond, site, currency, rate = 1, bought = new Set() }) {
  const round = (v) => (v == null ? '' : currency === 'CZK' ? Math.round((v * rate) / 10) * 10 : Math.round(v * rate));
  const rows = [['Slot', 'Part type', 'Qty', 'Brand', 'Part', 'Condition', `Unit price (${currency})`, `Line total (${currency})`, 'Price note', 'eBay search', 'eBay link', 'Bought']];
  for (const l of lines) {
    const t = targetPrice(l.part, cond);
    rows.push([
      l.code, l.label, l.qty, l.part.brand, l.part.name, t.basis || '',
      round(t.value), round(t.value == null ? null : t.value * l.qty), t.note || 'estimate',
      l.part.shop?.q || '', ebayUrl(l.part, cond, site), bought.has(l.key) ? 'yes' : '',
    ]);
  }
  const tot = listTotals(lines, cond, bought);
  rows.push(['', 'Total', '', '', '', '', '', round(tot.total), '', '', '', '']);
  return `﻿${rows.map((r) => r.map(cell).join(',')).join('\r\n')}\r\n`;
}
