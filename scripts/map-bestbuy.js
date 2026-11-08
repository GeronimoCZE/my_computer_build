#!/usr/bin/env node
// Propose Best Buy SKUs for catalog parts, so live prices track the exact product.
//
//   node scripts/map-bestbuy.js                  # print proposals (needs BESTBUY_API_KEY in .env or env)
//   node scripts/map-bestbuy.js --write          # save them to data/price-sources.json
//   node scripts/map-bestbuy.js --category gpu   # only one category
//
// Review the output before writing: GPUs match any brand's card with the same chip
// (the cheapest one in stock), other parts must match brand and model words.
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { loadCatalog, DATA_DIR } from '../lib/catalog.js';
import { createBestBuy } from '../lib/prices/bestbuy.js';

try { process.loadEnvFile(path.join(DATA_DIR, '..', '.env')); } catch { /* optional */ }
const key = process.env.BESTBUY_API_KEY;
if (!key) { console.error('Set BESTBUY_API_KEY (in .env or the environment) first.'); process.exit(1); }
const args = process.argv.slice(2);
const write = args.includes('--write');
const ci = args.indexOf('--category');
const only = ci >= 0 ? args[ci + 1] : null;

const file = path.join(DATA_DIR, 'price-sources.json');
const sources = JSON.parse(await readFile(file, 'utf8'));
const catalog = await loadCatalog();
const parts = Object.values(catalog.byId).filter((p) => !only || p.category === only);
// search mode only (no pins), so existing pins get re-checked too
const bb = createBestBuy({ apiKey: key, fetch: globalThis.fetch, sources: {} });
const results = await bb.fetchPrices(parts, { onError: (p, e) => console.error(`  ! ${p.id}: ${e.message}`) });

let found = 0;
for (const p of parts) {
  const r = results[p.id];
  if (!r) { console.log(`- ${p.id.padEnd(28)} no match`); continue; }
  found++;
  console.log(`+ ${p.id.padEnd(28)} $${String(r.price).padEnd(6)} sku ${r.sku}  ${r.title}`);
  if (write && r.sku) sources.parts[p.id] = { ...(sources.parts[p.id] || {}), bestbuy: { sku: Number(r.sku), title: r.title } };
}
console.log(`\n${found}/${parts.length} parts matched.`);
if (write) {
  await writeFile(file, `${JSON.stringify(sources, null, 2)}\n`);
  console.log(`Saved SKUs to ${file}`);
}
