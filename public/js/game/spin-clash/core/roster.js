// The roster owns every top, keyed by player slot, and lays them out for a round.

import { ARENA } from "../config.js";
import { TAU, shuffle } from "./vec.js";
import { createTop, resetTop, isAlive } from "../entities/top.js";

export function createRoster() {
  const tops = new Map();
  let dirty = false; // someone joined/left since the last layout

  return {
    tops,
    get size() { return tops.size; },
    get(slot) { return tops.get(slot); },
    list() { return [...tops.values()]; },
    alive() { return [...tops.values()].filter(isAlive); },
    findByUid(uid) { for (const t of tops.values()) if (t.uid === uid) return t; return null; },
    isDirty() { return dirty; },

    add(slot) {
      if (tops.has(slot)) return tops.get(slot);
      const t = createTop(slot);
      tops.set(slot, t);
      dirty = true;
      return t;
    },

    remove(slot) {
      if (tops.delete(slot)) dirty = true;
    },

    clearQueues() {
      for (const t of tops.values()) t.queue.dash = t.queue.jump = false;
    },

    // Everyone back on the stadium, evenly spaced on a circle (random order).
    resetForRound() {
      const list = shuffle([...tops.values()]);
      const n = list.length;
      const offset = Math.random() * TAU;
      const d = ARENA.radius * ARENA.spawnRatio;
      list.forEach((t, i) => {
        const a = offset + (i / n) * TAU;
        resetTop(t, ARENA.cx + Math.cos(a) * d, ARENA.cy + Math.sin(a) * d);
      });
      dirty = false;
    },
  };
}
