// Floor gun pickups: seeded fixed spots, random relocation after a while, gun swapping on the floor.

import { GUNS, PICKUP_COUNT, PICKUP_LIFE, PICKUP_SEED, PICKUP_TYPES } from "../config.js";
import { mulberry32 } from "../utils.js";

export function setupPickups(G) {
  const { THREE, scene, floorTop, clearAt, cells, bases, gunModel, disposeGunModel } = G;

  /* ---------------- gun pickups: fixed spots (seeded), the same in every game ---------------- */
  const pickupSpots = [];
  const pickupPool = cells((x, z) => clearAt(x, z, 1.0) && bases.every((b) => Math.hypot(x - b.home.x, z - b.home.z) > 10));
  {
    const rnd = mulberry32(PICKUP_SEED);
    const pool = pickupPool;
    for (let tries = 0; tries < 4000 && pickupSpots.length < PICKUP_COUNT && pool.length; tries++) {
      const c = pool[(rnd() * pool.length) | 0];
      const minD = tries < 2000 ? 12 : 6;
      if (pickupSpots.some((o) => Math.hypot(o[0] - c[0], o[1] - c[1]) < minD)) continue;
      pickupSpots.push(c);
    }
  }
  const pickups = pickupSpots.map(([x, z], i) => {
    const g = new THREE.Group(); g.position.set(x, floorTop, z);
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.8, 1.1, 28).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({ color: 0xffd060, transparent: true, opacity: 0.7, side: THREE.DoubleSide }));
    ring.position.y = 0.06;
    const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.4, 5, 12, 1, true),
      new THREE.MeshBasicMaterial({ color: 0xffd060, transparent: true, opacity: 0.18, depthWrite: false, side: THREE.DoubleSide }));
    beam.position.y = 2.5;
    const spin = new THREE.Group(); spin.position.y = 1.0;
    g.add(ring, beam, spin); scene.add(g);
    return { x, z, group: g, spin, model: null, gunId: "", ammo: 0, reserve: 0, phase: i * 1.3, life: 0, pop: 1 };
  });
  const rollLife = () => PICKUP_LIFE[0] + Math.random() * (PICKUP_LIFE[1] - PICKUP_LIFE[0]);
  const GUN_IDS = Object.keys(GUNS);
  function relocatePickup(p) {                                    // the old gun vanishes, a new random gun appears somewhere else right now
    let best = null;
    for (let t = 0; t < 40 && pickupPool.length; t++) {
      const c = pickupPool[(Math.random() * pickupPool.length) | 0];
      if (pickups.some((o) => o !== p && Math.hypot(o.x - c[0], o.z - c[1]) < 6)) continue;
      if (Math.hypot(p.x - c[0], p.z - c[1]) < 8) continue;
      best = c; break;
    }
    if (best) { p.x = best[0]; p.z = best[1]; p.group.position.set(p.x, floorTop, p.z); }
    const id = GUN_IDS[(Math.random() * GUN_IDS.length) | 0];
    setPickup(p, id, GUNS[id].mag, GUNS[id].total - GUNS[id].mag);
    p.life = rollLife(); p.pop = 0;
  }
  function updatePickups(dt) {
    for (const p of pickups) {
      p.life -= dt;
      if (p.life <= 0) relocatePickup(p);
      if (p.pop < 1) { p.pop = Math.min(1, p.pop + dt * 3); p.group.scale.setScalar(p.pop); }
    }
  }
  function setPickup(p, id, ammo, reserve) {
    p.gunId = id; p.ammo = ammo; p.reserve = reserve;
    if (p.model) { p.spin.remove(p.model.group); disposeGunModel(p.model); }
    p.model = gunModel(id, 1.1);
    p.spin.add(p.model.group);
  }
  function resetPickups() { pickups.forEach((p, i) => { const id = PICKUP_TYPES[i % PICKUP_TYPES.length]; setPickup(p, id, GUNS[id].mag, GUNS[id].total - GUNS[id].mag); p.life = rollLife(); p.pop = 1; p.group.scale.setScalar(1); }); }
  resetPickups();

  // shared with the modules set up after this one
  Object.assign(G, { pickups, updatePickups, setPickup, resetPickups });
}
