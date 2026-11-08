import { SLOTS, MAX_STORAGE, STACKABLE, emptyBuild, normalizeBuild, evaluate, candidateIssues, canAddMore, withPart, qtyOf, memoryOf, gpuSlotsOf } from '/shared/engine.js';
import { store, encodeShare, decodeShare } from './store.js';

const $ = (s, el = document) => el.querySelector(s);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const icon = (id) => `<svg aria-hidden="true"><use href="#i-${id}"/></svg>`;
const SLOT = Object.fromEntries(SLOTS.map((s) => [s.key, s]));
const LEVEL_ICON = { error: 'stop', warn: 'alert', info: 'info' };
const KWH = { USD: 0.17, EUR: 0.3, CZK: 6.0 };
const ADD_LABEL = { case: 'Add a case', motherboard: 'Add a motherboard', cpu: 'Add a processor', cooler: 'Add a CPU cooler', ram: 'Add memory', gpu: 'Add a graphics card', storage: 'Add a drive', psu: 'Add a power supply' };
const PICK_TITLE = { case: 'Choose a case', motherboard: 'Choose a motherboard', cpu: 'Choose a processor', cooler: 'Choose a CPU cooler', ram: 'Choose memory', gpu: 'Choose a graphics card', storage: 'Choose a drive', psu: 'Choose a power supply' };

const UNIT = { ram: ['kit', 'kits'], gpu: ['card', 'cards'], storage: ['drive', 'drives'] };
const plural = (n, [one, many]) => `${n} ${n === 1 ? one : many}`;

const PRESETS = [
  { name: 'Budget 1080p', tag: '≈ $900 · Arc B580', build: { case: 'case-nzxt-h5-flow', motherboard: 'mb-asus-b550-plus', cpu: 'cpu-r5-5600', cooler: null, ram: 'ram-corsair-lpx-16-3200', gpu: 'gpu-arc-b580-le', psu: 'psu-bequiet-pp12m-650', storage: ['ssd-crucial-p3plus-1tb'] } },
  { name: '1440p sweet spot', tag: '≈ $2.0k · RX 9070 XT', build: { case: 'case-jonsbo-d31', motherboard: 'mb-gb-b650m-elite', cpu: 'cpu-r7-7800x3d', cooler: 'cool-thermalright-pa120se', ram: 'ram-gskill-z5neo-32-6000', gpu: 'gpu-rx9070xt-pulse', psu: 'psu-seasonic-gx750', storage: ['ssd-wd-sn850x-1tb'] } },
  { name: '4K flagship', tag: '≈ $5.6k · RTX 5090', build: { case: 'case-lianli-o11-evo', motherboard: 'mb-asus-x870e-e', cpu: 'cpu-r7-9800x3d', cooler: 'cool-arctic-lf3-360', ram: 'ram-corsair-veng-64-6000', gpu: 'gpu-rtx5090-fe', psu: 'psu-seasonic-tx1600', storage: ['ssd-crucial-t705-2tb', 'ssd-samsung-990pro-2tb'] } },
  { name: 'Dual-GPU workstation', tag: '≈ $5.1k · 2× RTX 5080', build: { case: 'case-fractal-north', motherboard: 'mb-asus-x870e-e', cpu: 'cpu-r9-9950x', cooler: 'cool-arctic-lf3-360', ram: 'ram-crucial-pro-32-5600', gpu: 'gpu-rtx5080-fe', psu: 'psu-seasonic-tx1600', storage: ['ssd-samsung-990pro-2tb', 'ssd-samsung-990pro-2tb', 'hdd-wd-blue-4tb'], qty: { ram: 2, gpu: 2 } } },
  { name: 'Retro 2014 rig', tag: 'used · i7-4790K', build: { case: 'case-nzxt-h510', motherboard: 'mb-asus-z97-a', cpu: 'cpu-i7-4790k', cooler: 'cool-cm-hyper212', ram: 'ram-hyperx-fury-16-1866', gpu: 'gpu-gtx1080ti-fe', psu: 'psu-evga-500w1', storage: ['ssd-samsung-870evo-1tb', 'hdd-seagate-barracuda-2tb'] } },
];

const state = {
  catalog: null,
  build: emptyBuild(),
  name: 'Untitled build',
  savedId: null,
  dirty: false,
  resolution: '1440p',
  currency: 'USD',
  glass: true,
  tab: 'parts',
  picker: null, // { slot, replaceId } — replaceId: the drive being swapped (storage only)
  pickerEra: 'all',
  result: null,
};

let scene = null;
let fmtCache = null;

/* ---------------------------------------------------------------- formatting */
function money(usd, { currency = state.currency } = {}) {
  if (usd == null) return '—';
  const c = state.catalog.meta.currencies[currency];
  if (!fmtCache || fmtCache.currency !== currency) {
    fmtCache = { currency, f: new Intl.NumberFormat(currency === 'CZK' ? 'cs-CZ' : currency === 'EUR' ? 'de-DE' : 'en-US', { style: 'currency', currency, maximumFractionDigits: 0 }) };
  }
  const v = usd * c.rate;
  return fmtCache.f.format(currency === 'CZK' ? Math.round(v / 10) * 10 : Math.round(v));
}

function capacity(gb) { return gb >= 1000 ? `${+(gb / 1000).toFixed(1)} TB` : `${gb} GB`; }

function specLine(p) {
  switch (p.category) {
    case 'cpu': return `${p.cores}C/${p.threads}T · ${p.boostGHz.toFixed(1)} GHz · ${p.socket} · ${p.tdp} W${p.igpu ? ' · iGPU' : ''}`;
    case 'motherboard': return `${p.socket} · ${p.chipset} · ${p.formFactor} · ${p.memoryType} ×${p.memorySlots} · ${p.m2Slots}× M.2${p.wifi ? ' · Wi-Fi' : ''}`;
    case 'ram': return `${p.type}-${p.speed} CL${p.cas} · ${p.modules}×${p.capacityGB / p.modules} GB`;
    case 'gpu': return `${p.vramGB} GB · ${p.tbp} W · ${p.lengthMm} mm · ${p.slots}-slot`;
    case 'cooler': return p.type === 'aio' ? `${p.radiatorMm} mm AIO · rated ~${p.tdpRating} W` : `${p.type === 'low-profile' ? 'Low-profile' : 'Air tower'} · ${p.heightMm} mm · rated ~${p.tdpRating} W`;
    case 'case': return `${p.formFactors.join('/')} · GPU ≤${p.maxGpuMm} mm · cooler ≤${p.maxCoolerMm} mm · ${p.psuForms.join('/')} PSU`;
    case 'psu': return `${p.wattage} W · ${p.efficiency} · ${p.formFactor}${p.atx3 ? ' · ATX 3.x' : ''}`;
    case 'storage': return `${capacity(p.capacityGB)} · ${p.interface === 'nvme' ? `NVMe PCIe ${p.pcieGen}.0` : p.kind === 'hdd' ? 'SATA HDD' : 'SATA SSD'} · ${p.readMBs.toLocaleString('en-US')} MB/s`;
    default: return '';
  }
}

function perfOf(p) {
  if (p.category === 'cpu') return { label: 'Gaming', v: p.gameIndex / 100 };
  if (p.category === 'gpu') return { label: 'Raster', v: p.perfIndex / 128 };
  return null;
}

/* ---------------------------------------------------------------- state changes */
function commit({ flash, persist = true } = {}) {
  state.result = evaluate(state.build, state.catalog, { resolution: state.resolution });
  render();
  if (flash) flashRow(flash);
  if (persist) {
    state.dirty = true;
    store.saveCurrent({ build: state.build, name: state.name, savedId: state.savedId });
  }
}

function setPart(slot, id, replaceId = null) {
  const before = qtyOf(state.build, slot);
  if (slot === 'storage') {
    if (replaceId) {
      // swap every copy of that drive, as many as still fit
      const count = state.build.storage.filter((d) => d === replaceId).length;
      state.build.storage = state.build.storage.filter((d) => d !== replaceId);
      for (let i = 0; i < count; i++) {
        if (i && !canAddMore(state.build, state.catalog, 'storage', id).ok) break;
        state.build.storage = [...state.build.storage, id];
      }
    } else state.build.storage = [...state.build.storage, id].slice(0, MAX_STORAGE);
  } else state.build = withPart(state.build, state.catalog, slot, id);
  commit({ flash: slot });
  if (STACKABLE.includes(slot) && state.build[slot] && qtyOf(state.build, slot) < before) {
    toast(`Only ${plural(qtyOf(state.build, slot), UNIT[slot])} of this fits, so the build has ${qtyOf(state.build, slot)} now.`);
  }
}

/** +1 / −1 on a stacked slot (memory kits, graphics cards) or on one drive model. */
function changeQty(slot, delta, partId) {
  if (delta > 0) {
    const r = canAddMore(state.build, state.catalog, slot, partId);
    if (!r.ok) { if (r.reason) toast(r.reason, { ms: 6000 }); return; }
    if (slot === 'storage') state.build.storage = [...state.build.storage, partId];
    else state.build.qty = { ...state.build.qty, [slot]: qtyOf(state.build, slot) + 1 };
  } else {
    if (slot === 'storage') {
      const i = state.build.storage.lastIndexOf(partId);
      if (i < 0 || state.build.storage.filter((d) => d === partId).length < 2) return;
      state.build.storage = state.build.storage.filter((_, j) => j !== i);
    } else {
      if (qtyOf(state.build, slot) < 2) return;
      state.build.qty = { ...state.build.qty, [slot]: qtyOf(state.build, slot) - 1 };
    }
  }
  commit({ flash: slot });
  const row = $(`#slot-list [data-slot="${slot}"]${slot === 'storage' ? `[data-id="${partId}"]` : ''} [data-act="${delta > 0 ? 'inc' : 'dec'}"]`);
  row?.focus();
}

function removePart(slot, partId = null) {
  const prev = structuredClone(state.build);
  const part = state.catalog.byId[slot === 'storage' ? partId : state.build[slot]];
  if (slot === 'storage') state.build.storage = state.build.storage.filter((d) => d !== partId);
  else {
    state.build[slot] = null;
    if (STACKABLE.includes(slot)) state.build.qty = { ...state.build.qty, [slot]: 1 };
  }
  commit();
  toast(`Removed ${part?.name || SLOT[slot].label}`, { action: 'Undo', onAction: () => { state.build = prev; commit({ flash: slot }); } });
}

function loadBuild(build, name, savedId = null) {
  state.build = normalizeBuild(build, state.catalog.byId);
  state.name = name || 'Untitled build';
  state.savedId = savedId;
  $('#build-name').value = state.name;
  commit();
  state.dirty = false;
}

/* ---------------------------------------------------------------- rendering */
function render() {
  renderSlots();
  renderTotals();
  renderCompat();
  renderPrice();
  renderPower();
  renderPerf();
  renderBoot();
  const r = state.result;
  if (scene) {
    const { benchCount } = scene.update(r.parts);
    // tint the parts that cause each error; the board and case only when nothing else is involved
    scene.setIssues(r.issues.filter((i) => i.level === 'error').flatMap((i) => {
      const own = i.slots.filter((s) => s !== 'motherboard' && s !== 'case');
      return own.length ? own : i.slots.filter((s) => s === 'motherboard');
    }));
    scene.setPowered(r.boot.ready);
    renderBench(benchCount);
  }
  const errs = r.issues.filter((i) => i.level === 'error').length;
  const tb = $('#tab-issues');
  tb.hidden = !errs; tb.textContent = errs;
  $('#presets').hidden = r.price.count > 0;
}

function slotIssueLevel(slot) {
  const lv = state.result.issues.filter((i) => i.slots.includes(slot) && i.code !== 'box-cooler').map((i) => i.level);
  return lv.includes('error') ? 'error' : lv.includes('warn') ? 'warn' : null;
}

/* live prices (Best Buy new, eBay used) arrive merged into part.price by the server */
const SOURCE_LABEL = { bestbuy: 'Best Buy', ebay: 'eBay' };
function ago(ts) {
  const m = Math.max(1, Math.round((Date.now() - ts) / 60000));
  return m < 60 ? `${m} min ago` : `${Math.round(m / 60)} h ago`;
}
function liveDot(l, kind) {
  if (!l) return '';
  const what = kind === 'used' ? `typical asking price of ${l.count} used listings on ${SOURCE_LABEL[l.source]}` : `live price at ${SOURCE_LABEL[l.source]}`;
  return `<i class="live-dot" title="${esc(`${what}, updated ${ago(l.fetchedAt)}`)}"></i>`;
}
function priceCell(p, qty = 1) {
  const pr = p.price;
  const ln = pr.live?.new; const lu = pr.live?.used;
  const x = (v) => (v == null ? null : v * qty);
  if (pr.new != null) return `${liveDot(ln, 'new')}${money(x(pr.new))}<small>${pr.used != null ? `${liveDot(lu, 'used')}used ${money(x(pr.used))}` : 'new only'}</small>`;
  return `${liveDot(lu, 'used')}${money(x(pr.used))}<small>used only</small>`;
}
function sourceLinks(p) {
  const ln = p.price.live?.new; const lu = p.price.live?.used;
  const out = [];
  if (ln?.url) out.push(`<a href="${esc(ln.url)}" target="_blank" rel="noopener">${SOURCE_LABEL[ln.source]} ${money(ln.price)}</a>`);
  if (lu?.url) out.push(`<a href="${esc(lu.url)}" target="_blank" rel="noopener">eBay used, ${lu.count} listings</a>`);
  return out.length ? `<div class="slot-src">${out.join(' · ')} · ${ago(Math.max(ln?.fetchedAt || 0, lu?.fetchedAt || 0))}</div>` : '';
}

function waitingNote(slot, p) {
  const r = state.result.parts;
  if (!r.motherboard && ['cpu', 'ram', 'gpu'].includes(slot)) return 'On the bench until you add a motherboard';
  if (slot === 'ram' && memoryOf(r).modules > r.motherboard.memorySlots) return 'Modules without a free slot wait on the bench';
  if (slot === 'gpu' && r.qty.gpu > gpuSlotsOf(r.motherboard)) return 'Cards without a free x16 slot wait on the bench';
  if (slot === 'cooler' && (!r.motherboard || !r.cpu)) return `On the bench until you add ${!r.motherboard ? 'a motherboard' : 'a CPU'}`;
  if (slot === 'storage' && p?.formFactor === 'm2') {
    if (!r.motherboard) return 'On the bench until you add a motherboard';
    if (r.storage.filter((d) => d.formFactor === 'm2').length > r.motherboard.m2Slots) return 'Drives without a free M.2 slot wait on the bench';
  }
  return '';
}

function renderSlots() {
  const list = $('#slot-list');
  const parts = state.result.parts;
  const rows = [];
  for (const s of SLOTS) {
    const level = slotIssueLevel(s.key);
    const cls = `slot${level ? ` has-${level}` : ''}`;
    if (s.key === 'storage') {
      // identical drives share one row with a quantity
      const groups = [];
      for (const d of parts.storage) {
        const g = groups.find((x) => x.part.id === d.id);
        if (g) g.qty++; else groups.push({ part: d, qty: 1 });
      }
      if (!groups.length) rows.push(emptyRow(s, cls));
      groups.forEach((g, i) => rows.push(filledRow(s, g.part, `${cls}${i ? ' sub' : ''}`, g.qty)));
      if (groups.length && parts.storage.length < MAX_STORAGE) {
        rows.push(`<li class="slot sub" data-slot="storage" data-add="1"><span class="slot-code"></span><button type="button" class="add-more" data-act="add-storage">${icon('plus')} Add a different drive</button></li>`);
      }
      continue;
    }
    const p = parts[s.key];
    rows.push(p ? filledRow(s, p, cls, s.stack ? parts.qty[s.key] : 1) : emptyRow(s, cls));
  }
  list.innerHTML = rows.join('');

  const filled = SLOTS.filter((s) => (s.multi ? parts[s.key].length : parts[s.key])).length;
  const pips = SLOTS.map((s) => {
    const on = s.multi ? parts[s.key].length : parts[s.key];
    return `<i class="pip${on ? ' on' : ''}${slotIssueLevel(s.key) === 'error' ? ' bad' : ''}"></i>`;
  }).join('');
  $('#parts-progress').innerHTML = `<span class="pips">${pips}</span><span>${filled}/${SLOTS.length} slots filled</span>`;
}

function emptyRow(s, cls) {
  const cpu = state.result.parts.cpu;
  const stock = s.key === 'cooler' && cpu?.boxCooler;
  return `<li class="${cls}" data-slot="${s.key}" tabindex="0" role="button" aria-label="Add ${esc(s.label)}">
    <span class="slot-code">${s.code}</span>
    <div class="slot-main">
      <div class="slot-label">${esc(s.label)}</div>
      ${stock ? `<div class="slot-spec">Using the cooler bundled with the ${esc(cpu.name)}</div>` : ''}
      <div class="slot-empty">${icon('plus')} ${stock ? 'Upgrade the cooler' : ADD_LABEL[s.key]}</div>
    </div>
    <span></span>
  </li>`;
}

/** What the stepper says: how much room the board leaves for this part. */
function roomNote(slot, p, qty) {
  const r = state.result.parts;
  const mb = r.motherboard;
  if (slot === 'ram') {
    const mem = memoryOf(r);
    return `${mem.capacityGB} GB total · ${mb ? `${mem.modules} of ${mb.memorySlots} slots` : plural(mem.modules, ['module', 'modules'])}`;
  }
  if (slot === 'gpu') return mb ? `${qty} of ${gpuSlotsOf(mb)} x16 slot${gpuSlotsOf(mb) === 1 ? '' : 's'}` : '';
  if (slot === 'storage' && mb) {
    if (p.formFactor === 'm2') return `${r.storage.filter((d) => d.formFactor === 'm2').length} of ${mb.m2Slots} M.2 slots`;
    return `${r.storage.filter((d) => d.interface === 'sata').length} of ${mb.sataPorts} SATA ports`;
  }
  return '';
}

function stepper(s, p, qty) {
  const more = canAddMore(state.build, state.catalog, s.key, p.id);
  const unit = UNIT[s.key];
  const each = qty > 1 ? `${money(p.price.new ?? p.price.used)} each` : '';
  const note = [roomNote(s.key, p, qty), each].filter(Boolean).join(' · ');
  return `<div class="qty-line">
      <div class="qty" role="group" aria-label="How many ${esc(unit[1])}">
        <button type="button" class="qty-btn" data-act="dec" aria-label="One ${esc(unit[0])} fewer"${qty < 2 ? ' aria-disabled="true"' : ''}>${icon('minus')}</button>
        <output class="qty-n" aria-live="polite">${qty}<span class="sr-only"> ${esc(qty === 1 ? unit[0] : unit[1])}</span></output>
        <button type="button" class="qty-btn" data-act="inc" aria-label="Add another ${esc(unit[0])}"${more.ok ? '' : ` aria-disabled="true" title="${esc(more.reason)}"`}>${icon('plus')}</button>
      </div>
      <span class="qty-note">${esc(note)}</span>
    </div>`;
}

function filledRow(s, p, cls, qty = 1) {
  const note = waitingNote(s.key, p);
  const id = s.key === 'storage' ? ` data-id="${esc(p.id)}"` : '';
  const many = qty > 1 ? `${plural(qty, UNIT[s.key])} of ` : '';
  return `<li class="${cls} filled" data-slot="${s.key}"${id} tabindex="0" role="button" aria-label="Change ${esc(s.label)}: ${esc(many + p.name)}">
    <span class="slot-code">${s.code}</span>
    <div class="slot-main">
      <div class="slot-label">${esc(s.label)}</div>
      <div class="slot-name">${qty > 1 ? `<span class="qty-x">${qty}×</span> ` : ''}<span class="brand-s">${esc(p.brand)}</span> ${esc(p.name)}</div>
      <div class="slot-spec">${esc(specLine(p))}</div>
      ${UNIT[s.key] ? stepper(s, p, qty) : ''}
      ${sourceLinks(p)}
      ${note ? `<div class="slot-state">${esc(note)}</div>` : ''}
    </div>
    <div>
      <div class="slot-price">${priceCell(p, qty)}</div>
      <div class="slot-actions">
        <button type="button" class="mini-btn" data-act="swap" title="Swap">${icon('swap')}<span class="sr-only">Swap</span></button>
        <button type="button" class="mini-btn danger" data-act="remove" title="${qty > 1 ? `Remove all ${qty}` : 'Remove'}">${icon('x')}<span class="sr-only">Remove</span></button>
      </div>
    </div>
  </li>`;
}

function renderTotals() {
  const pr = state.result.price;
  const anyLive = Object.values(state.result.parts).flat().some((p) => p?.price?.live);
  $('#totals').innerHTML = `
    <div class="total"><p class="eyebrow">${anyLive ? 'Buying new' : 'Retail estimate'}</p><span class="num">${pr.count ? money(pr.retail) : '—'}</span></div>
    <div class="total used"><p class="eyebrow">${anyLive ? 'Buying used' : 'Used estimate'}</p><span class="num">${pr.count ? money(pr.used) : '—'}</span></div>`;
}

function renderCompat() {
  const { issues, boot, price } = state.result;
  const errors = issues.filter((i) => i.level === 'error');
  const warns = issues.filter((i) => i.level === 'warn');
  let v;
  if (!price.count) v = { cls: 'ok', ic: 'check', h: 'Nothing to check yet', p: 'Compatibility is checked live as you add parts.' };
  else if (errors.length) v = { cls: 'bad', ic: 'stop', h: `${errors.length} problem${errors.length > 1 ? 's' : ''} to fix`, p: 'These parts won’t work together as chosen.' };
  else if (boot.ready) v = { cls: 'ready', ic: 'check', h: 'Compatible and ready to boot', p: warns.length ? `${warns.length} thing${warns.length > 1 ? 's' : ''} worth a look below.` : 'Every part fits and the power supply has headroom.' };
  else if (warns.length) v = { cls: 'warn', ic: 'alert', h: 'No conflicts, a few cautions', p: `Still missing: ${boot.missing.map((m) => SLOT[m].label.toLowerCase()).join(', ')}.` };
  else v = { cls: 'ok', ic: 'check', h: 'No conflicts so far', p: `Still missing: ${boot.missing.map((m) => SLOT[m].label.toLowerCase()).join(', ')}.` };

  $('#compat').innerHTML = `
    <div class="block-head"><p class="eyebrow">Compatibility</p><span class="note">${issues.length ? `${issues.length} note${issues.length > 1 ? 's' : ''}` : ''}</span></div>
    <div class="verdict ${v.cls}"><span class="verdict-icon">${icon(v.ic)}</span><div><h3>${esc(v.h)}</h3><p>${esc(v.p)}</p></div></div>
    ${issues.length ? `<ul class="issues">${issues.map((i) => `
      <li class="issue ${i.level}">${icon(LEVEL_ICON[i.level])}<div>${esc(i.message)}
        <div class="issue-slots">${i.slots.filter((s) => SLOT[s]).map((s) => `<button type="button" data-goto="${s}">${esc(SLOT[s].label)}</button>`).join('')}</div>
      </div></li>`).join('')}</ul>` : ''}`;
}

function renderPrice() {
  const pr = state.result.price;
  const m = state.catalog.meta;
  if (!pr.count) {
    $('#price').innerHTML = `<div class="block-head"><p class="eyebrow">Price</p></div><p class="empty-note">Totals appear here. Every price is an estimate, shown new and used.</p>`;
    return;
  }
  const max = Math.max(pr.retail, pr.used, 1);
  const all = Object.values(state.result.parts).flat().filter(Boolean);
  const live = { n: 0, of: 0 };
  for (const p of all) {
    if (p.price?.new != null || p.price?.estimate?.new != null) { live.of++; if (p.price.live?.new) live.n++; }
    if (p.price?.used != null) { live.of++; if (p.price.live?.used) live.n++; }
  }
  const liveNote = live.n
    ? `<span class="live-dot"></span><b>${live.n} of ${live.of}</b> prices here are live (new from Best Buy, used from eBay asking prices). The rest are estimates from ${esc(monthName(m.pricesAsOf))}. `
    : '';
  $('#price').innerHTML = `
    <div class="block-head"><p class="eyebrow">Price${live.n ? '' : ' estimate'}</p><span class="note">${live.n ? `${live.n} of ${live.of} live` : `as of ${esc(monthName(m.pricesAsOf))}`}</span></div>
    <div class="price-grid">
      <div class="figure"><span class="num">${money(pr.retail)}</span><span class="sub">Buying new</span></div>
      <div class="figure muted"><span class="num">${money(pr.used)}</span><span class="sub">Buying used</span></div>
    </div>
    <div class="price-bar"><span class="retail" style="width:${(pr.retail / max) * 100}%"></span></div>
    <div class="price-bar"><span style="width:${(pr.used / max) * 100}%"></span></div>
    <p class="fine">${liveNote}${pr.savings > 0 ? `Going used saves about <b>${money(pr.savings)}</b>. ` : ''}${pr.discontinued.length ? `<b>${pr.discontinued.length}</b> part${pr.discontinued.length > 1 ? 's are' : ' is'} no longer sold new, so the new total uses ${pr.discontinued.length > 1 ? 'their' : 'its'} used price. ` : ''}Launch prices added up to ${money(pr.msrp, { currency: 'USD' })}${state.currency !== 'USD' ? ' (USD)' : ''}.</p>`;
}

function monthName(ym) {
  const [y, mo] = String(ym).split('-').map(Number);
  return new Date(y, (mo || 1) - 1, 1).toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
}

function renderPower() {
  const { power } = state.result;
  const psu = state.result.parts.psu;
  if (!power.peak) {
    $('#power').innerHTML = `<div class="block-head"><p class="eyebrow">Power</p></div><p class="empty-note">Add a CPU or graphics card to estimate power draw and the power supply you need.</p>`;
    return;
  }
  const scaleMax = Math.max(power.peak, power.recommendedPsu, psu?.wattage || 0) * 1.12;
  const pct = (w) => `${Math.min(100, (w / scaleMax) * 100)}%`;
  const edge = (w) => (w / scaleMax > 0.78 ? ' edge-r' : w / scaleMax < 0.18 ? ' edge-l' : '');
  const kwhPrice = KWH[state.currency];
  const monthly = (power.gaming / 1000) * 3 * 30 * kwhPrice;
  const c = state.catalog.meta.currencies[state.currency];
  const monthlyStr = new Intl.NumberFormat(state.currency === 'CZK' ? 'cs-CZ' : state.currency === 'EUR' ? 'de-DE' : 'en-US', { style: 'currency', currency: state.currency, maximumFractionDigits: state.currency === 'CZK' ? 0 : 2 }).format(monthly);
  const over = psu && psu.wattage < power.peak;
  $('#power').innerHTML = `
    <div class="block-head"><p class="eyebrow">Power draw</p><span class="note">estimate</span></div>
    <div class="power-figs">
      <div><span class="num">${power.idle}<small>W</small></span><span class="eyebrow">Idle</span></div>
      <div><span class="num">${power.gaming}<small>W</small></span><span class="eyebrow">Gaming</span></div>
      <div><span class="num">${power.peak}<small>W</small></span><span class="eyebrow">Peak</span></div>
    </div>
    <div class="meter" role="img" aria-label="Gaming ${power.gaming} watts, peak ${power.peak} watts, recommended supply ${power.recommendedPsu} watts${psu ? `, chosen supply ${psu.wattage} watts` : ''}">
      <div class="meter-track"></div>
      <div class="meter-fill peak" style="width:${pct(power.peak)}"></div>
      <div class="meter-fill gaming" style="width:${pct(power.gaming)}"></div>
      <div class="meter-mark rec${edge(power.recommendedPsu)}" style="left:${pct(power.recommendedPsu)}"><span>rec. ${power.recommendedPsu} W</span></div>
      ${psu ? `<div class="meter-mark${over ? ' over' : ''}${edge(psu.wattage)}" style="left:${pct(psu.wattage)}"><span>your PSU ${psu.wattage} W</span></div>` : ''}
    </div>
    <p class="fine">${psu ? '' : `Pick a power supply of at least <b>${power.recommendedPsu} W</b>. `}About <b>${monthlyStr}</b> a month for 3 hours of gaming a day at ${c.symbol === '$' ? '$' : ''}${kwhPrice}${c.symbol !== '$' ? ` ${c.symbol}` : ''}/kWh.</p>`;
}

function renderPerf() {
  const { fps } = state.result;
  const res = state.catalog.resolutions;
  const seg = `<div class="seg" role="group" aria-label="Resolution">${res.map((r) => `<button type="button" data-res="${r}" aria-pressed="${r === state.resolution}">${r}</button>`).join('')}</div>`;
  if (!fps.graphics || !state.result.parts.cpu) {
    const need = !state.result.parts.cpu ? (fps.graphics ? 'a CPU' : 'a CPU and a graphics card') : 'a graphics card';
    $('#perf').innerHTML = `<div class="block-head"><p class="eyebrow">Game performance</p>${seg}</div><p class="empty-note">Add ${need} to see estimated FPS in ${state.catalog.games.length} popular games.</p>`;
    return;
  }
  const max = Math.max(200, ...fps.results.map((g) => g.high));
  const guides = [60, 144, 240].filter((g) => g < max);
  const pct = (v) => `${(v / max) * 100}%`;
  $('#perf').innerHTML = `
    <div class="block-head"><p class="eyebrow">Game performance</p>${seg}</div>
    <p class="gfx-line">${fps.graphics.integrated ? `Integrated ${esc(fps.graphics.name)}` : esc(fps.graphics.name)} · avg FPS${fps.cards > 1 ? ` · games use one of your ${fps.cards} cards` : ''}</p>
    <ul class="fps-list">${fps.results.map((g) => {
      const tags = [];
      if (g.bound === 'cpu') tags.push('<span class="tag-cpu">CPU-limited</span>');
      else if (g.bound === 'gpu') tags.push('<span>GPU-limited</span>');
      else if (g.bound === 'cap') tags.push('<span class="tag-cap">engine cap 60</span>');
      else tags.push('<span>balanced</span>');
      if (g.vramShort) tags.push('<span class="tag-vram">VRAM short</span>');
      for (const n of g.notes.filter((n) => !n.startsWith('needs'))) tags.push(`<span class="tag-vram">${esc(n)}</span>`);
      return `<li class="fps-row">
        <span class="fps-name">${esc(g.name)}<small>${esc(g.preset)}</small></span>
        <span class="fps-val">${g.capped ? g.fps : `${g.low}–${g.high}`}<small>fps</small></span>
        <div class="fps-bar" aria-hidden="true">
          ${g.capped ? '' : `<span class="range" style="left:${pct(g.low)};width:calc(${pct(g.high)} - ${pct(g.low)})"></span>`}
          <span class="val" style="width:${pct(g.fps)}"></span>
          ${guides.map((x) => `<span class="guide" style="left:${pct(x)}"></span>`).join('')}
        </div>
        <div class="fps-meta">${tags.join('')}</div>
      </li>`;
    }).join('')}</ul>
    <div class="guides-legend"><span>Ticks at ${guides.join(' · ')} fps</span><span>range ±15%</span></div>`;
}

function renderBoot() {
  const chip = $('#boot-chip');
  const { boot, price } = state.result;
  let cls = ''; let text;
  if (!price.count) text = 'Empty case · add a part to start';
  else if (boot.errors) { cls = 'blocked'; text = `${boot.errors} problem${boot.errors > 1 ? 's' : ''} to fix before it boots`; }
  else if (boot.ready) { cls = 'ready'; text = 'Ready to boot'; }
  else text = `Still needs: ${boot.missing.map((m) => SLOT[m].label.toLowerCase()).join(', ')}`;
  chip.className = `boot-chip ${cls}`;
  chip.innerHTML = `<span class="led"></span><span>${esc(text)}</span>`;
}

function renderBench(n) {
  const el = $('#bench-note');
  el.hidden = !n;
  if (n) el.textContent = `${n} part${n > 1 ? 's' : ''} on the bench, waiting for somewhere to mount`;
}

function flashRow(slot) {
  const row = $(`#slot-list [data-slot="${slot}"]:not([data-add])`);
  if (!row) return;
  row.classList.remove('flash'); void row.offsetWidth; row.classList.add('flash');
}

/* ---------------------------------------------------------------- picker */
const ERAS = [
  { id: 'all', label: 'All' },
  { id: 'current', label: '2024+', test: (y) => y >= 2024 },
  { id: 'recent', label: '2020–23', test: (y) => y >= 2020 && y < 2024 },
  { id: 'legacy', label: '2019 and older', test: (y) => y < 2020 },
];

let pickerReturnFocus = null;
function openPicker(slot, replaceId = null) {
  state.picker = { slot, replaceId };
  pickerReturnFocus = document.activeElement;
  const s = SLOT[slot];
  $('#picker-code').textContent = `${s.code} / ${s.label}`;
  const n = slot === 'storage' && replaceId ? state.build.storage.filter((d) => d === replaceId).length : qtyOf(state.build, slot);
  $('#picker-title').textContent = replaceId == null && slot === 'storage' && state.build.storage.length ? 'Add a different drive'
    : n > 1 ? `${PICK_TITLE[slot]} · replaces all ${n}` : PICK_TITLE[slot];
  $('#picker-search').value = '';
  $('#picker').hidden = false;
  $('#sheet-backdrop').hidden = false;
  renderPicker();
  $('#picker-list').scrollTop = 0;
  if (!matchMedia('(pointer: coarse)').matches) $('#picker-search').focus();
  else $('#picker-close').focus();
}

function closePicker() {
  state.picker = null;
  $('#picker').hidden = true;
  $('#sheet-backdrop').hidden = true;
  pickerReturnFocus?.focus?.();
}

function renderPicker() {
  const { slot, replaceId } = state.picker;
  const q = $('#picker-search').value.trim().toLowerCase();
  const era = ERAS.find((e) => e.id === state.pickerEra);
  const hide = $('#hide-incompatible').checked;
  const currentId = slot === 'storage' ? replaceId : state.build[slot];
  $('#era-chips').innerHTML = ERAS.map((e) => `<button type="button" data-era="${e.id}" aria-pressed="${e.id === state.pickerEra}">${e.label}</button>`).join('');

  const base = slot === 'storage' && replaceId ? { ...state.build, storage: state.build.storage.filter((d) => d !== replaceId) } : state.build;
  let items = state.catalog.parts[slot]
    .filter((p) => !q || `${p.brand} ${p.name} ${p.socket || ''} ${p.chipset || ''}`.toLowerCase().includes(q))
    .filter((p) => !era.test || era.test(p.released))
    .map((p) => {
      const iss = candidateIssues(base, state.catalog, slot, p.id);
      const worst = iss.find((i) => i.level === 'error') || iss.find((i) => i.level === 'warn') || iss.find((i) => i.level === 'info');
      return { p, iss, worst, bad: iss.some((i) => i.level === 'error') };
    });
  if (hide) items = items.filter((i) => !i.bad);
  const price = (p) => p.price.new ?? p.price.used ?? 0;
  const sort = $('#picker-sort').value;
  const perfKey = (p) => (p.category === 'cpu' ? p.gameIndex : p.category === 'gpu' ? p.perfIndex : p.released * 10 + (p.wattage || p.capacityGB / 1000 || 0) / 1000);
  items.sort((a, b) => {
    if (sort === 'price-asc') return price(a.p) - price(b.p);
    if (sort === 'price-desc') return price(b.p) - price(a.p);
    if (sort === 'new') return b.p.released - a.p.released || price(b.p) - price(a.p);
    return (a.bad - b.bad) || (perfKey(b.p) - perfKey(a.p)) || price(a.p) - price(b.p);
  });

  const list = $('#picker-list');
  if (!items.length) {
    list.innerHTML = `<div class="picker-empty">No parts match${q ? ` “${esc(q)}”` : ''}${hide ? ' that work with this build' : ''}. Try another era or clear the search.</div>`;
    return;
  }
  list.innerHTML = items.map(({ p, worst, bad }) => {
    const perf = perfOf(p);
    const pr = p.price;
    const compat = worst
      ? `<div class="pick-compat ${worst.level === 'info' ? '' : worst.level}">${icon(LEVEL_ICON[worst.level])}<span>${esc(worst.message)}</span></div>`
      : `<div class="pick-compat ok">${icon('check')}<span>Works with your build</span></div>`;
    return `<button type="button" role="listitem" class="pick${p.id === currentId ? ' current' : ''}${bad ? ' incompatible' : ''}" data-id="${p.id}">
      <div class="pick-top"><span class="pick-year">${p.released}</span><span class="pick-name"><span class="brand-s">${esc(p.brand)}</span> ${esc(p.name)}</span></div>
      <div class="pick-price">${pr.new != null ? `${liveDot(pr.live?.new, 'new')}${money(pr.new)}<small>${pr.used != null ? `${liveDot(pr.live?.used, 'used')}used ${money(pr.used)}` : 'new'}</small>` : `${liveDot(pr.live?.used, 'used')}${money(pr.used)}<small class="eol">used · not sold new</small>`}</div>
      <div class="pick-spec">${esc(specLine(p))}</div>
      ${compat}
      ${perf ? `<div class="pick-perf"><span>${perf.label}</span><i><b style="width:${Math.min(100, perf.v * 100)}%"></b></i>${p.id === currentId ? '<span class="pick-current-tag">In build</span>' : ''}</div>` : p.id === currentId ? '<div class="pick-perf"><span class="pick-current-tag">In build</span></div>' : ''}
    </button>`;
  }).join('');
}

/* ---------------------------------------------------------------- saved builds */
function summary() {
  const r = state.result;
  const gpu = r.parts.gpu ? `${r.parts.qty.gpu > 1 ? `${r.parts.qty.gpu}× ` : ''}${r.parts.gpu.name}` : null;
  return { retail: r.price.retail, used: r.price.used, count: r.price.count, cpu: r.parts.cpu?.name || null, gpu };
}

function saveCurrent() {
  if (!state.result.price.count) { toast('Add at least one part before saving.'); return; }
  const saved = store.saveBuild({ id: state.savedId, name: state.name, build: state.build, summary: summary() });
  if (!saved) { toast('Couldn’t save: this browser is blocking local storage.'); return; }
  state.savedId = saved.id;
  state.dirty = false;
  store.saveCurrent({ build: state.build, name: state.name, savedId: state.savedId });
  updateBuildsCount();
  toast(`Saved “${state.name}” to My builds`);
}

function updateBuildsCount() {
  const n = store.listBuilds().length;
  const el = $('#builds-count');
  el.hidden = !n; el.textContent = n;
}

function renderBuilds() {
  const list = store.listBuilds();
  const el = $('#builds-list');
  if (!list.length) {
    el.innerHTML = `<div class="builds-empty"><b>No saved builds yet</b>Builds you save are kept in this browser on this device. Use Share to move one to another device.</div>`;
    return;
  }
  el.innerHTML = list.map((b) => {
    const s = b.summary || {};
    const when = new Date(b.updatedAt || b.createdAt).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
    return `<div class="saved${b.id === state.savedId ? ' current' : ''}" data-id="${esc(b.id)}">
      <h3>${esc(b.name)}</h3>
      <div class="saved-price">${s.retail != null ? money(s.retail) : ''}</div>
      <div class="saved-meta">${s.count || 0} part${s.count === 1 ? '' : 's'} · saved ${esc(when)}${b.id === state.savedId ? ' · open now' : ''}</div>
      <div class="saved-parts">${esc([s.cpu, s.gpu].filter(Boolean).join(' + ') || 'No CPU or GPU yet')}</div>
      <div class="saved-actions">
        <button type="button" class="btn line" data-act="load">Open</button>
        <button type="button" class="mini-btn danger" data-act="delete" title="Delete">${icon('trash')}<span class="sr-only">Delete</span></button>
      </div>
    </div>`;
  }).join('');
}

/* ---------------------------------------------------------------- toasts */
function toast(msg, { action, onAction, ms = 4200 } = {}) {
  const t = document.createElement('div');
  t.className = 'toast';
  t.innerHTML = `<span>${esc(msg)}</span>${action ? `<button type="button">${esc(action)}</button>` : ''}`;
  if (action) t.querySelector('button').addEventListener('click', () => { onAction(); t.remove(); });
  $('#toasts').append(t);
  setTimeout(() => t.remove(), ms);
}

/* ---------------------------------------------------------------- mobile tabs */
function setTab(tab) {
  state.tab = tab;
  for (const b of document.querySelectorAll('#tabs button')) b.setAttribute('aria-pressed', String(b.dataset.tab === tab));
  const parts = $('#panel-parts'); const stats = $('#panel-stats');
  if (tab === 'parts') { parts.removeAttribute('hidden-mobile'); stats.setAttribute('hidden-mobile', ''); }
  else { parts.setAttribute('hidden-mobile', ''); stats.removeAttribute('hidden-mobile'); stats.dataset.view = tab; }
}

/* ---------------------------------------------------------------- events */
function bindEvents() {
  $('#slot-list').addEventListener('click', (e) => {
    const row = e.target.closest('.slot');
    if (!row || e.target.closest('a')) return;
    const slot = row.dataset.slot;
    const id = row.dataset.id || null;
    const act = e.target.closest('[data-act]')?.dataset.act;
    if (act === 'remove') { e.stopPropagation(); removePart(slot, id); return; }
    if (act === 'inc' || act === 'dec') { e.stopPropagation(); changeQty(slot, act === 'inc' ? 1 : -1, id || state.build[slot]); return; }
    if (act === 'add-storage' || row.dataset.add) { openPicker('storage', null); return; }
    openPicker(slot, slot === 'storage' && row.classList.contains('filled') ? id : null);
  });
  $('#slot-list').addEventListener('keydown', (e) => {
    if (e.target.closest('.qty')) return; // the stepper buttons handle their own keys
    if ((e.key === 'Enter' || e.key === ' ') && e.target.classList.contains('slot')) { e.preventDefault(); e.target.click(); }
    if (!e.target.classList.contains('filled')) return;
    const { slot, id } = e.target.dataset;
    if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); removePart(slot, id || null); }
    if (UNIT[slot] && (e.key === '+' || e.key === '=' || e.key === '-')) { e.preventDefault(); changeQty(slot, e.key === '-' ? -1 : 1, id || state.build[slot]); }
  });
  $('#slot-list').addEventListener('mouseover', (e) => {
    const row = e.target.closest('.slot.filled');
    scene?.highlight(row ? row.dataset.slot : null);
  });
  $('#slot-list').addEventListener('mouseleave', () => scene?.highlight(null));

  $('#preset-list').addEventListener('click', (e) => {
    const b = e.target.closest('[data-preset]');
    if (!b) return;
    const p = PRESETS[Number(b.dataset.preset)];
    loadBuild(p.build, p.name);
    state.dirty = true;
  });

  $('#panel-stats').addEventListener('click', (e) => {
    const res = e.target.closest('[data-res]');
    if (res) {
      state.resolution = res.dataset.res;
      store.savePrefs({ ...store.loadPrefs(), resolution: state.resolution });
      commit({ persist: false });
      return;
    }
    const go = e.target.closest('[data-goto]');
    if (go) openPicker(go.dataset.goto, go.dataset.goto === 'storage' ? state.build.storage[0] || null : null);
  });

  $('#picker-list').addEventListener('click', (e) => {
    const b = e.target.closest('.pick');
    if (!b) return;
    const { slot, replaceId } = state.picker;
    closePicker();
    setPart(slot, b.dataset.id, replaceId);
  });
  $('#picker-search').addEventListener('input', renderPicker);
  $('#picker-sort').addEventListener('change', renderPicker);
  $('#hide-incompatible').addEventListener('change', renderPicker);
  $('#era-chips').addEventListener('click', (e) => {
    const b = e.target.closest('[data-era]');
    if (!b) return;
    state.pickerEra = b.dataset.era;
    renderPicker();
  });
  $('#picker-close').addEventListener('click', closePicker);
  $('#sheet-backdrop').addEventListener('click', closePicker);
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && state.picker) closePicker(); });

  $('#build-name').addEventListener('input', (e) => { state.name = e.target.value.trim() || 'Untitled build'; store.saveCurrent({ build: state.build, name: state.name, savedId: state.savedId }); });
  $('#build-name').addEventListener('keydown', (e) => { if (e.key === 'Enter') e.target.blur(); });

  $('#btn-save').addEventListener('click', saveCurrent);
  $('#btn-new').addEventListener('click', () => {
    const prev = { build: structuredClone(state.build), name: state.name, savedId: state.savedId };
    loadBuild(emptyBuild(), 'Untitled build');
    history.replaceState(null, '', location.pathname);
    if (SLOTS.some((s) => (s.multi ? prev.build[s.key].length : prev.build[s.key]))) {
      toast('Started a new build', { action: 'Undo', onAction: () => loadBuild(prev.build, prev.name, prev.savedId) });
    }
  });
  $('#btn-builds').addEventListener('click', () => { renderBuilds(); $('#builds-modal').showModal(); });
  $('#builds-modal').addEventListener('click', (e) => {
    if (e.target === e.currentTarget || e.target.closest('[data-close]')) { e.currentTarget.close(); return; }
    const row = e.target.closest('.saved');
    const act = e.target.closest('[data-act]')?.dataset.act;
    if (!row || !act) return;
    const id = row.dataset.id;
    if (act === 'load') {
      const b = store.listBuilds().find((x) => x.id === id);
      if (b) { loadBuild(b.build, b.name, b.id); $('#builds-modal').close(); toast(`Opened “${b.name}”`); }
    } else if (act === 'delete') {
      const r = store.deleteBuild(id);
      if (r) {
        if (state.savedId === id) state.savedId = null;
        renderBuilds(); updateBuildsCount();
        toast(`Deleted “${r.removed.name}”`, { action: 'Undo', onAction: () => { store.restoreBuild(r.removed, r.idx); renderBuilds(); updateBuildsCount(); } });
      }
    }
  });
  $('#btn-share').addEventListener('click', async () => {
    if (!state.result.price.count) { toast('Add some parts first, then share.'); return; }
    const url = `${location.origin}${location.pathname}${encodeShare(state.build, state.name)}`;
    history.replaceState(null, '', url);
    try { await navigator.clipboard.writeText(url); toast('Link copied. Anyone with it sees this exact build.'); }
    catch { toast('Link is in the address bar. Copy it from there.'); }
  });
  $('#currency').addEventListener('change', (e) => {
    state.currency = e.target.value;
    store.savePrefs({ ...store.loadPrefs(), currency: state.currency });
    commit({ persist: false });
    if (state.picker) renderPicker();
  });
  $('#btn-glass').addEventListener('click', (e) => {
    state.glass = !state.glass;
    e.currentTarget.setAttribute('aria-pressed', String(state.glass));
    scene?.setGlass(state.glass);
  });
  $('#btn-view').addEventListener('click', () => scene?.resetView());
  $('#tabs').addEventListener('click', (e) => {
    const b = e.target.closest('[data-tab]');
    if (b) setTab(b.dataset.tab);
  });
  window.addEventListener('beforeunload', () => store.saveCurrent({ build: state.build, name: state.name, savedId: state.savedId }));
}

/* ---------------------------------------------------------------- boot */
async function init() {
  const loading = $('#stage-loading');
  let data;
  try {
    const res = await fetch('/api/catalog');
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    data = await res.json();
  } catch (err) {
    loading.classList.add('error');
    loading.innerHTML = `<div>Couldn’t load the parts catalog (${esc(err.message)}). <button class="btn line" type="button" onclick="location.reload()">Try again</button></div>`;
    return;
  }
  const byId = {};
  for (const list of Object.values(data.parts)) for (const p of list) byId[p.id] = p;
  state.catalog = { ...data, byId };

  const prefs = store.loadPrefs();
  state.currency = data.meta.currencies[prefs.currency] ? prefs.currency : 'USD';
  state.resolution = data.resolutions.includes(prefs.resolution) ? prefs.resolution : '1440p';
  $('#currency').innerHTML = Object.keys(data.meta.currencies).map((c) => `<option value="${c}"${c === state.currency ? ' selected' : ''}>${c}</option>`).join('');

  $('#preset-list').innerHTML = PRESETS.map((p, i) => `<button type="button" class="preset" data-preset="${i}"><b>${esc(p.name)}</b><span>${esc(p.tag)}</span></button>`).join('');
  $('#method-body').innerHTML = `
    <p><b>Prices</b> ${data.meta.livePrices?.enabled?.length
      ? `marked with a green dot are live: new prices from Best Buy and used prices as the typical asking price of matching eBay listings, refreshed every few hours (US). Graphics cards match any brand with the same chip, so the live new price is the cheapest one in stock. Everything else is a hand-compiled street-price estimate in USD (${esc(monthName(data.meta.pricesAsOf))}).`
      : `are hand-compiled street-price estimates in USD (${esc(monthName(data.meta.pricesAsOf))}), not live quotes. Live prices from Best Buy and eBay switch on when the server has API keys.`} “Used” is a typical second-hand price in good condition. EUR and CZK use fixed approximate rates; local prices with VAT often differ. Memory and SSD prices were especially volatile in 2025–26.</p>
    <p><b>FPS</b> comes from a model, not from benchmarks of your exact build. Each game has reference frame rates for a fully GPU-bound and fully CPU-bound system; your parts scale those by relative performance indexes and combine them as a soft bottleneck. Missing VRAM, single-channel memory and low RAM apply penalties. Expect ±15% or more: drivers, patches, scenes and upscaling all move the numbers.</p>
    <p><b>Power</b> adds typical CPU and GPU draw under gaming and worst-case loads, plus board, memory, drives and fans. The recommended supply adds 30% headroom for transient spikes.</p>
    <p><b>Compatibility</b> checks socket and chipset support, memory type and slots, board and PSU form factor, GPU length, cooler height and radiator mounts, M.2 slots, drive bays, and power. Extra memory kits, graphics cards and drives are limited by the board’s memory slots, x16 slots and their spacing, M.2 slots and SATA ports, and the case’s expansion slots and bays. Slot spacing follows each board’s usual layout and is approximate.</p>`;

  updateBuildsCount();
  bindEvents();
  setTab('parts');

  // Restore: share link > in-progress build > empty
  const shared = decodeShare(location.hash);
  const current = store.loadCurrent();
  if (shared) { state.build = normalizeBuild(shared.build, byId); state.name = shared.name || 'Shared build'; }
  else if (current?.build) { state.build = normalizeBuild(current.build, byId); state.name = current.name || 'Untitled build'; state.savedId = current.savedId || null; }
  $('#build-name').value = state.name;
  state.result = evaluate(state.build, state.catalog, { resolution: state.resolution });
  render();

  // 3D last, so the lists are usable even if WebGL fails
  try {
    const { createScene } = await import('./scene.js');
    scene = createScene($('#viewport'), {
      onPick: (slot) => openPicker(slot, slot === 'storage' ? state.build.storage[0] || null : null),
      onHover: (slot, x, y) => {
        const tip = $('#tip');
        if (!slot) { tip.hidden = true; return; }
        const r = state.result.parts;
        const p = slot === 'storage' ? r.storage[0] : r[slot];
        const n = slot === 'storage' ? r.storage.length : STACKABLE.includes(slot) ? r.qty[slot] : 1;
        const label = slot === 'storage' && n > 1 ? `${n} drives` : `${n > 1 ? `${n}× ` : ''}${p?.name || 'Bundled cooler'}`;
        tip.innerHTML = `${esc(SLOT[slot].label)}<small>${esc(label)}</small>`;
        tip.style.left = `${x}px`; tip.style.top = `${y}px`;
        tip.hidden = false;
      },
    });
    render();
    loading.classList.add('done');
  } catch (err) {
    console.error(err);
    loading.classList.add('error');
    loading.textContent = 'The 3D view needs WebGL, which isn’t available here. The builder still works.';
  }
}

init();
