// A "top" is one player's spinner. This file only defines the data shape and
// tiny helpers; behaviour lives in physics/ and entities/abilities.js.
// Tops have no health and never slow down: the only way out is falling off.

import { TOP, ABILITY } from "../config.js";

export const STATUS = Object.freeze({
  ALIVE: "alive",       // on the stadium and fighting
  FALLING: "falling",   // went over the edge; plays the fall animation
  OUT: "out",           // gone (also used for spectators who joined mid-round)
});

let nextUid = 1; // unique id per top, so a re-used slot number is never confused

export function createTop(slot) {
  const t = {
    uid: nextUid++,
    slot,
    r: TOP.radius,
    input: { x: 0, y: 0 },              // latest stick value, -1..1
    queue: { dash: false, jump: false }, // button presses waiting for the next step
    cd: { dash: 0, jump: 0 },           // seconds of cooldown left
  };
  resetTop(t, 0, 0);
  t.status = STATUS.OUT;
  t.spectator = true; // not part of a round until the next reset
  return t;
}

export function resetTop(t, x, y) {
  Object.assign(t, {
    x, y, vx: 0, vy: 0,
    z: 0, vz: 0,                 // height above the floor (jump)
    angle: Math.random() * 6.28, // visual rotation only
    status: STATUS.ALIVE,
    spectator: false,
    place: 0,                    // finishing position this round (0 = not decided)
    deadT: 0,                    // seconds since it started falling
    dashT: 0,                    // seconds of dash status left
    thrownT: 0,                  // seconds since being thrown (visual trail)
    hitFlash: 0,
    landed: false,               // set for one step when a jump ends
  });
  t.queue.dash = t.queue.jump = false;
  t.cd.dash = t.cd.jump = 0;
}

export const isAlive = (t) => t.status === STATUS.ALIVE;
export const isSolid = (t) => t.status === STATUS.ALIVE;

// A dashing top is much heavier.
export const massOf = (t) => (t.dashT > 0 ? TOP.mass * ABILITY.dash.mass : TOP.mass);
