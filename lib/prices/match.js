// Turning a catalog part into a store search query, and deciding whether a
// store listing title is really that part (and not the Ti, the XT, a box, a bundle...).

const VARIANTS = ['ti', 'super', 'xt', 'xtx', 'gre', 'x3d'];
const STOP = ['black', 'white', 'edition', 'rgb', 'gaming', 'wifi', 'mesh', 'airflow', 'flow', 'gold', 'sfx', 'rpm', 'max', 'the', 'and'];
const JUNK = [
  'broken', 'for parts', 'parts only', 'repair', 'faulty', 'defective', 'not working', 'untested',
  'box only', 'empty box', 'no gpu', 'backplate', 'bracket only', 'fan only', 'fans only', 'shroud',
  'replacement fan', 'heatsink only', 'cooler only', 'lot of', 'bundle', 'combo', 'laptop', 'read description',
  'waterblock', 'water block', 'pc build', 'gaming pc', 'desktop pc', 'computer tower',
];

export function normalize(s) {
  return String(s || '')
    .toLowerCase()
    .replace(/[™®©]/g, '')
    .replace(/×/g, 'x')
    .replace(/\b(\d{1,2})\s*x\s*(\d{1,3})\s*gb\b/g, '$1x$2gb') // "2 x 16 GB" -> "2x16gb"
    .replace(/(\d)\s*(gb|tb)\b/g, '$1$2') // "16 GB" -> "16gb"
    .replace(/\b(\d{1,2})\s*g\b/g, '$1gb') // "16G" (VRAM) -> "16gb", but leave "8700G" alone
    .replace(/\./g, '')
    .replace(/[^a-z0-9+]+/g, ' ')
    .trim();
}

const tokens = (s) => normalize(s).split(' ').filter(Boolean);

/** Search text for a part. GPUs search by chip (any brand's RTX 5070 Ti), everything else by brand + model. */
export function marketQuery(part) {
  const clean = part.name
    .replace(/\(.*?\)/g, ' ')
    .replace(/founders edition|limited edition|reference/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (part.category === 'gpu') {
    const m = part.name.match(/\b(RTX|GTX|RX|Arc)\s*(Vega\s*\d{2}|[A-Z]?\d{3,4})\s*(Ti|Super|XTX|XT|GRE)?\b/i);
    if (m) {
      const vram = /\d+\s?G(B)?\b/i.test(part.name) ? `${part.vramGB}GB` : '';
      return [m[1], m[2], m[3], vram].filter(Boolean).join(' ');
    }
  }
  if (part.category === 'cpu') return clean;
  if (part.category === 'ram') {
    const series = clean.replace(/\b\d+GB\b.*$/i, '').trim();
    return `${part.brand} ${series} ${part.capacityGB}GB ${part.type} ${part.speed}`;
  }
  return `${part.brand} ${clean}`;
}

/**
 * Search text for a shopping-list link on the eBay website. Same as marketQuery, plus the
 * CPU brand, and minus words that keep the faster sibling out ("GTX 1080 -Ti", "RX 9070 -XT").
 */
export function shopQuery(part, override) {
  if (override) return override;
  let q = marketQuery(part);
  if (part.category === 'cpu' && !q.toLowerCase().startsWith(part.brand.toLowerCase())) q = `${part.brand} ${q}`;
  if (part.category === 'gpu') {
    const has = (w) => new RegExp(`\\b${w}\\b`, 'i').test(q);
    const [ti, sup, xt, xtx] = ['Ti', 'Super', 'XT', 'XTX'].map(has);
    if (/\b(RTX|GTX)\b/i.test(q)) q += `${ti ? '' : ' -Ti'}${ti || sup ? '' : ' -Super'}`;
    else if (/\bRX\b/i.test(q)) q += xtx ? '' : xt ? ' -XTX' : ' -XT';
  }
  return q;
}

/** Tokens a listing must contain, plus the part's variant suffixes. */
export function matchRule(part, query = marketQuery(part)) {
  const q = tokens(query);
  const brand = normalize(part.brand);
  const brandWords = brand.split(' ');
  const needBrand = part.category !== 'gpu' && part.category !== 'cpu';
  let required = q.filter((t) => /\d/.test(t));
  // Branded parts also need their product-line words ("Peerless Assassin 120", "ROG Strix X870E")
  const words = q.filter((t) => !/\d/.test(t) && t.length >= 3 && !brandWords.includes(t) && !STOP.includes(t));
  if (needBrand || !required.length) required.push(...words.slice(0, 2));
  const variants = q.filter((t) => VARIANTS.includes(t));
  required = [...new Set([...required, ...variants])];
  return { required, variants, brand: needBrand ? brand : null };
}

export function titleMatches(title, rule, { used = false, exclude = [] } = {}) {
  const t = normalize(title);
  const set = new Set(t.split(' '));
  if (!rule.required.every((tok) => set.has(tok))) return false;
  for (const v of VARIANTS) if (!rule.variants.includes(v) && set.has(v)) return false;
  if (rule.brand && !t.includes(rule.brand)) return false;
  for (const w of exclude) if (t.includes(normalize(w))) return false;
  if (used) for (const w of JUNK) if (t.includes(w)) return false;
  return true;
}

/** Median of the middle 70% of prices, to ignore outliers. */
export function robustMedian(values) {
  const v = values.filter((x) => Number.isFinite(x) && x > 0).sort((a, b) => a - b);
  if (!v.length) return null;
  const cut = Math.floor(v.length * 0.15);
  const mid = v.slice(cut, v.length - cut || undefined);
  const m = Math.floor(mid.length / 2);
  return mid.length % 2 ? mid[m] : (mid[m - 1] + mid[m]) / 2;
}
