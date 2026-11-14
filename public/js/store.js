// Browser persistence: saved builds + the in-progress build, all in localStorage.
// Every access is guarded: private mode or blocked storage must never break the app.
const KEY_BUILDS = 'mcb.builds.v1';
const KEY_CURRENT = 'mcb.current.v1';
const KEY_PREFS = 'mcb.prefs.v1';
const KEY_SHOP = 'mcb.shop.v1'; // ticked-off shopping list lines, per build

function read(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch { return fallback; }
}
function write(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); return true; } catch { return false; }
}

export const store = {
  available() {
    try { localStorage.setItem('mcb.t', '1'); localStorage.removeItem('mcb.t'); return true; } catch { return false; }
  },
  listBuilds() {
    const list = read(KEY_BUILDS, []);
    return Array.isArray(list) ? list.filter((b) => b && b.id && b.build) : [];
  },
  saveBuild({ id, name, build, summary }) {
    const list = this.listBuilds();
    const now = new Date().toISOString();
    const existing = id && list.find((b) => b.id === id);
    if (existing) Object.assign(existing, { name, build, summary, updatedAt: now });
    else list.unshift({ id: id || `b_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`, name, build, summary, createdAt: now, updatedAt: now });
    const ok = write(KEY_BUILDS, list);
    return ok ? (existing || list[0]) : null;
  },
  deleteBuild(id) {
    const list = this.listBuilds();
    const idx = list.findIndex((b) => b.id === id);
    if (idx < 0) return null;
    const [removed] = list.splice(idx, 1);
    write(KEY_BUILDS, list);
    return { removed, idx };
  },
  restoreBuild(entry, idx) {
    const list = this.listBuilds();
    list.splice(Math.min(idx, list.length), 0, entry);
    write(KEY_BUILDS, list);
  },
  loadCurrent() { return read(KEY_CURRENT, null); },
  saveCurrent(state) { write(KEY_CURRENT, state); },
  loadPrefs() { return read(KEY_PREFS, {}); },
  savePrefs(p) { write(KEY_PREFS, p); },
  loadBought(sig) {
    const all = read(KEY_SHOP, {});
    return new Set(Array.isArray(all?.[sig]) ? all[sig] : []);
  },
  saveBought(sig, set) {
    const all = read(KEY_SHOP, {}) || {};
    delete all[sig];
    if (set.size) all[sig] = [...set];
    const keys = Object.keys(all);
    while (keys.length > 30) delete all[keys.shift()]; // keep the 30 most recently touched builds
    write(KEY_SHOP, all);
  },
};

/* Share links: #b=<case>~<mb>~<cpu>~<cooler>~<ram>~<gpu>~<psu>~<storage,storage>&q=r2g2&n=<name>&shop=used&site=de
   q (memory kits / graphics cards) is left out when there's one of each, so older links still work.
   shop + site open the shopping list with that condition and eBay site. */
const ORDER = ['case', 'motherboard', 'cpu', 'cooler', 'ram', 'gpu', 'psu'];
export function encodeShare(build, name, extra = {}) {
  const parts = ORDER.map((k) => build[k] || '');
  parts.push((build.storage || []).join(','));
  const p = new URLSearchParams();
  p.set('b', parts.join('~'));
  const r = build.ram ? build.qty?.ram || 1 : 1;
  const g = build.gpu ? build.qty?.gpu || 1 : 1;
  if (r > 1 || g > 1) p.set('q', `r${r}g${g}`);
  if (name) p.set('n', name);
  for (const [k, v] of Object.entries(extra)) if (v) p.set(k, v);
  return `#${p.toString()}`;
}
export function decodeShare(hash) {
  if (!hash || hash.length < 3) return null;
  const p = new URLSearchParams(hash.replace(/^#/, ''));
  const raw = p.get('b');
  if (!raw) return null;
  const bits = raw.split('~');
  const build = {};
  ORDER.forEach((k, i) => { build[k] = bits[i] || null; });
  build.storage = bits[7] ? bits[7].split(',').filter(Boolean) : [];
  const q = /^r(\d)g(\d)$/.exec(p.get('q') || '');
  build.qty = { ram: q ? Number(q[1]) : 1, gpu: q ? Number(q[2]) : 1 };
  return { build, name: p.get('n') || '', shop: p.get('shop') || null, site: p.get('site') || null };
}
