import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadCatalog } from '../lib/catalog.js';
import { shopQuery } from '../lib/prices/match.js';
import { SLOTS, resolveBuild, emptyBuild } from '../shared/engine.js';
import { shopLines, targetPrice, ebayUrl, listTotals, toText, toCsv } from '../public/js/shop.js';

const catalog = await loadCatalog();
for (const p of Object.values(catalog.byId)) p.shop = { q: shopQuery(p), cat: null };
const parts = (o) => resolveBuild({ ...emptyBuild(), ...o }, catalog.byId);

test('shop queries keep the faster sibling out', () => {
  assert.equal(shopQuery(catalog.byId['gpu-gtx1080-fe']), 'GTX 1080 -Ti -Super');
  assert.equal(shopQuery(catalog.byId['gpu-gtx1080ti-fe']), 'GTX 1080 Ti');
  assert.equal(shopQuery(catalog.byId['gpu-rx9070-reaper']), 'RX 9070 16GB -XT');
  assert.equal(shopQuery(catalog.byId['gpu-rxvega64-ref']), 'RX Vega 64 8GB -XT');
  assert.equal(shopQuery(catalog.byId['cpu-i7-7700k']), 'Intel Core i7-7700K');
  assert.equal(shopQuery(catalog.byId['cpu-i7-7700k'], 'custom'), 'custom');
});

test('lines group identical drives and carry stacked quantities', () => {
  const lines = shopLines(parts({ gpu: 'gpu-gtx1070-fe', ram: 'ram-corsair-lpx-16-2400', qty: { ram: 2, gpu: 1 }, storage: ['hdd-wd-blue-4tb', 'ssd-samsung-960evo-500gb', 'hdd-wd-blue-4tb'] }), SLOTS);
  assert.deepEqual(lines.map((l) => [l.slot, l.qty]), [['ram', 2], ['gpu', 1], ['storage', 2], ['storage', 1]]);
});

test('target price falls back when a part is not sold in that condition', () => {
  const gpu = catalog.byId['gpu-gtx1080-fe']; // used only
  assert.deepEqual(targetPrice(gpu, 'new'), { value: gpu.price.used, basis: 'used', note: 'not sold new' });
  const ram = catalog.byId['ram-corsair-lpx-16-2400']; // sold new and used
  assert.equal(targetPrice(ram, 'any').value, Math.min(ram.price.new, ram.price.used));
});

test('eBay links filter by condition, and use US categories only on eBay.com', () => {
  const p = { ...catalog.byId['gpu-gtx1080-fe'], shop: { q: 'GTX 1080 -Ti -Super', cat: 27386 } };
  const us = new URL(ebayUrl(p, 'used', 'us'));
  assert.equal(us.host, 'www.ebay.com');
  assert.equal(us.searchParams.get('_nkw'), 'GTX 1080 -Ti -Super');
  assert.equal(us.searchParams.get('_sacat'), '27386');
  assert.equal(us.searchParams.get('LH_ItemCondition'), '3000');
  const de = new URL(ebayUrl(p, 'any', 'de'));
  assert.equal(de.host, 'www.ebay.de');
  assert.equal(de.searchParams.get('_sacat'), null);
  assert.equal(de.searchParams.get('LH_ItemCondition'), null);
});

test('totals, text and CSV agree', () => {
  const lines = shopLines(parts({ cpu: 'cpu-i7-7700k', gpu: 'gpu-gtx1080-fe', qty: { ram: 1, gpu: 2 } }), SLOTS);
  const bought = new Set(['cpu:cpu-i7-7700k']);
  const t = listTotals(lines, 'used', bought);
  assert.equal(t.total, 65 + 2 * 110);
  assert.equal(t.left, 2 * 110);
  assert.equal(t.boughtCount, 1);
  const money = (v) => '$' + v;
  const text = toText(lines, { name: 'Test', cond: 'used', site: 'us', money, bought });
  assert.match(text, /\[x\] 03 Processor: Intel Core i7-7700K · ~\$65/);
  assert.match(text, /\[ \] 06 Graphics card: 2× NVIDIA GeForce GTX 1080 Founders Edition · ~\$220/);
  assert.match(text, /Total: ~\$285/);
  const csv = toCsv(lines, { cond: 'used', site: 'us', currency: 'CZK', rate: 21, bought });
  assert.ok(csv.startsWith('﻿Slot,'));
  assert.match(csv, /,2,NVIDIA,GeForce GTX 1080 Founders Edition,used,2310,4620,/);
  assert.match(csv, /,Total,.*,5990,/);
});
