// 3D viewport: lays parts out inside the case, diffs against what's on screen and
// animates parts in, out and between positions. Renders on demand to stay light.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import {
  M, ACCENT, createMaterials, boardGeometry, buildMotherboard, buildCpu, buildCooler, buildRam, buildGpu,
  buildStorage, buildPsu, psuSize, buildCase, caseLayout, GENERIC_CASE, buildCable,
} from './models.js';

const RED = new THREE.Color('#ff4d3d');
const ease = {
  outCubic: (t) => 1 - Math.pow(1 - t, 3),
  inCubic: (t) => t * t * t,
  inOutCubic: (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2),
  outBack: (t) => { const c1 = 1.5, c3 = c1 + 1; return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2); },
};

/** Memory slot population order: second slot of each channel first. */
function fillOrder(n) {
  if (n === 4) return [1, 3, 0, 2];
  if (n === 8) return [1, 3, 5, 7, 0, 2, 4, 6];
  return Array.from({ length: n }, (_, i) => i);
}

export function createScene(canvas, { onPick, onHover } = {}) {
  const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const isTouch = matchMedia('(pointer: coarse)').matches;
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(devicePixelRatio, isTouch ? 1.75 : 2));
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.outputColorSpace = THREE.SRGBColorSpace;

  const scene = new THREE.Scene();
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  pmrem.dispose();
  scene.environmentIntensity = 0.75;

  const key = new THREE.DirectionalLight('#fff4e6', 1.6);
  key.position.set(-4, 8, 6);
  scene.add(key);
  const rim = new THREE.DirectionalLight('#9fb6ff', 0.5);
  rim.position.set(6, 3, -5);
  scene.add(rim);
  const glow = new THREE.PointLight(ACCENT, 0, 6, 1.6);
  scene.add(glow);

  const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 100);
  const controls = new OrbitControls(camera, canvas);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.enablePan = false;
  controls.minPolarAngle = 0.15;
  controls.maxPolarAngle = 1.55;
  controls.rotateSpeed = isTouch ? 0.7 : 0.9;

  const mat = createMaterials();

  // soft contact shadow
  const shadowTex = (() => {
    const c = document.createElement('canvas'); c.width = c.height = 128;
    const g = c.getContext('2d');
    const grd = g.createRadialGradient(64, 64, 8, 64, 64, 64);
    grd.addColorStop(0, 'rgba(0,0,0,0.55)'); grd.addColorStop(0.6, 'rgba(0,0,0,0.18)'); grd.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = grd; g.fillRect(0, 0, 128, 128);
    return new THREE.CanvasTexture(c);
  })();
  const shadow = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: shadowTex, transparent: true, depthWrite: false }));
  shadow.rotation.x = -Math.PI / 2;
  shadow.position.y = -M(13);
  scene.add(shadow);

  const root = new THREE.Group();
  scene.add(root);

  /* ------------------------------------------------------------ state */
  let caseState = null; // { id, group, layout, mats }
  const live = new Map(); // key -> entry { key, slot, group, mats, leds, fans, tint }
  const tweens = new Set();
  let powered = false;
  let glassOn = true;
  let hoverSlot = null;
  let errorSlots = new Set();
  let needsRender = true;
  let lastFitKey = '';
  let spinUntil = 0; // fans spin while the user is around, then rendering idles again
  const wake = (ms = 9000) => { spinUntil = Math.max(spinUntil, performance.now() + ms); };

  const invalidate = () => { needsRender = true; };

  function tween({ duration, delay = 0, easing = ease.outCubic, update, done }) {
    const t = { start: performance.now() + delay * 1000, duration: Math.max(1, duration * 1000), easing, update, done };
    tweens.add(t);
    invalidate();
    return t;
  }

  /* ------------------------------------------------------------ material handling */
  function adopt(group) {
    const cache = new Map();
    const mats = []; const leds = []; const fans = [];
    group.traverse((o) => {
      if (o.userData.isFan) fans.push(o);
      if (!o.material) return;
      const src = o.material;
      if (src.userData?.glass || src === mat.glass) return;
      if (!cache.has(src.uuid)) {
        const c = src.clone();
        c.userData = { baseOpacity: 1, led: src === mat.led };
        cache.set(src.uuid, c);
        (c.userData.led ? leds : mats).push(c);
      }
      o.material = cache.get(src.uuid);
    });
    for (const l of leds) l.emissiveIntensity = powered ? 2.6 : 0.15;
    return { mats, leds, fans };
  }

  function setOpacity(entry, a) {
    for (const m of [...entry.mats, ...entry.leds]) {
      m.transparent = a < 0.999;
      m.opacity = a;
      m.depthWrite = a > 0.5;
    }
  }

  function applyTint(entry) {
    const t = entry.tint;
    const r = ACCENT.r * (t.flash * 0.9 + t.hover * 0.16) + RED.r * t.error * 0.3;
    const g = ACCENT.g * (t.flash * 0.9 + t.hover * 0.16) + RED.g * t.error * 0.3;
    const b = ACCENT.b * (t.flash * 0.9 + t.hover * 0.16) + RED.b * t.error * 0.3;
    for (const m of entry.mats) if (m.emissive) { m.emissive.setRGB(r, g, b); m.emissiveIntensity = 1; }
  }

  function disposeGroup(group) {
    group.traverse((o) => {
      if (o.geometry) o.geometry.dispose();
      if (o.material && o.material !== mat.glass) {
        if (o.material.map && o.material.map !== mat.pcb.map && !Object.values(mat).some((m) => m.map === o.material.map)) o.material.map.dispose();
        o.material.dispose();
      }
    });
  }

  /* ------------------------------------------------------------ layout */
  function computeLayout(parts) {
    const cs = parts.case || GENERIC_CASE;
    const L = caseLayout(cs);
    const entries = [];
    const mb = parts.motherboard;
    const A = new THREE.Vector3(L.xRear, L.yTop, L.zTray + M(6));
    const zF = A.z + M(1.6);
    const bg = mb ? boardGeometry(mb) : null;
    const bw = (x, y, z = zF) => new THREE.Vector3(A.x - M(x), A.y - M(y), z);
    const add = (e) => { entries.push({ insert: new THREE.Vector3(0, 0, 1), rotY: 0, scale: 1, mounted: true, sig: '', ...e }); };

    if (mb) add({ slot: 'motherboard', part: mb, pos: A.clone(), build: () => buildMotherboard(mat, mb) });

    const cpu = parts.cpu;
    const socket = bg ? bw(bg.socket.x, bg.socket.y) : null;
    if (cpu) add({ slot: 'cpu', part: cpu, mounted: !!mb, pos: mb ? socket.clone().setZ(zF + M(5)) : null, build: () => buildCpu(mat, cpu), bench: { w: 0.7, cx: 0, cy: 0 } });

    const coolerPart = parts.cooler || (cpu?.boxCooler ? { id: 'stock', type: 'stock', name: 'Bundled cooler' } : null);
    if (coolerPart) {
      const mounted = !!(mb && cpu);
      const pos = mounted ? socket.clone().setZ(zF + M(10)) : null;
      let radiatorOffset = null;
      if (coolerPart.type === 'aio') {
        const len = M(coolerPart.radiatorMm + 37);
        const wid = M(coolerPart.radiatorMm === 280 ? 143 : 122);
        if (mounted) {
          const world = new THREE.Vector3(
            Math.min(-L.D / 2 + M(12) + len / 2, L.D / 2 - M(30) - len / 2),
            L.H - M(10) - M(13.5),
            Math.min(zF + M(70) + wid / 2, L.zFace - M(16) - wid / 2),
          );
          radiatorOffset = world.sub(pos);
        } else radiatorOffset = new THREE.Vector3(M(30), M(150), -M(60));
      }
      add({
        slot: 'cooler', part: coolerPart, mounted, pos,
        sig: radiatorOffset ? radiatorOffset.toArray().map((v) => v.toFixed(2)).join(',') : '',
        build: () => buildCooler(mat, coolerPart, { radiatorOffset }),
        bench: { w: coolerPart.type === 'aio' ? M(coolerPart.radiatorMm + 60) : 1.7, cx: coolerPart.type === 'aio' ? M(30) : 0, cy: 0 },
      });
    }

    // memory: one model per stick, filled in the order boards ask for (A2, B2, then A1, B1),
    // so adding a second kit leaves the first kit's sticks where they are
    const ram = parts.ram;
    if (ram) {
      const sticks = ram.modules * (parts.qty?.ram || 1);
      const order = bg ? fillOrder(bg.slots.length) : [];
      for (let i = 0; i < sticks; i++) {
        const si = order[i];
        const mounted = !!mb && si != null;
        add({
          slot: 'ram', part: ram, idx: i, mounted,
          pos: mounted ? bw(bg.slots[si], bg.ramY + 67, zF + M(4)) : null,
          build: () => buildRam(mat, ram, [0]),
          bench: { w: 0.14, cx: 0, cy: 0, pack: true },
        });
      }
    }

    // graphics cards: one per x16 slot, top slot first
    const gpu = parts.gpu;
    const gpuPos = [];
    if (gpu) {
      const n = parts.qty?.gpu || 1;
      for (let i = 0; i < n; i++) {
        const y = bg?.pcie[i];
        const mounted = y != null;
        const pos = mounted ? new THREE.Vector3(L.D / 2 - M(10), A.y - M(y), zF + M(8)) : null;
        if (mounted) gpuPos.push(pos);
        add({ slot: 'gpu', part: gpu, idx: i, mounted, pos, build: () => buildGpu(mat, gpu), bench: { w: M(gpu.lengthMm) + 0.3, cx: -M(gpu.lengthMm) / 2, cy: 0 } });
      }
    }

    // drives: keyed by part and copy number, so removing one copy only takes that drive out
    let m2i = 0; let s25 = 0; let s35 = 0;
    const copies = {};
    parts.storage.forEach((d) => {
      const idx = (copies[d.id] = (copies[d.id] ?? -1) + 1);
      if (d.formFactor === 'm2') {
        const slot = bg?.m2[m2i++];
        add({ slot: 'storage', part: d, idx, mounted: !!slot, pos: slot ? bw(slot.x, slot.y, zF + M(1)) : null, build: () => buildStorage(mat, d), bench: { w: 1.1, cx: -M(40), cy: 0 } });
      } else if (d.formFactor === '2.5') {
        // two side by side on the shroud, then stacked
        const col = s25 % 2, row = Math.floor(s25 / 2);
        add({ slot: 'storage', part: d, idx, pos: new THREE.Vector3(-L.D / 2 + M(85) + col * M(108), L.shroudH + M(2) + row * M(10), L.zFace - M(85)), build: () => buildStorage(mat, d) });
        s25++;
      } else {
        add({ slot: 'storage', part: d, idx, pos: new THREE.Vector3(-L.D / 2 + M(100), M(8) + s35 * M(30), L.zFace - M(30) - M(58)), build: () => buildStorage(mat, d) });
        s35++;
      }
    });

    const psu = parts.psu;
    let psuPos = null;
    if (psu) {
      const s = psuSize(psu);
      psuPos = new THREE.Vector3(L.D / 2 - M(8), M(6), L.zFace - M(36) - M(s.w) / 2);
      add({ slot: 'psu', part: psu, pos: psuPos, build: () => buildPsu(mat, psu), insert: new THREE.Vector3(1, 0, 0) });
    }

    // cables
    if (mb && psu) {
      const hx = A.x - M(bg.atx24.x - 2), hy = A.y - M(bg.atx24.y);
      const pts = [
        new THREE.Vector3(hx - M(28), L.shroudH - M(4), L.zTray + M(22)),
        new THREE.Vector3(hx - M(34), (L.shroudH + hy) / 2, L.zTray + M(30)),
        new THREE.Vector3(hx - M(26), hy, zF + M(16)),
        new THREE.Vector3(hx - M(3), hy, zF + M(12)),
      ];
      add({ slot: 'cable', part: { id: 'atx24' }, pos: new THREE.Vector3(), sig: pts.map((p) => p.toArray().map((v) => v.toFixed(2))).join('|'), build: () => buildCable(mat, pts, M(7)), cable: true });
    }
    if (gpu && mb && psu) gpuPos.forEach((gp, ci) => {
      const Lg = M(gpu.lengthMm);
      const Hc = M(Math.min(140, 112 + (gpu.slots - 2) * 14));
      const plug = gp.clone().add(new THREE.Vector3(-Lg * (gpu.needs16pin ? 0.45 : 0.85), -M(8), Hc + M(8)));
      if (plug.y > L.shroudH + M(20)) {
        const pts = [
          new THREE.Vector3(plug.x - M(20), L.shroudH, Math.min(plug.z - M(5), L.zFace - M(50))),
          new THREE.Vector3(plug.x - M(12), (L.shroudH + plug.y) / 2, Math.min(plug.z + M(16), L.zFace - M(14))),
          new THREE.Vector3(plug.x, plug.y + M(6), Math.min(plug.z + M(4), L.zFace - M(12))),
        ];
        add({ slot: 'cable', part: { id: `gpu${ci}` }, pos: new THREE.Vector3(), sig: pts.map((p) => p.toArray().map((v) => v.toFixed(2))).join('|'), build: () => buildCable(mat, pts, M(6)), cable: true });
      }
    });

    // bench row for parts that have nowhere to mount yet
    const benched = entries.filter((e) => !e.mounted);
    // shrink the row when many parts wait, so it stays about as wide as the case
    const rawW = benched.reduce((s, e) => s + e.bench.w, 0);
    const scale = Math.min(0.62, (L.D + 0.6) / Math.max(rawW, 0.01));
    // sticks from the same kit sit close together; everything else gets breathing room
    const gapAfter = (i) => (benched[i].bench.pack && benched[i + 1]?.bench.pack && benched[i + 1].slot === benched[i].slot ? 0.04 : 0.25);
    const total = benched.reduce((s, e, i) => s + e.bench.w * scale + (i < benched.length - 1 ? gapAfter(i) : 0), 0);
    let cursor = -total / 2;
    benched.forEach((e, i) => {
      const w = e.bench.w * scale;
      e.pos = new THREE.Vector3(cursor + w / 2 - e.bench.cx * scale, 0.45 - e.bench.cy * scale, L.W / 2 + 1.1);
      e.scale = scale;
      e.rotY = 0;
      cursor += w + gapAfter(i);
    });

    for (const e of entries) e.key = `${e.slot}:${e.part.id}${e.idx != null ? ':' + e.idx : ''}${e.sig ? '#' + e.sig : ''}`;
    const benchCount = new Set(benched.map((e) => (e.bench.pack ? e.slot : e.key))).size;
    return { cs, L, entries, benchCount };
  }

  /* ------------------------------------------------------------ animations */
  function animateIn(entry, target, delay) {
    const g = entry.group;
    const id = (entry.motionId = (entry.motionId || 0) + 1);
    const live_ = () => entry.motionId === id;
    const end = target.pos.clone();
    const dir = target.insert.clone();
    if (!target.mounted) dir.set(0, 1, 0);
    g.scale.setScalar(target.scale);
    g.rotation.y = target.rotY;
    entry.tint.flash = 0;
    if (reduceMotion) {
      g.position.copy(end);
      setOpacity(entry, 0);
      tween({ duration: 0.25, delay, update: (t) => live_() && setOpacity(entry, t), done: () => live_() && setOpacity(entry, 1) });
      return;
    }
    const start = end.clone().addScaledVector(dir, target.cable ? 0 : 2.2).add(new THREE.Vector3(0, target.cable ? 0 : 0.5, 0));
    const near = end.clone().addScaledVector(dir, target.cable ? 0 : 0.45);
    g.position.copy(start);
    g.rotation.z = target.cable ? 0 : 0.22;
    setOpacity(entry, 0);
    tween({
      duration: target.cable ? 0.4 : 0.55, delay, easing: ease.outCubic,
      update: (t) => { if (!live_()) return; g.position.lerpVectors(start, near, t); g.rotation.z = 0.22 * (1 - t) * (target.cable ? 0 : 1); setOpacity(entry, Math.min(1, t * 1.6)); },
      done: () => {
        if (!live_()) return;
        setOpacity(entry, 1);
        tween({
          duration: 0.3, easing: ease.outBack,
          update: (t) => live_() && g.position.lerpVectors(near, end, t),
          done: () => {
            if (target.cable || !live_()) return;
            tween({ duration: 0.7, easing: (t) => t, update: (t) => { entry.tint.flash = Math.sin(Math.PI * Math.min(1, t * 1.4)) * (1 - t); applyTint(entry); }, done: () => { entry.tint.flash = 0; applyTint(entry); } });
          },
        });
      },
    });
  }

  function animateOut(entry, delay = 0) {
    live.delete(entry.key);
    entry.motionId = (entry.motionId || 0) + 1;
    g_rotReset(entry);
    const g = entry.group;
    const from = g.position.clone();
    const dir = entry.target.mounted ? entry.target.insert.clone() : new THREE.Vector3(0, 1, 0);
    const finish = () => { root.remove(g); disposeGroup(g); invalidate(); };
    if (reduceMotion || entry.target.cable) {
      tween({ duration: 0.2, delay, update: (t) => setOpacity(entry, 1 - t), done: finish });
      return;
    }
    const mid = from.clone().addScaledVector(dir, 0.45);
    const far = from.clone().addScaledVector(dir, 2.0).add(new THREE.Vector3(0, 0.6, 0));
    tween({
      duration: 0.18, delay, easing: ease.inCubic,
      update: (t) => g.position.lerpVectors(from, mid, t),
      done: () => tween({
        duration: 0.38, easing: ease.inCubic,
        update: (t) => { g.position.lerpVectors(mid, far, t); g.rotation.z = -0.25 * t; setOpacity(entry, 1 - t); },
        done: finish,
      }),
    });
  }

  function g_rotReset(entry) { entry.group.rotation.z = 0; }

  function animateMove(entry, target, delay = 0) {
    const g = entry.group;
    const interrupted = entry.target !== target && entry.group.rotation.z !== 0;
    const from = g.position.clone();
    const fromScale = g.scale.x;
    const to = target.pos.clone();
    const lift = entry.target.mounted !== target.mounted ? 0.9 : 0;
    entry.target = target;
    if (from.distanceTo(to) < 1e-4 && Math.abs(fromScale - target.scale) < 1e-4) return;
    const id = (entry.motionId = (entry.motionId || 0) + 1);
    if (interrupted || entry.mats.some((m) => m.opacity < 1)) { setOpacity(entry, 1); g.rotation.z = 0; }
    tween({
      duration: reduceMotion ? 0.01 : 0.7, delay, easing: ease.inOutCubic,
      update: (t) => {
        if (entry.motionId !== id) return;
        g.position.lerpVectors(from, to, t);
        g.position.y += Math.sin(Math.PI * t) * lift;
        g.scale.setScalar(fromScale + (target.scale - fromScale) * t);
      },
    });
  }

  /* ------------------------------------------------------------ case swap */
  function setCase(cs, L) {
    const id = cs.id || 'generic';
    if (caseState?.id === id) return false;
    const old = caseState;
    const built = buildCase(mat, cs);
    const a = adopt(built.group);
    caseState = { id, group: built.group, layout: L, ghosts: built.ghosts, ...a, tint: { flash: 0, hover: 0, error: 0 }, glassMeshes: [] };
    built.group.traverse((o) => { if (o.userData.glass) { caseState.glassMeshes.push(o); o.visible = glassOn; } });
    root.add(built.group);
    shadow.scale.set(L.D + 1.6, L.W + 1.6, 1);
    setOpacity(caseState, 0);
    const cur = caseState;
    tween({ duration: reduceMotion ? 0.2 : 0.45, delay: old ? 0.15 : 0, update: (t) => setOpacity(cur, t), done: () => setOpacity(cur, 1) });
    if (old) tween({ duration: 0.3, update: (t) => setOpacity(old, 1 - t), done: () => { root.remove(old.group); disposeGroup(old.group); } });
    glow.position.set(0, L.H * 0.6, 0);
    return true;
  }

  /* ------------------------------------------------------------ camera */
  function fitCamera(L, animate) {
    const w = canvas.clientWidth || 1, h = canvas.clientHeight || 1;
    const aspect = w / h;
    const fov = THREE.MathUtils.degToRad(camera.fov);
    const needH = L.H * 1.5;
    const needW = (L.D + 1.6) / aspect;
    const dist = Math.max(needH, needW) / (2 * Math.tan(fov / 2)) + L.W / 2;
    const target = new THREE.Vector3(0, L.H * 0.44, 0.3);
    const dir = new THREE.Vector3(-0.45, 0.36, 1).normalize();
    const pos = target.clone().addScaledVector(dir, dist);
    controls.minDistance = dist * 0.45;
    controls.maxDistance = dist * 1.9;
    if (!animate || reduceMotion) {
      camera.position.copy(pos); controls.target.copy(target); controls.update(); invalidate();
      return;
    }
    const p0 = camera.position.clone(), t0 = controls.target.clone();
    tween({ duration: 0.8, easing: ease.inOutCubic, update: (t) => { camera.position.lerpVectors(p0, pos, t); controls.target.lerpVectors(t0, target, t); controls.update(); } });
  }

  /* ------------------------------------------------------------ public update */
  function update(parts) {
    const { cs, L, entries, benchCount } = computeLayout(parts);
    const caseChanged = setCase(cs, L);
    caseState.ghosts.motherboard.visible = !parts.motherboard;
    caseState.ghosts.psu.visible = !parts.psu;
    const fitKey = `${L.H}|${L.W}|${L.D}`;
    if (fitKey !== lastFitKey) { fitCamera(L, lastFitKey !== ''); lastFitKey = fitKey; }

    const next = new Map(entries.map((e) => [e.key, e]));
    let outDelay = 0;
    for (const [k, entry] of [...live]) {
      if (!next.has(k)) { animateOut(entry, outDelay); outDelay += 0.04; }
    }
    let inDelay = live.size === 0 ? 0.1 : (outDelay > 0 ? 0.22 : 0);
    if (caseChanged) inDelay += 0.2;
    for (const e of entries) {
      const existing = live.get(e.key);
      if (existing) { animateMove(existing, e, caseChanged ? 0.1 : 0); continue; }
      const group = e.build();
      const a = adopt(group);
      const entry = { key: e.key, slot: e.slot, group, ...a, target: e, tint: { flash: 0, hover: 0, error: 0 } };
      group.traverse((o) => { o.userData.slot = e.slot === 'cable' ? null : e.slot; });
      root.add(group);
      live.set(e.key, entry);
      entry.tint.error = errorSlots.has(e.slot) ? 1 : 0;
      entry.tint.hover = hoverSlot === e.slot ? 1 : 0;
      applyTint(entry);
      animateIn(entry, e, inDelay);
      inDelay += 0.12;
    }
    invalidate();
    wake();
    return { benchCount };
  }

  function setIssues(slots) {
    errorSlots = new Set(slots);
    for (const e of live.values()) { e.tint.error = errorSlots.has(e.slot) ? 1 : 0; applyTint(e); }
    invalidate();
  }

  function highlight(slot) {
    hoverSlot = slot;
    for (const e of live.values()) { e.tint.hover = e.slot === slot ? 1 : 0; applyTint(e); }
    invalidate();
  }

  function setPowered(on) {
    if (on === powered) return;
    powered = on;
    if (on) wake(12000);
    const all = [...live.values(), caseState].filter(Boolean);
    const from = glow.intensity;
    tween({
      duration: reduceMotion ? 0.01 : 0.9, easing: ease.inOutCubic,
      update: (t) => {
        const k = on ? t : 1 - t;
        for (const e of all) for (const l of e.leds) l.emissiveIntensity = 0.15 + 2.45 * k;
        glow.intensity = on ? from + (0.6 - from) * t : from * (1 - t);
      },
    });
  }

  function setGlass(on) {
    glassOn = on;
    caseState?.glassMeshes.forEach((m) => { m.visible = on; });
    invalidate();
  }

  function resetView() { if (caseState) fitCamera(caseState.layout, true); }

  /* ------------------------------------------------------------ picking */
  const ray = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  function slotAt(ev) {
    const r = canvas.getBoundingClientRect();
    ndc.set(((ev.clientX - r.left) / r.width) * 2 - 1, -((ev.clientY - r.top) / r.height) * 2 + 1);
    ray.setFromCamera(ndc, camera);
    const targets = [...live.values()].filter((e) => e.slot !== 'cable').map((e) => e.group);
    const hit = ray.intersectObjects(targets, true)[0];
    return hit?.object.userData.slot || null;
  }
  let downAt = null;
  canvas.addEventListener('pointerdown', (e) => { downAt = { x: e.clientX, y: e.clientY }; });
  canvas.addEventListener('pointerup', (e) => {
    if (!downAt || Math.hypot(e.clientX - downAt.x, e.clientY - downAt.y) > 6) return;
    const s = slotAt(e);
    if (s && onPick) onPick(s);
  });
  let hoverRaf = 0;
  canvas.addEventListener('pointermove', (e) => {
    wake();
    if (isTouch || e.buttons) return;
    cancelAnimationFrame(hoverRaf);
    hoverRaf = requestAnimationFrame(() => {
      const s = slotAt(e);
      canvas.style.cursor = s ? 'pointer' : 'grab';
      if (s !== hoverSlot) highlight(s);
      onHover?.(s, e.clientX, e.clientY);
    });
  });
  canvas.addEventListener('pointerleave', () => { if (hoverSlot) highlight(null); onHover?.(null); });

  /* ------------------------------------------------------------ loop */
  controls.addEventListener('change', () => { invalidate(); wake(); });
  const ro = new ResizeObserver(() => {
    const w = canvas.clientWidth, h = canvas.clientHeight;
    if (!w || !h) return;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    if (caseState) fitCamera(caseState.layout, false);
    invalidate();
  });
  ro.observe(canvas);

  let last = performance.now();
  function frame(now) {
    requestAnimationFrame(frame);
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    if (document.hidden) return;
    for (const t of [...tweens]) {
      if (now < t.start) { needsRender = true; continue; }
      const k = Math.min(1, (now - t.start) / t.duration);
      t.update(t.easing(k));
      if (k >= 1) { tweens.delete(t); t.done?.(); }
      needsRender = true;
    }
    if (controls.update()) needsRender = true;
    if (powered && !reduceMotion && now < spinUntil) {
      const spin = dt * 14;
      for (const e of live.values()) for (const f of e.fans) f.userData.rotor.rotation.z += spin;
      if (caseState) for (const f of caseState.fans) f.userData.rotor.rotation.z += spin;
      needsRender = true;
    }
    if (needsRender) { renderer.render(scene, camera); needsRender = false; }
  }
  requestAnimationFrame(frame);

  return { update, setIssues, highlight, setPowered, setGlass, resetView, invalidate };
}
