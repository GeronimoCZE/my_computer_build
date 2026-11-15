// Saved builds for signed-in users: one small JSON file per account in .data/users/.
// Writes are atomic (temp file + rename) and serialised per user.
import { mkdir, readFile, writeFile, rename, rm } from 'node:fs/promises';
import path from 'node:path';
import { normalizeBuild } from '../shared/engine.js';

export const MAX_BUILDS = 100;

export function createUserStore({ dir, byId }) {
  const queues = new Map();
  const file = (uid) => {
    if (!/^[a-f0-9]{32}$/.test(uid)) throw new Error('bad user id');
    return path.join(dir, `${uid}.json`);
  };

  async function read(uid) {
    try {
      const data = JSON.parse(await readFile(file(uid), 'utf8'));
      return Array.isArray(data.builds) ? data.builds : [];
    } catch (e) {
      if (e.code === 'ENOENT') return [];
      throw e;
    }
  }

  async function write(uid, builds) {
    await mkdir(dir, { recursive: true });
    const f = file(uid);
    const tmp = `${f}.${process.pid}.${Date.now()}.tmp`;
    await writeFile(tmp, JSON.stringify({ builds }), 'utf8');
    await rename(tmp, f);
  }

  /** Run fn after any earlier write for the same user finishes. */
  function serial(uid, fn) {
    const prev = queues.get(uid) || Promise.resolve();
    const run = prev.catch(() => {}).then(fn);
    queues.set(uid, run.finally(() => { if (queues.get(uid) === run) queues.delete(uid); }));
    return run;
  }

  /** Validates a client-sent build entry; returns a clean copy or throws with a message. */
  function clean(id, raw) {
    if (!/^[A-Za-z0-9_-]{1,40}$/.test(id)) throw httpError(400, 'Build id must be 1–40 letters, digits, _ or -.');
    if (!raw || typeof raw !== 'object') throw httpError(400, 'Send { name, build }.');
    const name = String(raw.name ?? 'Untitled build').replace(/[\u0000-\u001f]/g, '').trim().slice(0, 60) || 'Untitled build';
    const build = normalizeBuild(raw.build, byId);
    const s = raw.summary && typeof raw.summary === 'object' ? raw.summary : {};
    const num = (v) => (Number.isFinite(v) && v >= 0 && v < 1e7 ? Math.round(v) : null);
    const str = (v) => (typeof v === 'string' ? v.slice(0, 120) : null);
    const summary = { retail: num(s.retail), used: num(s.used), count: num(s.count), cpu: str(s.cpu), gpu: str(s.gpu) };
    return { id, name, build, summary };
  }

  return {
    list: (uid) => read(uid),
    put: (uid, id, raw) => serial(uid, async () => {
      const entry = clean(id, raw);
      const builds = await read(uid);
      const now = new Date().toISOString();
      const i = builds.findIndex((b) => b.id === id);
      if (i >= 0) builds[i] = { ...builds[i], ...entry, updatedAt: now };
      else {
        if (builds.length >= MAX_BUILDS) throw httpError(409, `You can keep up to ${MAX_BUILDS} builds. Delete one first.`);
        builds.unshift({ ...entry, createdAt: raw.createdAt && !Number.isNaN(Date.parse(raw.createdAt)) ? new Date(raw.createdAt).toISOString() : now, updatedAt: now });
      }
      await write(uid, builds);
      return builds.find((b) => b.id === id);
    }),
    remove: (uid, id) => serial(uid, async () => {
      const builds = await read(uid);
      const next = builds.filter((b) => b.id !== id);
      if (next.length === builds.length) return false;
      await write(uid, next);
      return true;
    }),
    removeAll: (uid) => serial(uid, async () => { await rm(file(uid), { force: true }); }),
  };
}

export function httpError(status, message) {
  return Object.assign(new Error(message), { status });
}
