// NEON VOID: a narrow bridge floating in an endless dark abyss.
//  - no ground, no guard rails: leave the road and you fall (see abyss.js)
//  - sudden hairpins / chicanes that get tighter further down the road
//  - road width fluctuates and squeezes down to two lanes or a single lane
//  - neon edge lines turn from cyan/magenta to hot orange as the road narrows (a warning for the team)
//
// Road space: the road is sampled every L metres. Offset d is measured sideways from the centreline
// along (-cos h, sin h), where h is the road heading at that sample (forward = (sin h, cos h)).
import * as THREE from "./three.js";

export const L = 4;                  // segment length (m)
export const N = 900;                // number of segments
export const HALF = 10;              // WIDEST half-width. The real width varies: use halfAt(s) / loc.half
export const START_S = 48;           // distance along the road where the cars start
export const LANES = [-7.5, -2.5, 2.5, 7.5];   // lane centres on the full-width road only; use lanesAt(s)
export const VOID_COLOR = 0x03000a;

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerp = (a, b, t) => a + (b - a) * t;
const smooth = (x) => { x = clamp(x, 0, 1); return x * x * (3 - 2 * x); };
const mix = (a, b, t) => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];

const CYAN = [0.1, 0.95, 1], MAGENTA = [1, 0.2, 0.85], ORANGE = [1, 0.35, 0.05];

// rng: a () => [0,1) function. Used for the curves, the chokepoints and the void dust.
export function createTrack(rng) {
  const disposables = [];
  const own = (o) => { disposables.push(o); return o; };
  const group = new THREE.Group();
  const MAXS = (N - 1) * L;

  /* ---------- 1. Curvature: straights broken up by sudden sharp corners ---------- */
  const curvRaw = new Float32Array(N);
  const straights = [];                       // [s0, s1] pieces of dead-straight road
  {
    let s = 140, h = 0, flip = rng() < 0.5 ? 1 : -1;
    const arc = (len, k) => {
      const a = Math.floor(s / L), b = Math.min(N, Math.ceil((s + len) / L));
      for (let i = a; i < b; i++) curvRaw[i] = k;
      s += len; h += k * len;
    };
    while (s < MAXS - 80) {
      const prog = s / MAXS;
      const sl = lerp(110, 38, prog) * (0.6 + rng() * 0.8);     // straights get shorter
      straights.push([s, s + sl]); s += sl;
      const R = lerp(34, 17, prog) * (0.8 + rng() * 0.5);        // corner radius shrinks over the run
      const kind = rng();
      const th = kind < 0.3 ? 0.6 + rng() * 0.5 : kind < 0.55 ? 2.1 + rng() * 0.8 : 1.2 + rng() * 0.8;
      let sign = rng() < 0.65 ? -flip : flip;                    // mostly alternate, sometimes repeat
      const net = kind < 0.3 ? 0 : th;                           // a chicane turns the road by nothing overall
      if (Math.abs(h + sign * net) > 1.9) sign = -Math.sign(h) || sign;   // never wander back on ourselves
      flip = sign;
      if (kind < 0.3) { arc(R * th, sign / R); arc(R * th, -sign / R); }   // chicane
      else arc(R * th, sign / R);                                          // sharp corner / hairpin
    }
  }
  // soften the curvature steps over about +-8 m so the road itself has no kinks (area is preserved)
  const curv = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    let sum = 0;
    for (let j = -2; j <= 2; j++) sum += curvRaw[clamp(i + j, 0, N - 1)];
    curv[i] = sum / 5;
  }

  /* ---------- 2. Width: gentle breathing plus chokepoints on the straights ---------- */
  const half = new Float32Array(N);
  {
    const hp = rng() * 6.28;
    const base = (i) => lerp(HALF, HALF - 1.3 * (0.5 + 0.5 * Math.sin(i * L * 0.019 + hp)), clamp((i * L - 160) / 100, 0, 1));
    for (let i = 0; i < N; i++) half[i] = base(i);
    const RAMP = 22;
    for (const [a, b] of straights) {
      if (b - a < 80 || a < 230 || rng() > 0.6) continue;
      const hold = clamp(b - a - 44, 16, 60), c = (a + b) / 2;
      const target = (a > 600 && rng() < 0.45) ? 2.7 : 5.2;      // one lane (late) or two lanes
      for (let i = 0; i < N; i++) {
        const x = Math.abs(i * L - c);
        const f = x <= hold / 2 ? 1 : x >= hold / 2 + RAMP ? 0 : 1 - smooth((x - hold / 2) / RAMP);
        if (f > 0) half[i] = Math.min(half[i], lerp(base(i), target, f));
      }
    }
  }

  /* ---------- 3. Centreline: integrate the heading ---------- */
  const px = new Float32Array(N), pz = new Float32Array(N), hd = new Float32Array(N);
  {
    let x = 0, z = 0, h = 0;
    for (let i = 0; i < N; i++) {
      px[i] = x; pz[i] = z;
      h += curv[i] * L; hd[i] = h;
      x += Math.sin(h) * L; z += Math.cos(h) * L;
    }
  }
  const P = (i, d) => [px[i] - Math.cos(hd[i]) * d, pz[i] + Math.sin(hd[i]) * d];

  function sample(s, d, out = {}) {
    s = clamp(s, 0, MAXS - 0.01);
    const i = Math.floor(s / L), f = (s - i * L) / L;
    const h = hd[i] + (hd[i + 1] - hd[i]) * f;
    const x = px[i] + (px[i + 1] - px[i]) * f, z = pz[i] + (pz[i + 1] - pz[i]) * f;
    out.x = x - Math.cos(h) * d;
    out.z = z + Math.sin(h) * d;
    out.h = h;
    return out;
  }
  function halfAt(s) {
    s = clamp(s, 0, MAXS - 0.01);
    const i = Math.floor(s / L), f = (s - i * L) / L;
    return lerp(half[i], half[i + 1], f);
  }
  // Lane centres that fit the road at distance s (4 lanes wide open, 1 lane in the tightest squeeze)
  function lanesAt(s) {
    const n = clamp(Math.round(halfAt(s) * 2 / 5), 1, 4);
    return Array.from({ length: n }, (_, k) => (k - (n - 1) / 2) * 5);
  }

  /* ---------- 4. Meshes ---------- */
  const dd = (d, i) => (typeof d === "function" ? d(i) : d);
  // d0/d1 may be numbers or (i) => number. colorFn (optional) gives per-sample [r,g,b].
  function strip(d0, y0, d1, y1, m, skip, colorFn) {
    const a = [], col = [];
    for (let i = 0; i < N - 1; i++) {
      if (skip && skip(i)) continue;
      const p0 = P(i, dd(d0, i)), p1 = P(i, dd(d1, i)), q0 = P(i + 1, dd(d0, i + 1)), q1 = P(i + 1, dd(d1, i + 1));
      a.push(p0[0], y0, p0[1], p1[0], y1, p1[1], q0[0], y0, q0[1],
        p1[0], y1, p1[1], q1[0], y1, q1[1], q0[0], y0, q0[1]);
      if (colorFn) for (const k of [i, i, i + 1, i, i + 1, i + 1]) col.push(...colorFn(k));
    }
    const g = own(new THREE.BufferGeometry());
    g.setAttribute("position", new THREE.Float32BufferAttribute(a, 3));
    if (colorFn) g.setAttribute("color", new THREE.Float32BufferAttribute(col, 3));
    g.computeVertexNormals();
    const mesh = new THREE.Mesh(g, m);
    mesh.frustumCulled = false;
    group.add(mesh);
    return mesh;
  }

  const lit = (c, o = {}) => own(new THREE.MeshLambertMaterial({ color: c, side: THREE.DoubleSide, ...o }));
  const basic = (c) => own(new THREE.MeshBasicMaterial({ color: c }));

  // the bridge: dark deck with a visible slab edge underneath
  const hl = (i) => half[i], hr = (i) => -half[i];
  strip(hr, 0, hl, 0, lit(0x16161f, { emissive: 0x08080e }));
  const slab = lit(0x0b0b18, { emissive: 0x04040a });
  strip(hl, 0, hl, -0.9, slab);
  strip(hr, 0, hr, -0.9, slab);
  strip(hr, -0.9, hl, -0.9, slab);

  // lane markings (only where the road is wide enough to have them)
  const white = basic(0xcfd8ff);
  strip(-0.12, 0.04, 0.12, 0.04, white, (i) => i % 2 === 1 || half[i] < 4);
  for (const d of [-5, 5]) strip(d - 0.12, 0.04, d + 0.12, 0.04, white, (i) => i % 2 === 1 || half[i] < 6.4);
  strip(hr, 0.05, hl, 0.05, white, (i) => i !== 11);                                  // start line

  // neon edges + soft additive glow. Colour shifts to orange as the road narrows.
  const danger = (i) => clamp((8.6 - half[i]) / 4, 0, 1);
  const colL = (i) => mix(CYAN, ORANGE, danger(i));
  const colR = (i) => mix(MAGENTA, ORANGE, danger(i));
  const neon = own(new THREE.MeshBasicMaterial({ vertexColors: true, fog: false, toneMapped: false, side: THREE.DoubleSide }));
  const glow = own(new THREE.MeshBasicMaterial({
    vertexColors: true, fog: false, toneMapped: false, side: THREE.DoubleSide,
    transparent: true, opacity: 0.22, blending: THREE.AdditiveBlending, depthWrite: false,
  }));
  for (const [sgn, colFn] of [[1, colL], [-1, colR]]) {
    strip((i) => sgn * (half[i] - 0.3), 0.06, (i) => sgn * half[i], 0.06, neon, null, colFn);
    strip((i) => sgn * (half[i] - 0.7), 0.07, (i) => sgn * (half[i] + 0.7), 0.07, glow, null, colFn);
  }

  // drifting dust in the void: a speed and depth cue
  {
    const cnt = 1400, pos = new Float32Array(cnt * 3), colr = new Float32Array(cnt * 3), tmp = {};
    for (let k = 0; k < cnt; k++) {
      sample(rng() * MAXS, (rng() - 0.5) * 170, tmp);
      pos.set([tmp.x, -45 + rng() * 75, tmp.z], k * 3);
      colr.set(rng() < 0.5 ? CYAN : rng() < 0.6 ? MAGENTA : [1, 1, 1], k * 3);
    }
    const g = own(new THREE.BufferGeometry());
    g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    g.setAttribute("color", new THREE.BufferAttribute(colr, 3));
    const pts = new THREE.Points(g, own(new THREE.PointsMaterial({
      size: 0.55, vertexColors: true, transparent: true, opacity: 0.8,
      blending: THREE.AdditiveBlending, depthWrite: false, fog: false,
    })));
    pts.frustumCulled = false;
    group.add(pts);
  }

  /* ---------- 5. Queries ---------- */
  // A locator remembers which sample a car was last near, so the next search is cheap.
  //   idx       nearest centreline sample      h         road heading there
  //   cx, cz    that sample's position         progress  distance travelled along the road (m)
  //   half      half-width of the road there
  const makeLoc = (s = 0) => ({ idx: Math.floor(s / L), h: 0, cx: 0, cz: 0, progress: s, half: HALF });

  function locate(x, z, loc) {
    let best = loc.idx, bd = 1e18;
    for (let i = Math.max(0, loc.idx - 8); i <= Math.min(N - 1, loc.idx + 8); i++) {
      const dx = x - px[i], dz = z - pz[i], d = dx * dx + dz * dz;
      if (d < bd) { bd = d; best = i; }
    }
    const h = hd[best];
    loc.idx = best;
    loc.h = h;
    loc.cx = px[best];
    loc.cz = pz[best];
    loc.half = half[best];
    loc.progress = best * L + (x - px[best]) * Math.sin(h) + (z - pz[best]) * Math.cos(h);
    return loc;
  }

  // Signed sideways distance of a point from the road centre (positive = right). Uses a located `loc`.
  const lateral = (x, z, loc) => (x - loc.cx) * -Math.cos(loc.h) + (z - loc.cz) * Math.sin(loc.h);

  // Call once: black void background and fog. Lights are up to main.js (a dim hemisphere light is plenty).
  function applyAtmosphere(scene) {
    scene.background = new THREE.Color(VOID_COLOR);
    scene.fog = new THREE.Fog(VOID_COLOR, 50, 260);
  }

  return {
    group,
    length: MAXS,
    sample,
    halfAt,
    lanesAt,
    makeLoc,
    locate,
    lateral,
    applyAtmosphere,
    dispose() {
      for (const o of disposables) { try { if (o.dispose) o.dispose(); } catch { /* ignore */ } }
    },
  };
}
