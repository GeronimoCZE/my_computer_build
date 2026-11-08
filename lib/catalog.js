// Loads the parts catalog from /data, validates it and merges in price estimates.
// Specs (data/parts/*.json) and prices (data/prices.json) are kept apart so that
// prices can be refreshed by a script or feed without touching spec data.
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { SLOTS } from '../shared/engine.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const DATA_DIR = path.join(ROOT, 'data');

const REQUIRED = {
  common: ['id', 'brand', 'name', 'released', 'msrp'],
  cpu: ['socket', 'family', 'cores', 'threads', 'boostGHz', 'tdp', 'peakW', 'gamingW', 'gameIndex', 'memory'],
  motherboard: ['socket', 'chipset', 'formFactor', 'memoryType', 'memorySlots', 'maxMemoryGB', 'maxMemSpeed', 'm2Slots', 'm2Gen', 'sataPorts', 'powerW'],
  ram: ['type', 'capacityGB', 'modules', 'speed', 'cas'],
  gpu: ['chip', 'vramGB', 'perfIndex', 'tbp', 'lengthMm', 'slots', 'recommendedPsu'],
  cooler: ['type', 'tdpRating', 'fans', 'sockets'],
  case: ['formFactors', 'maxGpuMm', 'maxCoolerMm', 'radiators', 'psuForms', 'heightMm', 'widthMm', 'depthMm'],
  psu: ['wattage', 'formFactor', 'efficiency'],
  storage: ['kind', 'interface', 'formFactor', 'capacityGB', 'readMBs'],
};

async function readJson(file) {
  return JSON.parse(await readFile(path.join(DATA_DIR, file), 'utf8'));
}

export function validate(parts, prices) {
  const errors = [];
  const warnings = [];
  const seen = new Set();
  for (const [cat, list] of Object.entries(parts)) {
    for (const item of list) {
      for (const f of [...REQUIRED.common, ...REQUIRED[cat]]) {
        if (item[f] === undefined) errors.push(`${cat}/${item.id ?? '?'}: missing "${f}"`);
      }
      if (seen.has(item.id)) errors.push(`duplicate id ${item.id}`);
      seen.add(item.id);
      if (!prices[item.id]) warnings.push(`${item.id}: no price entry`);
    }
  }
  for (const id of Object.keys(prices)) if (!seen.has(id)) warnings.push(`prices.json: unknown id ${id}`);
  return { errors, warnings };
}

export async function loadCatalog() {
  const categories = SLOTS.map((s) => s.key);
  const parts = {};
  await Promise.all(categories.map(async (cat) => { parts[cat] = await readJson(`parts/${cat}.json`); }));
  const [priceFile, games, meta] = await Promise.all([readJson('prices.json'), readJson('games.json'), readJson('meta.json')]);

  const { errors, warnings } = validate(parts, priceFile.prices);
  if (errors.length) throw new Error(`Catalog validation failed:\n  ${errors.join('\n  ')}`);

  const byId = {};
  for (const cat of categories) {
    parts[cat] = parts[cat].map((item) => {
      const pr = priceFile.prices[item.id] || {};
      const merged = {
        ...item,
        category: cat,
        price: { new: pr.new ?? null, used: pr.used ?? null, asOf: pr.asOf || priceFile.asOf, source: pr.source || priceFile.source },
      };
      byId[item.id] = merged;
      return merged;
    });
  }

  return {
    meta: {
      ...meta,
      currency: priceFile.currency,
      pricesAsOf: priceFile.asOf,
      priceSource: priceFile.source,
      priceNote: priceFile.note,
      gamesNote: games.note,
      counts: Object.fromEntries(categories.map((c) => [c, parts[c].length])),
    },
    parts,
    byId,
    games: games.games,
    resolutions: games.resolutions,
    warnings,
  };
}
