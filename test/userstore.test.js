import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, readdir, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { loadCatalog } from '../lib/catalog.js';
import { createUserStore, MAX_BUILDS } from '../lib/userstore.js';
import { PRESETS } from '../shared/presets.js';

const catalog = await loadCatalog();
const dir = await mkdtemp(path.join(tmpdir(), 'mcb-users-'));
after(() => rm(dir, { recursive: true, force: true }));
const store = createUserStore({ dir, byId: catalog.byId });
const uid = (n) => n.toString(16).padStart(32, '0');
const sample = { name: '1440p', build: PRESETS[1].build, summary: { retail: 1900, used: 1440, count: 8, cpu: 'Ryzen 7 7800X3D', gpu: 'RX 9070 XT' } };

test('a new account has no builds', async () => {
  assert.deepEqual(await store.list(uid(1)), []);
});

test('put saves, updates in place and lists newest first', async () => {
  const u = uid(2);
  const a = await store.put(u, 'a', sample);
  assert.equal(a.id, 'a');
  assert.equal(a.name, '1440p');
  assert.equal(a.build.cpu, 'cpu-r7-7800x3d');
  assert.ok(a.createdAt && a.updatedAt);
  await store.put(u, 'b', { ...sample, name: 'Second' });
  assert.deepEqual((await store.list(u)).map((b) => b.id), ['b', 'a']);
  const a2 = await store.put(u, 'a', { ...sample, name: 'Renamed' });
  assert.equal(a2.name, 'Renamed');
  assert.equal(a2.createdAt, a.createdAt, 'created date kept on update');
  assert.equal((await store.list(u)).length, 2);
});

test('put cleans what the browser sends', async () => {
  const u = uid(3);
  const b = await store.put(u, 'x_1-Y', {
    name: `  Evil\u0000\u001f name ${'z'.repeat(100)}`,
    build: { cpu: 'cpu-does-not-exist', gpu: PRESETS[1].build.gpu, storage: ['nope', PRESETS[1].build.storage[0]], extra: 'ignored' },
    summary: { retail: -5, used: 1e9, count: 3.6, cpu: { toString: () => 'x' }, gpu: 'g'.repeat(500) },
    createdAt: 'not a date',
  });
  assert.equal(b.name.length, 60);
  assert.doesNotMatch(b.name, /[\u0000-\u001f]/);
  assert.equal(b.build.cpu, null, 'unknown part dropped');
  assert.equal(b.build.gpu, PRESETS[1].build.gpu);
  assert.deepEqual(b.build.storage, [PRESETS[1].build.storage[0]]);
  assert.equal(b.build.extra, undefined);
  assert.deepEqual(b.summary, { retail: null, used: null, count: 4, cpu: null, gpu: 'g'.repeat(120) });
  assert.ok(!Number.isNaN(Date.parse(b.createdAt)));
  const blank = await store.put(u, 'blank', { name: '   ', build: {} });
  assert.equal(blank.name, 'Untitled build');
});

test('put rejects bad ids and bodies with a 400', async () => {
  for (const id of ['', 'a b', '../../etc/passwd', 'x'.repeat(41), 'é']) {
    await assert.rejects(store.put(uid(4), id, sample), (e) => e.status === 400, id);
  }
  await assert.rejects(store.put(uid(4), 'ok', null), (e) => e.status === 400);
  await assert.rejects(store.put(uid(4), 'ok', 'string'), (e) => e.status === 400);
});

test('user ids that are not 32 hex characters never reach the file system', async () => {
  await assert.rejects(store.list('../escape'), /bad user id/);
  await assert.rejects(store.put('ABC', 'a', sample), /bad user id/);
});

test(`an account keeps at most ${MAX_BUILDS} builds`, async () => {
  const u = uid(5);
  for (let i = 0; i < MAX_BUILDS; i++) await store.put(u, `b${i}`, sample);
  await assert.rejects(store.put(u, 'one-more', sample), (e) => e.status === 409);
  await store.put(u, 'b0', { ...sample, name: 'still editable' });
  assert.equal((await store.list(u)).length, MAX_BUILDS);
});

test('parallel writes for one account are serialised, nothing is lost', async () => {
  const u = uid(6);
  await Promise.all(Array.from({ length: 25 }, (_, i) => store.put(u, `p${i}`, sample)));
  assert.equal((await store.list(u)).length, 25);
  const files = await readdir(dir);
  assert.ok(!files.some((f) => f.endsWith('.tmp')), 'no temp files left behind');
  JSON.parse(await readFile(path.join(dir, `${u}.json`), 'utf8'));
});

test('remove and removeAll', async () => {
  const u = uid(7);
  await store.put(u, 'a', sample);
  await store.put(u, 'b', sample);
  assert.equal(await store.remove(u, 'a'), true);
  assert.equal(await store.remove(u, 'a'), false);
  assert.deepEqual((await store.list(u)).map((b) => b.id), ['b']);
  await store.removeAll(u);
  assert.deepEqual(await store.list(u), []);
  assert.ok(!(await readdir(dir)).includes(`${u}.json`));
  await store.removeAll(u); // twice is fine
});
