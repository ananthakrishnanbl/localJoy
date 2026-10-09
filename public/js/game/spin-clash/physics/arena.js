// The stadium has NO walls. A grounded top whose centre is beyond the edge
// falls off and is out. Jumping keeps you alive over the void until you land.

import { ARENA } from "../config.js";
import { STATUS } from "../entities/top.js";

// Collects tops that are over the edge this step (or keeps everyone safe when
// the round is already decided).
export function checkEdge(t, sim, falls) {
  if (t.status !== STATUS.ALIVE) return;
  const dx = t.x - ARENA.cx, dy = t.y - ARENA.cy;
  const d = Math.hypot(dx, dy);

  if (!sim.combat) {
    // Round is over: nobody falls any more, gently keep them on the floor.
    const limit = sim.radius - t.r;
    if (d > limit && d > 1e-4) {
      const nx = dx / d, ny = dy / d;
      t.x = ARENA.cx + nx * limit; t.y = ARENA.cy + ny * limit;
      const vn = t.vx * nx + t.vy * ny;
      if (vn > 0) { t.vx -= vn * nx; t.vy -= vn * ny; }
    }
    return;
  }

  if (t.z > 0) return;               // in the air: can still land back inside
  if (d > sim.radius) falls.push({ t, d });
}

// Several tops can fall in the same step: the one furthest out counts as eliminated first
// (i.e. finishes lower), so the finishing order is always well defined.
export function resolveFalls(falls, sim, bus) {
  falls.sort((p, q) => q.d - p.d);
  for (const { t } of falls) {
    t.status = STATUS.FALLING;
    t.deadT = 0;
    t.dashT = 0;
    bus.emit({ type: "out", slot: t.slot, uid: t.uid, x: t.x, y: t.y });
  }
}
