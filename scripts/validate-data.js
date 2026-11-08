#!/usr/bin/env node
// Validate data/ (required fields, duplicate ids, missing prices).
import { loadCatalog } from '../lib/catalog.js';

try {
  const c = await loadCatalog();
  for (const w of c.warnings) console.warn(`warn: ${w}`);
  const total = Object.values(c.meta.counts).reduce((a, b) => a + b, 0);
  console.log(`OK: ${total} parts across ${Object.keys(c.meta.counts).length} categories, ${c.games.length} games.`);
} catch (e) {
  console.error(e.message);
  process.exit(1);
}
