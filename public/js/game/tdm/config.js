// TEAM DEATHMATCH  -  /js/game/tdm/config.js
// Every number you may want to tweak, plus the small helper functions shared by all the other files.

/* ================= SETTINGS ================= */
export const THREE_CDN = "https://cdn.jsdelivr.net/npm/three@0.160.0";                      // used when the page has no import map for "three"
export const MAP_FILES = [new URL("./assets/map.glb", import.meta.url).href, "/js/game/tdm/assets/map.glb"];
export const MAP_SCALE = 2;                // the map is drawn twice as big, characters keep their size
export const NO_COLLISION = [];            // map pieces to walk through, by name, e.g. ["gate-metal-bars"]

export const START_HP = 100;               // everybody starts with full health
export const MEDKIT_HEAL = 40;             // health a med-kit gives back
export const MEDKIT_RESPAWN = 8;           // seconds until a used med-kit shows up again (always on the same spot)
export const MEDKIT_CORNERS = 2;           // med-kits sit in the exact middle of the map + on this many RANDOM corners (new random corners every match)
export const MATCH_TIME = 300;             // match length in seconds (5 minutes): most kills when time runs out wins
export const OVERTIME = true;              // tied when time is up? true = sudden death (first clear lead wins); false = it's a draw
export const RESPAWN_TIME = 7;             // seconds down after dying
export const SPAWN_PROTECT = 1.5;          // seconds nobody can hurt you after respawning
export const LOOK_YAW = 2.4, LOOK_PITCH = 1.7;   // drag-to-look: radians turned per full phone-height of dragging (raise = more sensitive)
export const HIT_R_BASE = 0.5;             // how close to a player a bullet must pass to hit
export const CHAR_COUNT = 6;               // char1.glb ... char6.glb
export const MAX_FIGHTERS = 4;             // split-screen cells (the console allows more phones, the extra ones wait for the next round)
export const PICKUP_COUNT = 6;             // gun pickups on the map
export const PICKUP_SEED = 1337;           // fixed seed: the pickup spots are the same in every game (change to move them)
export const PICKUP_TYPES = ["g3", "g4", "g5"];   // what lies on the pickup spots at the start of every match (repeats in this order)
export const PICKUP_RANGE = 2.2;           // how close you must stand to a pickup to PICK it
export const PICKUP_LIFE = [18, 40];       // every floor gun vanishes after a random time in this range (seconds); a new random gun appears at a new random spot
export const PICKUP_ANIM = 0.6;            // seconds the "pick-up" animation plays
export const HIT_FLASH = 0.6;              // seconds the red damage flash lasts
export const TEAM_TINT = 0.45;             // how strongly a soldier is tinted with his team / own colour (0 = plain character, 1 = fully coloured)

// Every gun. Damage order: g1 = g2 < g3 < g5 < g4. g3 fires fastest. delay = seconds between shots.
// range = how far a bullet flies (world units); total = magazine + spare bullets (when both are empty the gun is dry).
export const GUNS = {
  g1: { id: "g1", name: "STINGER", dmg: 9,  delay: 0.16, mag: 30, reload: 1.6, kick: 1.0, range: 45,  total: 120 },
  g2: { id: "g2", name: "FALCON",  dmg: 9,  delay: 0.16, mag: 30, reload: 1.6, kick: 1.0, range: 60,  total: 120 },
  g3: { id: "g3", name: "HORNET",  dmg: 12, delay: 0.08, mag: 20, reload: 1.8, kick: 0.7, range: 30,  total: 140 },
  g5: { id: "g5", name: "THUNDER", dmg: 18, delay: 0.22, mag: 40, reload: 2.0, kick: 1.2, range: 80,  total: 160 },
  g4: { id: "g4", name: "REAPER",  dmg: 34, delay: 0.55, mag: 20, reload: 2.4, kick: 1.8, range: 150, total: 60 },
};
export const START_GUNS = ["g1", "g2"];    // carried on every spawn; one of them (random) is in hand

// SCOPE (see scope.js). Tap SCOPE (or double-tap the look area) on the phone: the view becomes a scope and zooms by the gun's RANGE.
//   zoom    comes from the range: the further a gun shoots, the closer the scope pulls the view (SCOPE_ZOOM.min up to SCOPE_ZOOM.max)
//   sens    extra look-speed multiplier while fully zoomed (1 = none). Turning is ALSO divided by the zoom, so a high zoom is slow and precise
//   speed   walking speed multiplier while fully zoomed
// Scope switches itself off when you swap, pick up, reload or die. You cannot scope while reloading.
export const SCOPE_EASE = 12;              // how fast the zoom eases in / out (higher = snappier)
export const SCOPE_ZOOM = { min: 1.25, max: 3 };   // the shortest-range gun zooms min, the longest-range gun zooms max (the map is small, so 3x is the top)
const _r = Object.values(GUNS).map((g) => g.range), R_MIN = Math.min(..._r), R_MAX = Math.max(..._r);
const zoomOf = (id) => +(SCOPE_ZOOM.min + ((GUNS[id].range - R_MIN) / (R_MAX - R_MIN)) * (SCOPE_ZOOM.max - SCOPE_ZOOM.min)).toFixed(1);
export const SCOPE = {
  g3: { zoom: zoomOf("g3"), sens: 0.9,  speed: 0.9  },      // HORNET
  g1: { zoom: zoomOf("g1"), sens: 0.9,  speed: 0.85 },      // STINGER
  g2: { zoom: zoomOf("g2"), sens: 0.9,  speed: 0.8  },      // FALCON
  g5: { zoom: zoomOf("g5"), sens: 0.85, speed: 0.7  },      // THUNDER
  g4: { zoom: zoomOf("g4"), sens: 0.85, speed: 0.55 },      // REAPER
};

// First-person gun, drawn in its own pass with its own camera (see models.js).
export const VIEW_GUN = { fov: 55, depth: 0.55, ax: 0.30, ay: -0.52, maxLen: 0.5, scale: 0.5 };
// Third-person gun in the right hand (numbers are in the arm-right bone's own space).
export const HAND_GUN = { bone: "arm-right", pos: [-0.316, 0.025, 0.0625], rot: [0, (2 * Math.PI) / 3, 0], len: 0.5 };
// The spare gun hangs diagonally on the soldier's back.
export const BACK_GUN = { pos: [0.1, 1.9 * 0.62, -0.16], tilt: 0.55, len: 0.8 };
// While a soldier walks / runs the arms are kept in the "holding-right" pose so the gun is always raised.
export const HOLD_POSE = { clip: "holding-right", arms: ["arm-right", "arm-left"], pitchFollow: 0.8 };
export const ANIM = { idle: "holding-right", idleAlt: "idle", walk: "walk", run: "sprint", shoot: "holding-right-shoot", die: "die", pick: "pick-up" };
/* ============================================ */

// The two team colours, and the three choices on the select screen (stick left / right): RED team, SOLO (fight alone), BLUE team.
export const TEAMS = [
  { name: "RED",  color: "#e5484d", hex: 0xe5484d },    // defends the NORTH room
  { name: "BLUE", color: "#3b8bff", hex: 0x3b8bff },    // defends the SOUTH room
];
export const SIDES = [
  { name: "RED",  team: 0,  color: TEAMS[0].color },
  { name: "SOLO", team: -1, color: "#46c37b" },
  { name: "BLUE", team: 1,  color: TEAMS[1].color },
];

/* ---------------- small helpers ---------------- */
export const clampN = (v, a, b) => Math.max(a, Math.min(b, v));
export const num = (v) => (Number.isFinite(+v) ? +v : 0);
export const stickVal = (v) => clampN(num(v), -1, 1);
// Character + gun models: this game's own assets/ folder first, then the CTF game's (so the same models can be shared).
export const assetUrls = (rel) => [new URL("./assets/" + rel, import.meta.url).href, "/js/game/tdm/assets/" + rel, "/js/game/ctf/assets/" + rel];
export function mulberry32(a) { return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
export const h = (tag, cls, text) => {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text !== undefined) n.textContent = text;
  return n;
};
export const fmtClock = (t) => `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, "0")}`;