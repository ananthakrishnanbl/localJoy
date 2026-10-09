// Top-vs-top collisions.
//   * Normal bump: a simple elastic bounce, no damage.
//   * DASHING top hits a normal top: the victim is THROWN a long way.
//   * Airborne tops pass over everything (that is what jump is for).

import { PHYSICS, THROW } from "../config.js";
import { TAU, clamp } from "../core/vec.js";
import { isSolid, massOf } from "../entities/top.js";

export function collideTops(list, bus) {
  for (let i = 0; i < list.length; i++) {
    const a = list[i];
    if (!isSolid(a) || a.z > 6) continue;
    for (let j = i + 1; j < list.length; j++) {
      const b = list[j];
      if (!isSolid(b) || b.z > 6) continue;
      resolvePair(a, b, bus);
    }
  }
}

function resolvePair(a, b, bus) {
  const dx = b.x - a.x, dy = b.y - a.y;
  const minD = a.r + b.r;
  let dist = Math.hypot(dx, dy);
  if (dist >= minD) return;

  let nx, ny;
  if (dist < 1e-4) { const ang = Math.random() * TAU; nx = Math.cos(ang); ny = Math.sin(ang); dist = 0; }
  else { nx = dx / dist; ny = dy / dist; }

  const ma = massOf(a), mb = massOf(b);
  const inv = 1 / ma + 1 / mb;

  // Separate the overlap (the lighter top is moved more).
  const overlap = minD - dist;
  a.x -= nx * overlap * (1 / ma) / inv; a.y -= ny * overlap * (1 / ma) / inv;
  b.x += nx * overlap * (1 / mb) / inv; b.y += ny * overlap * (1 / mb) / inv;

  const rvx = b.vx - a.vx, rvy = b.vy - a.vy;
  const vn = rvx * nx + rvy * ny;
  if (vn >= 0) return; // already separating

  // Exactly one of them is dashing -> throw the other one.
  const aDash = a.dashT > 0, bDash = b.dashT > 0;
  if (aDash !== bDash) {
    if (aDash) throwVictim(a, b, nx, ny, bus);
    else throwVictim(b, a, -nx, -ny, bus);
    return;
  }

  // Normal elastic bounce (also used when both are dashing).
  const j = (-(1 + PHYSICS.restitution) * vn) / inv;
  a.vx -= (j * nx) / ma; a.vy -= (j * ny) / ma;
  b.vx += (j * nx) / mb; b.vy += (j * ny) / mb;

  const closing = -vn;
  if (closing > 80) {
    bus.emit({ type: "bump", x: a.x + nx * a.r, y: a.y + ny * a.r, power: clamp(closing / 700, 0, 1.5), slots: [a.slot, b.slot] });
  }
}

// (nx, ny) points from the attacker toward the victim.
function throwVictim(att, vic, nx, ny, bus) {
  let dx = nx, dy = ny;
  const sp = Math.hypot(att.vx, att.vy);
  if (sp > 1) {
    const B = THROW.dashDirBlend;
    dx = nx * (1 - B) + (att.vx / sp) * B;
    dy = ny * (1 - B) + (att.vy / sp) * B;
    const m = Math.hypot(dx, dy) || 1;
    dx /= m; dy /= m;
  }

  vic.vx = dx * THROW.speed;
  vic.vy = dy * THROW.speed;
  vic.thrownT = THROW.stun;
  vic.hitFlash = 1;

  att.vx *= THROW.attackerKeep;
  att.vy *= THROW.attackerKeep;
  att.dashT = Math.min(att.dashT, 0.05); // one hit per dash
  att.hitFlash = 0.6;

  bus.emit({
    type: "throw",
    x: (att.x + vic.x) / 2, y: (att.y + vic.y) / 2,
    dx, dy,
    attacker: att.slot, victim: vic.slot,
  });
}
