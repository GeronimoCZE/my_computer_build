// Procedural, low-poly models for every component. One model per category,
// parameterised by the part's real dimensions (GPU length, cooler height, case size...).
// Units: 1 three.js unit = 100 mm.
import * as THREE from 'three';

export const M = (mm) => mm / 100;
export const ACCENT = new THREE.Color('#ffb02e');

/* ---------------------------------------------------------------- materials */

function canvasTexture(w, h, draw) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

function pcbTexture() {
  return canvasTexture(512, 512, (g, w, h) => {
    g.fillStyle = '#16191b'; g.fillRect(0, 0, w, h);
    g.strokeStyle = '#1f2427'; g.lineWidth = 2;
    let s = 7;
    const rnd = () => ((s = (s * 9301 + 49297) % 233280) / 233280);
    for (let i = 0; i < 140; i++) {
      let x = rnd() * w, y = rnd() * h;
      g.beginPath(); g.moveTo(x, y);
      for (let k = 0; k < 3; k++) {
        if (rnd() > 0.5) x += (rnd() - 0.5) * 160; else y += (rnd() - 0.5) * 160;
        g.lineTo(x, y);
      }
      g.stroke();
    }
    g.fillStyle = '#2b3135';
    for (let i = 0; i < 60; i++) g.fillRect(rnd() * w, rnd() * h, 4 + rnd() * 10, 3 + rnd() * 6);
    g.strokeStyle = 'rgba(210,210,200,0.18)'; g.lineWidth = 1.5;
    for (let i = 0; i < 18; i++) g.strokeRect(rnd() * w, rnd() * h, 10 + rnd() * 30, 6 + rnd() * 16);
  });
}

function meshTexture(color) {
  const t = canvasTexture(128, 128, (g, w, h) => {
    g.fillStyle = color; g.fillRect(0, 0, w, h);
    g.fillStyle = 'rgba(0,0,0,0.75)';
    for (let y = 0; y < h; y += 8) for (let x = (y / 8) % 2 ? 4 : 0; x < w; x += 8) {
      g.beginPath(); g.arc(x + 2, y + 2, 2.4, 0, Math.PI * 2); g.fill();
    }
  });
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

export function labelTexture(lines, { bg = '#111214', fg = '#e9e4da', accent = '#ffb02e', w = 512, h = 256 } = {}) {
  return canvasTexture(w, h, (g) => {
    g.fillStyle = bg; g.fillRect(0, 0, w, h);
    g.fillStyle = accent; g.fillRect(0, h - 14, w, 14);
    g.fillStyle = fg;
    g.textBaseline = 'middle';
    lines.forEach((ln, i) => {
      g.font = `${i === 0 ? 700 : 500} ${i === 0 ? 92 : 38}px "Archivo", system-ui, sans-serif`;
      g.fillText(ln, 28, i === 0 ? h * 0.38 : h * 0.38 + 70 * i);
    });
  });
}

export function createMaterials() {
  const std = (o) => new THREE.MeshStandardMaterial(o);
  return {
    pcb: std({ map: pcbTexture(), roughness: 0.7, metalness: 0.15 }),
    pcbGreen: std({ color: '#0f3b2a', roughness: 0.7, metalness: 0.1 }),
    plastic: std({ color: '#141518', roughness: 0.6, metalness: 0.05 }),
    plasticLight: std({ color: '#d9d9dc', roughness: 0.55, metalness: 0.05 }),
    slot: std({ color: '#0d0e10', roughness: 0.8 }),
    metalDark: std({ color: '#2a2c30', roughness: 0.35, metalness: 0.85 }),
    aluminum: std({ color: '#a4a8ae', roughness: 0.36, metalness: 0.9 }),
    fin: std({ color: '#c7cace', roughness: 0.32, metalness: 0.9, side: THREE.DoubleSide }),
    finDark: std({ color: '#2c2d31', roughness: 0.4, metalness: 0.7, side: THREE.DoubleSide }),
    copper: std({ color: '#c77b4a', roughness: 0.3, metalness: 1 }),
    gold: std({ color: '#d4a64a', roughness: 0.3, metalness: 1 }),
    silicon: std({ color: '#3a3f46', roughness: 0.4, metalness: 0.6 }),
    noctua: std({ color: '#8a6a55', roughness: 0.6 }),
    noctuaBlade: std({ color: '#c8a690', roughness: 0.6, side: THREE.DoubleSide }),
    blade: std({ color: '#1a1b1e', roughness: 0.55, side: THREE.DoubleSide }),
    bladeLight: std({ color: '#e7e7ea', roughness: 0.55, side: THREE.DoubleSide }),
    rubber: std({ color: '#0b0b0c', roughness: 0.9 }),
    led: std({ color: '#2a2016', emissive: ACCENT.clone(), emissiveIntensity: 0.15, roughness: 0.4 }),
    label: std({ color: '#e9e4da', roughness: 0.8 }),
    wood: std({ color: '#7a5233', roughness: 0.75 }),
    woodLight: std({ color: '#9a6c45', roughness: 0.75 }),
    glass: new THREE.MeshPhysicalMaterial({ color: '#c9d4dc', metalness: 0, roughness: 0.04, transparent: true, opacity: 0.1, envMapIntensity: 1.4, side: THREE.DoubleSide, depthWrite: false }),
    meshDark: std({ map: meshTexture('#2a2b2f'), roughness: 0.7, metalness: 0.3 }),
    meshLight: std({ map: meshTexture('#d9d9db'), roughness: 0.7, metalness: 0.2 }),
  };
}

export const CASE_COLORS = { black: '#1d1e21', white: '#e6e6e8', gray: '#6c7177', graphite: '#232428' };
const GPU_COLORS = { silver: '#b4b7bc', black: '#1c1d20', white: '#e3e3e5' };
const RAM_COLORS = { black: '#1b1c1f', silver: '#a9acb2', red: '#a3262b', green: '#0f3b2a', blue: '#24426e' };

/* ---------------------------------------------------------------- helpers */

function box(w, h, d, material, x = 0, y = 0, z = 0) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
  m.position.set(x, y, z);
  return m;
}
function cyl(r, h, material, segs = 24) {
  return new THREE.Mesh(new THREE.CylinderGeometry(r, r, h, segs), material);
}

/** 120/140 mm fan facing +z. Returns group; group.userData.rotor spins around z. */
export function fan(mat, size = 120, { light = false, noctua = false, ring = true } = {}) {
  const g = new THREE.Group();
  const s = M(size), t = M(25), bar = M(7);
  const frame = noctua ? mat.noctua : light ? mat.plasticLight : mat.plastic;
  g.add(box(s, bar, t, frame, 0, s / 2 - bar / 2, 0));
  g.add(box(s, bar, t, frame, 0, -s / 2 + bar / 2, 0));
  g.add(box(bar, s, t, frame, s / 2 - bar / 2, 0, 0));
  g.add(box(bar, s, t, frame, -s / 2 + bar / 2, 0, 0));
  const shroud = new THREE.Mesh(new THREE.CylinderGeometry(s * 0.48, s * 0.48, t * 0.9, 32, 1, true), frame);
  shroud.rotation.x = Math.PI / 2;
  g.add(shroud);
  const rotor = new THREE.Group();
  const hub = cyl(s * 0.17, t * 0.8, frame, 20);
  hub.rotation.x = Math.PI / 2;
  rotor.add(hub);
  const bladeMat = noctua ? mat.noctuaBlade : light ? mat.bladeLight : mat.blade;
  const bladeGeo = new THREE.BoxGeometry(s * 0.3, s * 0.13, M(1.2));
  for (let i = 0; i < 7; i++) {
    const b = new THREE.Mesh(bladeGeo, bladeMat);
    const a = (i / 7) * Math.PI * 2;
    b.position.set(Math.cos(a) * s * 0.3, Math.sin(a) * s * 0.3, 0);
    b.rotation.z = a;
    b.rotation.x = 0.45;
    rotor.add(b);
  }
  g.add(rotor);
  if (ring) {
    const r = new THREE.Mesh(new THREE.TorusGeometry(s * 0.45, M(1.6), 6, 40), mat.led);
    r.position.z = t / 2;
    g.add(r);
  }
  g.userData.rotor = rotor;
  g.userData.isFan = true;
  return g;
}

/* ---------------------------------------------------------------- motherboard */

export const BOARD_SIZES = { ATX: [244, 305], mATX: [244, 244], ITX: [170, 170] };

/**
 * Board-local feature positions in mm, measured from the top-rear corner.
 * `pcie` lists the full-length x16 slots a graphics card can use, spaced by the
 * board's slot gap (one expansion slot = 20.32 mm).
 */
export function boardGeometry(part = {}) {
  const formFactor = part.formFactor || 'ATX';
  const [w, h] = BOARD_SIZES[formFactor] || BOARD_SIZES.ATX;
  const itx = formFactor === 'ITX';
  const socket = itx ? { x: 78, y: 62 } : { x: 98, y: 82 };
  const ramY = itx ? 18 : 14;
  const ramX0 = itx ? 138 : 162;
  const slots = Array.from({ length: part.memorySlots ?? 4 }, (_, i) => ramX0 + i * (itx ? 12 : 9.5));
  const pcieY = itx ? 150 : 168;
  const gpuSlots = part.gpuSlots ?? (itx ? 1 : 2);
  const gap = (part.gpuSlotGap ?? 3) * 20.32;
  const pcie = Array.from({ length: gpuSlots }, (_, i) => pcieY + i * gap).filter((y) => y + 6 < h);
  // M.2 slots sit between and below the x16 slots so drives and cards don't overlap
  const m2All = itx
    ? [{ x: 54, y: 104 }, { x: 54, y: 128 }]
    : formFactor === 'mATX'
      ? [{ x: 58, y: 134 }, { x: 58, y: 198 }, { x: 140, y: 198 }]
      : [{ x: 58, y: 134 }, { x: 58, y: 200 }, { x: 58, y: 262 }, { x: 140, y: 262 }, { x: 58, y: 290 }];
  const m2 = m2All.slice(0, part.m2Slots ?? 2);
  return { w, h, socket, ramY, slots, pcieY, pcie, m2, atx24: { x: w - 6, y: itx ? 40 : 110 } };
}

export function buildMotherboard(mat, part) {
  const g = new THREE.Group();
  const geo = boardGeometry(part);
  const W = M(geo.w), H = M(geo.h), T = M(1.6);
  const P = (x, y) => [-M(x), -M(y)];
  // PCB, origin at top-rear corner of the back face
  const pcb = box(W, H, T, part.released < 2016 ? mat.pcbGreen : mat.pcb, -W / 2, -H / 2, T / 2);
  g.add(pcb);
  const z0 = T;
  // socket
  const [sx, sy] = P(geo.socket.x, geo.socket.y);
  const isLga = part.socket.startsWith('LGA');
  g.add(box(M(isLga ? 52 : 58), M(isLga ? 64 : 58), M(5), isLga ? mat.metalDark : mat.plasticLight, sx, sy, z0 + M(2.5)));
  // VRM heatsinks (L shape)
  g.add(box(M(110), M(26), M(30), mat.metalDark, ...P(98, 14), z0 + M(15)));
  g.add(box(M(22), M(100), M(30), mat.metalDark, ...P(36, 82), z0 + M(15)));
  // rear I/O shroud
  g.add(box(M(26), M(150), M(36), mat.plastic, ...P(13, 78), z0 + M(18)));
  // RAM slots
  for (const x of geo.slots) {
    g.add(box(M(6), M(138), M(7), mat.slot, ...P(x, geo.ramY + 67), z0 + M(3.5)));
  }
  // PCIe x16 slots (the first one reinforced), or an x1 slot under a lone x16 on bigger boards
  geo.pcie.forEach((y, i) => g.add(box(M(89), M(i ? 6 : 7), M(i ? 9 : 11), i ? mat.slot : mat.metalDark, ...P(58, y), z0 + M(i ? 4.5 : 5.5))));
  if (geo.pcie.length === 1 && geo.h > 200) g.add(box(M(25), M(6), M(9), mat.slot, ...P(26, geo.pcieY + 41), z0 + M(4.5)));
  // chipset heatsink + M.2 heatsink plates
  if (!part.formFactor.includes('ITX')) g.add(box(M(52), M(48), M(10), mat.metalDark, ...P(geo.w - 50, geo.h - 70), z0 + M(5)));
  // 24-pin header
  g.add(box(M(8), M(52), M(16), mat.slot, ...P(geo.atx24.x - 2, geo.atx24.y), z0 + M(8)));
  // board LED strip near chipset (lights up when powered)
  g.add(box(M(2), M(70), M(2), mat.led, ...P(geo.w - 2, geo.h - 60), z0 + M(1)));
  // small caps along VRM
  const capGeo = new THREE.CylinderGeometry(M(3.5), M(3.5), M(8), 10);
  for (let i = 0; i < 7; i++) {
    const c = new THREE.Mesh(capGeo, mat.aluminum);
    c.rotation.x = Math.PI / 2;
    c.position.set(...P(48 + i * 11, 34), z0 + M(4));
    g.add(c);
  }
  return g;
}

/* ---------------------------------------------------------------- CPU */

export function buildCpu(mat, part) {
  const g = new THREE.Group();
  const lga = part.socket.startsWith('LGA');
  const w = M(lga ? 37.5 : 40), h = M(lga ? 45 : 40);
  g.add(box(w, h, M(1.5), mat.pcbGreen, 0, 0, M(0.75)));
  const ihs = box(w * 0.86, h * 0.8, M(3.2), mat.aluminum, 0, 0, M(3.1));
  g.add(ihs);
  // engraved notch / triangle marker
  g.add(box(M(3), M(3), M(0.4), mat.gold, -w / 2 + M(3), -h / 2 + M(3), M(1.7)));
  return g;
}

/* ---------------------------------------------------------------- coolers */

export function buildCooler(mat, part, ctx = {}) {
  const g = new THREE.Group();
  const noctua = part.color === 'brown';
  const light = part.color === 'white';
  if (part.type === 'aio') return buildAio(mat, part, ctx);
  if (part.type === 'low-profile') {
    const h = M(part.heightMm);
    g.add(box(M(40), M(40), M(8), mat.copper, 0, 0, M(4)));
    for (let i = 0; i < 4; i++) {
      const p = cyl(M(3), h * 0.55, mat.copper, 10);
      p.rotation.x = Math.PI / 2;
      p.position.set(M(-15 + i * 10), M(0), h * 0.3);
      g.add(p);
    }
    const finGeo = new THREE.BoxGeometry(M(128), M(146), M(0.5));
    const fins = new THREE.InstancedMesh(finGeo, mat.fin, 12);
    const m4 = new THREE.Matrix4();
    for (let i = 0; i < 12; i++) { m4.makeTranslation(M(-10), 0, h * 0.25 + i * M(1.6)); fins.setMatrixAt(i, m4); }
    g.add(fins);
    const f = fan(mat, 120, { noctua, light, ring: !noctua });
    f.position.set(M(-10), 0, h - M(12.5));
    g.add(f);
    return g;
  }
  // stock cooler
  if (part.type === 'stock') {
    const base = cyl(M(46), M(30), mat.finDark, 28);
    base.rotation.x = Math.PI / 2; base.position.z = M(15);
    g.add(base);
    const f = fan(mat, 92, { ring: false });
    f.position.z = M(30 + 12.5);
    g.add(f);
    return g;
  }
  // tower
  const H = M(part.heightMm);
  const towers = part.towers || 1;
  g.add(box(M(40), M(40), M(10), mat.copper, 0, 0, M(5)));
  g.add(box(M(46), M(46), M(6), noctua ? mat.aluminum : mat.metalDark, 0, 0, M(13)));
  const stackDepth = M(towers === 2 ? 46 : 52);
  const stackW = M(122);
  const finCount = Math.round((part.heightMm - 50) / 2.4);
  const finGeo = new THREE.BoxGeometry(stackDepth, stackW, M(0.5));
  const finMat = part.color === 'black' ? mat.finDark : mat.fin;
  const xs = towers === 2 ? [M(-42), M(42)] : [0];
  const m4 = new THREE.Matrix4();
  for (const x of xs) {
    const fins = new THREE.InstancedMesh(finGeo, finMat, finCount);
    for (let i = 0; i < finCount; i++) { m4.makeTranslation(x, 0, M(40) + i * M(2.4)); fins.setMatrixAt(i, m4); }
    g.add(fins);
    g.add(box(stackDepth + M(2), stackW + M(2), M(5), part.color === 'black' ? mat.plastic : mat.metalDark, x, 0, H - M(4)));
  }
  // heatpipes
  for (let i = 0; i < 6; i++) {
    const p = cyl(M(3), H - M(12), mat.copper, 10);
    p.rotation.x = Math.PI / 2;
    p.position.set(xs[i % xs.length] + M((i % 3) * 12 - 12), M(i < 3 ? -16 : 16), (H - M(12)) / 2 + M(8));
    g.add(p);
  }
  // fans: on the front face (-x) of each stack, facing -x... fan axis = x
  const fanZ = M(40) + (H - M(50)) / 2;
  const fanX = towers === 2 ? [0, M(-42) - stackDepth / 2 - M(13)] : [-stackDepth / 2 - M(13)];
  for (const fx of fanX.slice(0, part.fans)) {
    const f = fan(mat, 120, { noctua, light, ring: !noctua && part.color !== 'brown' });
    f.rotation.y = -Math.PI / 2;
    f.position.set(fx, 0, Math.min(fanZ, H - M(62)));
    g.add(f);
  }
  return g;
}

function buildAio(mat, part, ctx) {
  const g = new THREE.Group();
  const light = part.color === 'white';
  // pump block on the CPU
  const pump = cyl(M(34), M(42), light ? mat.plasticLight : mat.plastic, 32);
  pump.rotation.x = Math.PI / 2; pump.position.z = M(21);
  g.add(pump);
  const ring = new THREE.Mesh(new THREE.TorusGeometry(M(28), M(2), 8, 40), mat.led);
  ring.position.z = M(42.5);
  g.add(ring);
  const cap = cyl(M(25), M(2), mat.metalDark, 32);
  cap.rotation.x = Math.PI / 2; cap.position.z = M(43);
  g.add(cap);
  // radiator (offset from pump given by layout), lies horizontal under the top panel
  const off = ctx.radiatorOffset || new THREE.Vector3(0, M(160), M(80));
  const len = M(part.radiatorMm + 37);
  const wid = M(part.radiatorMm === 280 ? 143 : 122);
  const rad = new THREE.Group();
  rad.position.copy(off);
  rad.add(box(len, M(27), wid, mat.metalDark, 0, 0, 0));
  const finGeo = new THREE.BoxGeometry(M(0.4), M(23), wid - M(6));
  const n = Math.round(part.radiatorMm / 3.2);
  const fins = new THREE.InstancedMesh(finGeo, mat.finDark, n);
  const m4 = new THREE.Matrix4();
  for (let i = 0; i < n; i++) { m4.makeTranslation(-len / 2 + M(18) + i * M(3.2), 0, 0); fins.setMatrixAt(i, m4); }
  rad.add(fins);
  const fanSize = part.radiatorMm === 280 ? 140 : 120;
  for (let i = 0; i < part.fans; i++) {
    const f = fan(mat, fanSize, { light });
    f.rotation.x = Math.PI / 2;
    f.position.set(-len / 2 + M(18) + M(fanSize) * (i + 0.5), -M(27), 0);
    rad.add(f);
  }
  g.add(rad);
  // tubes from pump side to radiator end
  const endX = off.x - len / 2 + M(12);
  for (const dz of [-1, 1]) {
    const start = new THREE.Vector3(M(-30), M(10 * dz), M(24));
    const end = new THREE.Vector3(endX, off.y - M(8), off.z + M(25 * dz));
    const mid = new THREE.Vector3((start.x + end.x) / 2 - M(30), (start.y + end.y) / 2 + M(40), start.z + M(90));
    const curve = new THREE.CatmullRomCurve3([start, new THREE.Vector3(start.x - M(40), start.y, start.z + M(30)), mid, end]);
    g.add(new THREE.Mesh(new THREE.TubeGeometry(curve, 40, M(5.5), 8, false), mat.rubber));
  }
  return g;
}

/* ---------------------------------------------------------------- memory */

/** offsets: x offsets (units) of each stick relative to the anchor slot. */
export function buildRam(mat, part, offsets = [0, M(19)]) {
  const g = new THREE.Group();
  const tall = part.type === 'DDR5' || part.rgb ? M(44) : M(34);
  const color = RAM_COLORS[part.color] || RAM_COLORS.black;
  const spreader = new THREE.MeshStandardMaterial({ color, roughness: 0.38, metalness: 0.8 });
  for (const ox of offsets) {
    const s = new THREE.Group();
    s.add(box(M(1.2), M(133), M(31), mat.pcbGreen, 0, 0, M(15.5)));
    s.add(box(M(6.6), M(133), tall - M(4), spreader, 0, 0, M(4) + (tall - M(4)) / 2));
    if (part.rgb) s.add(box(M(5.4), M(128), M(6), mat.led, 0, 0, tall + M(2)));
    s.position.x = ox;
    g.add(s);
  }
  return g;
}

/* ---------------------------------------------------------------- GPU */

export function buildGpu(mat, part) {
  const g = new THREE.Group();
  const L = M(part.lengthMm);
  const T = M(part.slots * 20) - M(4);
  const Hc = M(Math.min(140, 112 + (part.slots - 2) * 14));
  const col = GPU_COLORS[part.color] || GPU_COLORS.black;
  const shroudMat = new THREE.MeshStandardMaterial({ color: col, roughness: part.color === 'silver' ? 0.3 : 0.5, metalness: part.color === 'silver' ? 0.85 : 0.35 });
  // PCB (horizontal), gold fingers at the slot
  g.add(box(L - M(10), M(1.6), Hc - M(8), mat.pcb, -L / 2, 0, Hc / 2 + M(2)));
  g.add(box(M(80), M(1.8), M(8), mat.gold, -M(50), 0, M(2)));
  // backplate
  g.add(box(L - M(6), M(2), Hc - M(4), part.color === 'silver' ? mat.aluminum : mat.metalDark, -L / 2, M(2.2), Hc / 2 + M(2)));
  // cooler shroud below
  g.add(box(L, T - M(2), Hc, shroudMat, -L / 2, -T / 2 - M(1), Hc / 2 + M(2)));
  // fin stack visible at edge
  g.add(box(L - M(30), T * 0.5, M(4), mat.finDark, -L / 2, -T * 0.55, Hc + M(3)));
  // LED strip on the glass-facing edge
  g.add(box(L * 0.42, M(5), M(1.5), mat.led, -L * 0.62, -T * 0.25, Hc + M(5.5)));
  // fans facing down
  const n = part.fans;
  const fs = n === 1 ? 80 : n === 3 ? Math.min(95, (part.lengthMm - 20) / 3) : Math.min(100, (part.lengthMm - 30) / 2);
  for (let i = 0; i < n; i++) {
    const f = fan(mat, fs, { light: part.color === 'white', ring: false });
    f.rotation.x = Math.PI / 2;
    const span = L - M(20);
    f.position.set(-M(10) - span * ((i + 0.5) / n), -T - M(1), Hc / 2 + M(2));
    f.scale.z = 0.6;
    g.add(f);
  }
  // I/O bracket
  g.add(box(M(1.2), T + M(6), M(120), mat.aluminum, M(4), -T / 2, M(62)));
  // power connector on top edge
  g.add(box(M(part.needs16pin ? 20 : 26), M(9), M(8), mat.slot, -L * (part.needs16pin ? 0.45 : 0.85), -M(8), Hc + M(4)));
  g.userData.powerPlug = new THREE.Vector3(-L * (part.needs16pin ? 0.45 : 0.85), -M(8), Hc + M(8));
  return g;
}

/* ---------------------------------------------------------------- storage */

export function buildStorage(mat, part) {
  const g = new THREE.Group();
  if (part.formFactor === 'm2') {
    // lies flat on the board, extends -x from the connector
    g.add(box(M(80), M(22), M(1.2), mat.pcb, -M(40), 0, M(0.6)));
    g.add(box(M(70), M(20), M(1), part.pcieGen >= 5 ? mat.metalDark : mat.label, -M(42), 0, M(1.7)));
    g.add(box(M(4), M(18), M(1.6), mat.gold, -M(1.5), 0, M(0.8)));
    if (part.pcieGen >= 5) g.add(box(M(70), M(20), M(9), mat.finDark, -M(42), 0, M(6)));
    return g;
  }
  if (part.formFactor === '2.5') {
    g.add(box(M(100), M(7), M(70), mat.metalDark, 0, M(3.5), 0));
    const lbl = new THREE.Mesh(new THREE.PlaneGeometry(M(80), M(50)), new THREE.MeshStandardMaterial({ map: labelTexture([`${part.capacityGB >= 1000 ? part.capacityGB / 1000 + 'TB' : part.capacityGB + 'GB'}`, part.brand.toUpperCase()], { w: 384, h: 256 }), roughness: 0.6 }));
    lbl.rotation.x = -Math.PI / 2; lbl.position.y = M(7.2);
    g.add(lbl);
    return g;
  }
  // 3.5" HDD
  g.add(box(M(147), M(26), M(101), mat.aluminum, 0, M(13), 0));
  g.add(box(M(120), M(1), M(80), mat.label, M(5), M(26.5), 0));
  return g;
}

/* ---------------------------------------------------------------- PSU */

export function psuSize(part) {
  return part.formFactor === 'SFX' ? { l: 100, h: 63.5, w: 125 } : { l: part.wattage >= 1200 ? 200 : part.wattage >= 1000 ? 180 : 160, h: 86, w: 150 };
}

/** Anchor: centre of the bottom of the rear face. Body extends -x. */
export function buildPsu(mat, part) {
  const g = new THREE.Group();
  const { l, h, w } = psuSize(part);
  const L = M(l), Hh = M(h), Wd = M(w);
  g.add(box(L, Hh, Wd, mat.metalDark, -L / 2, Hh / 2, 0));
  const lbl = new THREE.Mesh(
    new THREE.PlaneGeometry(L * 0.86, Hh * 0.7),
    new THREE.MeshStandardMaterial({ map: labelTexture([`${part.wattage}W`, part.efficiency.toUpperCase()], { w: 512, h: 256 }), roughness: 0.6 }),
  );
  lbl.position.set(-L / 2, Hh / 2, Wd / 2 + M(0.3));
  g.add(lbl);
  // modular sockets on the front face
  for (let i = 0; i < 6; i++) g.add(box(M(1), M(10), M(14), mat.slot, -L - M(0.5), Hh * 0.35 + (i % 2) * M(14), -Wd / 2 + M(20) + Math.floor(i / 2) * M(24)));
  return g;
}

/* ---------------------------------------------------------------- case */

export const GENERIC_CASE = { id: null, name: 'Empty frame', heightMm: 460, widthMm: 220, depthMm: 450, color: 'graphite', front: 'mesh', formFactors: ['ATX', 'mATX', 'ITX'], psuForms: ['ATX'], radiators: [240, 280, 360] };

export function caseLayout(cs) {
  const H = M(cs.heightMm), W = M(cs.widthMm), D = M(cs.depthMm);
  const small = cs.heightMm < 380;
  const sfx = cs.psuForms?.includes('SFX') && !cs.psuForms.includes('ATX');
  const shroudH = sfx ? M(74) : M(96);
  return {
    H, W, D, small, sfx, shroudH,
    zTray: -W / 2 + M(14),
    zFace: W / 2 - M(4),
    xRear: D / 2 - M(20),
    yTop: H - (small ? M(16) : M(42)),
  };
}

export function buildCase(mat, cs) {
  const g = new THREE.Group();
  const L = caseLayout(cs);
  const { H, W, D } = L;
  const t = M(5);
  const color = CASE_COLORS[cs.color] || CASE_COLORS.graphite;
  const light = cs.color === 'white';
  const body = new THREE.MeshStandardMaterial({ color, roughness: 0.42, metalness: light ? 0.15 : 0.6 });
  const inner = new THREE.MeshStandardMaterial({ color: light ? '#d6d6d9' : '#18191c', roughness: 0.65, metalness: 0.3 });

  g.add(box(D, t, W, body, 0, t / 2, 0)); // floor
  g.add(box(D, t, W, body, 0, H - t / 2, 0)); // top
  g.add(box(D, H, t, inner, 0, H / 2, -W / 2 + t / 2)); // tray wall (motherboard side)
  g.add(box(t, H, W, body, D / 2 - t / 2, H / 2, 0)); // rear
  // rear I/O cutout + PCIe slot covers (darker inset)
  g.add(box(M(1), M(160), M(46), mat.rubber, D / 2 - t - M(0.6), L.yTop - M(80), L.zTray + M(36)));
  for (let i = 0; i < 7; i++) g.add(box(M(1), M(14), M(110), mat.metalDark, D / 2 - t - M(0.6), L.yTop - M(175) - i * M(20.3), L.zTray + M(80)));

  // front panel style
  if (cs.front === 'wood') {
    g.add(box(t, H, W, body, -D / 2 + t / 2, H / 2, 0));
    const n = Math.floor((W - M(20)) / M(14));
    for (let i = 0; i < n; i++) {
      g.add(box(M(9), H - M(30), M(10), i % 2 ? mat.wood : mat.woodLight, -D / 2 - M(4), H / 2, -W / 2 + M(17) + i * M(14)));
    }
  } else if (cs.front === 'glass') {
    const f = box(t, H - M(10), W - M(10), mat.glass, -D / 2 + t / 2, H / 2, 0);
    f.userData.glass = true;
    g.add(f);
    g.add(box(t, M(10), W, body, -D / 2 + t / 2, M(5), 0));
  } else if (cs.front === 'mesh') {
    const m = (light ? mat.meshLight : mat.meshDark).clone();
    m.map = m.map.clone(); m.map.needsUpdate = true; m.map.repeat.set(W * 3, H * 3);
    g.add(box(t, H, W, m, -D / 2 + t / 2, H / 2, 0));
  } else {
    g.add(box(t, H, W, body, -D / 2 + t / 2, H / 2, 0));
  }

  // glass-side frame
  for (const [x, y, w, h] of [[0, H - M(6), D, M(12)], [0, M(6), D, M(12)], [-D / 2 + M(6), H / 2, M(12), H], [D / 2 - M(6), H / 2, M(12), H]]) {
    g.add(box(w, h, M(6), body, x, y, W / 2 - M(3)));
  }
  const glass = box(D - M(10), H - M(10), M(3), mat.glass, 0, H / 2, W / 2 - M(1));
  glass.userData.glass = true;
  glass.renderOrder = 10;
  g.add(glass);

  // PSU shroud with a PSU window
  const sh = L.shroudH;
  g.add(box(D - 2 * t, M(3), W - M(20), body, 0, sh, M(4)));
  const shape = new THREE.Shape();
  shape.moveTo(-D / 2 + t, t); shape.lineTo(D / 2 - t, t); shape.lineTo(D / 2 - t, sh); shape.lineTo(-D / 2 + t, sh); shape.closePath();
  const win = new THREE.Path();
  const wx0 = D / 2 - M(L.sfx ? 120 : 190), wx1 = D / 2 - M(22);
  win.moveTo(wx0, M(16)); win.lineTo(wx0, sh - M(14)); win.lineTo(wx1, sh - M(14)); win.lineTo(wx1, M(16)); win.closePath();
  const win2 = new THREE.Path();
  const fx0 = -D / 2 + M(24), fx1 = -D / 2 + M(180);
  win2.moveTo(fx0, M(16)); win2.lineTo(fx0, sh - M(14)); win2.lineTo(fx1, sh - M(14)); win2.lineTo(fx1, M(16)); win2.closePath();
  shape.holes.push(win, win2);
  const sideMat = body.clone(); sideMat.side = THREE.DoubleSide;
  const side = new THREE.Mesh(new THREE.ShapeGeometry(shape), sideMat);
  side.position.z = L.zFace - M(30);
  g.add(side);

  // tray grommets
  for (let i = 0; i < 3; i++) g.add(box(M(20), M(55), M(2), mat.rubber, L.xRear - M(262), L.yTop - M(40) - i * M(90), -W / 2 + t + M(1)));

  // fans: front intake + rear exhaust
  const fans = [];
  const fanCount = L.small ? 1 : 3;
  const fs = L.small ? 120 : 120;
  const room = H - sh - M(20);
  for (let i = 0; i < fanCount; i++) {
    if (M(fs) * (i + 1) > room + M(130)) break;
    const f = fan(mat, fs, { light });
    f.rotation.y = Math.PI / 2;
    f.position.set(-D / 2 + t + M(14), H - M(20) - M(fs) * (i + 0.5) - M(6) * i, M(10));
    g.add(f); fans.push(f);
  }
  if (!L.small) {
    const r = fan(mat, 120, { light });
    r.rotation.y = -Math.PI / 2;
    r.position.set(D / 2 - t - M(14), L.yTop - M(72), Math.min(L.zTray + M(100), W / 2 - M(70)));
    g.add(r); fans.push(r);
  }

  // power button + LED
  const btn = cyl(M(7), M(4), mat.metalDark, 20);
  btn.position.set(-D / 2 + M(40), H + M(1), W / 2 - M(40));
  g.add(btn);
  const led = cyl(M(2), M(1.5), mat.led, 10);
  led.position.set(-D / 2 + M(62), H + M(0.5), W / 2 - M(40));
  g.add(led);

  // feet
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) g.add(box(M(40), M(14), M(18), mat.rubber, sx * (D / 2 - M(40)), -M(7), sz * (W / 2 - M(22))));

  // dashed ghosts showing where the motherboard and PSU go while those slots are empty
  const ghostMat = new THREE.LineDashedMaterial({ color: '#8a857c', dashSize: M(9), gapSize: M(6), transparent: true, opacity: 0.9 });
  const rect = (w, h) => {
    const pts = [[0, 0], [-w, 0], [-w, -h], [0, -h], [0, 0]].map(([x, y]) => new THREE.Vector3(x, y, 0));
    const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), ghostMat);
    line.computeLineDistances();
    return line;
  };
  const ghostBoard = rect(M(244), M(305));
  ghostBoard.position.set(L.xRear, L.yTop, L.zTray + M(2));
  const psuL = M(L.sfx ? 100 : 160), psuH = M(L.sfx ? 63.5 : 86);
  const ghostPsu = rect(psuL, psuH);
  ghostPsu.position.set(D / 2 - M(8), M(6) + psuH, L.zFace - M(29));
  g.add(ghostBoard, ghostPsu);

  return { group: g, layout: L, ghosts: { motherboard: ghostBoard, psu: ghostPsu } };
}

/* ---------------------------------------------------------------- cables */

export function buildCable(mat, points, radius = M(5), flat = 1) {
  const curve = new THREE.CatmullRomCurve3(points);
  const m = new THREE.Mesh(new THREE.TubeGeometry(curve, 48, radius, 8, false), mat.rubber);
  if (flat !== 1) m.scale.set(1, 1, 1);
  const g = new THREE.Group();
  g.add(m);
  return g;
}
