// Server-rendered pages. Each returns a full HTML document through renderPage().
import { SLOTS, emptyBuild, evaluate, normalizeBuild, candidateIssues } from '../../shared/engine.js';
import { PRESETS } from '../../shared/presets.js';
import { CATEGORY, specLine, capacity, partPath, partTitle } from '../../shared/format.js';
import { encodeShare } from '../../public/js/store.js';
import { esc, usd, monthName, fit, fitSentences } from './html.js';
import { icon, MARK } from './icons.js';
import { renderPage, breadcrumbs } from './layout.js';
import { siteJsonLd, appJsonLd, faqJsonLd } from './seo.js';

const SLOT = Object.fromEntries(SLOTS.map((s) => [s.key, s]));
const catIcon = (k, cls = '') => `<span class="cat-tile${cls ? ` ${cls}` : ''}">${icon(`cat-${k}`)}</span>`;
const totalParts = (catalog) => Object.values(catalog.meta.counts).reduce((a, b) => a + b, 0);
const yearSpan = (catalog) => {
  const ys = Object.values(catalog.byId).map((p) => p.released);
  return [Math.min(...ys), Math.max(...ys)];
};
const priceOf = (p) => p.price.new ?? p.price.used ?? null;
const shareHash = (build, name) => encodeShare(normalizeBuild(build), name);

function presetResult(catalog, preset, resolution = preset.resolution) {
  return evaluate(normalizeBuild(preset.build, catalog.byId), catalog, { resolution });
}

function priceCells(p) {
  return `<td class="num">${p.price.new != null ? usd(p.price.new) : '<span class="muted">not sold new</span>'}</td><td class="num muted">${usd(p.price.used)}</td>`;
}

/* ================================================================= home */

export const FAQ = (catalog) => {
  const [y0] = yearSpan(catalog);
  const live = catalog.meta.livePrices?.enabled?.length;
  return [
    { q: 'Is My Computer Build free?', a: 'Yes. There is no account to create and nothing to pay. Builds save in your browser automatically. If you sign in with Google, your saved builds follow you to other devices.' },
    { q: 'How does the compatibility check work?', a: 'Every time you add or change a part, the builder checks the CPU socket and chipset, memory type and slot count, board, case and power supply sizes, graphics card length, cooler height and radiator mounts, M.2 slots, SATA ports and drive bays, PCIe slot spacing for several graphics cards, and whether the power supply has enough headroom. Problems show in red, both in the list and on the 3D model.' },
    { q: 'Where do the prices come from?', a: `${live ? 'Prices with a green dot are live: new prices from Best Buy and used prices from current eBay listings. The rest are' : 'They are'} hand-compiled street-price estimates in US dollars as of ${monthName(catalog.meta.pricesAsOf)}. “Used” means a typical second-hand price for a part in good condition. Euro and Czech koruna prices use fixed exchange rates, so local prices with VAT can differ.` },
    { q: 'How accurate are the FPS estimates?', a: 'They come from a model, not from benchmarks of your exact PC. Each game has reference frame rates for a fast graphics card and a fast processor; your parts scale those by their performance, and the slower of the two limits the result. Too little video memory or single-channel memory lowers it further. Expect a range of about ±15%.' },
    { q: 'Can I plan a PC with used or older parts?', a: `Yes. The catalog goes back to ${y0}, with parts such as the Core i7-4790K, GTX 970 and GTX 1080 Ti, and every part has a used price estimate. When the build is done, the shopping list searches eBay for each part in used, new or any condition.` },
    { q: 'Can I add two graphics cards or more memory?', a: 'Yes. Memory kits, graphics cards and drives have a quantity. The motherboard and case set the limit, from memory slots and x16 slots to how far apart those slots are, M.2 slots, SATA ports and drive bays. A second graphics card adds price and power but not FPS, because games use one card.' },
    { q: 'How do I share a build?', a: 'Press Share in the builder. It copies a link with the whole build in it, so whoever opens it sees the same parts. The shopping list has its own link that opens straight to the list.' },
    { q: 'Does it work on a phone?', a: 'Yes. The layout is made for small screens, and you can rotate the 3D model with a finger. The 3D view needs WebGL; without it the parts list, checks and estimates still work.' },
  ];
};

export function homePage(ctx, { catalog }) {
  const { site, origin } = ctx;
  const total = totalParts(catalog);
  const [y0, y1] = yearSpan(catalog);
  const demo = PRESETS[1];
  const r = presetResult(catalog, demo, '1440p');
  const p = r.parts;
  const faqs = FAQ(catalog);

  // "Will it work?": the checks this exact build passes, from its real specs
  const checks = [
    `${p.cpu.name} and ${p.motherboard.chipset} board share socket ${p.cpu.socket}`,
    `${p.ram.type} kit in a ${p.motherboard.memoryType} board, ${p.ram.modules} of ${p.motherboard.memorySlots} slots`,
    `${p.gpu.lengthMm} mm card, the case takes up to ${p.case.maxGpuMm} mm`,
    `${p.psu.wattage} W supply, ${r.power.recommendedPsu} W recommended`,
  ];
  const fpsGames = r.fps.results.filter((g) => !g.capped).slice(0, 4);
  const fpsMax = Math.max(...fpsGames.map((g) => g.high), 200);
  const meterMax = Math.max(r.power.peak, p.psu.wattage) * 1.1;

  const eras = [
    { label: '2024 and newer', test: (y) => y >= 2024 },
    { label: '2020 to 2023', test: (y) => y >= 2020 && y < 2024 },
    { label: `${y0} to 2019`, test: (y) => y < 2020 },
  ].map((e) => {
    const list = Object.values(catalog.byId).filter((x) => e.test(x.released));
    const ex = ['gpu', 'cpu'].map((k) => list.filter((x) => x.category === k).sort((a, b) => (b.perfIndex ?? b.gameIndex) - (a.perfIndex ?? a.gameIndex))[0]).filter(Boolean);
    return { ...e, n: list.length, ex };
  });

  const body = `
<section class="hero">
  <div class="wrap hero-grid">
    <div class="hero-copy">
      <p class="pill"><span class="pill-dot"></span>Free 3D PC builder<span class="pill-more">&nbsp;· ${total} parts from ${y0} to ${y1}</span></p>
      <h1>Plan your next PC <span class="accent-text">in 3D.</span></h1>
      <p class="lead">Pick parts and watch them go into the case. Compatibility, new and used prices, power draw and FPS update with every part you add, for this year’s hardware and for used parts going back to ${y0}.</p>
      <div class="actions">
        <a class="btn primary lg" href="/build">Start building ${icon('arrow')}</a>
        <a class="btn line lg" href="/builds">See example builds</a>
      </div>
      <p class="continue" data-continue hidden></p>
      <ul class="ticks">
        <li>${icon('check')}No account needed</li>
        <li>${icon('check')}Works on your phone</li>
        <li>${icon('check')}Shopping list with eBay links</li>
      </ul>
    </div>
    <figure class="hero-shot">
      <div class="shot-frame">
        <picture data-themed>
          <source srcset="/img/builder-dark.jpg" media="(prefers-color-scheme: dark)">
          <img src="/img/builder-light.jpg" data-light="/img/builder-light.jpg" data-dark="/img/builder-dark.jpg" width="1600" height="1000" alt="The 3D builder with a complete 1440p gaming build: the parts list on the left, the PC case in 3D in the middle, and price, power and FPS estimates on the right" fetchpriority="high">
        </picture>
      </div>
    </figure>
  </div>
</section>

<section class="section" aria-labelledby="live-h">
  <div class="wrap">
    <header class="section-head">
      <p class="kicker">As you build</p>
      <h2 id="live-h">Four answers that update with every part</h2>
      <p>Shown here for the <a href="/builds/${demo.slug}">1440p example build</a>: a ${esc(p.cpu.name)} with a ${esc(p.gpu.name.replace(/ \d+GB$/, ''))}.</p>
    </header>
    <div class="bento">
      <article class="tile">
        <div class="tile-top">${icon('check')}<h3>Will it work?</h3></div>
        <p>Sockets, memory, sizes, clearances, slots and power are checked live. Problems turn red in the list and on the model.</p>
        <div class="demo demo-checks">
          <p class="verdict-line"><span class="ok-dot"></span>Compatible and ready to boot</p>
          <ul>${checks.map((c) => `<li>${icon('check')}<span>${esc(c)}</span></li>`).join('')}</ul>
        </div>
      </article>
      <article class="tile">
        <div class="tile-top">${icon('tag')}<h3>What will it cost?</h3></div>
        <p>Every part has a new and a used price, so you can see what buying second-hand saves.</p>
        <div class="demo demo-price">
          <div><span class="big num">${usd(r.price.retail)}</span><small>new</small></div>
          <div><span class="big num muted">${usd(r.price.used)}</span><small>used</small></div>
          <div class="bar"><i style="width:100%"></i></div>
          <div class="bar used"><i style="width:${Math.round((r.price.used / r.price.retail) * 100)}%"></i></div>
        </div>
      </article>
      <article class="tile">
        <div class="tile-top">${icon('bolt')}<h3>How much power?</h3></div>
        <p>Idle, gaming and peak draw, and the power supply size that leaves room for spikes.</p>
        <div class="demo demo-power">
          <div class="figs"><div><span class="num">${r.power.idle}</span><small>W idle</small></div><div><span class="num">${r.power.gaming}</span><small>W gaming</small></div><div><span class="num">${r.power.peak}</span><small>W peak</small></div></div>
          <div class="meter"><i class="peak" style="width:${(r.power.peak / meterMax) * 100}%"></i><i class="gaming" style="width:${(r.power.gaming / meterMax) * 100}%"></i><b style="left:${(p.psu.wattage / meterMax) * 100}%"><span>${p.psu.wattage} W supply</span></b></div>
        </div>
      </article>
      <article class="tile">
        <div class="tile-top">${icon('gauge')}<h3>How fast in games?</h3></div>
        <p>Estimated FPS in ${catalog.games.length} games at 1080p, 1440p and 4K, with what limits each one.</p>
        <div class="demo demo-fps">
          ${fpsGames.map((g) => `<div class="fps"><span>${esc(g.name)}</span><b class="num">${g.fps}<small> fps</small></b><i><em style="width:${(g.fps / fpsMax) * 100}%"></em></i></div>`).join('')}
          <p class="demo-note">1440p, ${esc(fpsGames[0]?.preset || 'high')} settings</p>
        </div>
      </article>
    </div>
  </div>
</section>

<section class="section alt" aria-labelledby="eras-h">
  <div class="wrap split">
    <div>
      <p class="kicker">New and used</p>
      <h2 id="eras-h">From this year’s cards back to ${y0}</h2>
      <p>Most builders only know what is on sale today. This one also has the parts people buy second-hand, with their quirks: Intel 6th and 7th gen chips that don’t run on 8th gen boards, AM4 boards that need a BIOS update first, quad-cores that stutter in new games.</p>
      <p>When the build is ready, the shopping list turns it into an eBay search for every part, with a target price to aim for.</p>
      <a class="text-link" href="/parts">Browse the parts catalog ${icon('arrow')}</a>
    </div>
    <ol class="eras">
      ${eras.map((e) => `<li>
        <span class="era-n num">${e.n}</span>
        <div><b>${esc(e.label)}</b><span>${e.ex.map((x) => `<a href="${partPath(x)}">${esc(x.name.replace(/ Founders Edition| Limited Edition/, ''))}</a>`).join(', ')}</span></div>
      </li>`).join('')}
    </ol>
  </div>
</section>

<section class="section" aria-labelledby="builds-h">
  <div class="wrap">
    <header class="section-head row">
      <div><p class="kicker">Example builds</p><h2 id="builds-h">Start from a checked build</h2></div>
      <a class="text-link" href="/builds">All example builds ${icon('arrow')}</a>
    </header>
    ${buildCards(catalog)}
  </div>
</section>

<section class="section alt" aria-labelledby="how-h">
  <div class="wrap">
    <header class="section-head"><p class="kicker">How it works</p><h2 id="how-h">From empty case to shopping list</h2></header>
    <ol class="steps">
      <li><span class="step-n num">01</span><h3>Pick a case</h3><p>Start with an empty case or an example build. The case sets the board size, the longest graphics card and the tallest cooler that fit.</p></li>
      <li><span class="step-n num">02</span><h3>Add parts</h3><p>Each part shows whether it works with the rest before you pick it. Parts without a place to mount yet wait on the bench in front of the case.</p></li>
      <li><span class="step-n num">03</span><h3>Buy with a list</h3><p>When the build is ready to boot, get a shopping list with an eBay search per part. Tick parts off as you buy them, or share and print the list.</p></li>
    </ol>
  </div>
</section>

<section class="section" aria-labelledby="faq-h" id="faq">
  <div class="wrap narrow">
    <header class="section-head"><p class="kicker">FAQ</p><h2 id="faq-h">Questions people ask</h2></header>
    <div class="faq">${faqs.map((f) => `<details><summary>${esc(f.q)}${icon('down')}</summary><p>${esc(f.a)}</p></details>`).join('')}</div>
  </div>
</section>

<section class="cta-band">
  <div class="wrap cta-inner">
    <div class="cta-mark">${MARK}</div>
    <h2>Your next PC, part by part.</h2>
    <p>Free, in your browser, with nothing to install.</p>
    <a class="btn primary lg" href="/build">Start building ${icon('arrow')}</a>
  </div>
</section>`;

  return renderPage(ctx, {
    fullTitle: `${site.name}: Free 3D PC Builder with Prices and FPS`,
    title: 'Free 3D PC Builder with Compatibility, Price and FPS Estimates',
    description: `Plan a PC part by part in 3D. Free compatibility checks, new and used prices, power draw and FPS estimates in ${catalog.games.length} games, for ${total} parts from ${y0} to ${y1}.`,
    ogImage: '/og/default.png',
    jsonLd: [...siteJsonLd(ctx), appJsonLd({ origin, site, catalog }), faqJsonLd(faqs)],
    bodyClass: 'page-home',
    body,
  });
}

function buildCards(catalog) {
  return `<div class="build-cards">${PRESETS.map((pr) => {
    const r = presetResult(catalog, pr);
    const gpu = r.parts.gpu ? `${r.parts.qty.gpu > 1 ? `${r.parts.qty.gpu}× ` : ''}${r.parts.gpu.name.replace(/ Founders Edition| Limited Edition/, '')}` : '';
    return `<a class="build-card" href="/builds/${pr.slug}">
      <span class="bc-tag">${esc(pr.tag)}</span>
      <h3>${esc(pr.title)}</h3>
      <p>${esc(r.parts.cpu.name)} · ${esc(gpu)}</p>
      <div class="bc-foot"><span><b class="num">${usd(r.price.retail)}</b> new</span><span class="muted"><b class="num">${usd(r.price.used)}</b> used</span>${icon('arrow')}</div>
    </a>`;
  }).join('')}</div>`;
}

/* ================================================================= builder */

export function builderPage(ctx, { catalog }) {
  const total = totalParts(catalog);
  const skeletonRows = SLOTS.map((s) => `<li class="slot skeleton" aria-hidden="true">${catIcon(s.key)}<div class="slot-main"><div class="slot-label">${esc(s.label)}</div><span class="sk-line w60"></span></div><span class="sk-line w40"></span></li>`).join('');
  const skBlock = (h) => `<div class="block-head"><p class="eyebrow">${h}</p></div><span class="sk-line w80"></span><span class="sk-line w50"></span>`;
  const body = `
<h1 class="sr-only">3D PC builder</h1>
<div class="builder" id="app" aria-busy="true">
  <div class="build-bar">
    <div class="bb-name">
      <label class="sr-only" for="build-name">Build name</label>
      <input id="build-name" class="build-name" value="Untitled build" maxlength="60" autocomplete="off" spellcheck="false">
      <div class="progress" id="parts-progress" aria-live="polite"></div>
    </div>
    <div class="bb-actions">
      <button class="btn ghost sm" id="btn-new" type="button" title="Start a new build">${icon('new')}<span>New</span></button>
      <button class="btn ghost sm" id="btn-save" type="button" title="Save this build">${icon('save')}<span>Save</span></button>
      <button class="btn ghost sm" id="btn-builds" type="button" title="Your saved builds">${icon('folder')}<span>My builds</span><b class="count" id="builds-count" hidden></b></button>
      <button class="btn ghost sm" id="btn-share" type="button" title="Copy a link to this build">${icon('share')}<span>Share</span></button>
      <label class="currency"><span class="sr-only">Currency</span><select id="currency"><option>USD</option></select></label>
    </div>
  </div>

  <div class="workspace">
    <section class="panel parts" id="panel-parts" aria-label="Parts list">
      <div class="presets" id="presets" hidden>
        <p class="presets-lead">Start with an empty case, or load an example build:</p>
        <div class="preset-list" id="preset-list"></div>
      </div>
      <ol class="slot-list" id="slot-list">${skeletonRows}</ol>
      <div class="totals" id="totals"><div class="total"><p class="eyebrow">New</p><span class="sk-line w60"></span></div><div class="total"><p class="eyebrow">Used</p><span class="sk-line w60"></span></div></div>
    </section>

    <section class="stage" id="stage" aria-label="3D view of the build">
      <canvas id="viewport" aria-label="Interactive 3D model of the PC case. Drag to rotate, select a part to change it."></canvas>
      <div class="stage-top">
        <div class="boot-chip" id="boot-chip" role="status"></div>
        <div class="stage-tools">
          <button class="icon-btn" id="btn-glass" type="button" aria-pressed="true" title="Glass side panel">${icon('panel')}<span class="sr-only">Glass panel</span></button>
          <button class="icon-btn" id="btn-view" type="button" title="Reset the camera">${icon('reset')}<span class="sr-only">Reset view</span></button>
        </div>
      </div>
      <p class="bench-note" id="bench-note" hidden></p>
      <p class="stage-hint" id="stage-hint">Drag to rotate · scroll to zoom · click a part to change it</p>
      <div class="tip" id="tip" hidden></div>
      <div class="stage-loading" id="stage-loading" role="status">
        <div class="loader" aria-hidden="true">${MARK}</div>
        <p class="loader-text" id="loader-text">Loading ${total} parts…</p>
        <div class="loader-bar" aria-hidden="true"><i></i></div>
      </div>
    </section>

    <nav class="tabs" id="tabs" aria-label="Sections">
      <button type="button" data-tab="parts" aria-pressed="true">Parts</button>
      <button type="button" data-tab="stats" aria-pressed="false">Checks &amp; price <b id="tab-issues" hidden></b></button>
      <button type="button" data-tab="perf" aria-pressed="false">FPS</button>
    </nav>

    <section class="panel stats" id="panel-stats" aria-label="Build checks and estimates">
      <div class="stat-block" id="compat">${skBlock('Compatibility')}</div>
      <div class="stat-block" id="price">${skBlock('Price')}</div>
      <div class="stat-block" id="power">${skBlock('Power')}</div>
      <div class="stat-block" id="perf">${skBlock('Game performance')}</div>
      <details class="method">
        <summary>How the estimates work</summary>
        <div id="method-body"></div>
      </details>
    </section>
  </div>
</div>

<section class="builder-about" aria-labelledby="ba-h">
  <div class="wrap">
    <h2 id="ba-h">How to use the 3D PC builder</h2>
    <div class="ba-grid">
      <p>Select a slot in the parts list, or click a spot in the 3D case, to choose a part. The picker marks parts that won’t work with what you already have, and can hide them.</p>
      <p>The right-hand panel shows compatibility notes, the price new and used, power draw with the power supply you need, and estimated FPS in ${catalog.games.length} games at 1080p, 1440p or 4K.</p>
      <p>Your build saves in this browser as you go. Save it to My builds, share it as a link, or open the shopping list for an eBay search per part. Not sure where to start? Load one of the <a href="/builds">example builds</a>.</p>
    </div>
  </div>
</section>`;

  const after = `
<div class="sheet-backdrop" id="sheet-backdrop" hidden></div>
<aside class="sheet" id="picker" role="dialog" aria-modal="true" aria-labelledby="picker-title" hidden>
  <div class="sheet-head">
    <div class="sheet-title"><span class="cat-tile" id="picker-icon"></span><div><p class="eyebrow" id="picker-code"></p><h2 id="picker-title">Choose a part</h2></div></div>
    <button class="icon-btn" id="picker-close" type="button" title="Close (Esc)">${icon('x')}<span class="sr-only">Close</span></button>
  </div>
  <div class="picker-controls">
    <label class="search">${icon('search')}<input id="picker-search" type="search" placeholder="Search by name or brand" autocomplete="off"></label>
    <div class="filter-row">
      <div class="chips" id="era-chips" role="group" aria-label="Release era"></div>
      <select id="picker-sort" aria-label="Sort">
        <option value="rec">Best match</option>
        <option value="price-asc">Price: low to high</option>
        <option value="price-desc">Price: high to low</option>
        <option value="new">Newest first</option>
      </select>
    </div>
    <label class="toggle"><input type="checkbox" id="hide-incompatible"> <span>Hide parts that won’t work with this build</span></label>
  </div>
  <div class="picker-list" id="picker-list" role="list"></div>
</aside>

<dialog class="modal" id="builds-modal" aria-labelledby="builds-title">
  <div class="modal-head">
    <div><p class="eyebrow" id="builds-where">Saved in this browser</p><h2 id="builds-title">My builds</h2></div>
    <button class="icon-btn" type="button" data-close title="Close">${icon('x')}<span class="sr-only">Close</span></button>
  </div>
  <div class="builds-list" id="builds-list"></div>
</dialog>

<dialog class="modal shop" id="shop-modal" aria-labelledby="shop-title">
  <div class="modal-head">
    <div><p class="eyebrow">Shopping list</p><h2 id="shop-title">Untitled build</h2></div>
    <button class="icon-btn" type="button" data-close title="Close">${icon('x')}<span class="sr-only">Close</span></button>
  </div>
  <div class="shop-controls">
    <div class="seg" id="shop-cond" role="group" aria-label="Condition"></div>
    <label class="shop-site"><span>Search</span><select id="shop-site" aria-label="eBay site"></select></label>
  </div>
  <div class="shop-body">
    <div class="shop-banner" id="shop-banner" hidden></div>
    <ol class="shop-list" id="shop-list"></ol>
    <p class="shop-fine" id="shop-fine"></p>
  </div>
  <div class="shop-foot">
    <div class="shop-sum" id="shop-sum" aria-live="polite"></div>
    <div class="shop-export" role="group" aria-label="Export the list">
      <button class="btn primary sm" type="button" data-export="link">${icon('link')}<span>Copy link</span></button>
      <button class="btn line sm" type="button" data-export="text">${icon('copy')}<span>Copy text</span></button>
      <button class="btn line sm" type="button" data-export="csv">${icon('download')}<span>CSV</span></button>
      <button class="btn line sm" type="button" data-export="print">${icon('print')}<span>Print</span></button>
    </div>
  </div>
</dialog>
<div class="print-sheet" id="print-sheet" aria-hidden="true"></div>
<noscript><p class="noscript">The 3D builder needs JavaScript. You can still browse the <a href="/parts">parts catalog</a> and the <a href="/builds">example builds</a>.</p></noscript>`;

  return renderPage(ctx, {
    title: 'Free 3D PC Builder: Prices, Power and FPS',
    description: `Build a PC in 3D from ${total} parts. Live compatibility checks, new and used price estimates, power supply sizing and FPS estimates in ${catalog.games.length} games. Free, no sign-up.`,
    ogImage: '/og/builder.png',
    ogAlt: 'The My Computer Build 3D builder with a complete gaming PC',
    jsonLd: appJsonLd({ origin: ctx.origin, site: ctx.site, catalog }),
    importMap: true,
    styles: ['/css/builder.css'],
    scripts: ['/js/site.js', '/js/main.js'],
    bodyClass: 'page-builder',
    hideCta: true,
    footerClass: 'compact',
    body,
    afterFooter: after,
  });
}

/* ================================================================= parts */

export function partsIndexPage(ctx, { catalog }) {
  const crumbs = breadcrumbs(ctx, [{ name: 'Parts', path: '/parts' }]);
  const total = totalParts(catalog);
  const [y0, y1] = yearSpan(catalog);
  const cards = SLOTS.map((s) => {
    const list = catalog.parts[s.key];
    const prices = list.map(priceOf).filter((v) => v != null);
    const ys = list.map((x) => x.released);
    return `<a class="cat-card" href="/parts/${CATEGORY[s.key].slug}">
      ${catIcon(s.key, 'lg')}
      <h2>${esc(CATEGORY[s.key].many)}</h2>
      <p>${list.length} parts · ${Math.min(...ys)}–${Math.max(...ys)}</p>
      <p class="muted">${usd(Math.min(...prices))} to ${usd(Math.max(...prices))}</p>
    </a>`;
  }).join('');
  const body = `
<section class="page-head">
  <div class="wrap">
    ${crumbs.html}
    <h1>PC parts catalog</h1>
    <p class="lead">${total} parts released from ${y0} to ${y1}, each with its specs, a new and used price estimate, and the other parts it works with.</p>
  </div>
</section>
<section class="section tight"><div class="wrap"><div class="cat-grid">${cards}</div>
  <p class="fine">Prices are estimates in US dollars as of ${monthName(catalog.meta.pricesAsOf)}. <a href="/about#estimates">How the estimates work</a>.</p>
</div></section>`;
  return renderPage(ctx, {
    title: 'PC Parts Catalog: Specs and Prices',
    description: `Specs, new and used prices and compatibility for ${total} PC parts from ${y0} to ${y1}: graphics cards, CPUs, motherboards, memory, drives, PSUs, coolers and cases.`,
    ogImage: '/og/parts.png',
    jsonLd: [crumbs.ld],
    bodyClass: 'page-parts',
    body,
  });
}

// Columns for each category table: [header, cell(p), numeric?]
const COLUMNS = {
  gpu: [['Video memory', (p) => `${p.vramGB} GB`, 1], ['Performance', (p) => perfBar(p.perfIndex, 128), 0], ['Board power', (p) => `${p.tbp} W`, 1], ['Length', (p) => `${p.lengthMm} mm`, 1]],
  cpu: [['Cores / threads', (p) => `${p.cores} / ${p.threads}`, 1], ['Boost', (p) => `${p.boostGHz.toFixed(1)} GHz`, 1], ['Socket', (p) => p.socket, 0], ['Gaming', (p) => perfBar(p.gameIndex, 100), 0]],
  motherboard: [['Socket', (p) => p.socket, 0], ['Chipset', (p) => p.chipset, 0], ['Size', (p) => p.formFactor, 0], ['Memory', (p) => `${p.memoryType} ×${p.memorySlots}`, 0], ['M.2', (p) => p.m2Slots, 1]],
  ram: [['Type', (p) => `${p.type}-${p.speed}`, 0], ['Capacity', (p) => `${p.capacityGB} GB`, 1], ['Modules', (p) => `${p.modules} × ${p.capacityGB / p.modules} GB`, 1], ['Latency', (p) => `CL${p.cas}`, 1]],
  storage: [['Capacity', (p) => capacity(p.capacityGB), 1], ['Interface', (p) => (p.interface === 'nvme' ? `NVMe PCIe ${p.pcieGen}.0` : 'SATA'), 0], ['Type', (p) => (p.kind === 'hdd' ? 'Hard drive' : 'SSD'), 0], ['Read', (p) => `${p.readMBs.toLocaleString('en-US')} MB/s`, 1]],
  psu: [['Wattage', (p) => `${p.wattage} W`, 1], ['Efficiency', (p) => p.efficiency, 0], ['Size', (p) => p.formFactor, 0], ['Cabling', (p) => ({ full: 'Fully modular', semi: 'Semi-modular', none: 'Fixed' }[p.modular] || '—'), 0]],
  cooler: [['Type', (p) => coolerType(p), 0], ['Size', (p) => (p.type === 'aio' ? `${p.radiatorMm} mm radiator` : `${p.heightMm} mm tall`), 1], ['Rated for', (p) => `~${p.tdpRating} W`, 1], ['Fans', (p) => p.fans, 1]],
  case: [['Boards', (p) => p.formFactors.join(', '), 0], ['Max GPU', (p) => `${p.maxGpuMm} mm`, 1], ['Max cooler', (p) => `${p.maxCoolerMm} mm`, 1], ['Front', (p) => cap(p.front), 0]],
};
const cap = (s) => (s ? s[0].toUpperCase() + s.slice(1) : '—');
const coolerType = (p) => ({ air: 'Air tower', 'low-profile': 'Low-profile air', aio: 'Liquid (AIO)' }[p.type] || p.type);
const perfBar = (v, max) => `<span class="perf"><i style="width:${Math.min(100, (v / max) * 100)}%"></i></span><span class="sr-only">${v}</span>`;

const CATEGORY_INTRO = {
  gpu: 'Graphics cards from the GTX 900 series to the RTX 50 series, Radeon RX 400 to RX 9070 XT and Intel Arc. Performance is relative to the fastest card here; board power and length decide the power supply and the case.',
  cpu: 'Intel Core from 4th gen to Core Ultra 200S, and AMD Ryzen 1000 to 9000. The gaming bar is relative to the Ryzen 7 9800X3D. Socket and chipset decide the motherboard.',
  motherboard: 'Boards for AM4, AM5 and Intel sockets from LGA1150 to LGA1851. The socket and chipset decide which processors run on a board, and the memory type decides the RAM.',
  ram: 'DDR3, DDR4 and DDR5 memory kits. A board takes one memory type only, and the kit’s module count has to fit its slots.',
  storage: 'NVMe and SATA SSDs and hard drives. NVMe drives need an M.2 slot on the board; SATA drives need a SATA port and a bay in the case.',
  psu: 'ATX and SFX power supplies from 500 W to 1600 W. ATX 3.x models with a native 16-pin cable suit the newest graphics cards.',
  cooler: 'Air towers, low-profile coolers and all-in-one liquid coolers. Height has to fit the case and the mounting kit has to fit the socket.',
  case: 'Cases from Mini-ITX to full ATX. Each lists the longest graphics card, the tallest cooler and the radiators it takes.',
};

export function partsCategoryPage(ctx, { catalog }, cat) {
  const C = CATEGORY[cat];
  const crumbs = breadcrumbs(ctx, [{ name: 'Parts', path: '/parts' }, { name: C.many, path: `/parts/${C.slug}` }]);
  const cols = COLUMNS[cat];
  const list = [...catalog.parts[cat]].sort((a, b) => b.released - a.released || (priceOf(b) ?? 0) - (priceOf(a) ?? 0));
  const ys = list.map((x) => x.released);
  const rows = list.map((p) => `<tr data-q="${esc(`${p.brand} ${p.name} ${p.socket || ''} ${p.chipset || ''}`.toLowerCase())}">
      <th scope="row"><a href="${partPath(p)}"><span class="brand-s">${esc(p.brand)}</span> ${esc(p.name)}</a></th>
      <td class="num muted">${p.released}</td>
      ${cols.map(([, f, n]) => `<td${n ? ' class="num"' : ''}>${f(p)}</td>`).join('')}
      ${priceCells(p)}
    </tr>`).join('');
  const body = `
<section class="page-head">
  <div class="wrap">
    ${crumbs.html}
    <div class="head-row">${catIcon(cat, 'lg')}<h1>${esc(C.many)}</h1></div>
    <p class="lead">${esc(CATEGORY_INTRO[cat])}</p>
    <p class="meta">${list.length} parts · released ${Math.min(...ys)}–${Math.max(...ys)} · prices in USD as of ${monthName(catalog.meta.pricesAsOf)}</p>
  </div>
</section>
<section class="section tight">
  <div class="wrap">
    <div class="table-tools">
      <label class="search sm">${icon('search')}<input type="search" placeholder="Filter ${esc(C.noun)}" data-filter="#parts-table" aria-label="Filter the table"></label>
      <a class="btn line sm" href="/build">${icon('cube')}Open the builder</a>
    </div>
    <div class="table-wrap">
      <table class="data" id="parts-table">
        <thead><tr><th scope="col">Name</th><th scope="col" class="num">Year</th>${cols.map(([h, , n]) => `<th scope="col"${n ? ' class="num"' : ''}>${esc(h)}</th>`).join('')}<th scope="col" class="num">New</th><th scope="col" class="num">Used</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
      <p class="table-empty" hidden>No ${esc(C.noun)} match that filter.</p>
    </div>
    <nav class="cat-nav" aria-label="Other categories">${SLOTS.filter((s) => s.key !== cat).map((s) => `<a href="/parts/${CATEGORY[s.key].slug}">${catIcon(s.key, 'sm')}${esc(CATEGORY[s.key].many)}</a>`).join('')}</nav>
  </div>
</section>`;
  // As many of the newest names as fit in a search snippet.
  const lead = `Compare ${list.length} ${C.noun} from ${Math.min(...ys)} to ${Math.max(...ys)}`;
  const tail = '. Specs, new and used prices, and what each one works with.';
  let names = list.slice(0, 3).map((p) => `${p.brand} ${p.name.replace(/ Founders Edition| Limited Edition/, '')}`);
  while (names.length && `${lead}, including ${names.join(', ')}${tail}`.length > 160) names = names.slice(0, -1);
  return renderPage(ctx, {
    title: `${C.many}: Specs, Prices and Compatibility`,
    description: `${lead}${names.length ? `, including ${names.join(', ')}` : ''}${tail}`,
    ogImage: '/og/parts.png',
    jsonLd: [crumbs.ld, {
      '@context': 'https://schema.org',
      '@type': 'ItemList',
      name: C.many,
      numberOfItems: list.length,
      itemListElement: list.map((p, i) => ({ '@type': 'ListItem', position: i + 1, url: `${ctx.origin}${partPath(p)}`, name: partTitle(p) })),
    }],
    bodyClass: 'page-parts',
    body,
  });
}

// Full spec sheet rows for a part page: [label, value]
function specRows(p) {
  const yesNo = (v) => (v ? 'Yes' : 'No');
  const rows = {
    cpu: () => [['Socket', p.socket], ['Cores / threads', `${p.cores} / ${p.threads}`], ['Base clock', p.baseGHz ? `${p.baseGHz.toFixed(1)} GHz` : null], ['Boost clock', `${p.boostGHz.toFixed(1)} GHz`], ['TDP', `${p.tdp} W`], ['Typical gaming draw', `${p.gamingW} W`], ['Peak draw', `${p.peakW} W`], ['Memory support', p.memory.join(', ')], ['Integrated graphics', p.igpu?.name || 'None'], ['Cooler in the box', yesNo(p.boxCooler)], ['Unlocked for overclocking', yesNo(p.unlocked)], ['Gaming index', `${p.gameIndex} (Ryzen 7 9800X3D = 100)`]],
    gpu: () => [['GPU maker', p.chip], ['Video memory', `${p.vramGB} GB`], ['Performance index', `${p.perfIndex} (RTX 4090 = 100)`], ['Board power', `${p.tbp} W`], ['Recommended power supply', `${p.recommendedPsu} W`], ['Power connector', p.powerConnector], ['Length', `${p.lengthMm} mm`], ['Thickness', `${p.slots} slots`], ['Fans', p.fans]],
    motherboard: () => [['Socket', p.socket], ['Chipset', p.chipset], ['Form factor', p.formFactor], ['Memory', `${p.memoryType}, ${p.memorySlots} slots, up to ${p.maxMemoryGB} GB`], ['Fastest rated memory', `${p.maxMemSpeed} MT/s`], ['M.2 slots', `${p.m2Slots}${p.m2Slots ? ` (up to PCIe ${p.m2Gen}.0)` : ''}`], ['SATA ports', p.sataPorts], ['PCIe generation', p.pcieGen ? `${p.pcieGen}.0` : null], ['x16 slots for graphics cards', p.gpuSlots ?? (p.formFactor === 'ITX' ? 1 : 2)], ['Wi-Fi', p.wifi || 'No'], ['CPU overclocking', yesNo(p.cpuOverclock)]],
    ram: () => [['Type', p.type], ['Capacity', `${p.capacityGB} GB`], ['Modules', `${p.modules} × ${p.capacityGB / p.modules} GB`], ['Speed', `${p.speed} MT/s`], ['CAS latency', `CL${p.cas}`], ['RGB lighting', yesNo(p.rgb)]],
    storage: () => [['Type', p.kind === 'hdd' ? 'Hard drive' : 'SSD'], ['Interface', p.interface === 'nvme' ? `NVMe, PCIe ${p.pcieGen}.0` : 'SATA'], ['Form factor', p.formFactor === 'm2' ? 'M.2 2280' : `${p.formFactor}-inch`], ['Capacity', capacity(p.capacityGB)], ['Sequential read', `${p.readMBs.toLocaleString('en-US')} MB/s`], ['Power', p.powerW ? `${p.powerW} W` : null]],
    psu: () => [['Wattage', `${p.wattage} W`], ['Efficiency', p.efficiency], ['Form factor', p.formFactor], ['ATX 3.x', yesNo(p.atx3)], ['Native 16-pin cable', yesNo(p.native16pin)], ['Cabling', { full: 'Fully modular', semi: 'Semi-modular', none: 'Fixed cables' }[p.modular]]],
    cooler: () => [['Type', coolerType(p)], [p.type === 'aio' ? 'Radiator' : 'Height', p.type === 'aio' ? `${p.radiatorMm} mm` : `${p.heightMm} mm`], ['Rated for', `about ${p.tdpRating} W`], ['Fans', p.fans], ['Sockets', p.sockets.join(', ')]],
    case: () => [['Motherboards', p.formFactors.join(', ')], ['Longest graphics card', `${p.maxGpuMm} mm`], ['Tallest CPU cooler', `${p.maxCoolerMm} mm`], ['Radiators', p.radiators.length ? p.radiators.map((x) => `${x} mm`).join(', ') : 'None'], ['Power supply', p.psuForms.join(', ')], ['3.5-inch bays', p.drives35], ['2.5-inch bays', p.drives25], ['Expansion slots', p.expansionSlots ?? (p.formFactors.includes('ATX') ? 7 : p.formFactors.includes('mATX') ? 5 : 3)], ['Size (H × W × D)', `${p.heightMm} × ${p.widthMm} × ${p.depthMm} mm`], ['Front panel', cap(p.front)]],
  }[p.category]?.() || [];
  return [...rows, ['Released', p.released], ['Launch price', p.msrp ? usd(p.msrp) : null]].filter(([, v]) => v != null && v !== '');
}

// The headline numbers on a part page
function keyFacts(p) {
  return {
    cpu: () => [[`${p.cores}/${p.threads}`, 'cores / threads'], [`${p.boostGHz.toFixed(1)} GHz`, 'boost clock'], [p.socket, 'socket'], [`${p.tdp} W`, 'TDP']],
    gpu: () => [[`${p.vramGB} GB`, 'video memory'], [`${p.tbp} W`, 'board power'], [`${p.recommendedPsu} W`, 'power supply'], [`${p.lengthMm} mm`, 'length']],
    motherboard: () => [[p.socket, 'socket'], [p.chipset, 'chipset'], [p.formFactor, 'form factor'], [p.memoryType, 'memory']],
    ram: () => [[`${p.capacityGB} GB`, 'capacity'], [p.type, 'type'], [`${p.speed}`, 'MT/s'], [`CL${p.cas}`, 'latency']],
    storage: () => [[capacity(p.capacityGB), 'capacity'], [p.interface === 'nvme' ? `PCIe ${p.pcieGen}.0` : 'SATA', 'interface'], [`${p.readMBs.toLocaleString('en-US')}`, 'MB/s read'], [p.kind === 'hdd' ? 'HDD' : 'SSD', 'type']],
    psu: () => [[`${p.wattage} W`, 'wattage'], [p.efficiency.replace('80+ ', ''), '80 Plus rating'], [p.formFactor, 'form factor'], [p.atx3 ? 'Yes' : 'No', 'ATX 3.x']],
    cooler: () => [[coolerType(p), 'type'], [p.type === 'aio' ? `${p.radiatorMm} mm` : `${p.heightMm} mm`, p.type === 'aio' ? 'radiator' : 'height'], [`~${p.tdpRating} W`, 'rated for'], [`${p.fans}`, p.fans === 1 ? 'fan' : 'fans']],
    case: () => [[p.formFactors[0], 'largest board'], [`${p.maxGpuMm} mm`, 'max GPU'], [`${p.maxCoolerMm} mm`, 'max cooler'], [p.radiators.length ? `${Math.max(...p.radiators)} mm` : 'None', 'largest radiator']],
  }[p.category]?.() || [];
}

const RELATIONS = {
  cpu: [['motherboard', 'Motherboards it runs on']],
  motherboard: [['cpu', 'Processors it supports'], ['ram', 'Memory kits that fit']],
  ram: [['motherboard', 'Motherboards it fits']],
  cooler: [['cpu', 'Processors it can mount on']],
  gpu: [['case', 'Cases it fits in']],
  case: [['gpu', 'Graphics cards that fit'], ['motherboard', 'Motherboards that fit']],
  storage: [['motherboard', 'Motherboards with a slot for it']],
  psu: [['gpu', 'Graphics cards it can power']],
};

/** Which parts of another category work with this one, judged by the same engine as the builder. */
function relation(catalog, part, other) {
  const ok = []; const no = [];
  for (const q of catalog.parts[other]) {
    let why = null;
    if (part.category === 'psu') { if (q.recommendedPsu > part.wattage) why = `Its maker recommends a ${q.recommendedPsu} W supply.`; }
    else why = candidateIssues({ ...emptyBuild(), [other]: q.id }, catalog, part.category, part.id).find((i) => i.level === 'error')?.message || null;
    (why ? no : ok).push({ q, why });
  }
  return { ok, no };
}

function relationBlock(catalog, part, [other, label]) {
  const { ok, no } = relation(catalog, part, other);
  const many = CATEGORY[other].noun;
  const link = (q) => `<a href="${partPath(q)}">${esc(partTitle(q))}</a>`;
  let inner;
  if (!no.length) inner = `<p>Works with all ${ok.length} ${many} in the catalog.</p>`;
  else if (!ok.length) inner = `<p>None of the ${no.length} ${many} in the catalog. ${esc(no[0].why || '')}</p>`;
  else if (ok.length >= no.length) {
    inner = `<p>Works with ${ok.length} of ${ok.length + no.length} ${many} in the catalog. Not with:</p>
      <ul class="rel-list no">${no.slice(0, 10).map((x) => `<li>${link(x.q)}<small>${esc(x.why || '')}</small></li>`).join('')}</ul>${no.length > 10 ? `<p class="muted">and ${no.length - 10} more.</p>` : ''}`;
  } else {
    inner = `<p>Works with ${ok.length} of ${ok.length + no.length} ${many} in the catalog:</p>
      <ul class="rel-list">${ok.slice(0, 16).map((x) => `<li>${link(x.q)}</li>`).join('')}</ul>${ok.length > 16 ? `<p class="muted">and ${ok.length - 16} more.</p>` : ''}`;
  }
  return `<section class="rel"><h2>${catIcon(other, 'sm')}${esc(label)}</h2>${inner}</section>`;
}

function similarParts(catalog, part) {
  const pv = priceOf(part) ?? 0;
  const score = (q) => (part.category === 'gpu' ? Math.abs(q.perfIndex - part.perfIndex) : part.category === 'cpu' ? Math.abs(q.gameIndex - part.gameIndex) : Math.abs((priceOf(q) ?? 0) - pv) / 20 + Math.abs(q.released - part.released));
  return catalog.parts[part.category].filter((q) => q.id !== part.id).sort((a, b) => score(a) - score(b)).slice(0, 4);
}

export function partPage(ctx, { catalog }, part) {
  const C = CATEGORY[part.category];
  const title = partTitle(part);
  const crumbs = breadcrumbs(ctx, [{ name: 'Parts', path: '/parts' }, { name: C.many, path: `/parts/${C.slug}` }, { name: part.name, path: partPath(part) }]);
  const pr = part.price;
  const live = (l) => (l ? `<span class="live"><i class="live-dot"></i>live, ${esc(l.source === 'ebay' ? 'eBay' : 'Best Buy')}</span>` : '');
  const similar = similarParts(catalog, part);
  const body = `
<section class="page-head">
  <div class="wrap">
    ${crumbs.html}
    <div class="part-head">
      ${catIcon(part.category, 'xl')}
      <div>
        <p class="kicker">${esc(C.one)} · ${part.released}</p>
        <h1>${esc(title)}</h1>
        <p class="spec-line">${esc(specLine(part))}</p>
      </div>
    </div>
  </div>
</section>
<section class="section tight">
  <div class="wrap part-grid">
    <div class="part-main">
      <div class="facts">${keyFacts(part).map(([v, l]) => `<div><b class="num">${esc(v)}</b><span>${esc(l)}</span></div>`).join('')}</div>
      <section class="spec-sheet">
        <h2>Specifications</h2>
        <dl>${specRows(part).map(([k, v]) => `<div><dt>${esc(k)}</dt><dd>${esc(v)}</dd></div>`).join('')}</dl>
      </section>
      ${(RELATIONS[part.category] || []).map((r) => relationBlock(catalog, part, r)).join('')}
    </div>
    <aside class="part-side">
      <div class="price-card">
        <p class="eyebrow">Price estimate</p>
        <div class="pc-row"><span>New</span><b class="num">${pr.new != null ? usd(pr.new) : '—'}</b></div>
        ${pr.new == null ? '<p class="fine">No longer sold new.</p>' : live(pr.live?.new)}
        <div class="pc-row"><span>Used</span><b class="num">${usd(pr.used)}</b></div>
        ${live(pr.live?.used)}
        <p class="fine">US dollars, ${pr.live ? 'live where marked, otherwise ' : ''}estimated as of ${monthName(catalog.meta.pricesAsOf)}. Launch price ${usd(part.msrp)}.</p>
        <a class="btn primary block" href="/build?add=${encodeURIComponent(part.id)}" rel="nofollow">${icon('plus')}Add to my build</a>
        <a class="btn line block" href="/build#${shareHash({ [part.category]: part.category === 'storage' ? [part.id] : part.id }, title).slice(1)}" rel="nofollow">${icon('cube')}See it in 3D</a>
      </div>
      <div class="similar">
        <p class="eyebrow">Similar ${esc(C.noun)}</p>
        <ul>${similar.map((q) => `<li><a href="${partPath(q)}"><span>${esc(partTitle(q))}</span><small class="num">${usd(priceOf(q))}${q.price.new == null ? ' used' : ''}</small></a></li>`).join('')}</ul>
      </div>
    </aside>
  </div>
</section>`;
  const priceText = pr.new != null ? `about ${usd(pr.new)} new and ${usd(pr.used)} used` : `about ${usd(pr.used)} used (no longer sold new)`;
  return renderPage(ctx, {
    title: fit([`${title}: Specs, Price and Compatibility`, `${title}: Specs and Price`, `${title} Specs`, title], 62),
    description: fitSentences([
      `${title}${title.includes(String(part.released)) ? '' : ` (${part.released})`}: ${specLine(part).replaceAll(' · ', ', ')}.`,
      `Costs ${priceText}.`,
      'See which parts it works with and try it in a 3D build.',
      'See which parts it works with.',
    ]),
    ogImage: '/og/parts.png',
    jsonLd: [crumbs.ld],
    bodyClass: 'page-part',
    body,
  });
}

/* ================================================================= example builds */

export function buildsIndexPage(ctx, { catalog }) {
  const crumbs = breadcrumbs(ctx, [{ name: 'Example builds', path: '/builds' }]);
  const body = `
<section class="page-head">
  <div class="wrap">
    ${crumbs.html}
    <h1>Example PC builds</h1>
    <p class="lead">Complete builds that pass every compatibility check, from a budget 1080p gaming PC to a 4K RTX 5090 rig, plus two used builds from 2014 and 2017. Open any of them in the 3D builder and change what you like.</p>
  </div>
</section>
<section class="section tight"><div class="wrap">${buildCards(catalog)}</div></section>`;
  return renderPage(ctx, {
    title: 'Example PC Builds for 1080p, 1440p and 4K',
    description: 'Checked example PC builds with new and used prices, power draw and FPS: budget 1080p, 1440p, 4K with an RTX 5090, a dual-GPU workstation and used builds.',
    ogImage: '/og/builds.png',
    jsonLd: [crumbs.ld, {
      '@context': 'https://schema.org',
      '@type': 'ItemList',
      itemListElement: PRESETS.map((p, i) => ({ '@type': 'ListItem', position: i + 1, url: `${ctx.origin}/builds/${p.slug}`, name: p.title })),
    }],
    bodyClass: 'page-builds',
    body,
  });
}

export function buildPage(ctx, { catalog }, preset) {
  const crumbs = breadcrumbs(ctx, [{ name: 'Example builds', path: '/builds' }, { name: preset.title, path: `/builds/${preset.slug}` }]);
  const results = Object.fromEntries(catalog.resolutions.map((res) => [res, presetResult(catalog, preset, res)]));
  const r = results[preset.resolution];
  const rows = [];
  for (const s of SLOTS) {
    const v = r.parts[s.key];
    if (s.multi) {
      const groups = [];
      for (const d of v) { const g = groups.find((x) => x.p.id === d.id); if (g) g.n++; else groups.push({ p: d, n: 1 }); }
      groups.forEach((g) => rows.push({ s, p: g.p, n: g.n }));
    } else if (v) rows.push({ s, p: v, n: s.stack ? r.parts.qty[s.key] : 1 });
    else if (s.key === 'cooler' && r.parts.cpu?.boxCooler) rows.push({ s, p: null, n: 1, note: `Cooler bundled with the ${r.parts.cpu.name}` });
  }
  const notes = r.issues.filter((i) => i.code !== 'box-cooler');
  const open = `/build${encodeShare(normalizeBuild(preset.build, catalog.byId), preset.name)}`;
  const body = `
<section class="page-head">
  <div class="wrap">
    ${crumbs.html}
    <p class="kicker">${esc(preset.tag)} · ${esc(preset.resolution)} gaming</p>
    <h1>${esc(preset.title)}</h1>
    <p class="lead">${esc(preset.intro)}</p>
    <div class="actions"><a class="btn primary" href="${esc(open)}" rel="nofollow">${icon('cube')}Open in the 3D builder</a><a class="btn line" href="/builds">All example builds</a></div>
  </div>
</section>
<section class="section tight">
  <div class="wrap">
    <div class="facts wide">
      <div><b class="num">${usd(r.price.retail)}</b><span>buying new</span></div>
      <div><b class="num">${usd(r.price.used)}</b><span>buying used</span></div>
      <div><b class="num">${r.power.gaming} W</b><span>gaming draw</span></div>
      <div><b class="num">${r.power.recommendedPsu} W</b><span>recommended supply</span></div>
    </div>
    <div class="build-grid">
      <section>
        <h2>Parts list</h2>
        <div class="table-wrap"><table class="data parts-list">
          <thead><tr><th scope="col">Part</th><th scope="col">Model</th><th scope="col" class="num">New</th><th scope="col" class="num">Used</th></tr></thead>
          <tbody>${rows.map(({ s, p, n, note }) => `<tr>
            <td class="cat-cell">${catIcon(s.key, 'sm')}${esc(s.label)}</td>
            <th scope="row">${p ? `${n > 1 ? `<span class="qty-x num">${n}×</span> ` : ''}<a href="${partPath(p)}">${esc(partTitle(p))}</a><small>${esc(specLine(p))}</small>` : `<span class="muted">${esc(note)}</span>`}</th>
            ${p ? `<td class="num">${p.price.new != null ? usd(p.price.new * n) : '—'}</td><td class="num muted">${usd(p.price.used == null ? null : p.price.used * n)}</td>` : '<td class="num muted">included</td><td></td>'}
          </tr>`).join('')}</tbody>
          <tfoot><tr><td></td><th scope="row">Total</th><td class="num">${usd(r.price.retail)}</td><td class="num muted">${usd(r.price.used)}</td></tr></tfoot>
        </table></div>
        <p class="fine">Prices are estimates in US dollars as of ${monthName(catalog.meta.pricesAsOf)}${r.price.discontinued.length ? '. Parts no longer sold new count at their used price in the new total' : ''}.</p>
      </section>
      <section>
        <h2>Estimated FPS</h2>
        <div class="table-wrap"><table class="data fps-table">
          <thead><tr><th scope="col">Game</th>${catalog.resolutions.map((res) => `<th scope="col" class="num${res === preset.resolution ? ' hl' : ''}">${esc(res)}</th>`).join('')}</tr></thead>
          <tbody>${catalog.games.map((g, gi) => `<tr><th scope="row">${esc(g.name)}<small>${esc(g.preset)}</small></th>${catalog.resolutions.map((res) => {
            const x = results[res].fps.results[gi];
            return `<td class="num${res === preset.resolution ? ' hl' : ''}">${x.fps}${x.bound === 'cpu' ? '<sup title="Limited by the processor">C</sup>' : ''}</td>`;
          }).join('')}</tr>`).join('')}</tbody>
        </table></div>
        <p class="fine">Average FPS from a model, about ±15%. <sup>C</sup> marks results limited by the processor rather than the graphics card.</p>
        <h2>Compatibility</h2>
        ${notes.length ? `<ul class="notes">${notes.map((i) => `<li class="${i.level}">${icon(i.level === 'error' ? 'stop' : i.level === 'warn' ? 'alert' : 'info')}<span>${esc(i.message)}</span></li>`).join('')}</ul>` : `<p class="ok-line">${icon('check')}Every part fits and works together, and the power supply has headroom.</p>`}
      </section>
    </div>
    <nav class="more-builds" aria-label="More example builds"><h2>More example builds</h2>${buildCards(catalog).replace(new RegExp(`<a class="build-card" href="/builds/${preset.slug}">[\\s\\S]*?</a>`), '')}</nav>
  </div>
</section>`;
  return renderPage(ctx, {
    title: preset.title,
    description: fitSentences([preset.summary, `About ${usd(r.price.retail)} new or ${usd(r.price.used)} used, ${r.power.gaming} W while gaming.`, 'Parts list, FPS and compatibility.']),
    ogImage: `/og/build-${preset.slug}.png`,
    ogAlt: `${preset.title}: parts, price and FPS`,
    ogType: 'article',
    jsonLd: [crumbs.ld],
    bodyClass: 'page-build',
    body,
  });
}

/* ================================================================= about, 404 */

export function aboutPage(ctx, { catalog }) {
  const { site } = ctx;
  const crumbs = breadcrumbs(ctx, [{ name: 'About', path: '/about' }]);
  const total = totalParts(catalog);
  const [y0, y1] = yearSpan(catalog);
  const live = catalog.meta.livePrices?.enabled?.length;
  const faqs = FAQ(catalog);
  const creator = site.creator.url
    ? `<a href="${esc(site.creator.url)}" rel="author">${esc(site.creator.name || site.creator.url)}</a>`
    : esc(site.creator.name || 'an independent developer');
  const body = `
<section class="page-head">
  <div class="wrap narrow">
    ${crumbs.html}
    <h1>About My Computer Build</h1>
    <p class="lead">A free 3D PC builder for planning a computer part by part, with the checks and estimates you need before you buy.</p>
  </div>
</section>
<section class="section tight">
  <div class="wrap narrow prose">
    <h2>What it does</h2>
    <p>You start with an empty case and add parts. Each part goes into the 3D model where it would sit in a real PC, and parts with nowhere to mount yet wait on a bench in front of the case. With every change the site checks compatibility and updates the price new and used, the power draw and the estimated frame rates in ${catalog.games.length} popular games.</p>
    <p>The catalog has ${total} parts released from ${y0} to ${y1}. That includes current hardware and the older parts people buy second-hand, so you can plan a budget build from used parts as easily as a new one.</p>

    <h2 id="estimates">How the estimates work</h2>
    <h3>Prices</h3>
    <p>${live ? 'Prices with a green dot are live: new prices from Best Buy and used prices as the typical asking price of matching eBay listings, refreshed every few hours. Every other price is' : 'Prices are'} a hand-compiled street price in US dollars as of ${monthName(catalog.meta.pricesAsOf)}, not a quote. “Used” is a typical price for a part in good condition. Euro and Czech koruna amounts use fixed exchange rates, so local prices with VAT often differ. Memory and SSD prices moved a lot in 2025 and 2026.</p>
    <h3>Compatibility</h3>
    <p>The checker looks at the CPU socket and whether the chipset supports that processor, the memory type and number of slots, the board, case and power supply form factors, graphics card length, cooler height and radiator mounts, M.2 slots, SATA ports, drive bays and power supply headroom. For several memory kits, graphics cards or drives, it also counts slots, the spacing between x16 slots and the case’s expansion slots. Slot spacing follows each board’s usual layout and is approximate, so check the manual for unusual setups.</p>
    <h3>Frame rates</h3>
    <p>FPS comes from a model, not from benchmarks of your exact PC. For each game there are reference frame rates for a system limited only by its graphics card and one limited only by its processor. Your parts scale those by relative performance, and the two are combined so that the slower part limits the result. Too little video memory, single-channel memory or too little RAM lower it. Expect ±15% or more: drivers, game patches, scenes and upscaling all move the numbers.</p>
    <h3>Power</h3>
    <p>Power adds typical CPU and graphics card draw while gaming and at worst-case load, plus the board, memory, drives and fans. The recommended power supply adds 30% headroom for short spikes.</p>

    <h2>Your data</h2>
    <p>The builder works without an account and without tracking. Builds save in your own browser. If you sign in with Google, your saved builds are stored on the server so you can open them on other devices, and you can delete them at any time. The <a href="/privacy">privacy policy</a> and <a href="/cookies">cookie policy</a> have the details.</p>

    <h2 id="contact">Who makes it</h2>
    <p>My Computer Build is designed and built by ${creator}.${site.contactEmail ? ` For questions, corrections or a part you’d like added, email <a href="mailto:${esc(site.contactEmail)}">${esc(site.contactEmail)}</a>.` : ''}</p>
    <p class="fine">Built with <a href="https://threejs.org" rel="noopener">three.js</a> (MIT licence) and the <a href="https://vercel.com/font" rel="noopener">Geist</a> typeface (SIL Open Font License). Product names belong to their makers; this site isn’t affiliated with them or with Google, eBay or Best Buy.</p>
  </div>
</section>
<section class="section alt" id="faq" aria-labelledby="faq-h2">
  <div class="wrap narrow">
    <header class="section-head"><p class="kicker">FAQ</p><h2 id="faq-h2">Frequently asked questions</h2></header>
    <div class="faq">${faqs.map((f) => `<details><summary>${esc(f.q)}${icon('down')}</summary><p>${esc(f.a)}</p></details>`).join('')}</div>
  </div>
</section>`;
  return renderPage(ctx, {
    title: 'How the Checks and Estimates Work',
    description: `What My Computer Build does, how its compatibility checks and price, power and FPS estimates work, and who makes it. ${total} parts from ${y0} to ${y1}.`,
    ogImage: '/og/about.png',
    jsonLd: [crumbs.ld, { '@context': 'https://schema.org', '@type': 'AboutPage', name: 'About My Computer Build', url: `${ctx.origin}/about`, isPartOf: { '@id': `${ctx.origin}/#website` } }],
    bodyClass: 'page-about',
    body,
  });
}

export function notFoundPage(ctx) {
  const body = `
<section class="not-found">
  <div class="wrap narrow">
    <p class="nf-code num">404</p>
    <h1>This page isn’t in the case</h1>
    <p class="lead">The link may be old, or the part may have been renamed. Try one of these instead:</p>
    <div class="actions"><a class="btn primary" href="/build">${icon('cube')}Open the builder</a><a class="btn line" href="/parts">Browse parts</a><a class="btn line" href="/">Home</a></div>
  </div>
</section>`;
  return renderPage(ctx, { title: 'Page not found', description: 'This page could not be found on My Computer Build.', noindex: true, bodyClass: 'page-404', body });
}
