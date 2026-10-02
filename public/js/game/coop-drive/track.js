// The highway: a procedurally generated road (random curvature each run), guard rails, lane markings
// and roadside trees. Also answers "where is this point relative to the road?" for the game.
//
// Road space: the road is sampled every L metres. Offset d is measured sideways from the centreline
// along (-cos h, sin h), where h is the road heading at that sample (forward = (sin h, cos h)).
import * as THREE from "./three.js";

export const L = 4;                  // segment length (m)
export const N = 900;                // number of segments
export const HALF = 10;              // half road width (inner face of the rails)
export const START_S = 48;           // distance along the road where the cars start
export const LANES = [-7.5, -2.5, 2.5, 7.5];

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

// rng: a () => [0,1) function. The same rng is used for the curves and the trees.
export function createTrack(rng) {
  const disposables = [];
  const own = (o) => { disposables.push(o); return o; };
  const group = new THREE.Group();

  const mat = (c, o = {}) => own(new THREE.MeshLambertMaterial({ color: c, side: THREE.DoubleSide, ...o }));
  const basic = (c) => own(new THREE.MeshBasicMaterial({ color: c }));

  /* ---------- Centreline: heading integrated from a sum of sine curvatures ---------- */
  const px = new Float32Array(N), pz = new Float32Array(N), hd = new Float32Array(N);
  {
    const ph = [rng() * 6.28, rng() * 6.28, rng() * 6.28];
    let x = 0, z = 0, h = 0;
    for (let i = 0; i < N; i++) {
      px[i] = x; pz[i] = z;
      const s = i * L, k = clamp((s - 120) / 200, 0, 1);   // dead straight at the start, then curves fade in
      const curv = k * (0.0065 * Math.sin(s * 0.0105 + ph[0]) + 0.0055 * Math.sin(s * 0.0271 + ph[1]) + 0.0035 * Math.sin(s * 0.0613 + ph[2]));
      h += curv * L; hd[i] = h;
      x += Math.sin(h) * L; z += Math.cos(h) * L;
    }
  }
  const P = (i, d) => [px[i] - Math.cos(hd[i]) * d, pz[i] + Math.sin(hd[i]) * d];

  // Point at distance s along the road, d to the side. Returns { x, z, h }.
  function sample(s, d, out = {}) {
    s = clamp(s, 0, (N - 1) * L - 0.01);
    const i = Math.floor(s / L), f = (s - i * L) / L;
    const h = hd[i] + (hd[i + 1] - hd[i]) * f;
    const x = px[i] + (px[i + 1] - px[i]) * f, z = pz[i] + (pz[i + 1] - pz[i]) * f;
    out.x = x - Math.cos(h) * d;
    out.z = z + Math.sin(h) * d;
    out.h = h;
    return out;
  }

  /* ---------- Meshes ---------- */
  function strip(d0, y0, d1, y1, m, skip) {
    const a = [];
    for (let i = 0; i < N - 1; i++) {
      if (skip && skip(i)) continue;
      const p0 = P(i, d0), p1 = P(i, d1), q0 = P(i + 1, d0), q1 = P(i + 1, d1);
      a.push(p0[0], y0, p0[1], p1[0], y1, p1[1], q0[0], y0, q0[1],
        p1[0], y1, p1[1], q1[0], y1, q1[1], q0[0], y0, q0[1]);
    }
    const g = own(new THREE.BufferGeometry());
    g.setAttribute("position", new THREE.Float32BufferAttribute(a, 3));
    g.computeVertexNormals();
    const mesh = new THREE.Mesh(g, m);
    mesh.frustumCulled = false;
    group.add(mesh);
    return mesh;
  }

  const grass = mat(0x4f8a3e);
  const ground = new THREE.Mesh(own(new THREE.PlaneGeometry(9000, 9000)), grass);
  ground.rotation.x = -Math.PI / 2;
  ground.position.set(0, -0.2, 1800);
  group.add(ground);
  strip(-200, -0.05, 200, -0.05, grass);
  strip(-HALF, 0, HALF, 0, mat(0x3a3d44));

  const white = basic(0xf2f2f2), yellow = basic(0xf5c542);
  for (const d of [-5, 0, 5]) strip(d - 0.12, 0.04, d + 0.12, 0.04, white, (i) => i % 2 === 1);   // dashed lane lines
  for (const d of [-9.4, 9.4]) strip(d - 0.15, 0.04, d + 0.15, 0.04, yellow);                    // edge lines
  strip(-HALF, 0.05, HALF, 0.05, white, (i) => i !== 11);                                         // start line

  const railRed = mat(0xd23b3b), railWhite = mat(0xeeeeee);
  for (const side of [-1, 1]) {
    const dIn = side * HALF, dOut = side * (HALF + 0.7);
    for (const [m, par] of [[railRed, 0], [railWhite, 1]]) {
      strip(dIn, 0, dIn, 0.9, m, (i) => i % 2 !== par);
      strip(dIn, 0.9, dOut, 0.9, m, (i) => i % 2 !== par);
    }
  }

  // roadside trees (one instanced mesh)
  {
    const trees = [];
    for (let i = 4; i < N - 1; i += 3) {
      for (const side of [-1, 1]) if (rng() < 0.7) trees.push([i, side * (14 + rng() * 30), 0.7 + rng() * 0.9]);
    }
    const tm = own(new THREE.InstancedMesh(own(new THREE.ConeGeometry(2, 6, 6)), mat(0x2f7d3b), trees.length));
    const dummy = new THREE.Object3D();
    trees.forEach(([i, d, s], k) => {
      const p = P(i, d);
      dummy.position.set(p[0], 3 * s, p[1]);
      dummy.scale.set(s, s, s);
      dummy.updateMatrix();
      tm.setMatrixAt(k, dummy.matrix);
    });
    tm.instanceMatrix.needsUpdate = true;
    tm.frustumCulled = false;
    group.add(tm);
  }

  /* ---------- Queries ---------- */
  // A locator remembers which sample a car was last near, so the next search is cheap.
  //   idx       nearest centreline sample      h         road heading there
  //   cx, cz    that sample's position         progress  distance travelled along the road (m)
  const makeLoc = (s = 0) => ({ idx: Math.floor(s / L), h: 0, cx: 0, cz: 0, progress: s });

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
    loc.progress = best * L + (x - px[best]) * Math.sin(h) + (z - pz[best]) * Math.cos(h);
    return loc;
  }

  return {
    group,
    length: (N - 1) * L,
    sample,
    makeLoc,
    locate,
    dispose() {
      for (const o of disposables) { try { if (o.dispose) o.dispose(); } catch { /* ignore */ } }
    },
  };
}
