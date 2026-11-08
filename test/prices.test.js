import { test } from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import { mkdtemp } from 'node:fs/promises';
import { loadCatalog } from '../lib/catalog.js';
import { marketQuery, matchRule, titleMatches, robustMedian } from '../lib/prices/match.js';
import { createBestBuy } from '../lib/prices/bestbuy.js';
import { createEbay } from '../lib/prices/ebay.js';
import { createPriceService } from '../lib/prices/service.js';
import { evaluate, emptyBuild } from '../shared/engine.js';

const json = (body, status = 200) => ({ ok: status < 400, status, json: async () => body });

test('market queries', async () => {
  const c = await loadCatalog();
  assert.equal(marketQuery(c.byId['gpu-rtx5070ti-tuf']), 'RTX 5070 Ti 16GB');
  assert.equal(marketQuery(c.byId['gpu-rtx5090-fe']), 'RTX 5090');
  assert.equal(marketQuery(c.byId['gpu-rx9070-reaper']), 'RX 9070 16GB');
  assert.equal(marketQuery(c.byId['cpu-i5-12400f']), 'Core i5-12400F');
  assert.equal(marketQuery(c.byId['psu-corsair-rm850x']), 'Corsair RM850x');
  assert.match(marketQuery(c.byId['ram-gskill-z5neo-32-6000']), /G\.Skill Trident Z5 Neo RGB 32GB DDR5 6000/);
});

test('title matching rejects the wrong variant and junk', async () => {
  const c = await loadCatalog();
  const r5070 = matchRule(c.byId['gpu-rtx5070-fe']);
  assert.ok(titleMatches('MSI GeForce RTX 5070 12G Ventus 2X OC Graphics Card', r5070));
  assert.ok(!titleMatches('ASUS TUF RTX 5070 Ti 16GB', r5070));
  assert.ok(!titleMatches('NVIDIA RTX 5070 Founders Edition box only', r5070, { used: true }));
  const r9070 = matchRule(c.byId['gpu-rx9070-reaper']);
  assert.ok(!titleMatches('Sapphire Pulse RX 9070 XT 16GB', r9070));
  assert.ok(titleMatches('PowerColor Hellhound Radeon RX 9070 16GB GDDR6', r9070));
  const r7600 = matchRule(c.byId['cpu-r5-7600']);
  assert.ok(titleMatches('AMD Ryzen 5 7600 6-Core AM5 Processor', r7600));
  assert.ok(!titleMatches('AMD Ryzen 5 7600X 6-Core', r7600));
  const rPsu = matchRule(c.byId['psu-corsair-rm850x']);
  assert.ok(titleMatches('CORSAIR RM850x Fully Modular 80 PLUS Gold ATX Power Supply', rPsu));
  assert.ok(!titleMatches('Seasonic Focus GX-850 power supply', rPsu));
});

test('robust median ignores outliers', () => {
  assert.equal(robustMedian([400, 410, 420, 430, 9999, 1]), 415);
  assert.equal(robustMedian([]), null);
});

test('Best Buy provider: pinned SKU and keyword search', async () => {
  const c = await loadCatalog();
  const calls = [];
  const fetch = async (url) => {
    calls.push(url);
    if (url.includes('sku in(')) return json({ products: [{ sku: 111, name: 'AMD Ryzen 7 9800X3D', salePrice: 449.99, regularPrice: 479.99, onSale: true, url: 'https://bestbuy.com/x' }] });
    return json({ products: [
      { sku: 1, name: 'NVIDIA GeForce RTX 5070 Ti 16GB', salePrice: 799.99, onlineAvailability: true },
      { sku: 2, name: 'MSI GeForce RTX 5070 12GB', salePrice: 579.99, onlineAvailability: true },
      { sku: 3, name: 'Gigabyte GeForce RTX 5070 12GB', salePrice: 549.99, onlineAvailability: false },
    ] });
  };
  const bb = createBestBuy({ apiKey: 'k', fetch, delayMs: 0, sources: { 'cpu-r7-9800x3d': { bestbuy: { sku: 111 } } } });
  const out = await bb.fetchPrices([c.byId['cpu-r7-9800x3d'], c.byId['gpu-rtx5070-fe']]);
  assert.equal(out['cpu-r7-9800x3d'].price, 450);
  assert.equal(out['cpu-r7-9800x3d'].matchedBy, 'sku');
  assert.equal(out['gpu-rtx5070-fe'].price, 580); // in-stock, right variant
  assert.ok(calls[1].includes('(search=5070)'));
});

test('eBay provider: token, filtering, median', async () => {
  const c = await loadCatalog();
  let tokenCalls = 0;
  const fetch = async (url, opts = {}) => {
    if (url.includes('/oauth2/token')) { tokenCalls++; assert.match(opts.headers.Authorization, /^Basic /); return json({ access_token: 't', expires_in: 7200 }); }
    assert.equal(opts.headers.Authorization, 'Bearer t');
    assert.match(url, /conditions%3A%7BUSED%7D/);
    return json({ itemSummaries: [
      { title: 'EVGA GeForce RTX 3060 XC 12GB', price: { value: '185.00', currency: 'USD' } },
      { title: 'MSI RTX 3060 Ventus 12GB', price: { value: '175.00', currency: 'USD' } },
      { title: 'ASUS RTX 3060 12GB Dual', price: { value: '195.00', currency: 'USD' } },
      { title: 'RTX 3060 Ti 8GB', price: { value: '210.00', currency: 'USD' } },
      { title: 'RTX 3060 12GB for parts not working', price: { value: '40.00', currency: 'USD' } },
    ] });
  };
  const eb = createEbay({ clientId: 'a', clientSecret: 'b', fetch, delayMs: 0, categories: { gpu: 27386 } });
  const out = await eb.fetchPrices([c.byId['gpu-rtx3060-xc'], c.byId['gpu-rtx3060-xc']]);
  assert.equal(out['gpu-rtx3060-xc'].price, 185);
  assert.equal(out['gpu-rtx3060-xc'].count, 3);
  assert.equal(tokenCalls, 1);
  assert.match(out['gpu-rtx3060-xc'].url, /ebay\.com\/sch/);
});

test('price service overlays live prices, falls back when stale, feeds the engine', async () => {
  const c = await loadCatalog();
  let t = Date.parse('2026-11-07T12:00:00Z');
  const fake = { id: 'bestbuy', label: 'Best Buy', field: 'new', fetchPrices: async () => ({ 'gpu-rtx5070-fe': { price: 529, source: 'bestbuy', url: 'u' }, 'gpu-rtx5080-fe': null, 'gpu-rtx5090-fe': { price: 89, source: 'bestbuy' } }) };
  const dir = await mkdtemp(path.join(os.tmpdir(), 'mcb-'));
  let updates = 0;
  const svc = createPriceService({ catalog: c, providers: [fake], cacheFile: path.join(dir, 'c.json'), now: () => t, log: {}, onUpdate: () => updates++ });
  await svc.refresh();
  const p = c.byId['gpu-rtx5070-fe'];
  assert.equal(p.price.new, 529);
  assert.equal(p.price.estimate.new, 569);
  assert.equal(p.price.live.new.source, 'bestbuy');
  assert.equal(c.byId['gpu-rtx5080-fe'].price.new, 1149); // not found -> estimate
  assert.equal(c.meta.livePrices.liveNew, 1);
  assert.equal(c.byId['gpu-rtx5090-fe'].price.new, 2899); // an $89 "5090" is implausible, so it's ignored
  assert.equal(svc.status().enabled[0].lastRun.rejected, 1);
  const r = evaluate({ ...emptyBuild(), gpu: 'gpu-rtx5070-fe' }, c);
  assert.equal(r.price.retail, 529);
  t += 25 * 3600_000; // older than maxAge (24 h)
  svc.apply();
  assert.equal(p.price.new, 569);
  assert.equal(p.price.live, null);
  assert.ok(updates >= 2);
});
