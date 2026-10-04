// TEAM DEATHMATCH  -  /js/game/tdm/world.js
// The renderer, the map, wall collision, the walkable area, spawn points and the med-kit spots.
import { THREE_CDN, MAP_FILES, MAP_SCALE, NO_COLLISION } from "./config.js";

export async function loadThree() {
  try {
    const THREE = await import("three");                                   // the site's import map, if it has one
    const { GLTFLoader } = await import("three/addons/loaders/GLTFLoader.js");
    const SU = await import("three/addons/utils/SkeletonUtils.js");
    return { THREE, GLTFLoader, cloneSkinned: SU.clone };
  } catch {
    const THREE = await import(`${THREE_CDN}/+esm`);                        // otherwise straight from the CDN
    const { GLTFLoader } = await import(`${THREE_CDN}/examples/jsm/loaders/GLTFLoader.js/+esm`);
    const SU = await import(`${THREE_CDN}/examples/jsm/utils/SkeletonUtils.js/+esm`);
    return { THREE, GLTFLoader, cloneSkinned: SU.clone };
  }
}

// Builds the scene + map and puts everything the other files need on S.
// Returns null (after showing a message) when the map cannot be loaded.
export async function createWorld(S) {
  const { THREE, GLTFLoader, wrap, status, signal, dim } = S;

  /* ---------------- renderer, scene, lights ---------------- */
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0xe8b98f);
  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.autoUpdate = false;           // the map never moves: draw its shadows once (needsUpdate in main.js)
  wrap.insertBefore(renderer.domElement, status);
  scene.add(new THREE.HemisphereLight(0xfff0e0, 0x8a5a44, 1.4));
  const sun = new THREE.DirectionalLight(0xfff2dd, 2.2);
  sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048);
  scene.add(sun, sun.target);

  function resize() {
    const w = wrap.clientWidth, hh = wrap.clientHeight;
    if (!w || !hh) return;
    dim.W = w; dim.HH = hh;
    renderer.setSize(w, hh, false);
    wrap.style.fontSize = (w / 80) + "px";        // every HUD size is in em, so the HUD scales with the screen
  }
  const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(resize) : null;
  ro?.observe(wrap);
  resize();

  /* ---------------- load the map ---------------- */
  let gltf = null;
  for (const f of MAP_FILES) { try { gltf = await new GLTFLoader().loadAsync(f); break; } catch {} }
  if (!gltf) {
    ro?.disconnect(); renderer.dispose();
    status.textContent = "Could not load the map.\nExpected one of:\n" + MAP_FILES.join("\n") + "\n\nPut map.glb at public/js/game/tdm/assets/map.glb (or change MAP_FILES in js/game/tdm/config.js).";
    return null;
  }
  if (signal.aborted) { ro?.disconnect(); renderer.dispose(); return null; }

  const world = gltf.scene;
  world.scale.setScalar(MAP_SCALE);
  scene.add(world);
  world.updateMatrixWorld(true);
  const meshes = [];
  world.traverse((o) => {
    if (!o.isMesh) return;
    if (o.material) { o.material.roughness = 1; o.material.metalness = 0; }      // the map's own embedded texture is used
    o.castShadow = o.receiveShadow = true;
    meshes.push(o);
  });

  const all = new THREE.Box3().setFromObject(world);
  const size = all.getSize(new THREE.Vector3()), mid = all.getCenter(new THREE.Vector3());
  let floorTop = all.min.y;                             // refined below: the real walking surface (the lowest vertex is not always the floor)
  {
    const rc = new THREE.Raycaster(), org = new THREE.Vector3(), dwn = new THREE.Vector3(0, -1, 0), nrm = new THREE.Vector3(), votes = new Map();
    for (let i = 0; i < 7; i++) for (let j = 0; j < 7; j++) {
      org.set(all.min.x + ((i + 0.5) / 7) * size.x, all.max.y + 1, all.min.z + ((j + 0.5) / 7) * size.z);
      rc.set(org, dwn); rc.far = size.y + 2;
      for (const hit of rc.intersectObjects(meshes, false)) {          // nearest first = from the top down
        if (!hit.face || hit.point.y > all.min.y + 1.0) continue;     // roofs / wall tops are not the floor
        nrm.copy(hit.face.normal).transformDirection(hit.object.matrixWorld);
        if (nrm.y < 0.7) continue;                                    // only upward-facing surfaces
        const key = Math.round(hit.point.y * 100); votes.set(key, (votes.get(key) || 0) + 1); break;
      }
    }
    let best = null;
    for (const [k, n] of votes) if (!best || n > best[1]) best = [k, n];
    if (best && best[1] >= 3) floorTop = best[0] / 100;               // the most common surface height = the floor
    console.log(`[tdm] floor height ${floorTop.toFixed(2)} (lowest map vertex ${all.min.y.toFixed(2)})`);
  }
  const H = 4 * 0.45, RADIUS = H * 0.18;                 // character height / body radius

  /* ---------------- collision from the REAL wall geometry ---------------- */
  const LO = floorTop + 0.4, HI = floorTop + H;
  const CELL = 2, grid = new Map(), segs = [];
  const gkey = (ix, iz) => (ix + 5000) * 10000 + (iz + 5000);
  function addSeg(ax, az, bx, bz) {
    if ((ax - bx) ** 2 + (az - bz) ** 2 < 1e-8) return;
    const id = segs.length / 4; segs.push(ax, az, bx, bz);
    for (let ix = Math.floor(Math.min(ax, bx) / CELL); ix <= Math.floor(Math.max(ax, bx) / CELL); ix++)
      for (let iz = Math.floor(Math.min(az, bz) / CELL); iz <= Math.floor(Math.max(az, bz) / CELL); iz++) {
        const k = gkey(ix, iz); (grid.get(k) || grid.set(k, []).get(k)).push(id);
      }
  }
  {
    const V = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()], e1 = new THREE.Vector3(), e2 = new THREE.Vector3();
    for (const m of meshes) {
      if (NO_COLLISION.some((s) => m.name.includes(s))) continue;
      const pos = m.geometry.attributes.position, idx = m.geometry.index, n = idx ? idx.count : pos.count;
      for (let i = 0; i < n; i += 3) {
        for (let k = 0; k < 3; k++) V[k].fromBufferAttribute(pos, idx ? idx.getX(i + k) : i + k).applyMatrix4(m.matrixWorld);
        if (Math.max(V[0].y, V[1].y, V[2].y) < LO || Math.min(V[0].y, V[1].y, V[2].y) > HI) continue;
        e1.subVectors(V[1], V[0]); e2.subVectors(V[2], V[0]); e1.cross(e2);
        if (Math.abs(e1.y) > 0.6 * e1.length()) continue;         // floors / tops are not walls
        for (let k = 0; k < 3; k++) { const a = V[k], b = V[(k + 1) % 3]; addSeg(a.x, a.z, b.x, b.z); }
      }
    }
  }
  function hits(x, z) {
    const r2 = RADIUS * RADIUS;
    for (let ix = Math.floor((x - RADIUS) / CELL); ix <= Math.floor((x + RADIUS) / CELL); ix++)
      for (let iz = Math.floor((z - RADIUS) / CELL); iz <= Math.floor((z + RADIUS) / CELL); iz++) {
        const ids = grid.get(gkey(ix, iz)); if (!ids) continue;
        for (const id of ids) {
          const ax = segs[id * 4], az = segs[id * 4 + 1], dx = segs[id * 4 + 2] - ax, dz = segs[id * 4 + 3] - az;
          const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz)));
          if ((x - ax - t * dx) ** 2 + (z - az - t * dz) ** 2 < r2) return true;
        }
      }
    return false;
  }
  const clearAt = (x, z, r = 1.0) => !hits(x, z) && !hits(x + r, z) && !hits(x - r, z) && !hits(x, z + r) && !hits(x, z - r);

  // lighting fit
  const R = Math.max(size.x, size.z);
  sun.position.set(mid.x + R, mid.y + R * 1.5, mid.z + R * 0.5); sun.target.position.copy(mid);
  Object.assign(sun.shadow.camera, { left: -R, right: R, top: R, bottom: -R, far: R * 6 });
  scene.fog = new THREE.Fog(0xe8b98f, R * 1.2, R * 3);

  /* ---------------- walkable cells: flood-fill from a room, so spawns / med-kits are never unreachable ---------------- */
  const CS = 0.5, gx0 = all.min.x - 1, gz0 = all.min.z - 1;
  const GW = Math.ceil((size.x + 2) / CS), GD = Math.ceil((size.z + 2) / CS);
  const reach = new Uint8Array(GW * GD);
  const cellOf = (x, z) => {
    const i = Math.floor((x - gx0) / CS), j = Math.floor((z - gz0) / CS);
    return i < 0 || j < 0 || i >= GW || j >= GD ? -1 : j * GW + i;
  };
  const cellX = (idx) => gx0 + ((idx % GW) + 0.5) * CS, cellZ = (idx) => gz0 + (((idx / GW) | 0) + 0.5) * CS;

  // the two big rooms: team RED lives in the one with the larger z (north), team BLUE in the other (south)
  const roomBoxes = meshes.filter((m) => /^room-large/.test(m.name))
    .map((m) => new THREE.Box3().setFromObject(m)).sort((a, b) => b.min.z - a.min.z);
  const fallbackBox = (north) => new THREE.Box3(
    new THREE.Vector3(mid.x - 20, floorTop, north ? all.max.z - 40 : all.min.z + 2),
    new THREE.Vector3(mid.x + 20, floorTop + H, north ? all.max.z - 2 : all.min.z + 40));
  const roomBox = roomBoxes.length > 1 ? [roomBoxes[0], roomBoxes[roomBoxes.length - 1]] : [fallbackBox(true), fallbackBox(false)];

  function nearestFree(cx, cz, r = 0) {                   // closest spot to (cx, cz) that is not inside a wall
    if (!hits(cx, cz) && (!r || clearAt(cx, cz, r))) return [cx, cz];
    for (let d = 0.5; d < 30; d += 0.5)
      for (let a = 0; a < 6.28; a += 0.2) {
        const x = cx + Math.cos(a) * d, z = cz + Math.sin(a) * d;
        if (!hits(x, z) && (!r || clearAt(x, z, r))) return [x, z];
      }
    return [cx, cz];
  }
  {
    const c = roomBox[0], [sx, sz] = nearestFree((c.min.x + c.max.x) / 2, (c.min.z + c.max.z) / 2);
    const q = new Int32Array(GW * GD);
    let qh = 0, qt = 0;
    const s0 = cellOf(sx, sz);
    if (s0 >= 0) { reach[s0] = 1; q[qt++] = s0; }
    while (qh < qt) {
      const cc = q[qh++], i = cc % GW, j = (cc / GW) | 0;
      for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const ni = i + di, nj = j + dj;
        if (ni < 0 || nj < 0 || ni >= GW || nj >= GD) continue;
        const n = nj * GW + ni;
        if (reach[n] || hits(cellX(n), cellZ(n))) continue;
        reach[n] = 1; q[qt++] = n;
      }
    }
  }
  function cells(pred) {                                   // every reachable cell centre [x, z] that passes pred(x, z)
    const out = [];
    for (let c = 0; c < reach.length; c++) {
      if (!reach[c]) continue;
      const x = cellX(c), z = cellZ(c);
      if (pred(x, z)) out.push([x, z]);
    }
    return out;
  }
  const isReachable = (x, z) => { const c = cellOf(x, z); return c >= 0 && !!reach[c]; };

  /* ---------------- spawn points ---------------- */
  // Team spawns: inside the team's own room, a few steps from its centre, facing the middle of the map.
  // Solo spawns: anywhere on the walkable floor (the game picks the one farthest from everybody).
  const faceMid = (x, z) => Math.atan2(-(mid.x - x), -(mid.z - z));      // yaw that looks at the map centre (forward = -sin, -cos)
  const bases = [0, 1].map((t) => {
    const box = roomBox[t], cx = (box.min.x + box.max.x) / 2, cz = (box.min.z + box.max.z) / 2;
    const inRoom = cells((x, z) => x > box.min.x + 2 && x < box.max.x - 2 && z > box.min.z + 2 && z < box.max.z - 2 && clearAt(x, z, 1.2));
    let spawns = inRoom.filter((c) => Math.hypot(c[0] - cx, c[1] - cz) < 14);
    if (spawns.length < 6) spawns = inRoom;
    if (!spawns.length) spawns = [[cx, cz]];
    return { center: { x: cx, z: cz }, spawns, yaw: faceMid(cx, cz) };
  });
  const soloSpawns = cells((x, z) => clearAt(x, z, 1.4)).filter((_, i) => i % 6 === 0);   // (every 6th cell is plenty)
  if (!reach[cellOf(bases[0].center.x, bases[0].center.z)]) console.warn("[tdm] the two rooms are not connected on foot; check NO_COLLISION in config.js");

  /* ---------------- med-kit spots: the EXACT middle of the map + the four corners (the game uses 2 random corners per match) ---------------- */
  const spotMid = nearestFree(mid.x, mid.z, 1.2);
  let cornerSpots = meshes.filter((m) => /^corridor-wide-corner/.test(m.name))                // the four corner pieces of the map
    .map((m) => { const b = new THREE.Box3().setFromObject(m), c = b.getCenter(new THREE.Vector3()); return nearestFree(c.x, c.z, 1.2); });
  if (cornerSpots.length !== 4) {                                                             // another map: use the corners of the walkable area
    const xs = [], zs = [];
    cells(() => true).forEach(([x, z]) => { xs.push(x); zs.push(z); });
    const x0 = Math.min(...xs), x1 = Math.max(...xs), z0 = Math.min(...zs), z1 = Math.max(...zs), k = 8;
    cornerSpots = [[x0 + k, z0 + k], [x1 - k, z0 + k], [x0 + k, z1 - k], [x1 - k, z1 - k]].map(([x, z]) => nearestFree(x, z, 1.2));
  }
  console.log(`[tdm] med-kit spots: middle ${spotMid.map((v) => v.toFixed(1))}, corners ${cornerSpots.map((c) => c.map((v) => v.toFixed(1)).join("/")).join("  ")}`);

  Object.assign(S, {
    scene, renderer, world, meshes, all, size, mid, floorTop, H, RADIUS, hits, clearAt, cells, isReachable, nearestFree,
    roomBox, bases, soloSpawns, medSpots: { middle: spotMid, corners: cornerSpots }, faceMid,
  });
  return {
    dispose() {
      ro?.disconnect();
      world.traverse((o) => { o.geometry?.dispose(); });
      renderer.dispose();
      renderer.forceContextLoss?.();
    },
  };
}
