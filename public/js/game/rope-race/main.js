// =====================================================================
//  ROPE RACE  -  roped-together obstacle race (3D, three.js)
//  Controller: "pad"   A = jump   B = sprint (hold)   stick = move
//  Players are cubes for now (see makePlayerVisual() to swap in characters).
// =====================================================================

const THREE_VER = "0.160.0";
const THREE_URL = `https://cdn.jsdelivr.net/npm/three@${THREE_VER}/+esm`;
const GLTF_URL  = `https://cdn.jsdelivr.net/npm/three@${THREE_VER}/examples/jsm/loaders/GLTFLoader.js/+esm`;
const ASSET_DIR = new URL("./assets/mapassets/", import.meta.url).href;   // js/game/rope-race/assets/mapassets/
const ASSET_EXT = ".glb";            // change to ".gltf" if your models use that

// ---- tuning ---------------------------------------------------------
const W = 1280, H = 720;
const T = 2.08, COLS = 4, LANE_HALF = COLS * T / 2, LANE_GAP = 30;
const colX = (i) => (i - (COLS - 1) / 2) * T;
const PH = 0.8, HALF = 0.4;                   // player cube size
const GRAV = 22, JUMP = 10.5, WALK = 6, SPRINT = 9.5, STEP_UP = 0.55;   // longer jumps: more air time (~0.95s) ...
const HANG_LIMIT = 20;                         // seconds the others have to pull a fallen player up
const PULL_LEN = 10;                           // distance (units) the rescuers must walk forward to pull a fallen player up
const AIR_CONTROL = 9;                         // ... and better steering in the air (was 5)
const ROPE = 5.2;                              // max rope length between neighbours
const ROPE_TEX = "textures/colormap.png";      // relative to ASSET_DIR (assets/mapassets/textures/colormap.png)
const ROPE_UV = [0.5, 0.5];                    // which spot of the colour palette the rope samples (0..1, tweak to change rope colour)
const FALL_Y = -2.5;                           // below this a player is "fallen"
const MAX_HEARTS = 3, INV_TIME = 1.6;
const BRIDGE_TIME = 15;
const STICK_UP_IS_NEGATIVE = true;             // pad sends y=-1 when pushed up
const SECTIONS_PER_STAGE = 5;

// ---- the 12 map models (sizes = "size in game" from the spec) -------
const M = {
  low:     { f: "block-grass-low-large",  s: [2.08, 0.5, 2.08],  c: "#8bd06f" },
  ground:  { f: "block-grass-large",      s: [2.08, 1.0, 2.08],  c: "#6fbf5a", alt: "block-grass-low-large" },  // alt used (stretched to 1.0 tall) if the file is missing
  tall:    { f: "block-grass-large-tall", s: [2.08, 2.0, 2.08],  c: "#4f9d45" },
  mover:   { f: "block-moving-blue",      s: [3.0, 1.0, 3.0],    c: "#4f86ff" },
  spikes:  { f: "trap-spikes-large",      s: [2.07, 0.69, 2.07], c: "#b9bcc6" },
  sblock:  { f: "spike-block",            s: [0.9, 0.9, 0.9],    c: "#e04b4b" },
  sweeper: { f: "spike-block-wide",       s: [2.4, 0.9, 0.9],    c: "#e04b4b" },
  saw:     { f: "saw",                    s: [1.19, 1.19, 0.45], c: "#cfd3da", centre: true },
  lever:   { f: "lever",                  s: [0.9, 0.96, 0.68],  c: "#ffb703" },
  tree:    { f: "tree",                   s: [1.64, 2.9, 1.67],  c: "#2f8f46", cone: true },
  rocks:   { f: "rocks",                  s: [1.0, 0.6, 1.0],    c: "#9aa0a6" },
  plant:   { f: "plant",                  s: [0.77, 0.26, 0.66], c: "#3fae52" },
};

const TEAM_STYLE = [
  { name: "RED",  color: "#ff4d4d" },
  { name: "BLUE", color: "#3b8bff" },
];

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const clamp1 = (v) => (Number.isFinite(v) ? clamp(v, -1, 1) : 0);

function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// =====================================================================
//  RANDOM MAP GENERATOR  (pure data, same layout is used for every lane)
//  Course runs toward -Z. Row r is centred at z = -r*T.
// =====================================================================
function generate(seed) {
  const rnd = mulberry32(seed);
  const R = (a, b) => a + rnd() * (b - a);
  const RI = (a, b) => Math.floor(R(a, b + 1));
  const pick = (a) => a[Math.floor(rnd() * a.length)];
  const shuffle = (a) => { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
  const rz = (r) => -r * T;
  const items = [], cps = [];
  let row = 0, leverId = 0;
  const add = (o) => items.push(o);

  const gRow = (r) => { for (let c = 0; c < COLS; c++) add({ k: "solid", m: "ground", x: colX(c), z: rz(r), top: 0 }); };
  const flat = (rows) => {
    for (let i = 0; i < rows; i++) {
      gRow(row);
      if (rnd() < 0.4) add({ k: "deco", m: "plant", x: R(-3.6, 3.6), y: 0, z: rz(row) + R(-0.8, 0.8), rot: R(0, 6.28), mul: R(0.9, 1.3) });
      if (rnd() < 0.15) add({ k: "deco", m: "rocks", x: pick([-1, 1]) * R(3.0, 3.7), y: 0, z: rz(row) + R(-0.6, 0.6), rot: R(0, 6.28), mul: R(0.8, 1.2) });
      row++;
    }
  };

  // ---------- obstacle sections (each starts on solid ground) ----------
  const S = {
    planks() {                                   // narrow planks over a pit
      const G = RI(4, 5), n = RI(2, 3);
      const xs = shuffle([0, 1, 2, 3]).slice(0, n).map((c) => colX(c) + R(-0.35, 0.35));
      for (let i = 0; i < G; i++) xs.forEach((x) => add({ k: "solid", m: "low", x, z: rz(row + i), top: 0, mul: [0.5, 1, 1] }));
      row += G;
    },
    stones() {                                   // crumbling stepping stones
      const G = RI(4, 6); let prev = [1, 2];
      for (let i = 0; i < G; i++) {
        let cols;
        do {
          cols = shuffle([0, 1, 2, 3]).slice(0, RI(1, 2));
        } while (!cols.some((c) => prev.some((p) => Math.abs(p - c) <= 1)));
        cols.forEach((c) => add({ k: "crumble", x: colX(c), z: rz(row + i) }));
        prev = cols;
      }
      row += G;
    },
    moverZ() {                                   // shuttle platforms over a wide pit
      const G = 5, zN = rz(row) + T / 2, zF = rz(row + G - 1) - T / 2;
      const mid = (zN + zF) / 2, amp = (zN - zF) / 2 - 1.3, sp = R(0.55, 0.8);
      if (rnd() < 0.5) add({ k: "mover", x: 0, z: mid, top: 0, ax: 0, az: amp, rise: 0, sp, ph: R(0, 6.28) });
      else { const ph = R(0, 6.28); [-2.3, 2.3].forEach((x, i) => add({ k: "mover", x, z: mid, top: 0, ax: 0, az: amp, rise: 0, sp, ph: ph + i * Math.PI })); }
      row += G;
    },
    moverX() {                                   // two sliding platforms
      const zN = rz(row) + T / 2, sp = R(0.9, 1.2), ph = R(0, 6.28);
      add({ k: "mover", x: 0, z: zN - 2.0, top: 0, ax: 2.6, az: 0, rise: 0, sp, ph });
      add({ k: "mover", x: 0, z: zN - 6.3, top: 0, ax: 2.6, az: 0, rise: 0, sp, ph: ph + Math.PI });
      row += 4;
    },
    elevator() {                                 // elevator up to a raised deck
      for (let r = 0; r < 2; r++) for (const c of [0, 3]) {
        add({ k: "solid", m: "ground", x: colX(c), z: rz(row + r), top: 0 });
        add({ k: "solid", m: "tall", x: colX(c), z: rz(row + r), top: 2 });
      }
      add({ k: "mover", x: 0, z: rz(row) - T / 2, top: 0, ax: 0, az: 0, rise: 2, sp: R(0.7, 0.9), ph: R(0, 6.28) });
      for (let r = 2; r < 4; r++) for (let c = 0; c < COLS; c++) {
        add({ k: "solid", m: "ground", x: colX(c), z: rz(row + r), top: 0 });
        add({ k: "solid", m: "tall", x: colX(c), z: rz(row + r), top: 2 });
      }
      row += 4;
    },
    sweeper() {                                  // wide spike bars sweeping forward/back
      for (let i = 0; i < 4; i++) gRow(row + i);
      const zc = rz(row) - 1.5 * T, sp = R(1.2, 1.8), ph = R(0, 6.28);
      if (rnd() < 0.5) add({ k: "sweeper", x: pick([-2.2, 0, 2.2]), z: zc, ax: 0, az: 2.6, sp, ph });
      else { add({ k: "sweeper", x: -2.2, z: zc, ax: 0, az: 2.6, sp, ph }); add({ k: "sweeper", x: 2.2, z: zc, ax: 0, az: 2.6, sp, ph: ph + Math.PI }); }
      row += 4;
    },
    saw() {                                      // saws on rails
      const n = RI(1, 2);
      for (let i = 0; i < 3; i++) gRow(row + i);
      for (let i = 0; i < n; i++) {
        const z = rz(row + (n === 1 ? 1 : i * 2));
        add({ k: "rail", x: 0, z, len: 7.6 });
        add({ k: "saw", x: 0, z, ax: 3.1, az: 0, sp: R(1.4, 2.2), ph: R(0, 6.28) + i * Math.PI });
      }
      row += 3;
    },
    spikes() {                                   // spike tiles with random safe tiles
      const rows = RI(3, 4);
      for (let r = 0; r < rows; r++) {
        gRow(row + r);
        const free = shuffle([0, 1, 2, 3]).slice(0, RI(1, 2));
        for (let c = 0; c < COLS; c++) if (!free.includes(c)) add({ k: "spikes", x: colX(c), z: rz(row + r) });
      }
      row += rows;
    },
    patrol() {                                   // patrolling spike blocks
      for (let i = 0; i < 4; i++) gRow(row + i);
      add({ k: "sblock", x: 0, z: rz(row + 1), ax: 3.4, az: 0, sp: R(1.5, 2.6), ph: R(0, 6.28) });
      add({ k: "sblock", x: 0, z: rz(row + 3), ax: 3.4, az: 0, sp: R(1.5, 2.6), ph: R(0, 6.28) });
      if (rnd() < 0.5) add({ k: "sblock", x: 0, z: rz(row + 2), ax: 0, az: 0, sp: 1, ph: 0, ax2: 0 });
      row += 4;
    },
    pillars() {                                  // tall pillars to weave around
      const rows = RI(3, 4);
      for (let r = 0; r < rows; r++) {
        gRow(row + r);
        shuffle([0, 1, 2, 3]).slice(0, RI(1, 2)).forEach((c) => add({ k: "solid", m: "tall", x: colX(c), z: rz(row + r), top: 2 }));
      }
      row += rows;
    },
    gate() {                                     // wall with one gap
      gRow(row); gRow(row + 2);
      const g = RI(0, 3);
      for (let c = 0; c < COLS; c++) {
        add({ k: "solid", m: "ground", x: colX(c), z: rz(row + 1), top: 0 });
        if (c !== g) add({ k: "solid", m: "tall", x: colX(c), z: rz(row + 1), top: 2 });
      }
      if (rnd() < 0.55) add({ k: "spikes", x: colX(g), z: rz(row + 1) });
      row += 3;
    },
    lever() {                                    // lever extends a bridge (stage 3)
      const id = leverId++, G = 5;
      add({ k: "lever", id, x: colX(0), z: rz(row - 1) });
      for (let i = 0; i < G; i++) for (const c of [1, 2]) add({ k: "btile", id, i, n: G, x: colX(c), z: rz(row + i) });
      row += G;
    },
  };

  const pools = [
    ["planks", "spikes", "patrol", "stones", "pillars", "gate"],
    ["moverZ", "moverX", "elevator", "sweeper", "saw", "spikes", "patrol", "stones", "planks"],
    ["lever", "saw", "sweeper", "moverZ", "elevator", "patrol", "stones", "gate", "moverX"],
  ];

  flat(4);
  cps.push({ z: rz(1), spawnZ: rz(1) });
  let last = "";
  for (let s = 0; s < 3; s++) {
    if (s > 0) { cps.push({ z: rz(row), spawnZ: rz(row) }); flat(2); }
    for (let i = 0; i < SECTIONS_PER_STAGE; i++) {
      let name; do { name = pick(pools[s]); } while (name === last);
      last = name;
      S[name]();
      flat(RI(1, 2));
    }
  }
  // finish: steps up to a tall podium
  flat(1);
  const f = row;
  for (let c = 0; c < COLS; c++) {
    add({ k: "solid", m: "ground", x: colX(c), z: rz(f), top: 0 });
    add({ k: "solid", m: "low", x: colX(c), z: rz(f), top: 0.5 });
    add({ k: "solid", m: "ground", x: colX(c), z: rz(f + 1), top: 0 });
    add({ k: "solid", m: "ground", x: colX(c), z: rz(f + 1), top: 1.0 });
    for (const r of [2, 3]) {
      add({ k: "solid", m: "ground", x: colX(c), z: rz(f + r), top: 0 });
      add({ k: "solid", m: "tall", x: colX(c), z: rz(f + r), top: 2, finish: true });
    }
  }
  row = f + 4;

  // scenery on both sides
  for (let r = -4; r < row + 6; r++) {
    for (let k = 0; k < 2; k++) {
      if (rnd() < 0.55) {
        const side = rnd() < 0.5 ? -1 : 1;
        const m = rnd() < 0.5 ? "tree" : rnd() < 0.6 ? "rocks" : "plant";
        add({ k: "deco", m, x: side * (LANE_HALF + R(1.6, 10)), y: -1, z: rz(r) + R(-1, 1), rot: R(0, 6.28), mul: m === "tree" ? R(1, 1.33) : R(0.9, 1.4) });
      }
    }
  }
  return { items, cps, rows: row, finishZ: rz(f + 2) + T / 2 };
}

// =====================================================================
//  GAME
// =====================================================================
export async function start(ctx) {
  const { root, signal } = ctx;
  const on = (t, type, fn) => t.addEventListener(type, fn, { signal });
  const info = (slot) => ctx.player(slot) || { name: "KB", color: "#ffffff", animal: "⌨️" };

  // ---------- DOM ----------
  const style = document.createElement("style");
  style.textContent = `
  .rr-wrap{width:100%;height:100%;display:flex;align-items:center;justify-content:center;background:#0b1020}
  .rr-stage{position:relative;overflow:hidden;font-family:system-ui,sans-serif;color:#fff}
  .rr-stage canvas{width:100%;height:100%;display:block}
  .rr-ui{position:absolute;inset:0;pointer-events:none}
  .rr-msg{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;font-size:2rem;background:#0b1020;text-align:center;padding:2rem}
  .rr-div{position:absolute;top:0;bottom:0;left:50%;width:4px;margin-left:-2px;background:#0b1020}
  .rr-hud{position:absolute;top:8px;padding:6px 10px;font-size:15px;line-height:1.35;text-shadow:0 1px 3px #000}
  .rr-hud .rr-tn{font-weight:800;letter-spacing:.08em;font-size:17px}
  .rr-bar{height:8px;background:#0006;border-radius:6px;margin:4px 0 6px;overflow:hidden;width:220px}
  .rr-bar i{display:block;height:100%}
  .rr-pl{display:flex;gap:6px;align-items:center}
  .rr-dot{display:inline-block;width:12px;height:12px;border-radius:3px;border:1px solid #fff8}
  .rr-banner{position:absolute;top:34%;text-align:center;font-size:2.4rem;font-weight:900;text-shadow:0 3px 10px #000;opacity:0;transition:opacity .25s;padding:0 1rem}
  .rr-banner.on{opacity:1}
  .rr-lobby{position:absolute;inset:0;background:linear-gradient(160deg,#16254a,#2b1a4a);display:flex;flex-direction:column;align-items:center;padding:2.2% 4%;gap:1.2%}
  .rr-lobby h1{margin:0;font-size:2.6rem;letter-spacing:.06em}
  .rr-lobby p{margin:0;opacity:.85;font-size:1.05rem;text-align:center}
  .rr-cols{display:flex;gap:3%;width:100%;flex:1;min-height:0;justify-content:center}
  .rr-col{flex:1;max-width:44%;border:3px solid var(--c);border-radius:16px;padding:1.2%;background:#0006;display:flex;flex-direction:column;gap:8px}
  .rr-col h3{margin:0;color:var(--c);letter-spacing:.1em;font-size:1.5rem;text-align:center}
  .rr-chip{display:flex;align-items:center;gap:10px;background:#fff2;border-radius:10px;padding:6px 12px;font-size:1.2rem}
  .rr-chip.ok{background:#2ecc7155}
  .rr-status{font-size:1.4rem;font-weight:700;min-height:2rem;text-align:center}`;
  document.head.append(style);

  const wrap = document.createElement("div"); wrap.className = "rr-wrap";
  const stage = document.createElement("div"); stage.className = "rr-stage";
  const canvas = document.createElement("canvas"); canvas.width = W; canvas.height = H;
  const ui = document.createElement("div"); ui.className = "rr-ui";
  stage.append(canvas, ui); wrap.append(stage); root.replaceChildren(wrap);
  const fit = () => {
    const r = root.getBoundingClientRect();
    const rw = r.width || window.innerWidth, rh = r.height || window.innerHeight;
    const w = Math.min(rw, rh * 16 / 9);
    stage.style.width = w + "px"; stage.style.height = w * 9 / 16 + "px";
    stage.style.fontSize = (w / 1280) * 16 + "px";
  };
  fit();
  const ro = new ResizeObserver(fit); ro.observe(root);
  const msgEl = document.createElement("div"); msgEl.className = "rr-msg"; msgEl.textContent = "Loading Rope Race…";
  ui.append(msgEl);

  let raf = 0, hudTimer = 0, renderer = null;
  const cleanup = () => {
    cancelAnimationFrame(raf); clearInterval(hudTimer); ro.disconnect(); style.remove();
    if (renderer) renderer.dispose();
  };

  // ---------- load three + models ----------
  let THREE, GLTFLoader;
  try {
    const [a, b] = await Promise.all([import(THREE_URL), import(GLTF_URL)]);
    THREE = a; GLTFLoader = b.GLTFLoader;
  } catch (e) {
    console.error(e);
    msgEl.textContent = "Could not load three.js (needs internet). Edit THREE_URL in main.js to host it locally.";
    return { destroy: cleanup };
  }
  if (signal.aborted) { cleanup(); return { destroy() {} }; }

  const assets = {};
  const missing = [];
  await Promise.all(Object.entries(M).map(async ([k, s]) => {
    for (const name of [s.f, s.alt].filter(Boolean)) {
      try { assets[k] = (await new GLTFLoader().loadAsync(ASSET_DIR + name + ASSET_EXT)).scene; break; }
      catch (e) { assets[k] = null; }
    }
    if (!assets[k]) missing.push(s.f);
  }));
  if (missing.length) console.warn("[rope-race] models not found, using placeholder shapes:", missing.join(", "));
  if (signal.aborted) { cleanup(); return { destroy() {} }; }
  msgEl.remove();

  renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(1); renderer.setSize(W, H, false);
  renderer.setClearColor(0x8fd3ff);
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x8fd3ff);
  scene.fog = new THREE.Fog(0x8fd3ff, 45, 120);
  scene.add(new THREE.HemisphereLight(0xffffff, 0x6a8a5a, 1.7));
  const sun = new THREE.DirectionalLight(0xffffff, 2.0); sun.position.set(12, 25, 10); scene.add(sun);

  // ---------- model factory ----------
  const matCache = new Map();
  const matOf = (c) => { if (!matCache.has(c)) matCache.set(c, new THREE.MeshLambertMaterial({ color: c })); return matCache.get(c); };
  const geoCache = new Map();
  const boxGeo = (x, y, z) => { const k = x + "," + y + "," + z; if (!geoCache.has(k)) geoCache.set(k, new THREE.BoxGeometry(x, y, z)); return geoCache.get(k); };

  function makeModel(key, mul = [1, 1, 1]) {
    const spec = M[key], g = new THREE.Group(), spin = new THREE.Group();
    g.add(spin); g.userData.spin = spin;
    const src = assets[key];
    if (src) {
      const clone = src.clone(true), rot = new THREE.Group(); rot.add(clone);
      if (spec.centre) {                       // align the saw's thin axis with Z
        const b0 = new THREE.Box3().setFromObject(clone), sz = b0.getSize(new THREE.Vector3());
        const thin = sz.x <= sz.y && sz.x <= sz.z ? 0 : sz.y <= sz.z ? 1 : 2;
        if (thin === 0) rot.rotation.y = Math.PI / 2; else if (thin === 1) rot.rotation.x = Math.PI / 2;
      }
      rot.updateMatrixWorld(true);
      const box = new THREE.Box3().setFromObject(rot), size = box.getSize(new THREE.Vector3()), ctr = box.getCenter(new THREE.Vector3());
      const off = new THREE.Group(); off.add(rot);
      off.position.set(-ctr.x, spec.centre ? -ctr.y : -box.min.y, -ctr.z);
      spin.add(off);
      g.scale.set(spec.s[0] / size.x * mul[0], spec.s[1] / size.y * mul[1], spec.s[2] / size.z * mul[2]);
    } else {
      let mesh;
      if (spec.centre) { mesh = new THREE.Mesh(new THREE.CylinderGeometry(spec.s[0] / 2, spec.s[0] / 2, spec.s[2], 16).rotateX(Math.PI / 2), matOf(spec.c)); }
      else if (spec.cone) {
        mesh = new THREE.Group();
        const trunk = new THREE.Mesh(boxGeo(0.3, 0.8, 0.3), matOf("#7a5230")); trunk.position.y = 0.4;
        const top = new THREE.Mesh(new THREE.ConeGeometry(0.8, 2.1, 8), matOf(spec.c)); top.position.y = 1.85;
        mesh.add(trunk, top);
      } else { mesh = new THREE.Mesh(boxGeo(spec.s[0], spec.s[1], spec.s[2]), matOf(spec.c)); mesh.position.y = spec.s[1] / 2; }
      spin.add(mesh); g.scale.set(mul[0], mul[1], mul[2]);
    }
    return g;
  }

  // ---------- player visual (cube placeholder) ----------
  const tagTex = [];
  function makePlayerVisual(p, T) {
    const inf = info(p.slot);
    const g = new THREE.Group();
    const body = new THREE.Mesh(boxGeo(PH, PH, PH), matOf(inf.color)); body.position.y = PH / 2; g.add(body);
    for (const sx of [-0.18, 0.18]) {
      const e = new THREE.Mesh(boxGeo(0.18, 0.2, 0.05), matOf("#ffffff")); e.position.set(sx, 0.55, -0.41);
      const pu = new THREE.Mesh(boxGeo(0.08, 0.1, 0.05), matOf("#111111")); pu.position.set(sx, 0.55, -0.44);
      g.add(e, pu);
    }
    const hat = new THREE.Mesh(boxGeo(0.56, 0.1, 0.56), matOf(T.color)); hat.position.y = PH + 0.05; g.add(hat);
    const cv = document.createElement("canvas"); cv.width = 256; cv.height = 64;
    const c2 = cv.getContext("2d"); c2.font = "bold 34px sans-serif"; c2.textAlign = "center";
    c2.lineWidth = 6; c2.strokeStyle = "#000"; c2.strokeText(inf.name, 128, 44); c2.fillStyle = "#fff"; c2.fillText(inf.name, 128, 44);
    const tex = new THREE.CanvasTexture(cv); tagTex.push(tex);
    const tag = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false, transparent: true }));
    tag.scale.set(1.8, 0.45, 1); tag.position.y = PH + 0.7; g.add(tag);
    p.body = g;
    return g;
  }

  // ---------- state ----------
  const pl = new Map();
  let phase = "lobby", lobbyT = -1, lobbyMsg = "", lobbyDirty = true, resultT = 0;
  let layout = null, world = null, lanes = [], teams = [], gt = 0, acc = 0;
  const mkPlayer = (slot) => ({ slot, team: null, ready: false, ix: 0, iy: 0, sprint: false, jumpBuf: 0, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0,
    pull: 0, hx: 0, hy: 0, hz: 0, pz0: 0, hearts: MAX_HEARTS, grounded: false, ground: null, coyote: 0, inv: 0, stun: 0, hang: false, hangT: 0, drag: false, hauling: false, face: 0, body: null });
  const addPlayer = (slot) => { if (pl.has(slot)) return pl.get(slot); const p = mkPlayer(slot); pl.set(slot, p); return p; };

  const vibe = (slot, ms) => ctx.send(slot, { type: "vibrate", ms });
  const hudPhone = (p) => ctx.send(p.slot, { type: "hud", hp: p.hearts / MAX_HEARTS * 100, text: "♥".repeat(Math.max(0, p.hearts)) + "♡".repeat(Math.max(0, MAX_HEARTS - p.hearts)), down: p.hearts <= 0 });
  const membersOf = (T) => T.members.map((s) => pl.get(s)).filter(Boolean);
  const lanePlayers = (L) => (L.team ? membersOf(L.team) : []);

  // ---------- team assignment ----------
  let wasSolo = true;
  function assignTeams() {
    const ps = [...pl.values()].sort((a, b) => a.slot - b.slot);
    if (ps.length < 4) { ps.forEach((p) => (p.team = 0)); wasSolo = true; return; }
    if (wasSolo) { ps.forEach((p, i) => (p.team = i % 2)); wasSolo = false; }
    const c = [0, 0]; ps.forEach((p) => { if (p.team != null) c[p.team]++; });
    ps.forEach((p) => { if (p.team == null) { p.team = c[0] <= c[1] ? 0 : 1; c[p.team]++; } });
  }

  // ---------- colliders ----------
  function newCol(cx, top, cz, hx, h, hz) {
    const c = { cx, top, cz, hx, h, hz, dx: 0, dy: 0, dz: 0, off: false };
    setBox(c, cx, top, cz, true); return c;
  }
  function setBox(c, cx, top, cz, init) {
    c.dx = init ? 0 : cx - c.cx; c.dy = init ? 0 : top - c.top; c.dz = init ? 0 : cz - c.cz;
    c.cx = cx; c.top = top; c.cz = cz;
    c.x0 = cx - c.hx; c.x1 = cx + c.hx; c.z0 = cz - c.hz; c.z1 = cz + c.hz; c.y1 = top; c.y0 = top - c.h;
  }
  const setHaz = (h, x, z) => { h.x0 = x - h.hx; h.x1 = x + h.hx; h.z0 = z - h.hz; h.z1 = z + h.hz; };

  // ---------- build a lane from the layout ----------
  function buildLane(idx, ox) {
    const L = { idx, ox, group: new THREE.Group(), cols: [], dyn: [], haz: [], bridges: new Map(), cps: [], team: null };
    L.group.position.x = ox; world.add(L.group);
    const getBridge = (id) => { if (!L.bridges.has(id)) L.bridges.set(id, { on: false, tOn: -99, tOff: -99, tiles: [] }); return L.bridges.get(id); };
    const standing = (c) => lanePlayers(L).some((p) => p.ground === c);
    const len = layout.rows * T + 30;
    for (const s of [-1, 1]) {
      const m = new THREE.Mesh(boxGeo(14, 0.4, len), matOf("#7ccf6a"));
      m.position.set(s * (LANE_HALF + 0.3 + 7), -1.2, -(layout.rows * T) / 2 + 8); L.group.add(m);
    }
    for (const it of layout.items) {
      switch (it.k) {
        case "solid": {
          const mul = it.mul || [1, 1, 1], s = M[it.m].s;
          const mesh = makeModel(it.m, mul); mesh.position.set(it.x, it.top - s[1], it.z); L.group.add(mesh);
          const c = newCol(it.x, it.top, it.z, s[0] * mul[0] / 2, s[1], s[2] / 2); if (it.finish) c.finish = true; L.cols.push(c);
          break;
        }
        case "crumble": {
          const mesh = makeModel("low"); mesh.position.set(it.x, -0.5, it.z); L.group.add(mesh);
          const c = newCol(it.x, 0, it.z, T / 2 - 0.02, 0.5, T / 2 - 0.02); L.cols.push(c);
          const st = { s: 0, t: 0, v: 0 };
          L.dyn.push((t, dt) => {
            if (st.s === 0) { if (standing(c)) { st.s = 1; st.t = 0; } }
            else if (st.s === 1) { st.t += dt; mesh.position.x = it.x + (Math.random() - 0.5) * 0.08; mesh.position.z = it.z + (Math.random() - 0.5) * 0.08; if (st.t > 0.7) { st.s = 2; st.t = 0; st.v = 0; c.off = true; } }
            else { st.t += dt; st.v += 20 * dt; mesh.position.y -= st.v * dt; mesh.visible = mesh.position.y > -12; if (st.t > 3.5) { st.s = 0; mesh.visible = true; mesh.position.set(it.x, -0.5, it.z); c.off = false; } }
          });
          break;
        }
        case "spikes": {
          const mesh = makeModel("spikes"); mesh.position.set(it.x, 0, it.z); L.group.add(mesh);
          const h = { hx: 0.8, hz: 0.8, y0: 0, y1: 0.5, top: true };   // top: only hurts when you stand/land on it setHaz(h, it.x, it.z); L.haz.push(h);
          break;
        }
        case "mover": {
          const mesh = makeModel("mover"); L.group.add(mesh);
          const c = newCol(it.x, it.top, it.z, 1.5, 1, 1.5); L.cols.push(c);
          const upd = (t, init) => {
            const s = Math.sin(it.sp * t + it.ph);
            const x = it.x + it.ax * s, z = it.z + it.az * s;
            const top = it.top + (it.rise ? it.rise * (0.5 + 0.5 * clamp(1.5 * s, -1, 1)) : 0);
            setBox(c, x, top, z, init); mesh.position.set(x, top - 1, z);
          };
          upd(0, true); L.dyn.push((t) => upd(t, false));
          break;
        }
        case "sblock": case "sweeper": case "saw": {
          const mesh = makeModel(it.k); L.group.add(mesh);
          const dims = { sblock: { hx: 0.42, hz: 0.42, y0: 0.05, y1: 0.9, by: 0.05 }, sweeper: { hx: 1.18, hz: 0.42, y0: 0.05, y1: 0.9, by: 0.05 }, saw: { hx: 0.5, hz: 0.3, y0: 0.05, y1: 1.15, by: 0.6 } }[it.k];
          const h = { hx: dims.hx, hz: dims.hz, y0: dims.y0, y1: dims.y1 }; L.haz.push(h);
          L.dyn.push((t, dt) => {
            const s = Math.sin(it.sp * t + it.ph), x = it.x + it.ax * s, z = it.z + it.az * s;
            mesh.position.set(x, dims.by, z); setHaz(h, x, z);
            if (it.k === "saw") mesh.userData.spin.rotation.z -= dt * 9;
          });
          break;
        }
        case "rail": {
          const m = new THREE.Mesh(boxGeo(it.len, 0.08, 0.14), matOf("#3a3f4b")); m.position.set(it.x, 0.04, it.z); L.group.add(m);
          break;
        }
        case "lever": {
          const mesh = makeModel("lever"); mesh.position.set(it.x, 0, it.z); L.group.add(mesh);
          const br = getBridge(it.id);
          L.dyn.push((t) => {
            const touch = lanePlayers(L).some((p) => Math.abs(p.x - it.x) < 1.0 && Math.abs(p.z - it.z) < 1.1 && p.y < 1.2);
            if (touch) { if (!br.on) { br.on = true; br.tOn = t; } else if (t - br.tOn > BRIDGE_TIME - 5) br.tOn = t; }
            if (br.on && t - br.tOn > BRIDGE_TIME) { br.on = false; br.tOff = t; }
            mesh.rotation.z = br.on ? -0.6 : 0.6;
            const left = BRIDGE_TIME - (t - br.tOn);
            for (const tl of br.tiles) {
              const p = br.on ? clamp((t - br.tOn - tl.i * 0.18) / 0.35, 0, 1) : clamp(1 - (t - br.tOff - (tl.n - 1 - tl.i) * 0.15) / 0.35, 0, 1);
              tl.c.off = p < 1;
              tl.mesh.visible = p > 0.02 && !(br.on && left < 3 && Math.floor(t * 8) % 2 === 0);
              tl.mesh.position.y = -0.5 - (1 - p) * 3;
            }
          });
          break;
        }
        case "btile": {
          const mesh = makeModel("low"); mesh.position.set(it.x, -3.5, it.z); mesh.visible = false; L.group.add(mesh);
          const c = newCol(it.x, 0, it.z, T / 2 - 0.02, 0.5, T / 2 - 0.02); c.off = true; L.cols.push(c);
          getBridge(it.id).tiles.push({ i: it.i, n: it.n, c, mesh });
          break;
        }
        case "deco": {
          const mesh = makeModel(it.m, [it.mul, it.mul, it.mul]); mesh.position.set(it.x, it.y, it.z); mesh.rotation.y = it.rot; L.group.add(mesh);
          break;
        }
      }
    }
    // checkpoint pads
    layout.cps.forEach((cp, i) => {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(COLS * T, 1).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: i === 0 ? 0x3ddc84 : 0xffd23f, transparent: true, opacity: 0.55 }));
      m.position.set(0, 0.03, cp.z); L.group.add(m); L.cps[i] = m;
    });
    const fin = new THREE.Mesh(new THREE.PlaneGeometry(COLS * T, 1).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.7 }));
    fin.position.set(0, 2.04, layout.finishZ - T); L.group.add(fin);
    return L;
  }

  function buildWorld(n) {
    if (world) scene.remove(world);
    world = new THREE.Group(); scene.add(world);
    const v = new THREE.Mesh(new THREE.PlaneGeometry(600, 600).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0x1d2b46 }));
    v.position.y = -22; world.add(v);
    lanes = [];
    for (let i = 0; i < n; i++) lanes.push(buildLane(i, (i - (n - 1) / 2) * LANE_GAP));
  }

  // ---------- rope visuals ----------
  const ROPE_SEG = 14, ROPE_R = 0.06;
  // rope material: uses the colour palette texture (colormap.png); tan fallback until/if it loads
  const ropeMat = new THREE.MeshLambertMaterial({ color: 0xd9b26f });
  new THREE.TextureLoader().load(ASSET_DIR + ROPE_TEX, (tex) => {
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.magFilter = THREE.NearestFilter; tex.minFilter = THREE.NearestFilter; tex.generateMipmaps = false;
    tex.repeat.set(0.01, 0.01); tex.offset.set(ROPE_UV[0], ROPE_UV[1]);   // sample one palette colour
    ropeMat.map = tex; ropeMat.color.set(0xffffff); ropeMat.needsUpdate = true;
    tagTex.push(tex);
  }, undefined, () => console.warn("[rope-race] rope texture not found:", ASSET_DIR + ROPE_TEX));

  function rebuildRopes(T) {
    T.ropes.forEach((r) => r.forEach((m) => m.parent && m.parent.remove(m)));
    T.ropes = [];
    const ms = membersOf(T);
    for (let i = 0; i < ms.length - 1; i++) {
      const segs = [];
      for (let k = 0; k < ROPE_SEG; k++) { const m = new THREE.Mesh(boxGeo(ROPE_R * 2, ROPE_R * 2, 1), ropeMat); T.lane.group.add(m); segs.push(m); }
      T.ropes.push(segs);
    }
  }
  // rope collision: a rope point that ends up inside a block is lifted onto its top (rope drapes over / lies on blocks)
  function ropeCollide(L, pt) {
    for (let pass = 0; pass < 2; pass++) {
      let moved = false;
      for (const c of L.cols) {
        if (c.off) continue;
        if (pt.x < c.x0 - ROPE_R || pt.x > c.x1 + ROPE_R || pt.z < c.z0 - ROPE_R || pt.z > c.z1 + ROPE_R) continue;
        if (pt.y - ROPE_R < c.y1 && pt.y + ROPE_R > c.y0 + 0.05) { pt.y = c.y1 + ROPE_R + 0.01; moved = true; }
      }
      if (!moved) break;
    }
  }
  const _a = new THREE.Vector3(), _b = new THREE.Vector3();
  const ropePts = Array.from({ length: ROPE_SEG + 1 }, () => new THREE.Vector3());
  // rope polyline from player a to player b, with sag, draped over any obstacle in the way (end points stay on the players)
  function ropePath(L, a, b, sag) {
    for (let k = 0; k <= ROPE_SEG; k++) {
      const s = k / ROPE_SEG, pt = ropePts[k];
      pt.set(a.x + (b.x - a.x) * s, a.y + 0.4 + (b.y - a.y) * s - sag * 4 * s * (1 - s), a.z + (b.z - a.z) * s);
      if (k > 0 && k < ROPE_SEG) ropeCollide(L, pt);
    }
    return ropePts;
  }
  function drawRopes(T) {
    const ms = membersOf(T), L = T.lane;
    for (let i = 0; i < T.ropes.length && i < ms.length - 1; i++) {
      const a = ms[i], b = ms[i + 1], segs = T.ropes[i];
      const dist = Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z), sag = Math.max(0, ROPE - dist) / ROPE * 1.8;
      const pts = ropePath(L, a, b, sag);
      for (let k = 0; k < ROPE_SEG; k++) {
        const m = segs[k]; _a.copy(pts[k]); _b.copy(pts[k + 1]);
        m.position.copy(_a).add(_b).multiplyScalar(0.5); m.lookAt(_b.x, _b.y, _b.z); m.scale.z = _a.distanceTo(_b) + 0.02;
      }
    }
  }

  // ---------- physics ----------
  const EPS = 0.001;
  function moveAxis(p, L, axis, d) {
    if (!d) return;
    p[axis] += d;
    for (const c of L.cols) {
      if (c.off) continue;
      if (p.x + HALF <= c.x0 + EPS || p.x - HALF >= c.x1 - EPS || p.z + HALF <= c.z0 + EPS || p.z - HALF >= c.z1 - EPS || p.y + PH <= c.y0 + EPS || p.y >= c.y1 - EPS) continue;
      const rise = c.y1 - p.y;
      if (rise <= STEP_UP && p.vy <= 0.5) { p.y = c.y1; continue; }
      if (axis === "x") p.x = d > 0 ? c.x0 - HALF : c.x1 + HALF;
      else p.z = d > 0 ? c.z0 - HALF : c.z1 + HALF;
    }
  }
  function pushOut(p, L) {
    for (const c of L.cols) {
      if (c.off) continue;
      if (p.x + HALF <= c.x0 || p.x - HALF >= c.x1 || p.z + HALF <= c.z0 || p.z - HALF >= c.z1 || p.y + PH <= c.y0 || p.y >= c.y1) continue;
      const opts = [[p.x + HALF - c.x0, "x", -1], [c.x1 - (p.x - HALF), "x", 1], [p.z + HALF - c.z0, "z", -1], [c.z1 - (p.z - HALF), "z", 1], [p.y + PH - c.y0, "y", -1], [c.y1 - p.y, "y", 1]];
      opts.sort((u, v) => u[0] - v[0]);
      const [pen, ax, dir] = opts[0]; p[ax] += pen * dir;
    }
  }
  function physStep(p, L, dt) {
    if (p.hauling) return;
    if (p.drag) {                                   // being dragged down by the team
      p.vy = Math.min(p.vy - 40 * dt, -2); p.y += p.vy * dt; p.x += p.vx * dt; p.z += p.vz * dt; p.vx *= 0.98; p.vz *= 0.98; return;
    }
    if (p.ground && !p.ground.off) { p.x += p.ground.dx; p.y += p.ground.dy; p.z += p.ground.dz; }
    let mx = clamp1(p.ix), mz = clamp1(p.iy);
    if (!STICK_UP_IS_NEGATIVE) mz = -mz;
    const mag = Math.hypot(mx, mz);
    if (mag < 0.12) { mx = 0; mz = 0; } else if (mag > 1) { mx /= mag; mz /= mag; }
    const sp = p.sprint ? SPRINT : WALK;
    if (p.stun <= 0) {
      const k = Math.min(1, (p.grounded ? 14 : AIR_CONTROL) * dt);
      p.vx += (mx * sp - p.vx) * k; p.vz += (mz * sp - p.vz) * k;
      if (p.jumpBuf > 0 && (p.grounded || p.coyote > 0)) { p.vy = JUMP; p.jumpBuf = 0; p.coyote = 0; p.grounded = false; }
    } else { p.vx *= 1 - Math.min(1, 3 * dt); p.vz *= 1 - Math.min(1, 3 * dt); }
    moveAxis(p, L, "x", p.vx * dt);
    moveAxis(p, L, "z", p.vz * dt);
    p.vy = Math.max(-40, p.vy - GRAV * dt); p.y += p.vy * dt;
    p.grounded = false; p.ground = null;
    for (const c of L.cols) {
      if (c.off) continue;
      if (!(p.x + HALF > c.x0 + EPS && p.x - HALF < c.x1 - EPS && p.z + HALF > c.z0 + EPS && p.z - HALF < c.z1 - EPS)) continue;
      if (p.y + PH <= c.y0 + EPS || p.y >= c.y1) continue;
      if (p.vy <= 0 && p.y >= c.y1 - 0.4 - Math.max(0, -c.dy)) { p.y = c.y1; p.vy = 0; p.grounded = true; p.ground = c; }
      else if (p.vy > 0 && p.y < c.y0) { p.y = c.y0 - PH; p.vy = 0; }
    }
    if (mag > 0.2) p.face = Math.atan2(-p.vx, -p.vz);
  }

  // player vs player: teammates are solid cubes (push apart sideways, or stand on top of each other)
  function playerCollide(ms) {
    for (let i = 0; i < ms.length; i++) {
      for (let j = i + 1; j < ms.length; j++) {
        const a = ms[i], b = ms[j];
        if (a.hauling || b.hauling || a.drag || b.drag) continue;
        const ox = HALF * 2 - Math.abs(a.x - b.x), oz = HALF * 2 - Math.abs(a.z - b.z);
        if (ox <= 0 || oz <= 0) continue;
        const oy = PH - Math.abs(a.y - b.y);
        if (oy <= 0) continue;
        const [hi, lo] = a.y >= b.y ? [a, b] : [b, a];
        if (hi.y - lo.y >= PH * 0.55 && hi.vy <= lo.vy + 0.5) {        // landed on top of the other
          hi.y = lo.y + PH; hi.vy = Math.max(hi.vy, lo.vy); hi.grounded = true; hi.ground = null;
          continue;
        }
        if (ox < oz) {
          const dir = a.x < b.x ? -1 : 1, h = ox / 2;
          a.x += dir * h; b.x -= dir * h;
          if (a.vx * dir < 0) a.vx *= 0.3; if (b.vx * -dir < 0) b.vx *= 0.3;
        } else {
          const dir = a.z < b.z ? -1 : 1, h = oz / 2;
          a.z += dir * h; b.z -= dir * h;
          if (a.vz * dir < 0) a.vz *= 0.3; if (b.vz * -dir < 0) b.vz *= 0.3;
        }
      }
    }
  }

  function ropePhysics(T) {
    const ms = membersOf(T).filter((p) => !p.hauling);
    // rope collision: extra rope length used up by going over / around obstacles between two players
    const extra = [];
    for (let i = 0; i < ms.length - 1; i++) {
      const pts = ropePath(T.lane, ms[i], ms[i + 1], 0); let len = 0;
      for (let k = 0; k < ROPE_SEG; k++) len += pts[k].distanceTo(pts[k + 1]);
      extra[i] = Math.max(0, len - pts[0].distanceTo(pts[ROPE_SEG]));
    }
    for (let it = 0; it < 3; it++) {
      for (let i = 0; i < ms.length - 1; i++) {
        const a = ms[i], b = ms[i + 1];
        let dx = b.x - a.x, dy = b.y - a.y, dz = b.z - a.z; const dist = Math.hypot(dx, dy, dz);
        if (dist < 1.0 || dist + extra[i] <= ROPE) continue;
        dx /= dist; dy /= dist; dz /= dist; const ex = Math.min(dist + extra[i] - ROPE, dist - 0.9);
        const wa = a.grounded && !a.drag ? 0.3 : 1, wb = b.grounded && !b.drag ? 0.3 : 1, s = wa + wb, ma = wa / s, mb = wb / s;
        a.x += dx * ex * ma; a.y += dy * ex * ma; a.z += dz * ex * ma;
        b.x -= dx * ex * mb; b.y -= dy * ex * mb; b.z -= dz * ex * mb;
        const va = a.vx * dx + a.vy * dy + a.vz * dz; if (va < 0) { a.vx -= va * dx; a.vy -= va * dy; a.vz -= va * dz; }
        const vb = b.vx * dx + b.vy * dy + b.vz * dz; if (vb > 0) { b.vx -= vb * dx; b.vy -= vb * dy; b.vz -= vb * dz; }
      }
      if (T.state === "run") ms.forEach((p) => pushOut(p, T.lane));
    }
  }

  // ---------- team logic ----------
  function say(T, text, ms = 1800) { T.bannerEl.textContent = text; T.bannerEl.classList.add("on"); T.msgT = ms / 1000; }

  function respawn(T, full) {
    if (full) membersOf(T).forEach((p) => (p.hearts = MAX_HEARTS));   // always respawn at the last checkpoint (T.cp is kept)
    const cp = layout.cps[T.cp], ms = membersOf(T);
    ms.forEach((p, i) => {
      p.x = (i - (ms.length - 1) / 2) * 1.0; p.z = cp.spawnZ - (i % 2) * 0.1; p.y = 0.05;
      p.vx = p.vy = p.vz = 0; p.grounded = false; p.ground = null; p.drag = false; p.hang = false; p.hangT = 0; p.hauling = false;
      p.inv = 2; p.stun = 0; p.ix = p.ix; hudPhone(p);
    });
    T.state = "run"; T.dragT = 0;
    lanes.forEach((L) => L.cps.forEach((m, i) => { if (L === T.lane) m.material.color.set(i <= T.cp ? 0x3ddc84 : 0xffd23f); }));
  }
  function hurt(T, p, hz) {
    if (p.inv > 0 || T.state !== "run") return;
    p.hearts--; p.inv = INV_TIME; p.stun = 0.3;
    const cx = (hz.x0 + hz.x1) / 2, cz = (hz.z0 + hz.z1) / 2;
    const dx = p.x - cx, dz = p.z - cz, d = Math.hypot(dx, dz) || 1;
    p.vx = dx / d * 7; p.vz = dz / d * 7; p.vy = 7; p.grounded = false; p.ground = null;
    vibe(p.slot, [90, 40, 90]); hudPhone(p);
    if (p.hearts <= 0) {
      say(T, `${info(p.slot).name} ran out of hearts – back to the last checkpoint!`, 2600);
      membersOf(T).forEach((q) => vibe(q.slot, [200, 80, 200]));
      respawn(T, true);
    }
  }
  function startDrag(T, msg = "Half the team fell – back to the last checkpoint!") {
    T.state = "drag"; T.dragT = 0; say(T, msg, 2400);
    membersOf(T).forEach((p) => { p.drag = true; p.hauling = false; vibe(p.slot, [150, 50, 150]); });
  }
  function finishDrag(T) {
    const ms = membersOf(T); let dead = false;
    ms.forEach((p) => { p.hearts--; if (p.hearts <= 0) dead = true; });
    if (dead) { say(T, "Out of hearts – back to the last checkpoint!", 2600); respawn(T, true); }
    else { say(T, "Back to the checkpoint (-1 ♥ each)", 2200); respawn(T, false); }
    ms.forEach(hudPhone);
  }

  function teamStep(T, dt) {
    const ms = membersOf(T); if (!ms.length) return;
    const L = T.lane;
    for (const p of ms) {
      p.inv -= dt; p.stun -= dt; p.jumpBuf -= dt;
      p.coyote = p.grounded ? 0.1 : p.coyote - dt;
    }
    for (const p of ms) { p.pz0 = p.z; physStep(p, L, dt); }
    playerCollide(ms);
    ropePhysics(T);

    if (T.state === "drag") {
      T.dragT += dt;
      if (T.dragT > 1.9 || ms.every((p) => p.y < -16)) finishDrag(T);
      return;
    }
    // fallen / dangling players
    ms.forEach((p) => { if (!p.hauling) p.hang = p.y < FALL_Y; p.hangT = p.hang ? p.hangT + dt : 0; });
    const fallen = ms.filter((p) => p.hang).length;
    // half (or more) of the team has fallen -> everyone back to the last checkpoint
    if (fallen > 0 && fallen * 2 >= ms.length) { startDrag(T); return; }
    // fewer than half fallen -> the others have HANG_LIMIT seconds to pull them up by walking forward
    const rescuers = ms.filter((p) => !p.hang && !p.hauling && p.grounded);
    for (const p of ms) {
      if (!p.hang) continue;
      if (p.hangT > HANG_LIMIT) { startDrag(T, `${info(p.slot).name} wasn't pulled up in time – back to the last checkpoint!`); return; }
      if (!rescuers.length) { p.hauling = false; continue; }              // nobody can pull right now: keep dangling
      if (!p.hauling) { p.hauling = true; p.pull = 0; p.hx = p.x; p.hy = p.y; p.hz = p.z; p.vx = p.vy = p.vz = 0; }
      let fwd = 0, best = rescuers[0], bd = 1e9;
      for (const q of rescuers) {
        fwd = Math.max(fwd, q.pz0 - q.z);                                   // forward = towards -Z
        const d = Math.hypot(q.x - p.x, q.y - p.y, q.z - p.z); if (d < bd) { bd = d; best = q; }
      }
      p.pull = Math.min(1, p.pull + Math.max(0, fwd) / PULL_LEN);
      const e = p.pull;
      p.x = p.hx + (best.x - p.hx) * e; p.y = p.hy + (best.y + 0.1 - p.hy) * e; p.z = p.hz + (best.z - p.hz) * e;
      p.vx = p.vy = p.vz = 0;
      if (e >= 1) { p.hauling = false; p.hang = false; p.hangT = 0; p.pull = 0; p.inv = 1.2; vibe(p.slot, 80); }
    }
    // hazards
    for (const p of ms) {
      if (p.inv > 0 || p.hauling) continue;
      for (const h of L.haz) {
        const m = h.top ? 0 : HALF * 0.9;   // spike tiles: player's centre must be over the tile (on top), brushing the side does nothing
        if (p.x + m > h.x0 && p.x - m < h.x1 && p.z + m > h.z0 && p.z - m < h.z1 && p.y + PH > h.y0 && p.y < h.y1) { hurt(T, p, h); break; }
      }
      if (T.state !== "run") return;
    }
    // checkpoints
    const nxt = layout.cps[T.cp + 1];
    if (nxt && ms.some((p) => p.grounded && p.z < nxt.z)) { T.cp++; L.cps[T.cp].material.color.set(0x3ddc84); say(T, "Checkpoint!", 1200); ms.forEach((p) => vibe(p.slot, 60)); }
    // finish
    if (!T.finished && ms.every((p) => p.ground && p.ground.finish)) { T.finished = true; T.time = gt; endRound(T); }
  }

  function endRound(w) {
    if (phase !== "run") return;
    phase = "result"; resultT = 9;
    const tm = w.time.toFixed(1) + "s";
    teams.forEach((T) => {
      if (teams.length === 1) say(T, `FINISHED! ${tm}`, 9000);
      else say(T, T === w ? `${T.name} TEAM WINS! ${tm}` : `${w.name} team won`, 9000);
      membersOf(T).forEach((p) => vibe(p.slot, T === w ? [100, 60, 100, 60, 300] : 120));
    });
  }

  // ---------- round flow ----------
  function beginRound() {
    assignTeams();
    layout = generate((Math.random() * 4294967295) >>> 0);
    const groups = [0, 1].map((i) => [...pl.values()].filter((p) => p.team === i).sort((a, b) => a.slot - b.slot).map((p) => p.slot).map((s) => ({ s, i }))).filter((g) => g.length);
    ui.replaceChildren();
    buildWorld(groups.length);
    teams = groups.map((g, gi) => {
      const solo = groups.length === 1;
      const st = solo ? { name: "TEAM", color: "#ffd23f" } : TEAM_STYLE[g[0].i];
      const T = { id: gi, name: st.name, color: st.color, members: g.map((x) => x.s), cp: 0, state: "run", dragT: 0, finished: false, time: 0, lane: lanes[gi], ropes: [], msgT: 0,
        cam: new THREE.PerspectiveCamera(55, (W / groups.length) / H, 0.1, 220), camPos: new THREE.Vector3(), nGroups: groups.length };
      lanes[gi].team = T;
      T.members.forEach((s) => { const p = pl.get(s); p.hearts = MAX_HEARTS; p.sprint = false; p.jumpBuf = 0; lanes[gi].group.add(makePlayerVisual(p, T)); });
      T.hudEl = document.createElement("div"); T.hudEl.className = "rr-hud"; T.hudEl.style.left = (gi * 100 / groups.length) + "%";
      T.bannerEl = document.createElement("div"); T.bannerEl.className = "rr-banner"; T.bannerEl.style.left = (gi * 100 / groups.length) + "%"; T.bannerEl.style.width = (100 / groups.length) + "%";
      ui.append(T.hudEl, T.bannerEl);
      rebuildRopes(T); respawn(T, true);
      const ms = membersOf(T); T.camPos.set(lanes[gi].ox, 9, ms[0].z + 11);
      return T;
    });
    if (teams.length > 1) { const d = document.createElement("div"); d.className = "rr-div"; ui.append(d); }
    gt = 0; acc = 0; phase = "run";
    teams.forEach((T) => say(T, "GO!", 1200));
    updateHud();
  }

  function toLobby() {
    phase = "lobby"; lobbyT = -1; lobbyDirty = true;
    if (world) { scene.remove(world); world = null; }
    teams = []; lanes = [];
    ui.replaceChildren(lobbyEl);
    pl.forEach((p) => { p.ready = false; p.body = null; p.hearts = MAX_HEARTS; p.drag = false; p.hang = false; p.hauling = false; p.ground = null; p.ix = p.iy = 0; p.sprint = false; });
    assignTeams(); sendLobbyHud();
  }

  // ---------- lobby ----------
  const lobbyEl = document.createElement("div"); lobbyEl.className = "rr-lobby";
  ui.append(lobbyEl);
  function lobbyStatus() {
    const ps = [...pl.values()], counts = [0, 0]; ps.forEach((p) => counts[p.team ?? 0]++);
    const two = ps.length >= 4;
    if (!ps.length) return "Waiting for players…";
    if (two) {
      const bad = counts.some((c) => c === 1);
      if (bad) return "Each team needs at least 2 players";
    }
    const notReady = ps.filter((p) => !p.ready);
    if (notReady.length) return "Press A to get ready – waiting for " + notReady.map((p) => info(p.slot).name).join(", ");
    return "";
  }
  function renderLobby() {
    const ps = [...pl.values()].sort((a, b) => a.slot - b.slot), two = ps.length >= 4;
    const chip = (p) => `<div class="rr-chip ${p.ready ? "ok" : ""}"><span class="rr-dot" style="background:${info(p.slot).color}"></span>${esc(info(p.slot).name)} ${p.ready ? "✔" : ""}</div>`;
    const col = (i, title, color) => `<div class="rr-col" style="--c:${color}"><h3>${title}</h3>${ps.filter((p) => p.team === i).map(chip).join("") || "<i style='opacity:.5'>empty</i>"}</div>`;
    lobbyEl.innerHTML = `<h1>🪢 ROPE RACE</h1>
      <p>${two ? "Push the stick <b>◀ left</b> for RED or <b>right ▶</b> for BLUE, then press <b>A</b> to ready up." : "Fewer than 4 players: everyone is roped together – co-op! Press <b>A</b> to ready up."}<br>
      <b>A</b> = jump &nbsp; <b>B</b> = sprint &nbsp; Each player has 3 ♥. If one runs out, the team goes back to the last checkpoint. If half the team falls, everyone goes back to the checkpoint; if fewer fall, walk forward within 20s to pull them up!</p>
      <div class="rr-cols">${two ? col(0, "RED TEAM", TEAM_STYLE[0].color) + col(1, "BLUE TEAM", TEAM_STYLE[1].color) : col(0, "TEAM", "#ffd23f")}</div>
      <div class="rr-status">${lobbyT >= 0 ? "Starting in " + Math.ceil(lobbyT) + "…" : esc(lobbyMsg)}</div>`;
  }
  function sendLobbyHud() {
    const two = pl.size >= 4;
    pl.forEach((p) => ctx.send(p.slot, { type: "hud", text: two ? `${p.team === 1 ? "BLUE ▶" : "◀ RED"} · A = ready` : "A = ready", down: false }));
  }
  function lobbyTick(dt) {
    assignTeams();
    const msg = lobbyStatus(); if (msg !== lobbyMsg) { lobbyMsg = msg; lobbyDirty = true; }
    if (!msg && pl.size) {
      if (lobbyT < 0) { lobbyT = 3; lobbyDirty = true; }
      const before = Math.ceil(lobbyT); lobbyT -= dt; if (Math.ceil(lobbyT) !== before) lobbyDirty = true;
      if (lobbyT <= 0) { beginRound(); return; }
    } else if (lobbyT >= 0) { lobbyT = -1; lobbyDirty = true; }
    if (lobbyDirty) { lobbyDirty = false; renderLobby(); }
  }

  // ---------- HUD ----------
  function updateHud() {
    teams.forEach((T) => {
      const ms = membersOf(T), lead = ms.length ? Math.min(...ms.map((p) => p.z)) : 0;
      const prog = clamp(-lead / -layout.finishZ, 0, 1) * 100;
      T.hudEl.innerHTML = `<div class="rr-tn" style="color:${T.color}">${T.name} TEAM</div><div class="rr-bar"><i style="width:${prog.toFixed(0)}%;background:${T.color}"></i></div>` +
        ms.map((p) => `<div class="rr-pl"><span class="rr-dot" style="background:${esc(info(p.slot).color)}"></span>${esc(info(p.slot).name)} <span style="color:#ff5a6e">${"♥".repeat(Math.max(0, p.hearts))}</span><span style="opacity:.4">${"♥".repeat(MAX_HEARTS - Math.max(0, p.hearts))}</span></div>`).join("") +
        ms.filter((p) => p.hang).map((p) => `<div style="color:#ffd23f">🪢 Pull ${esc(info(p.slot).name)} up – move forward! ${Math.max(0, HANG_LIMIT - p.hangT).toFixed(0)}s</div>`).join("") +
        (phase === "run" ? `<div>⏱ ${gt.toFixed(1)}s</div>` : "");
    });
  }
  hudTimer = setInterval(() => { if (phase === "run" || phase === "result") updateHud(); }, 150);

  // ---------- input ----------
  function onMove(slot, x, y) {
    const p = pl.get(slot); if (!p) return;
    p.ix = clamp1(x); p.iy = clamp1(y);
    if (phase === "lobby" && pl.size >= 4) {
      const nt = p.ix < -0.5 ? 0 : p.ix > 0.5 ? 1 : p.team;
      if (nt !== p.team) { p.team = nt; p.ready = false; lobbyDirty = true; sendLobbyHud(); }
    }
  }
  function onButton(slot, id, pressed) {
    const p = pl.get(slot); if (!p) return;
    if (id === "A") {
      if (phase === "lobby") { if (pressed) { p.ready = !p.ready; lobbyDirty = true; vibe(slot, 30); } }
      else if (pressed) p.jumpBuf = 0.14;
    } else if (id === "B") p.sprint = !!pressed;
  }
  on(window, "controller-input", (e) => {
    const { slot, data } = e.detail || {}; if (!data) return;
    if (data.type === "move") onMove(slot, data.x, data.y);
    else if (data.type === "button") onButton(slot, data.id, !!data.pressed);
  });

  // optional keyboard test player: add ?kb=1 to the URL
  if (/[?&]kb=1/.test(location.search)) {
    addPlayer("kb"); const keys = new Set();
    const upd = () => onMove("kb", (keys.has("ArrowRight") || keys.has("KeyD") ? 1 : 0) - (keys.has("ArrowLeft") || keys.has("KeyA") ? 1 : 0), (keys.has("ArrowDown") || keys.has("KeyS") ? 1 : 0) - (keys.has("ArrowUp") || keys.has("KeyW") ? 1 : 0));
    on(window, "keydown", (e) => { if (e.repeat) return; keys.add(e.code); upd(); if (e.code === "Space" || e.code === "Enter") onButton("kb", "A", true); if (e.code.startsWith("Shift")) onButton("kb", "B", true); });
    on(window, "keyup", (e) => { keys.delete(e.code); upd(); if (e.code === "Space" || e.code === "Enter") onButton("kb", "A", false); if (e.code.startsWith("Shift")) onButton("kb", "B", false); });
  }

  // ---------- join / leave ----------
  ctx.players().forEach((q) => addPlayer(q.slot));
  assignTeams();
  on(window, "player-join", (e) => {
    const slot = e.detail.slot; const p = addPlayer(slot);
    if (phase === "lobby") { lobbyDirty = true; sendLobbyHud(); return; }
    if (!teams.length) return;
    const T = teams.slice().sort((a, b) => a.members.length - b.members.length)[0];
    if (T.members.includes(slot)) return;
    p.team = T.id; T.members.push(slot); T.members.sort((a, b) => a - b);
    T.lane.group.add(makePlayerVisual(p, T)); rebuildRopes(T);
    const cp = layout.cps[T.cp], ms = membersOf(T).filter((q) => q !== p), ref = ms[0];
    p.x = ref ? ref.x : 0; p.z = ref ? ref.z : cp.spawnZ; p.y = ref ? ref.y + 0.2 : 0.05; p.inv = 2; hudPhone(p);
  });
  on(window, "player-leave", (e) => {
    const slot = e.detail.slot, p = pl.get(slot); if (!p) return;
    if (p.body && p.body.parent) p.body.parent.remove(p.body);
    pl.delete(slot); lobbyDirty = true;
    if (phase === "lobby") return;
    for (const T of teams.slice()) {
      if (!T.members.includes(slot)) continue;
      T.members = T.members.filter((s) => s !== slot);
      if (T.members.length) rebuildRopes(T);
      else {
        T.ropes.forEach((r) => r.forEach((m) => m.parent && m.parent.remove(m)));
        T.hudEl.remove(); T.bannerEl.remove(); teams = teams.filter((x) => x !== T);
      }
    }
    if (!teams.length) toLobby();
  });

  // ---------- main loop ----------
  const STEP_DT = 1 / 60; let last = performance.now();
  const _t = new THREE.Vector3();
  function simStep(dt) {
    gt += dt;
    lanes.forEach((L) => L.dyn.forEach((f) => f(gt, dt)));
    teams.slice().forEach((T) => teamStep(T, dt));
  }
  function frame(now) {
    raf = requestAnimationFrame(frame);
    const dt = Math.min(0.05, (now - last) / 1000); last = now;
    if (phase === "lobby") { lobbyTick(dt); renderer.setScissorTest(false); renderer.clear(); return; }
    if (phase === "result") { resultT -= dt; if (resultT <= 0) { toLobby(); return; } }
    acc += dt; while (acc >= STEP_DT) { simStep(STEP_DT); acc -= STEP_DT; if (phase === "lobby") return; }

    // visuals
    for (const T of teams) {
      if (T.msgT > 0) { T.msgT -= dt; if (T.msgT <= 0 && phase === "run") T.bannerEl.classList.remove("on"); }
      const ms = membersOf(T); if (!ms.length) continue;
      for (const p of ms) {
        if (!p.body) continue;
        p.body.position.set(p.x, p.y, p.z);
        p.body.rotation.y += Math.atan2(Math.sin(p.face - p.body.rotation.y), Math.cos(p.face - p.body.rotation.y)) * Math.min(1, 14 * dt);
        p.body.visible = p.inv <= 0 || Math.floor(now / 60) % 2 === 0;
      }
      drawRopes(T);
      let cx = 0, cy = 0, cz = 0, mz = 1e9;
      ms.forEach((p) => { cx += p.x; cy += p.y; cz += p.z; mz = Math.min(mz, p.z); });
      cx /= ms.length; cy = Math.max(cy / ms.length, -1); cz = (cz / ms.length + mz) / 2;
      _t.set(T.lane.ox + cx * 0.6, cy + 9, cz + 11);
      T.camPos.lerp(_t, 1 - Math.exp(-5 * dt));
      T.cam.position.copy(T.camPos); T.cam.lookAt(T.lane.ox + cx * 0.6, cy, cz - 4);
    }
    renderer.setScissorTest(true);
    const n = teams.length;
    teams.forEach((T, i) => {
      const w = W / n, x = i * w;
      renderer.setViewport(x, 0, w, H); renderer.setScissor(x, 0, w, H);
      T.cam.aspect = w / H; T.cam.updateProjectionMatrix();
      renderer.render(scene, T.cam);
    });
  }
  renderLobby(); sendLobbyHud();
  raf = requestAnimationFrame(frame);

  return {
    destroy() {
      cleanup();
      tagTex.forEach((t) => t.dispose());
      pl.forEach((p) => ctx.send(p.slot, { type: "hud", text: "", down: false }));
    },
  };
}