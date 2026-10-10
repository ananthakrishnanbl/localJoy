// Per-top movement: steering, gentle bowl slope, drag and the jump arc.

import { ABILITY, ARENA, PHYSICS } from "../config.js";
import { STATUS } from "../entities/top.js";

export function integrate(t, h, sim) {
  // A top that went over the edge just keeps drifting while it falls.
  if (t.status === STATUS.FALLING) {
    const k = Math.exp(-0.5 * h);
    t.vx *= k; t.vy *= k;
    t.x += t.vx * h; t.y += t.vy * h;
    return;
  }

  // ---- vertical (jump) -------------------------------------------------
  if (t.z > 0 || t.vz > 0) {
    t.vz -= ABILITY.jump.gravity * h;
    t.z += t.vz * h;
    if (t.z <= 0) { t.z = 0; t.vz = 0; t.landed = true; }
  }
  const grounded = t.z <= 0;

  // ---- forces ----------------------------------------------------------
  const control = grounded ? 1 : PHYSICS.airControl;
  let ax = t.input.x * PHYSICS.moveAccel * control;
  let ay = t.input.y * PHYSICS.moveAccel * control;

  if (grounded) {
    // shallow bowl: a gentle slide toward the middle
    const dx = t.x - ARENA.cx, dy = t.y - ARENA.cy;
    const d = Math.hypot(dx, dy);
    if (d > 1e-3) {
      const pull = PHYSICS.dishPull * Math.min(1, d / sim.shape.base);
      ax -= (dx / d) * pull;
      ay -= (dy / d) * pull;
    }
  }

  t.vx += ax * h;
  t.vy += ay * h;

  // ---- drag ------------------------------------------------------------
  const drag = grounded ? (t.dashT > 0 ? PHYSICS.dashDrag : PHYSICS.drag) : PHYSICS.airDrag;
  const k = Math.exp(-drag * h);
  t.vx *= k; t.vy *= k;

  // ---- speed cap + move -----------------------------------------------
  const sp = Math.hypot(t.vx, t.vy);
  if (sp > PHYSICS.maxSpeed) { t.vx *= PHYSICS.maxSpeed / sp; t.vy *= PHYSICS.maxSpeed / sp; }
  t.x += t.vx * h;
  t.y += t.vy * h;
}
