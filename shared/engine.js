// Estimate engine shared by the browser and the Node server.
// Pure functions only: no DOM, no fetch, no Node APIs.

export const SLOTS = [
  { key: 'case', label: 'Case', code: '01', multi: false },
  { key: 'motherboard', label: 'Motherboard', code: '02', multi: false },
  { key: 'cpu', label: 'Processor', code: '03', multi: false },
  { key: 'cooler', label: 'CPU cooler', code: '04', multi: false },
  { key: 'ram', label: 'Memory', code: '05', multi: false, stack: true },
  { key: 'gpu', label: 'Graphics card', code: '06', multi: false, stack: true },
  { key: 'storage', label: 'Storage', code: '07', multi: true, max: 8 },
  { key: 'psu', label: 'Power supply', code: '08', multi: false },
];

export const MAX_STORAGE = 8;
/** Slots whose part can be stacked: several identical memory kits or graphics cards. */
export const STACKABLE = ['ram', 'gpu'];
const MAX_QTY = 8;

export function emptyBuild() {
  return { case: null, motherboard: null, cpu: null, cooler: null, ram: null, gpu: null, psu: null, storage: [], qty: { ram: 1, gpu: 1 } };
}

const clampQty = (n) => Math.min(MAX_QTY, Math.max(1, Math.floor(Number(n)) || 1));

/** How many of a stackable part the build holds (1 when the slot is empty). */
export function qtyOf(build, slot) {
  return build[slot] ? clampQty(build.qty?.[slot]) : 1;
}

/* Board and case layout fields, with defaults for data that doesn't list them. */
export function gpuSlotsOf(mb) { return mb.gpuSlots ?? (mb.formFactor === 'ITX' ? 1 : 2); }
export function gpuSlotGapOf(mb) { return mb.gpuSlotGap ?? 3; }
export function expansionSlotsOf(cs) {
  return cs.expansionSlots ?? (cs.formFactors.includes('ATX') ? 7 : cs.formFactors.includes('mATX') ? 5 : 3);
}

/** Memory totals across every kit in the build. */
export function memoryOf(p) {
  if (!p.ram) return null;
  const kits = p.qty?.ram || 1;
  return { kits, modules: p.ram.modules * kits, capacityGB: p.ram.capacityGB * kits };
}

/** Normalise any user-supplied build object into the canonical shape (ids only). */
export function normalizeBuild(raw, byId) {
  const b = emptyBuild();
  if (!raw || typeof raw !== 'object') return b;
  for (const s of SLOTS) {
    if (s.multi) {
      const list = Array.isArray(raw[s.key]) ? raw[s.key] : [];
      b[s.key] = list.filter((id) => typeof id === 'string' && (!byId || byId[id]?.category === s.key)).slice(0, s.max);
    } else {
      const id = raw[s.key];
      b[s.key] = typeof id === 'string' && (!byId || byId[id]?.category === s.key) ? id : null;
    }
  }
  // builds saved before quantities existed have no qty: they hold one of each
  for (const k of STACKABLE) b.qty[k] = b[k] ? clampQty(raw.qty?.[k]) : 1;
  return b;
}

/** Turn a build of ids into a build of part objects. */
export function resolveBuild(build, byId) {
  const p = {};
  for (const s of SLOTS) {
    if (s.multi) p[s.key] = (build[s.key] || []).map((id) => byId[id]).filter(Boolean);
    else p[s.key] = build[s.key] ? byId[build[s.key]] || null : null;
  }
  p.qty = Object.fromEntries(STACKABLE.map((k) => [k, p[k] ? qtyOf(build, k) : 1]));
  return p;
}

const issue = (level, code, slots, message) => ({ level, code, slots, message });

/** Compatibility rules. Returns issues sorted by severity: error, warn, info. */
export function checkCompatibility(p) {
  const out = [];
  const { case: cs, motherboard: mb, cpu, cooler, ram, gpu, psu, storage } = p;

  // CPU <-> motherboard
  if (cpu && mb) {
    if (cpu.socket !== mb.socket) {
      out.push(issue('error', 'socket', ['cpu', 'motherboard'], `${cpu.name} uses socket ${cpu.socket}, but the ${mb.name} has ${mb.socket}.`));
    } else {
      if (mb.unsupportedFamilies?.includes(cpu.family)) {
        out.push(issue('error', 'chipset-support', ['cpu', 'motherboard'], `The ${mb.chipset} chipset does not support the ${cpu.name}, even though the socket matches.`));
      }
      if (mb.biosUpdateFor?.includes(cpu.family)) {
        out.push(issue('warn', 'bios', ['cpu', 'motherboard'], `Boards from early production may need a BIOS update before they boot the ${cpu.name}. Check for BIOS Flashback or ask the seller.`));
      }
      if (!cpu.memory.includes(mb.memoryType)) {
        out.push(issue('error', 'cpu-memory', ['cpu', 'motherboard'], `${cpu.name} does not support ${mb.memoryType}.`));
      }
      if (cpu.unlocked && !mb.cpuOverclock) {
        out.push(issue('info', 'no-oc', ['cpu', 'motherboard'], `The ${mb.chipset} chipset can't overclock the CPU, so the unlocked multiplier of the ${cpu.name} goes unused.`));
      }
    }
  }

  // Memory (several identical kits count together)
  const mem = memoryOf(p);
  if (ram && mb) {
    if (mem.modules > mb.memorySlots) {
      out.push(issue('error', 'ram-slots', ['ram', 'motherboard'], mem.kits > 1
        ? `${mem.kits} kits make ${mem.modules} modules, but the board has ${mb.memorySlots} memory slots.`
        : `The kit has ${ram.modules} modules, but the board only has ${mb.memorySlots} slots.`));
    }
    if (ram.type !== mb.memoryType) {
      out.push(issue('error', 'ram-type', ['ram', 'motherboard'], `This kit is ${ram.type}, but the ${mb.name} takes ${mb.memoryType}. The modules physically won't fit.`));
    } else {
      if (mem.capacityGB > mb.maxMemoryGB) {
        out.push(issue('error', 'ram-capacity', ['ram', 'motherboard'], `${mem.capacityGB} GB is over the board's ${mb.maxMemoryGB} GB limit.`));
      }
      if (ram.speed > mb.maxMemSpeed) {
        out.push(issue('info', 'ram-speed-mb', ['ram', 'motherboard'], `The board is rated up to ${ram.type}-${mb.maxMemSpeed}, so the kit will run below its ${ram.speed} MT/s rating.`));
      }
    }
  }
  if (ram && cpu && !cpu.memory.includes(ram.type)) {
    out.push(issue('error', 'ram-cpu', ['ram', 'cpu'], `${cpu.name} supports ${cpu.memory.join(' or ')}, not ${ram.type}.`));
  }
  if (mem) {
    if (mem.modules === 1) {
      out.push(issue('warn', 'single-channel', ['ram'], 'A single memory module runs in single-channel mode, which costs noticeable performance. Use a two-module kit, or add a second module.'));
    } else if (mem.modules % 2 === 1) {
      out.push(issue('info', 'odd-modules', ['ram'], `${mem.modules} modules can't fill both memory channels evenly, so part of the memory runs single-channel.`));
    }
    if (mem.capacityGB < 16) {
      out.push(issue('warn', 'low-ram', ['ram'], `${mem.capacityGB} GB is below what most current games want (16 GB).`));
    }
    if (ram.type === 'DDR5' && mem.modules >= 4) {
      out.push(issue(ram.speed > 5600 ? 'warn' : 'info', 'ddr5-four', ['ram'], `Four DDR5 modules are hard on the memory controller. Most boards run four modules slower than two, often around ${ram.speed > 5600 ? '5200–5600' : '4800–5200'} MT/s instead of the rated ${ram.speed}, and the first boot can take a few minutes while the memory trains.`));
    } else if (mem.kits > 1 && ram.modules > 1) {
      out.push(issue('info', 'ram-kits', ['ram'], `${mem.kits} separate kits aren't tested together as one set. Identical kits usually work, but XMP/EXPO may need a lower speed or looser timings.`));
    }
  }

  // Cooling
  if (cooler) {
    if (cpu && !cooler.sockets.includes(cpu.socket)) {
      out.push(issue('error', 'cooler-socket', ['cooler', 'cpu'], `The ${cooler.name} has no mounting kit for ${cpu.socket}.`));
    }
    if (cpu && cooler.tdpRating < cpu.peakW) {
      const gap = cpu.peakW - cooler.tdpRating;
      out.push(issue(gap > 60 ? 'warn' : 'info', 'cooler-tdp', ['cooler', 'cpu'], `The cooler is rated for about ${cooler.tdpRating} W, while the ${cpu.name} can draw ${cpu.peakW} W. Expect throttling in long all-core loads.`));
    }
    if (cs && cooler.type !== 'aio' && cooler.heightMm > cs.maxCoolerMm) {
      out.push(issue('error', 'cooler-height', ['cooler', 'case'], `The cooler is ${cooler.heightMm} mm tall, but the ${cs.name} fits ${cs.maxCoolerMm} mm.`));
    }
    if (cs && cooler.type === 'aio' && !cs.radiators.includes(cooler.radiatorMm)) {
      out.push(issue('error', 'radiator', ['cooler', 'case'], cs.radiators.length
        ? `The ${cs.name} takes ${cs.radiators.join(' / ')} mm radiators, not ${cooler.radiatorMm} mm.`
        : `The ${cs.name} has no radiator mounts.`));
    }
  } else if (cpu) {
    if (cpu.boxCooler) out.push(issue('info', 'box-cooler', ['cooler'], `Using the cooler bundled with the ${cpu.name}. It works, but runs louder than an aftermarket cooler.`));
    else out.push(issue('warn', 'no-cooler', ['cooler'], `The ${cpu.name} ships without a cooler. Add one.`));
  }

  // Case fit
  if (cs && mb && !cs.formFactors.includes(mb.formFactor)) {
    out.push(issue('error', 'form-factor', ['case', 'motherboard'], `The ${cs.name} supports ${cs.formFactors.join(', ')} boards, not ${mb.formFactor}.`));
  }
  if (cs && gpu && gpu.lengthMm > cs.maxGpuMm) {
    out.push(issue('error', 'gpu-length', ['gpu', 'case'], `The card is ${gpu.lengthMm} mm long, but the ${cs.name} fits ${cs.maxGpuMm} mm.`));
  }
  // Several graphics cards
  const gpus = p.qty?.gpu || 1;
  if (gpu && gpus > 1) {
    if (mb) {
      const slots = gpuSlotsOf(mb);
      const gap = gpuSlotGapOf(mb);
      const thick = Math.ceil(gpu.slots);
      if (gpus > slots) {
        out.push(issue('error', 'gpu-slots', ['gpu', 'motherboard'], slots === 1
          ? `The ${mb.name} has one full-length PCIe slot, so it takes one graphics card.`
          : `The ${mb.name} has ${slots} full-length PCIe slots for graphics cards; ${gpus} cards selected.`));
      } else {
        if (thick > gap) {
          out.push(issue('error', 'gpu-block', ['gpu', 'motherboard'], `Each card is ${gpu.slots} slots thick, but the board's next x16 slot is only ${gap} slot positions lower, so the top card covers it.`));
        }
        const need = (gpus - 1) * gap + thick;
        if (cs && need > expansionSlotsOf(cs)) {
          out.push(issue('error', 'gpu-expansion', ['gpu', 'case'], `${gpus} of these cards on this board need ${need} expansion slots at the back of the case; the ${cs.name} has ${expansionSlotsOf(cs)}.`));
        }
        if ((mb.gpuSlot2Lanes ?? 4) < 8) {
          out.push(issue('info', 'gpu-lanes', ['gpu', 'motherboard'], `The second x16 slot on the ${mb.name} is wired for PCIe x${mb.gpuSlot2Lanes ?? 4} through the chipset, which slows that card in bandwidth-heavy work.`));
        }
      }
    }
    out.push(issue('info', 'multi-gpu', ['gpu'], `Games run on one graphics card. SLI and CrossFire are discontinued, so extra cards add cost and power draw but no FPS. They do help in 3D rendering, AI and other compute work.`));
  }
  if (cs && psu && !cs.psuForms.includes(psu.formFactor)) {
    out.push(issue('error', 'psu-form', ['psu', 'case'], `The ${cs.name} takes ${cs.psuForms.join('/')} power supplies, not ${psu.formFactor}.`));
  }

  // Storage
  if (storage.length) {
    const m2 = storage.filter((d) => d.formFactor === 'm2');
    if (mb && m2.length > mb.m2Slots) {
      out.push(issue('error', 'm2-slots', ['storage', 'motherboard'], `${m2.length} M.2 drives selected, but the board has ${mb.m2Slots} M.2 slot${mb.m2Slots === 1 ? '' : 's'}.`));
    }
    if (mb) {
      const sata = storage.filter((d) => d.interface === 'sata').length;
      if (sata > mb.sataPorts) out.push(issue('error', 'sata', ['storage', 'motherboard'], `Not enough SATA ports (${mb.sataPorts}).`));
      const fast = m2.find((d) => d.pcieGen > mb.m2Gen);
      if (fast) out.push(issue('info', 'm2-gen', ['storage', 'motherboard'], `The ${fast.name} is a PCIe ${fast.pcieGen}.0 drive; on this board it runs at PCIe ${mb.m2Gen}.0 speed.`));
    }
    if (cs) {
      const d35 = storage.filter((d) => d.formFactor === '3.5').length;
      const d25 = storage.filter((d) => d.formFactor === '2.5').length;
      if (d35 > cs.drives35) out.push(issue('error', 'bays35', ['storage', 'case'], `The ${cs.name} has ${cs.drives35} 3.5" bay${cs.drives35 === 1 ? '' : 's'}; ${d35} hard drives selected.`));
      // 3.5" bays usually take 2.5" drives too
      if (d25 > cs.drives25 + Math.max(0, cs.drives35 - d35)) out.push(issue('error', 'bays25', ['storage', 'case'], `Not enough 2.5" drive mounts in the ${cs.name}.`));
    }
  }

  // Video output
  if (cpu && !gpu && !cpu.igpu) {
    out.push(issue('error', 'no-video', ['gpu', 'cpu'], `The ${cpu.name} has no integrated graphics, so this build needs a graphics card to show a picture.`));
  }

  // Power
  const power = estimatePower(p);
  if (psu && power.peak > 0) {
    if (psu.wattage < power.peak) {
      out.push(issue('error', 'psu-watts', ['psu', 'gpu', 'cpu'], `Estimated peak draw is ${power.peak} W, which is more than the ${psu.wattage} W supply delivers.`));
    } else if (psu.wattage < power.recommendedPsu) {
      out.push(issue('warn', 'psu-headroom', ['psu', 'gpu', 'cpu'], `${psu.wattage} W leaves little headroom for transient spikes. ${power.recommendedPsu} W or more is recommended.`));
    }
  }
  if (psu && gpu?.needs16pin && !psu.native16pin) {
    out.push(issue('info', 'psu-16pin', ['psu', 'gpu'], 'The card uses a 16-pin connector and this supply has no native cable. Use the adapter that ships with the card and seat it fully.'));
  }

  const rank = { error: 0, warn: 1, info: 2 };
  return out.sort((a, b) => rank[a.level] - rank[b.level]);
}

/** Power draw estimates in watts. */
export function estimatePower(p) {
  const { cpu, gpu, motherboard: mb, ram, cooler, storage, case: cs } = p;
  const mem = memoryOf(p);
  const gpus = gpu ? p.qty?.gpu || 1 : 0;
  const base = (mb ? mb.powerW : 0)
    + (mem ? mem.modules * (ram.type === 'DDR5' ? 4 : 3) : 0)
    + storage.reduce((s, d) => s + (d.powerW || 5), 0)
    + (cooler ? (cooler.type === 'aio' ? 6 + cooler.fans * 2 : cooler.fans * 2) : cpu?.boxCooler ? 2 : 0)
    + (cs ? 9 : 0); // ~3 case fans
  const cpuIdle = cpu ? Math.round(cpu.tdp * 0.15) : 0;
  const gpuIdleEach = gpu ? Math.round(10 + gpu.tbp * 0.04) : 0;
  const idle = base + cpuIdle + gpuIdleEach * gpus;
  // a game loads one card; any others sit near idle
  const gaming = base + (cpu ? cpu.gamingW : 0) + (gpu ? Math.round(gpu.tbp * 0.92) + gpuIdleEach * (gpus - 1) : 0);
  // peak assumes every card under full load (rendering, compute)
  const peak = base + (cpu ? cpu.peakW : 0) + (gpu ? gpu.tbp * gpus : 0);
  const recommendedPsu = peak ? Math.max(450, Math.ceil((peak * 1.3) / 50) * 50) : 0;
  return { idle: cpu || gpu ? idle : base, gaming, peak, recommendedPsu };
}

/** Price totals. A part with no new price (discontinued) falls back to its used price. */
export function estimatePrice(p) {
  let retail = 0;
  let used = 0;
  let msrp = 0;
  let count = 0;
  const discontinued = [];
  const missing = [];
  const all = [];
  for (const s of SLOTS) {
    const v = p[s.key];
    if (s.multi) all.push(...v);
    else if (v) for (let i = 0; i < (s.stack ? p.qty?.[s.key] || 1 : 1); i++) all.push(v);
  }
  for (const part of all) {
    count++;
    const pr = part.price || {};
    msrp += part.msrp || 0;
    if (pr.new != null) retail += pr.new;
    else if (pr.used != null) { retail += pr.used; if (!discontinued.includes(part.name)) discontinued.push(part.name); }
    else missing.push(part.name);
    if (pr.used != null) used += pr.used;
    else if (pr.new != null) used += pr.new;
  }
  return { retail, used, msrp, count, discontinued, missing, savings: Math.max(0, retail - used) };
}

/** Effective graphics performance: the GPU, or the CPU's integrated graphics. */
function graphicsOf(p) {
  if (p.gpu) return { index: p.gpu.perfIndex, vram: p.gpu.vramGB, name: p.gpu.name, integrated: false };
  if (p.cpu?.igpu) return { index: p.cpu.igpu.index, vram: 2, name: p.cpu.igpu.name, integrated: true };
  return null;
}

/**
 * FPS estimates. Soft-minimum of a GPU-bound and a CPU-bound figure, scaled from
 * reference points in games.json. Returns null per game when the build can't render.
 */
export function estimateFps(p, games, resolution = '1440p') {
  const gfx = graphicsOf(p);
  const cpu = p.cpu;
  const ready = Boolean(gfx && cpu);
  const results = games.map((g) => {
    if (!ready) return { id: g.id, name: g.name, preset: g.preset, fps: null };
    const gpuFps = g.gpu[resolution] * Math.pow(gfx.index / 100, g.alpha);
    let cpuFps = g.cpu * (cpu.gameIndex / 100);
    const notes = [];
    const mem = memoryOf(p);
    if (mem) {
      if (mem.modules === 1) { cpuFps *= 0.85; notes.push('single-channel memory'); }
      if (mem.capacityGB < g.minRamGB) { cpuFps *= 0.8; notes.push(`under ${g.minRamGB} GB RAM`); }
    }
    const k = 3;
    let fps = Math.pow(Math.pow(gpuFps, -k) + Math.pow(cpuFps, -k), -1 / k);
    const vramNeed = g.vram[resolution];
    // integrated graphics borrow system RAM, so a VRAM shortfall doesn't apply
    const vramShort = !gfx.integrated && gfx.vram < vramNeed;
    if (vramShort) { fps *= 0.72; notes.push(`needs ~${vramNeed} GB VRAM`); }
    let bound = gpuFps < cpuFps * 0.9 ? 'gpu' : cpuFps < gpuFps * 0.9 ? 'cpu' : 'balanced';
    let capped = false;
    if (g.cap && fps > g.cap) { fps = g.cap; capped = true; bound = 'cap'; }
    const rounded = Math.round(fps);
    return {
      id: g.id, name: g.name, preset: g.preset,
      fps: rounded,
      low: capped ? rounded : Math.round(fps * 0.85),
      high: capped ? rounded : Math.round(fps * 1.15),
      bound, capped, vramShort, notes,
    };
  });
  return { resolution, graphics: gfx, cards: p.gpu ? p.qty?.gpu || 1 : 0, results };
}

/** Is the build complete enough to power on? */
export function bootReadiness(p, issues) {
  const missing = [];
  if (!p.case) missing.push('case');
  if (!p.motherboard) missing.push('motherboard');
  if (!p.cpu) missing.push('cpu');
  if (!p.cooler && !(p.cpu && p.cpu.boxCooler)) missing.push('cooler');
  if (!p.ram) missing.push('ram');
  if (!p.gpu && !(p.cpu && p.cpu.igpu)) missing.push('gpu');
  if (!p.storage.length) missing.push('storage');
  if (!p.psu) missing.push('psu');
  const errors = issues.filter((i) => i.level === 'error').length;
  return { ready: missing.length === 0 && errors === 0, missing, errors };
}

/** One-shot evaluation used by the UI and the API. */
export function evaluate(build, catalog, { resolution = '1440p' } = {}) {
  const p = resolveBuild(build, catalog.byId);
  const issues = checkCompatibility(p);
  return {
    parts: p,
    issues,
    power: estimatePower(p),
    price: estimatePrice(p),
    fps: estimateFps(p, catalog.games, resolution),
    boot: bootReadiness(p, issues),
  };
}

/** The build with candidateId put in slotKey (appended for storage). Stacked quantities shrink to what still fits. */
export function withPart(build, catalog, slotKey, candidateId) {
  const next = { ...build, storage: [...build.storage], qty: { ...emptyBuild().qty, ...build.qty } };
  if (slotKey === 'storage') next.storage = [...next.storage, candidateId].slice(0, MAX_STORAGE);
  else next[slotKey] = candidateId;
  if (STACKABLE.includes(slotKey)) next.qty[slotKey] = Math.min(qtyOf(build, slotKey), maxQty(next, catalog, slotKey).max);
  return next;
}

/** Issues the candidate part would introduce if it replaced the current pick for its slot. */
export function candidateIssues(build, catalog, slotKey, candidateId) {
  const p = resolveBuild(withPart(build, catalog, slotKey, candidateId), catalog.byId);
  return checkCompatibility(p).filter((i) => i.slots.includes(slotKey) && i.code !== 'box-cooler' && i.code !== 'multi-gpu');
}

// errors that mean "no room for another one"
const ROOM = new Set(['ram-slots', 'ram-capacity', 'gpu-slots', 'gpu-block', 'gpu-expansion', 'm2-slots', 'sata', 'bays35', 'bays25']);

/**
 * Can one more of this part go in? The board and case decide; without them a typical
 * layout is assumed (4 memory slots, 4 drives) and a second graphics card waits for a board.
 * Returns { ok, reason }.
 */
export function canAddMore(build, catalog, slotKey, partId = build[slotKey]) {
  const byId = catalog.byId;
  const part = byId[partId];
  if (!part) return { ok: false, reason: '' };
  const next = { ...build, storage: [...build.storage], qty: { ...emptyBuild().qty, ...build.qty } };
  if (slotKey === 'storage') {
    if (build.storage.length >= MAX_STORAGE) return { ok: false, reason: `This builder tracks up to ${MAX_STORAGE} drives.` };
    next.storage.push(partId);
  } else if (STACKABLE.includes(slotKey)) {
    if (qtyOf(build, slotKey) >= MAX_QTY) return { ok: false, reason: '' };
    next.qty[slotKey] = qtyOf(build, slotKey) + 1;
  } else return { ok: false, reason: '' };

  const p = resolveBuild(next, byId);
  if (!p.motherboard) {
    if (slotKey === 'gpu') return { ok: false, reason: 'Pick a motherboard first: its PCIe slots decide how many cards fit.' };
    if (slotKey === 'ram' && memoryOf(p).modules > 4) return { ok: false, reason: 'Most boards have 4 memory slots. Pick a motherboard to check yours.' };
    if (slotKey === 'storage' && next.storage.length > 4) return { ok: false, reason: 'Pick a motherboard to add more drives: its M.2 slots and SATA ports decide how many fit.' };
  }
  // only room problems this part causes count: a full SATA bay doesn't stop another M.2 drive
  const codes = slotKey !== 'storage' ? null : part.formFactor === 'm2' ? ['m2-slots'] : ['sata', 'bays35', 'bays25'];
  const blocker = checkCompatibility(p).find((i) => i.level === 'error' && ROOM.has(i.code) && i.slots.includes(slotKey) && (!codes || codes.includes(i.code)));
  return blocker ? { ok: false, reason: blocker.message } : { ok: true, reason: '' };
}

/** The most of a stackable part that fits, and why not more. */
export function maxQty(build, catalog, slotKey) {
  if (!build[slotKey]) return { max: 1, reason: '' };
  let b = { ...build, qty: { ...emptyBuild().qty, ...build.qty, [slotKey]: 1 } };
  for (;;) {
    const r = canAddMore(b, catalog, slotKey);
    if (!r.ok) return { max: b.qty[slotKey], reason: r.reason };
    b = { ...b, qty: { ...b.qty, [slotKey]: b.qty[slotKey] + 1 } };
  }
}
