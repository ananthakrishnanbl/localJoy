// Wall collision built from the real map geometry:  hits(x, z)  and  clearAt(x, z).

import { NO_COLLISION } from "../config.js";

export function setupCollision(G) {
  const { THREE, meshes, floorTop, H, RADIUS } = G;

  /* ---------------- collision from the REAL wall geometry (as in index.html) ---------------- */
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

  // shared with the modules set up after this one
  Object.assign(G, { hits, clearAt });
}
