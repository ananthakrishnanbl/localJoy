// Shared game state: match phase, clocks, roster (lobby), characters, scores, temporary effects.
// The values that change while playing live on  G.S  (see main.js).

import { MATCH_TIME } from "../config.js";

export function setupState(G) {
  const S = G.S;

  /* ---------------- game state ---------------- */
  S.phase = "teams";                      // teams -> count -> play -> over -> teams
  S.countT = 0; S.overT = 0; S.bannerT = 0; S.tNow = 0;
  S.matchT = MATCH_TIME; S.overtime = false;   // match clock (seconds left) and sudden-death flag
  const roster = new Map();                 // everybody connected: slot -> { pos: -1 red | 0 undecided | 1 blue, ready, latch }
  const chars = new Map();                  // players in the match: slot -> character
  const caps = [0, 0];
  const temps = [], decals = [];
  S.views = [];                           // [{ ch, el, ... }]  one per split-screen cell
  S.statsEl = null;

  // shared with the modules set up after this one
  Object.assign(G, { roster, chars, caps, temps, decals });
}
