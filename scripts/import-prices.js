#!/usr/bin/env node
// Merge a price CSV into data/prices.json.
//
//   node scripts/import-prices.js path/to/prices.csv [--source "my-feed"] [--as-of 2026-11] [--dry-run]
//
// CSV header: id,new,used     (extra columns are ignored; empty cell = leave unchanged,
//                              "null" or "-" = mark as not sold new / no used market)
// Use this to plug in exported data from a scraper, a spreadsheet or a retailer feed.
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { DATA_DIR } from '../lib/catalog.js';

const args = process.argv.slice(2);
const file = args.find((a) => !a.startsWith('--'));
const flag = (name) => { const i = args.indexOf(`--${name}`); return i >= 0 ? args[i + 1] : undefined; };
const dryRun = args.includes('--dry-run');

if (!file) {
  console.error('Usage: node scripts/import-prices.js prices.csv [--source name] [--as-of YYYY-MM] [--dry-run]');
  process.exit(1);
}

const pricesPath = path.join(DATA_DIR, 'prices.json');
const db = JSON.parse(await readFile(pricesPath, 'utf8'));
const lines = (await readFile(file, 'utf8')).split(/\r?\n/).filter((l) => l.trim());
const header = lines.shift().split(',').map((h) => h.trim().toLowerCase());
const col = (name) => header.indexOf(name);
if (col('id') < 0) { console.error('CSV needs an "id" column'); process.exit(1); }

const parseCell = (v) => {
  if (v === undefined) return undefined;
  const t = v.trim();
  if (t === '') return undefined;
  if (t === 'null' || t === '-') return null;
  const n = Number(t.replace(/[^0-9.]/g, ''));
  return Number.isFinite(n) ? Math.round(n) : undefined;
};

let updated = 0;
let added = 0;
const source = flag('source');
const asOf = flag('as-of');
for (const line of lines) {
  const cells = line.split(',');
  const id = cells[col('id')]?.trim();
  if (!id) continue;
  const entry = db.prices[id] || (added++, {});
  const nv = parseCell(cells[col('new')]);
  const uv = parseCell(cells[col('used')]);
  if (nv !== undefined) entry.new = nv;
  if (uv !== undefined) entry.used = uv;
  if (source) entry.source = source;
  if (asOf) entry.asOf = asOf;
  db.prices[id] = entry;
  updated++;
}

console.log(`${updated} rows read, ${added} new ids.`);
if (dryRun) { console.log('Dry run: nothing written.'); process.exit(0); }
await writeFile(pricesPath, `${JSON.stringify(db, null, 2)}\n`);
console.log(`Wrote ${pricesPath}. Run "npm run validate" to check for unknown ids.`);
