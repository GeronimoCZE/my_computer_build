import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadCatalog } from '../lib/catalog.js';
import { evaluate, emptyBuild, normalizeBuild, candidateIssues, canAddMore, maxQty, withPart } from '../shared/engine.js';

const catalog = await loadCatalog();
const build = (o) => ({ ...emptyBuild(), ...o });
const codes = (r) => r.issues.map((i) => i.code);

const highEnd = build({
  case: 'case-fractal-north', motherboard: 'mb-msi-b850-tomahawk', cpu: 'cpu-r7-9800x3d',
  cooler: 'cool-thermalright-pa120se', ram: 'ram-gskill-z5neo-32-6000', gpu: 'gpu-rx9070xt-pulse',
  storage: ['ssd-samsung-990pro-2tb'], psu: 'psu-corsair-rm850x',
});

test('catalog loads with no validation errors', () => {
  assert.ok(catalog.parts.cpu.length > 20);
  assert.ok(catalog.games.length >= 5);
});

test('a sensible high-end build is compatible and boot-ready', () => {
  const r = evaluate(highEnd, catalog);
  assert.deepEqual(r.issues.filter((i) => i.level === 'error'), []);
  assert.equal(r.boot.ready, true);
  assert.ok(r.power.peak > 450 && r.power.peak < 650, `peak ${r.power.peak}`);
});

test('socket mismatch is an error', () => {
  const r = evaluate({ ...highEnd, cpu: 'cpu-i5-14600k' }, catalog);
  assert.ok(codes(r).includes('socket'));
});

test('DDR4 kit in a DDR5 board is an error', () => {
  const r = evaluate({ ...highEnd, ram: 'ram-corsair-lpx-16-3200' }, catalog);
  assert.ok(codes(r).includes('ram-type'));
});

test('4-module kit in an ITX board is an error', () => {
  const r = evaluate(build({ motherboard: 'mb-gb-b550i-pro', ram: 'ram-gskill-ripjaws-32-4x8' }), catalog);
  assert.ok(codes(r).includes('ram-slots'));
});

test('ATX board / ATX PSU / tall cooler in an ITX case are errors', () => {
  const r = evaluate({ ...highEnd, case: 'case-fractal-terra' }, catalog);
  for (const c of ['form-factor', 'psu-form', 'cooler-height']) assert.ok(codes(r).includes(c), c);
});

test('Ryzen 5000 on B450 warns about BIOS; Ryzen 2000 on B550 is unsupported', () => {
  assert.ok(codes(evaluate(build({ motherboard: 'mb-msi-b450-tomahawk', cpu: 'cpu-r5-5600x' }), catalog)).includes('bios'));
  assert.ok(codes(evaluate(build({ motherboard: 'mb-asus-b550-plus', cpu: 'cpu-r7-2700x' }), catalog)).includes('chipset-support'));
});

test('undersized PSU is flagged', () => {
  const r = evaluate({ ...highEnd, gpu: 'gpu-rtx5090-fe', psu: 'psu-evga-500w1' }, catalog);
  assert.ok(codes(r).includes('psu-watts'));
});

test('F-series CPU with no GPU has no video output', () => {
  const r = evaluate(build({ cpu: 'cpu-i5-12400f' }), catalog);
  assert.ok(codes(r).includes('no-video'));
});

test('FPS estimates are ordered sensibly', () => {
  const fast = evaluate({ ...highEnd, gpu: 'gpu-rtx5090-fe' }, catalog, { resolution: '4K' }).fps.results;
  const slow = evaluate({ ...highEnd, gpu: 'gpu-gtx1060-6gb' }, catalog, { resolution: '4K' }).fps.results;
  for (let i = 0; i < fast.length; i++) assert.ok(fast[i].fps >= slow[i].fps, fast[i].name);
  const er = fast.find((g) => g.id === 'eldenring');
  assert.equal(er.fps, 60);
  assert.equal(er.bound, 'cap');
});

test('FPS is null without CPU', () => {
  const r = evaluate(build({ gpu: 'gpu-rtx5070-fe' }), catalog);
  assert.equal(r.fps.results[0].fps, null);
});

test('discontinued parts fall back to used price', () => {
  const r = evaluate(build({ gpu: 'gpu-rtx4090-fe' }), catalog);
  assert.equal(r.price.retail, 1700);
  assert.deepEqual(r.price.discontinued.length, 1);
});

test('normalizeBuild drops unknown ids and wrong categories', () => {
  const b = normalizeBuild({ cpu: 'gpu-rtx5070-fe', gpu: 'nope', storage: ['ssd-wd-sn850x-1tb', 'x'] }, catalog.byId);
  assert.equal(b.cpu, null);
  assert.equal(b.gpu, null);
  assert.deepEqual(b.storage, ['ssd-wd-sn850x-1tb']);
});

test('candidateIssues reports issues for the slot being picked', () => {
  const iss = candidateIssues(highEnd, catalog, 'gpu', 'gpu-rtx5090-fe');
  assert.ok(iss.some((i) => i.code === 'psu-watts' || i.code === 'psu-headroom'));
});

test('two memory kits fill four slots; a third kit has no room', () => {
  const b = { ...highEnd, qty: { ram: 2, gpu: 1 } };
  const r = evaluate(b, catalog);
  assert.ok(!codes(r).includes('ram-slots'));
  assert.ok(codes(r).includes('ddr5-four'));
  assert.equal(r.price.retail, evaluate(highEnd, catalog).price.retail + catalog.byId[highEnd.ram].price.new);
  assert.deepEqual(maxQty(highEnd, catalog, 'ram').max, 2);
  assert.ok(codes(evaluate({ ...highEnd, qty: { ram: 3, gpu: 1 } }, catalog)).includes('ram-slots'));
  assert.equal(maxQty({ ...highEnd, motherboard: 'mb-asrock-b650i' }, catalog, 'ram').max, 1);
});

test('two single-module sticks run dual channel', () => {
  const b = build({ motherboard: 'mb-asus-b550-plus', cpu: 'cpu-r5-5600', ram: 'ram-kingston-8-2666-single' });
  assert.ok(codes(evaluate(b, catalog)).includes('single-channel'));
  const two = evaluate({ ...b, qty: { ram: 2, gpu: 1 } }, catalog);
  assert.ok(!codes(two).includes('single-channel'));
  assert.ok(!codes(two).includes('low-ram'));
});

test('second graphics card: board slots, spacing and case room decide', () => {
  const ws = { ...highEnd, motherboard: 'mb-asus-x870e-e', gpu: 'gpu-rtx5080-fe', psu: 'psu-seasonic-tx1600', qty: { ram: 1, gpu: 2 } };
  const r = evaluate(ws, catalog);
  assert.deepEqual(r.issues.filter((i) => i.level === 'error'), []);
  assert.ok(codes(r).includes('multi-gpu'));
  assert.equal(r.fps.cards, 2);
  const one = evaluate({ ...ws, qty: { ram: 1, gpu: 1 } }, catalog);
  assert.equal(r.power.peak - one.power.peak, 360); // both cards at full load
  assert.deepEqual(r.fps.results.map((g) => g.fps), one.fps.results.map((g) => g.fps)); // games use one card
  assert.ok(codes(evaluate({ ...ws, gpu: 'gpu-rtx5070ti-tuf' }, catalog)).includes('gpu-block')); // 3.6-slot card covers slot 2
  assert.ok(codes(evaluate({ ...ws, motherboard: 'mb-asrock-b650i' }, catalog)).includes('gpu-slots'));
  assert.equal(canAddMore({ ...ws, motherboard: null, qty: { ram: 1, gpu: 1 } }, catalog, 'gpu').ok, false);
});

test('drive limits follow M.2 slots; quantities survive normalising', () => {
  const b = build({ motherboard: 'mb-asrock-a620m', storage: ['ssd-samsung-990pro-2tb'] });
  assert.equal(canAddMore(b, catalog, 'storage', 'ssd-samsung-990pro-2tb').ok, false);
  assert.equal(canAddMore(b, catalog, 'storage', 'hdd-wd-blue-4tb').ok, true);
  const n = normalizeBuild({ ram: 'ram-gskill-z5neo-32-6000', qty: { ram: '2', gpu: 3 } }, catalog.byId);
  assert.deepEqual(n.qty, { ram: 2, gpu: 1 }); // no GPU picked, so one
  assert.deepEqual(normalizeBuild({ ram: 'ram-gskill-z5neo-32-6000' }, catalog.byId).qty, { ram: 1, gpu: 1 });
  // swapping in a 4-module kit shrinks two kits to one
  assert.equal(withPart({ ...highEnd, qty: { ram: 2, gpu: 1 } }, catalog, 'ram', 'ram-gskill-ripjaws-32-4x8').qty.ram, 1);
});
