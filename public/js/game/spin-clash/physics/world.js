// The fixed-step physics world. Knows nothing about drawing or networking:
// it reads tops from the roster and reports what happened through the bus.

import { MATCH } from "../config.js";
import { shapeAt } from "../core/stadium.js";
import { STATUS } from "../entities/top.js";
import { tickAbilityTimers, processAbilityQueue } from "../entities/abilities.js";
import { integrate } from "./motion.js";
import { collideTops } from "./collisions.js";
import { applyWalls, checkEdge, resolveFalls } from "./arena.js";

export function createWorld({ roster, bus }) {
  // sim.combat    -> falling off the edge eliminates players
  // sim.abilities -> dash & jump buttons are active
  // sim.shape     -> current stadium outline (lobed -> red circle -> yellow circle)
  // sim.wall      -> wall height 0..1 (walls are solid while up)
  const sim = { combat: false, abilities: false, shape: shapeAt(0), wall: 1 };

  function updateStatus(t, h) {
    if (t.hitFlash > 0) t.hitFlash = Math.max(0, t.hitFlash - h * 5);
    if (t.status === STATUS.FALLING) {
      t.deadT += h;
      if (t.deadT > MATCH.fallTime) t.status = STATUS.OUT;
    }
  }

  function step(h) {
    const list = [];
    for (const t of roster.tops.values()) if (t.status !== STATUS.OUT) list.push(t);

    for (const t of list) {
      tickAbilityTimers(t, h);
      if (sim.abilities) processAbilityQueue(t, bus);
      else t.queue.dash = t.queue.jump = false;
      integrate(t, h, sim);
    }

    for (const t of list) {
      if (!t.landed) continue;
      t.landed = false;
      bus.emit({ type: "land", slot: t.slot, x: t.x, y: t.y });
    }

    collideTops(list, bus);

    for (const t of list) applyWalls(t, sim, bus);
    const falls = [];
    for (const t of list) checkEdge(t, sim, falls);
    if (falls.length) resolveFalls(falls, sim, bus);

    for (const t of list) updateStatus(t, h);
  }

  return { step, sim };
}
