// Display helpers shared by the builder (browser) and the server-rendered pages.

export function capacity(gb) { return gb >= 1000 ? `${+(gb / 1000).toFixed(1)} TB` : `${gb} GB`; }

/** One line of the specs that matter most when choosing, per category. */
export function specLine(p) {
  switch (p.category) {
    case 'cpu': return `${p.cores}C/${p.threads}T · ${p.boostGHz.toFixed(1)} GHz · ${p.socket} · ${p.tdp} W${p.igpu ? ' · iGPU' : ''}`;
    case 'motherboard': return `${p.socket} · ${p.chipset} · ${p.formFactor} · ${p.memoryType} ×${p.memorySlots} · ${p.m2Slots}× M.2${p.wifi ? ' · Wi-Fi' : ''}`;
    case 'ram': return `${p.type}-${p.speed} CL${p.cas} · ${p.modules}×${p.capacityGB / p.modules} GB`;
    case 'gpu': return `${p.vramGB} GB · ${p.tbp} W · ${p.lengthMm} mm · ${p.slots}-slot`;
    case 'cooler': return p.type === 'aio' ? `${p.radiatorMm} mm AIO · rated ~${p.tdpRating} W` : `${p.type === 'low-profile' ? 'Low-profile' : 'Air tower'} · ${p.heightMm} mm · rated ~${p.tdpRating} W`;
    case 'case': return `${p.formFactors.join('/')} · GPU ≤${p.maxGpuMm} mm · cooler ≤${p.maxCoolerMm} mm · ${p.psuForms.join('/')} PSU`;
    case 'psu': return `${p.wattage} W · ${p.efficiency} · ${p.formFactor}${p.atx3 ? ' · ATX 3.x' : ''}`;
    case 'storage': return `${capacity(p.capacityGB)} · ${p.interface === 'nvme' ? `NVMe PCIe ${p.pcieGen}.0` : p.kind === 'hdd' ? 'SATA HDD' : 'SATA SSD'} · ${p.readMBs.toLocaleString('en-US')} MB/s`;
    default: return '';
  }
}

/** Category names for headings and links. */
export const CATEGORY = {
  case: { one: 'Case', many: 'Cases', slug: 'cases' },
  motherboard: { one: 'Motherboard', many: 'Motherboards', slug: 'motherboards' },
  cpu: { one: 'Processor', many: 'Processors', slug: 'cpus' },
  cooler: { one: 'CPU cooler', many: 'CPU coolers', slug: 'cpu-coolers' },
  ram: { one: 'Memory kit', many: 'Memory', slug: 'memory' },
  gpu: { one: 'Graphics card', many: 'Graphics cards', slug: 'graphics-cards' },
  storage: { one: 'Drive', many: 'Storage', slug: 'storage' },
  psu: { one: 'Power supply', many: 'Power supplies', slug: 'power-supplies' },
};
export const categoryBySlug = (slug) => Object.keys(CATEGORY).find((k) => CATEGORY[k].slug === slug) || null;

/** URL-safe part slug: the id without its category prefix ("gpu-rtx5090-fe" -> "rtx5090-fe"). */
export const partSlug = (p) => p.id.replace(/^(cpu|mb|gpu|ram|psu|case|cool|ssd|hdd)-/, '');
export const partPath = (p) => `/parts/${CATEGORY[p.category].slug}/${partSlug(p)}`;
export const partTitle = (p) => (p.name.toLowerCase().startsWith(p.brand.toLowerCase()) ? p.name : `${p.brand} ${p.name}`);
