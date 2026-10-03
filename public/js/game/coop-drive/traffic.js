import * as THREE from "./three.js";
import { createCarMesh } from "./car.js";
import { START_S } from "./track.js";

export const TRAFFIC = {
  spawnAhead: 260,
  despawnBehind: 70,
  gapStart: 70, gapEnd: 50, 
  pairChance: 0,          
  aggression: 0,          
  signalTime: [0.25, 0.5], 
  mergeSpeed: [4.5, 8],     
  changeEvery: [9999, 9999],  
  speed: [9, 19],           
  maxCars: 6,
};

const COLORS = [0x8a8f98, 0xb5b0a0, 0x6a7fa0, 0xa87c5a, 0x7e9a7e, 0x9a6a9a];
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerp = (a, b, t) => a + (b - a) * t;

export function createTraffic(scene, track, rng) {
  const cars = [];
  let nextS = START_S + 120;
  let lead = START_S;
  const tmp = {};
  const R = (a, b) => a + (b - a) * rng();

  const blinkGeo = new THREE.BoxGeometry(0.35, 0.25, 0.2);
  const blinkMat = new THREE.MeshBasicMaterial({ color: 0xffa000 });

  function makeBlinkers() {
    const left = new THREE.Group(), right = new THREE.Group();
    for (const [grp, x] of [[left, 0.95], [right, -0.95]]) {
      for (const z of [2.1, -2.1]) {
        const m = new THREE.Mesh(blinkGeo, blinkMat);
        m.position.set(x, 0.8, z);
        grp.add(m);
      }
      grp.visible = false;
    }
    return { left, right };
  }

  function spawn(s, d) {
    const mesh = createCarMesh(COLORS[Math.floor(rng() * COLORS.length)]);
    const blink = makeBlinkers();
    mesh.root.add(blink.left, blink.right);
    scene.add(mesh.root);
    const base = R(TRAFFIC.speed[0], TRAFFIC.speed[1]);
    cars.push({
      s, d, targetD: d, baseSpeed: base, speed: base, state: "drive",
      timer: R(TRAFFIC.changeEvery[0], TRAFFIC.changeEvery[1]), signal: 0, mergeSpeed: 6,
      mesh, blink, box: { x: 0, z: 0, h: 0, hw: 1, hl: 2.1 },
    });
  }

  const nearestLane = (lanes, d) => lanes.reduce((b, l) => (Math.abs(l - d) < Math.abs(b - d) ? l : b), lanes[0]);

  function remove(i) {
    const c = cars[i];
    scene.remove(c.mesh.root);
    c.mesh.dispose();
    cars.splice(i, 1);
  }

  function update(dt, t, players) {
    const alive = players.filter((p) => p.alive);
    if (alive.length) lead = Math.max(...alive.map((p) => p.progress));
    const tail = alive.length ? Math.min(...alive.map((p) => p.progress)) : null;
    
    // Scale difficulty evenly from 0 to 1 over the 2000m race track
    const diff = clamp((lead - START_S) / 2000, 0, 1);

    while (nextS < lead + TRAFFIC.spawnAhead && cars.length < TRAFFIC.maxCars) {
      const lanes = track.lanesAt(nextS);
      if (lanes.length >= 3) {
        const first = Math.floor(rng() * lanes.length);
        spawn(nextS, lanes[first]);
        if (rng() < TRAFFIC.pairChance * (0.4 + 0.6 * diff)) {
          let k; do { k = Math.floor(rng() * lanes.length); } while (k === first);
          spawn(nextS + R(-4, 4), lanes[k]);
        }
      }
      nextS += lerp(TRAFFIC.gapStart, TRAFFIC.gapEnd, diff) * R(0.6, 1.4);
    }

    for (let i = cars.length - 1; i >= 0; i--) {
      const c = cars[i];
      if (tail !== null && c.s < tail - TRAFFIC.despawnBehind) { remove(i); continue; }

      let sp = c.baseSpeed;
      for (const o of cars) if (o !== c && o.s > c.s && o.s - c.s < 16 && Math.abs(o.d - c.d) < 2.4) sp = Math.min(sp, o.speed);
      c.speed += (sp - c.speed) * Math.min(1, 3 * dt);
      c.s += c.speed * dt;

      const lanes = track.lanesAt(c.s);

      if (c.state === "drive") {
        c.d += (nearestLane(lanes, c.d) - c.d) * Math.min(1, 2 * dt);
        c.timer -= dt;
        if (c.timer <= 0) {
          let target;
          let prey = null;
          for (const p of alive) {
            const gap = c.s - p.progress;
            if (gap > 8 && gap < 70 && (!prey || gap < c.s - prey.progress)) prey = p;
          }
          if (prey && rng() < TRAFFIC.aggression * diff) target = nearestLane(lanes, prey.d);
          else target = lanes[Math.floor(rng() * lanes.length)];
          
          if (Math.abs(target - c.d) > 1) {
            c.targetD = target;
            c.state = "signal";
            c.signal = R(TRAFFIC.signalTime[0], TRAFFIC.signalTime[1]);
            c.mergeSpeed = R(TRAFFIC.mergeSpeed[0], TRAFFIC.mergeSpeed[1]) * (0.8 + 0.4 * diff);
          } else {
            c.timer = R(TRAFFIC.changeEvery[0], TRAFFIC.changeEvery[1]);
          }
        }
      } else if (c.state === "signal") {
        c.signal -= dt;
        const on = Math.floor(c.signal * 12) % 2 === 0;
        const rightSide = c.targetD > c.d;
        c.blink.right.visible = rightSide && on;
        c.blink.left.visible = !rightSide && on;
        if (c.signal <= 0) { c.state = "merge"; c.blink.left.visible = c.blink.right.visible = false; }
      } else if (c.state === "merge") {
        const diffD = c.targetD - c.d, step = c.mergeSpeed * dt;
        if (Math.abs(diffD) <= step) {
          c.d = c.targetD;
          c.state = "drive";
          c.timer = R(TRAFFIC.changeEvery[0], TRAFFIC.changeEvery[1]) * lerp(1, 0.6, diff);
        } else c.d += Math.sign(diffD) * step;
      }

      const lim = Math.max(0, track.halfAt(c.s) - 1.3);
      c.d = clamp(c.d, -lim, lim);

      track.sample(c.s, c.d, tmp);
      c.mesh.root.position.set(tmp.x, 0, tmp.z);
      c.mesh.root.rotation.y = tmp.h;
      c.box.x = tmp.x; c.box.z = tmp.z; c.box.h = tmp.h;
    }
  }

  return {
    cars, update,
    dispose() {
      for (let i = cars.length - 1; i >= 0; i--) remove(i);
      blinkGeo.dispose();
      blinkMat.dispose();
    },
  };
}