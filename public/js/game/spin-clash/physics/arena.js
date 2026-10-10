// The stadium edge.
//   * The flat edge of each lobe has a WALL: tops bounce off it.
//   * The gaps between the lobes have NO wall: a grounded top whose centre goes past the
//     edge falls out there.
//   * Once the walls are down (sim.wall ~ 0) the whole outline is an open edge.
// Jumping keeps you alive over the void until you land.

import { ARENA, PHYSICS } from "../config.js";
import { STATUS } from "../entities/top.js";
import { edgeRadius, wallAxis } from "../core/stadium.js";
import { clamp } from "../core/vec.js";

const WALL_UP = 0.35; // walls count as solid while their height is above this

// Bounce off the flat lobe walls.
export function applyWalls(t, sim, bus) {
  if (sim.wall < WALL_UP || t.status !== STATUS.ALIVE) return;
  const dx = t.x - ARENA.cx, dy = t.y - ARENA.cy;
  if (Math.abs(dx) + Math.abs(dy) < 1e-3) return;

  const axis = wallAxis(Math.atan2(dy, dx));
  if (axis === null) return; // we're in a gap: no wall here

  const nx = Math.cos(axis), ny = Math.sin(axis);
  const plane = edgeRadius(sim.shape, axis);
  const proj = dx * nx + dy * ny;
  const limit = plane - t.r;
  if (proj <= limit) return;

  t.x -= nx * (proj - limit);
  t.y -= ny * (proj - limit);

  const vn = t.vx * nx + t.vy * ny;
  if (vn > 0) {
    const k = (1 + PHYSICS.wallRestitution) * vn;
    t.vx -= k * nx;
    t.vy -= k * ny;
    if (vn > 60) {
      const lat = -dx * ny + dy * nx; // position along the wall
      bus.emit({
        type: "wall", slot: t.slot,
        x: ARENA.cx + nx * plane - ny * lat,
        y: ARENA.cy + ny * plane + nx * lat,
        nx, ny, power: clamp(vn / 700, 0, 1.5),
      });
    }
  }
}

// Collects tops that are over the edge this step (or keeps everyone safe when
// the round is already decided).
export function checkEdge(t, sim, falls) {
  if (t.status !== STATUS.ALIVE) return;
  const dx = t.x - ARENA.cx, dy = t.y - ARENA.cy;
  const d = Math.hypot(dx, dy);
  const edge = edgeRadius(sim.shape, Math.atan2(dy, dx));

  if (!sim.combat) {
    // Round is over: nobody falls any more, gently keep them on the floor.
    const limit = edge - t.r;
    if (d > limit && d > 1e-4) {
      const nx = dx / d, ny = dy / d;
      t.x = ARENA.cx + nx * limit; t.y = ARENA.cy + ny * limit;
      const vn = t.vx * nx + t.vy * ny;
      if (vn > 0) { t.vx -= vn * nx; t.vy -= vn * ny; }
    }
    return;
  }

  if (t.z > 0) return;               // in the air: can still land back inside
  if (d > edge) falls.push({ t, d: d - edge });
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
