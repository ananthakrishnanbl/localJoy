// The circuit: a closed spline with turns, a tarmac ribbon, sand all around and mountains beyond the sand.
// Also answers "where is this point relative to the road?" for the physics and lap counting.
import * as THREE from "./three.js";

export const SCALE = 1.4;        // the whole circuit is this much bigger than the original layout
export const ROAD_W = 20 * SCALE;
export const HALF = ROAD_W / 2;
export const SAND_W = 20 * SCALE;        // sand strip on each side of the road. Past it is the mountain wall.
const N = 640;                   // number of samples along the centreline

// Centreline control points [x, z]. Edit these to change the circuit.
// Keep different parts of the track at least ~70 m apart, otherwise the sand zones overlap.
const CTRL = [
  [0, 0], [120, -10], [260, -20], [380, 40], [430, 160], [380, 270], [270, 310], [200, 380],
  [210, 500], [250, 570], [130, 610], [-20, 560], [-90, 460], [-60, 350], [-160, 290],
  [-260, 210], [-250, 90], [-150, 20],
];

function mulberry32(seed) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function canvasTexture(w, h, draw, repeatS = false) {
  const c = document.createElement("canvas");
  c.width = w; c.height = h;
  draw(c.getContext("2d"), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapT = THREE.RepeatWrapping;
  t.wrapS = repeatS ? THREE.RepeatWrapping : THREE.ClampToEdgeWrapping;
  t.anisotropy = 8;
  return t;
}

const asphaltTexture = () => canvasTexture(256, 256, (g, w, h) => {
  g.fillStyle = "#3a3e45"; g.fillRect(0, 0, w, h);
  for (let i = 0; i < 2500; i++) {
    g.fillStyle = Math.random() < 0.5 ? "rgba(255,255,255,.05)" : "rgba(0,0,0,.08)";
    g.fillRect(Math.random() * w, Math.random() * h, 2, 2);
  }
  g.fillStyle = "#f2f2f2"; g.fillRect(10, 0, 8, h); g.fillRect(w - 18, 0, 8, h);   // edge lines
  g.fillStyle = "#ffd34d"; g.fillRect(w / 2 - 3, 0, 6, h / 2);                      // dashed centre line
});

const kerbTexture = () => canvasTexture(16, 64, (g, w, h) => {
  g.fillStyle = "#e23b3b"; g.fillRect(0, 0, w, h / 2);
  g.fillStyle = "#f5f5f5"; g.fillRect(0, h / 2, w, h / 2);
});

const sandTexture = () => {
  const t = canvasTexture(256, 256, (g, w, h) => {
    g.fillStyle = "#e0c68a"; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 4000; i++) {
      g.fillStyle = Math.random() < 0.5 ? "rgba(255,240,200,.25)" : "rgba(150,110,50,.18)";
      g.fillRect(Math.random() * w, Math.random() * h, 2, 2);
    }
  }, true);
  t.repeat.set(320, 320);
  return t;
};

const checkerTexture = () => canvasTexture(128, 32, (g, w, h) => {
  for (let x = 0; x < 8; x++) for (let y = 0; y < 2; y++) {
    g.fillStyle = (x + y) % 2 ? "#111" : "#fff";
    g.fillRect(x * 16, y * 16, 16, 16);
  }
});

export function createTrack() {
  /* ---------- Centreline samples ---------- */
  const curve = new THREE.CatmullRomCurve3(CTRL.map(([x, z]) => new THREE.Vector3(x * SCALE, 0, z * SCALE)), true, "centripetal");
  curve.arcLengthDivisions = 4000;
  const pts = curve.getSpacedPoints(N);
  pts.pop();                                    // last point equals the first

  let acc = 0;
  const samples = pts.map((p, i) => {
    if (i > 0) acc += Math.hypot(p.x - pts[i - 1].x, p.z - pts[i - 1].z);
    return { x: p.x, z: p.z, s: acc };
  });
  const length = acc + Math.hypot(pts[0].x - pts[N - 1].x, pts[0].z - pts[N - 1].z);
  const step = length / N;
  samples.forEach((s, i) => {
    const a = samples[(i - 1 + N) % N], b = samples[(i + 1) % N];
    let tx = b.x - a.x, tz = b.z - a.z;
    const l = Math.hypot(tx, tz);
    s.tx = tx / l; s.tz = tz / l;               // forward
    s.lx = s.tz; s.lz = -s.tx;                  // left
  });

  /* ---------- Meshes ---------- */
  const group = new THREE.Group();

  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(5000, 5000).rotateX(-Math.PI / 2),
    new THREE.MeshLambertMaterial({ map: sandTexture() })
  );
  ground.position.set(300 * SCALE, 0, 300 * SCALE);
  group.add(ground);

  const flat = (map) => new THREE.MeshLambertMaterial({
    map, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
  });

  function ribbon(o0, o1, y, vLen, material) {
    const pos = [], uv = [], idx = [];
    for (let i = 0; i <= N; i++) {
      const s = samples[i % N], v = (i === N ? length : s.s) / vLen;
      pos.push(s.x + s.lx * o0, y, s.z + s.lz * o0, s.x + s.lx * o1, y, s.z + s.lz * o1);
      uv.push(0, v, 1, v);
    }
    for (let i = 0; i < N; i++) { const a = 2 * i; idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3); }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
    g.setIndex(idx);
    g.computeVertexNormals();
    return new THREE.Mesh(g, material);
  }

  group.add(ribbon(-HALF, HALF, 0.05, 25 * SCALE, flat(asphaltTexture())));
  const kerb = flat(kerbTexture());
  group.add(ribbon(HALF, HALF + 2, 0.06, 5.6, kerb));
  group.add(ribbon(-HALF - 2, -HALF, 0.06, 5.6, kerb));

  // Start / finish line and gantry
  const s0 = samples[0], psi0 = Math.atan2(s0.tx, s0.tz);
  const line = new THREE.Mesh(new THREE.PlaneGeometry(ROAD_W, 4).rotateX(-Math.PI / 2), flat(checkerTexture()));
  line.position.set(s0.x, 0.08, s0.z);
  line.rotation.y = psi0;
  group.add(line);

  const gateMat = new THREE.MeshLambertMaterial({ color: 0xe23b3b });
  for (const side of [-1, 1]) {
    const post = new THREE.Mesh(new THREE.BoxGeometry(1.2, 11, 1.2), gateMat);
    const off = side * (HALF + 3);
    post.position.set(s0.x + s0.lx * off, 5.5, s0.z + s0.lz * off);
    group.add(post);
  }
  const beam = new THREE.Mesh(new THREE.BoxGeometry(ROAD_W + 7, 2, 1.6), new THREE.MeshLambertMaterial({ color: 0xf5f5f5 }));
  beam.position.set(s0.x, 11, s0.z);
  beam.rotation.y = psi0;
  group.add(beam);

  /* ---------- Mountains (instanced: two draw calls for all of them) ---------- */
  const rnd = mulberry32(7);
  const minDist = (x, z) => {
    let m = Infinity;
    for (let i = 0; i < N; i += 2) m = Math.min(m, Math.hypot(samples[i].x - x, samples[i].z - z));
    return m;
  };
  const mountains = [];
  const place = (x, z, r, h, pad) => {
    if (minDist(x, z) < HALF + SAND_W + r * 0.55 + pad) return;   // never block the road or crowd the sand
    mountains.push({ x, z, r, h, rot: rnd() * 6.28 });
  };
  // a wall of foothills hugging the sand on both sides
  for (let i = 0; i < N; i += 7) {
    for (const side of [-1, 1]) {
      const s = samples[i];
      const r = (20 + rnd() * 18) * SCALE, h = (28 + rnd() * 45) * SCALE;
      const off = HALF + SAND_W + r * 0.7 + rnd() * 8;
      place(s.x + s.lx * side * off, s.z + s.lz * side * off, r, h, 0);
    }
  }
  // big peaks further out
  for (let i = 0; i < 560; i++) {
    const r = (40 + rnd() * 50) * SCALE, h = (70 + rnd() * 100) * SCALE;
    place((-900 + rnd() * 1900) * SCALE, (-600 + rnd() * 1800) * SCALE, r, h, 20 * SCALE);
  }

  const dummy = new THREE.Object3D();
  const cone = new THREE.ConeGeometry(1, 1, 7, 1);
  const rock = new THREE.InstancedMesh(cone, new THREE.MeshLambertMaterial({ flatShading: true }), mountains.length);
  const palette = ["#8b7a66", "#7d6e5d", "#9b8873", "#6f6862", "#a08a6c"].map((c) => new THREE.Color(c));
  mountains.forEach((m, i) => {
    dummy.position.set(m.x, m.h / 2, m.z);
    dummy.rotation.set(0, m.rot, 0);
    dummy.scale.set(m.r, m.h, m.r);
    dummy.updateMatrix();
    rock.setMatrixAt(i, dummy.matrix);
    rock.setColorAt(i, palette[i % palette.length]);
  });
  rock.frustumCulled = false;
  group.add(rock);

  const tall = mountains.filter((m) => m.h > 70 * SCALE);
  const snow = new THREE.InstancedMesh(cone, new THREE.MeshLambertMaterial({ color: 0xffffff, flatShading: true }), tall.length);
  tall.forEach((m, i) => {
    dummy.position.set(m.x, m.h * 0.82, m.z);
    dummy.rotation.set(0, m.rot, 0);
    dummy.scale.set(m.r * 0.37, m.h * 0.36, m.r * 0.37);
    dummy.updateMatrix();
    snow.setMatrixAt(i, dummy.matrix);
  });
  snow.frustumCulled = false;
  group.add(snow);

  /* ---------- Queries ---------- */
  function nearest(x, z, hint) {
    let best = -1, bd = Infinity;
    const scan = (i) => {
      const s = samples[i], d = (s.x - x) ** 2 + (s.z - z) ** 2;
      if (d < bd) { bd = d; best = i; }
    };
    if (hint != null && hint >= 0) for (let k = -14; k <= 14; k++) scan((hint + k + N) % N);   // cheap local search
    if (best < 0 || bd > (35 * SCALE) ** 2) { bd = Infinity; for (let i = 0; i < N; i++) scan(i); }       // lost it: search everything
    return best;
  }

  // Where is (x, z) relative to the road?
  //   idx      nearest centreline sample
  //   d        signed sideways distance from the centreline (left positive)
  //   along    distance along the track from that sample
  //   surface  "road" | "sand" | "wall" (beyond the sand, i.e. the mountains)
  function query(x, z, hint) {
    const idx = nearest(x, z, hint), s = samples[idx];
    const dx = x - s.x, dz = z - s.z;
    const d = dx * s.lx + dz * s.lz;
    const ad = Math.abs(d);
    return {
      idx, d,
      along: dx * s.tx + dz * s.tz,
      surface: ad <= HALF ? "road" : ad <= HALF + SAND_W ? "sand" : "wall",
    };
  }

  // Starting grid: two columns behind the line
  function gridPose(k) {
    const row = k >> 1, side = k & 1 ? 1 : -1;
    const idx = (N - Math.round((11 + row * 12) / step) + N) % N;
    const c = samples[idx], off = side * 4.6;
    return { x: c.x + c.lx * off, z: c.z + c.lz * off, psi: Math.atan2(c.tx, c.tz), idx };
  }

  // Put a bike back on the road, near the edge on the side it left from, facing the right way
  function respawnPose(idx, d) {
    const c = samples[idx], off = (d < 0 ? -1 : 1) * HALF * 0.5;
    return { x: c.x + c.lx * off, z: c.z + c.lz * off, psi: Math.atan2(c.tx, c.tz), idx };
  }

  return { group, samples, N, length, query, gridPose, respawnPose };
}