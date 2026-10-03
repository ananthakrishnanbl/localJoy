// Works out where things go: lighting fit, walkable area (flood fill), the two team rooms,
// bases (flag stand + spawn points) and the med-kit area in the middle room.

import { MAP_SCALE, MID_HALF, TEAMS } from "../config.js";

export function setupMapLayout(G) {
  const { THREE, scene, sun, meshes, all, size, mid, floorTop, H, hits, clearAt } = G;

  // lighting fit
  const R = Math.max(size.x, size.z);
  sun.position.set(mid.x + R, mid.y + R * 1.5, mid.z + R * 0.5); sun.target.position.copy(mid);
  Object.assign(sun.shadow.camera, { left: -R, right: R, top: R, bottom: -R, far: R * 6 });
  scene.fog = new THREE.Fog(0xe8b98f, R * 1.2, R * 3);

  /* ---------------- walkable cells: flood-fill from an end room, so flags / spawns / med-kits are never unreachable ---------------- */
  const CS = 0.5, gx0 = all.min.x - 1, gz0 = all.min.z - 1;
  const GW = Math.ceil((size.x + 2) / CS), GD = Math.ceil((size.z + 2) / CS);
  const reach = new Uint8Array(GW * GD);
  const cellOf = (x, z) => {
    const i = Math.floor((x - gx0) / CS), j = Math.floor((z - gz0) / CS);
    return i < 0 || j < 0 || i >= GW || j >= GD ? -1 : j * GW + i;
  };
  const cellX = (idx) => gx0 + ((idx % GW) + 0.5) * CS, cellZ = (idx) => gz0 + (((idx / GW) | 0) + 0.5) * CS;

  const roomBoxes = meshes.filter((m) => /^room-small/.test(m.name))
    .map((m) => new THREE.Box3().setFromObject(m)).sort((a, b) => a.min.x - b.min.x);
  const fallbackBox = (west) => new THREE.Box3(
    new THREE.Vector3(west ? all.min.x + 2 : all.max.x - 26, floorTop, mid.z - 12),
    new THREE.Vector3(west ? all.min.x + 26 : all.max.x - 2, floorTop + H, mid.z + 12));
  const roomBox = [roomBoxes.length > 1 ? roomBoxes[0] : fallbackBox(true), roomBoxes.length > 1 ? roomBoxes[roomBoxes.length - 1] : fallbackBox(false)];

  {
    const east = roomBox[1], cx = (east.min.x + east.max.x) / 2, cz = (east.min.z + east.max.z) / 2;
    let sx = cx, sz = cz, found = !hits(cx, cz);
    for (let r = 0.5; r < 20 && !found; r += 0.5)
      for (let a = 0; a < 6.28 && !found; a += 0.3) {
        const x = cx + Math.cos(a) * r, z = cz + Math.sin(a) * r;
        if (!hits(x, z)) { sx = x; sz = z; found = true; }
      }
    const q = new Int32Array(GW * GD);
    let qh = 0, qt = 0;
    const s0 = cellOf(sx, sz);
    if (s0 >= 0) { reach[s0] = 1; q[qt++] = s0; }
    while (qh < qt) {
      const c = q[qh++], i = c % GW, j = (c / GW) | 0;
      for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const ni = i + di, nj = j + dj;
        if (ni < 0 || nj < 0 || ni >= GW || nj >= GD) continue;
        const n = nj * GW + ni;
        if (reach[n] || hits(cellX(n), cellZ(n))) continue;
        reach[n] = 1; q[qt++] = n;
      }
    }
  }
  function cells(pred) {
    const out = [];
    for (let c = 0; c < reach.length; c++) {
      if (!reach[c]) continue;
      const x = cellX(c), z = cellZ(c);
      if (pred(x, z)) out.push([x, z]);
    }
    return out;
  }

  /* ---------------- bases (flag stand + spawn points) and med-kit spots ---------------- */
  const bases = TEAMS.map((_, t) => {
    const box = roomBox[t];
    const cx = (box.min.x + box.max.x) / 2, cz = (box.min.z + box.max.z) / 2;
    const inRoom = cells((x, z) => x > box.min.x + 1 && x < box.max.x - 1 && z > box.min.z + 1 && z < box.max.z - 1 && clearAt(x, z, 1.2));
    let home = [cx, cz], bd = Infinity;
    for (const c of inRoom) { const d = (c[0] - cx) ** 2 + (c[1] - cz) ** 2; if (d < bd) { bd = d; home = c; } }
    let spawns = inRoom.filter((c) => { const d = Math.hypot(c[0] - home[0], c[1] - home[1]); return d > 4 && d < 11; });
    if (spawns.length < 4) spawns = inRoom.filter((c) => Math.hypot(c[0] - home[0], c[1] - home[1]) > 2.5);
    if (!spawns.length) spawns = [home];
    return { home: { x: home[0], z: home[1] }, spawns, yaw: t === 0 ? -Math.PI / 2 : Math.PI / 2 };   // face the middle
  });
  const midCells = cells((x, z) => Math.abs(x - mid.x) <= MID_HALF.x * MAP_SCALE && Math.abs(z - mid.z) <= MID_HALF.z * MAP_SCALE && clearAt(x, z, 1.0));
  if (!midCells.length) console.warn("[ctf] no free spot found in the middle room for med-kits");
  if (!reach[cellOf(bases[0].home.x, bases[0].home.z)]) console.warn("[ctf] the two end rooms are not connected on foot; check NO_COLLISION in main.js");

  // shared with the modules set up after this one
  Object.assign(G, { cells, bases, midCells });
}
