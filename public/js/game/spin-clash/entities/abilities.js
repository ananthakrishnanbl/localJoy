// DASH and JUMP. Both are rejected while on cooldown (10 s each, see config).
//  - DASH: a fast charge. If it hits another top, that top is THROWN (see physics/collisions.js).
//  - JUMP: lifts you off the floor so dashes pass under you and you pass over other tops.

import { ABILITY, ARENA } from "../config.js";
import { isAlive } from "./top.js";

export function tickAbilityTimers(t, h) {
  if (t.cd.dash > 0) t.cd.dash = Math.max(0, t.cd.dash - h);
  if (t.cd.jump > 0) t.cd.jump = Math.max(0, t.cd.jump - h);
  if (t.thrownT > 0) t.thrownT = Math.max(0, t.thrownT - h);
  if (t.dashT > 0) {
    t.dashT = Math.max(0, t.dashT - h);
    if (t.dashT === 0) brake(t); // dash over: don't slide off the edge
  }
}

function brake(t) {
  const s = Math.hypot(t.vx, t.vy);
  const cap = ABILITY.dash.brakeSpeed;
  if (s > cap) { t.vx *= cap / s; t.vy *= cap / s; }
}

// Button presses are queued by input.js and consumed here, inside the fixed step.
export function processAbilityQueue(t, bus) {
  const { dash, jump } = t.queue;
  t.queue.dash = t.queue.jump = false;
  if (dash) tryDash(t, bus);
  if (jump) tryJump(t, bus);
}

export function tryDash(t, bus) {
  if (!isAlive(t) || t.z > 0 || t.cd.dash > 0) return false;

  // Direction: stick > current motion > toward the centre.
  let dx = t.input.x, dy = t.input.y, m = Math.hypot(dx, dy);
  if (m < 0.25) {
    dx = t.vx; dy = t.vy; m = Math.hypot(dx, dy);
    if (m < 30) { dx = ARENA.cx - t.x; dy = ARENA.cy - t.y; m = Math.hypot(dx, dy) || 1; }
  }
  dx /= m; dy /= m;

  const D = ABILITY.dash;
  t.vx = t.vx * 0.25 + dx * D.speed;
  t.vy = t.vy * 0.25 + dy * D.speed;
  t.dashT = D.duration;
  t.cd.dash = ABILITY.cooldown;
  bus.emit({ type: "dash", slot: t.slot, x: t.x, y: t.y, dx, dy });
  return true;
}

export function tryJump(t, bus) {
  if (!isAlive(t) || t.z > 0 || t.cd.jump > 0) return false;
  t.vz = ABILITY.jump.vz;
  t.cd.jump = ABILITY.cooldown;
  bus.emit({ type: "jump", slot: t.slot, x: t.x, y: t.y });
  return true;
}
