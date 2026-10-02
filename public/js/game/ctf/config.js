// Every setting of the game, in one place. Change numbers here, not in the code.

/* ================= SETTINGS ================= */
export const THREE_CDN = "https://cdn.jsdelivr.net/npm/three@0.160.0";                       // used when the page has no import map for "three"
export const MAP_FILES = [new URL("./assets/map.glb", import.meta.url).href, "/js/game/ctf/assets/map.glb"];  // public/js/game/ctf/assets/map.glb (relative to this file first, absolute path as fallback)
export const TEXTURES = [new URL("./assets/colormap.png", import.meta.url).href];  // optional; the map's own embedded texture is used if none is found
export const MAP_SCALE = 2;                       // same as index.html: map twice as big, characters keep their size
export const NO_COLLISION = [];                   // map pieces to walk through, by name, e.g. ["gate-metal-bars"]
export const MID_HALF = { x: 14, z: 10 };         // half size of the middle room (before MAP_SCALE): med-kits only appear inside it

export const START_HP = 100;                      // everybody starts with full health
export const BULLET_DAMAGE = 9;                   // health lost per bullet
export const FIRE_DELAY = 0.16;                   // seconds between shots (hold FIRE for auto fire)
export const MEDKIT_COUNT = 3;                    // med-kits in the middle room at the same time
export const MEDKIT_HEAL = 40;                    // health a med-kit gives back
export const MEDKIT_RESPAWN = 8;                  // seconds until a used med-kit shows up again, somewhere else
export const MATCH_TIME = 300;                    // match length in seconds (5 minutes): most captures when time runs out wins
export const OVERTIME = true;                     // tied when time is up? true = sudden death, next capture wins; false = it's a draw
export const RESPAWN_TIME = 7;                    // seconds down after dying
export const SPAWN_PROTECT = 1.5;                 // seconds nobody can hurt you after respawning
export const FLAG_RETURN_TIME = 20;               // a dropped flag goes home by itself after this many seconds
export const REQUIRE_OWN_FLAG = false;            // true = you can only score while your own flag is at home
export const YAW_RATE = 2.6, PITCH_RATE = 1.8;    // (old stick look speed, no longer used: the phone drags to look now)
export const LOOK_YAW = 2.4, LOOK_PITCH = 1.7;    // drag-to-look: radians turned per full phone-height of dragging (raise = more sensitive)
export const HIT_R_BASE = 0.5;                     // how close to a player a bullet must pass to hit
export const CHAR_COUNT = 6;                      // char1.glb ... char6.glb
export const PICKUP_COUNT = 6;                    // gun pickups on the map
export const PICKUP_SEED = 1337;                  // fixed seed: the pickup spots are the same in every game (change to move them)
export const PICKUP_TYPES = ["g3", "g4", "g5"];   // what lies on the pickup spots at the start of every match (repeats in this order)
export const PICKUP_RANGE = 2.2;                  // how close you must stand to a pickup to PICK it
export const PICKUP_LIFE = [18, 40];              // every floor gun vanishes after a random time in this range (seconds); a new random gun appears at a new random spot
export const PICKUP_ANIM = 0.6;                   // seconds the "pick-up" animation plays

// Every gun. Damage order: g1 = g2 < g3 < g5 < g4. g3 fires fastest. delay = seconds between shots.
export const GUNS = {
  // range = how far a bullet flies (world units); anything further away is not hit.
  // total = every bullet the gun holds in all (the magazine + the spare ones). Reloading moves spare bullets into the magazine; when all are gone the gun is empty.
  g1: { id: "g1", name: "STINGER",  dmg: 9,  delay: 0.16, mag: 30, reload: 1.6, kick: 1.0, range: 45, total: 120 },
  g2: { id: "g2", name: "FALCON",   dmg: 9,  delay: 0.16, mag: 30, reload: 1.6, kick: 1.0, range: 60, total: 120 },
  g3: { id: "g3", name: "HORNET",   dmg: 12, delay: 0.08, mag: 20, reload: 1.8, kick: 0.7, range: 30, total: 140 },
  g5: { id: "g5", name: "THUNDER",  dmg: 18, delay: 0.22, mag: 40, reload: 2.0, kick: 1.2, range: 80, total: 160 },
  g4: { id: "g4", name: "REAPER",   dmg: 34, delay: 0.55, mag: 20, reload: 2.4, kick: 1.8, range: 150, total: 60 },
};
export const START_GUNS = ["g1", "g2"];           // carried on every spawn; one of them (random) is in hand
// First-person gun. It is drawn in its OWN pass with its OWN camera (fixed fov, normal depth testing), so it never stretches with the split-screen
// cell shape and never z-fights with itself. ax / ay = where the gun sits on the screen as a fraction of the half width / half height
// (+ = right / up), depth = distance in front of the camera, maxLen / scale = size (same meaning as before, in camera units).
export const VIEW_GUN = { fov: 55, depth: 0.55, ax: 0.30, ay: -0.52, maxLen: 0.5, scale: 0.5 };
// Third-person gun in the right hand. Numbers are in the arm-right BONE's own space (model units, before the model is scaled up to H).
// In this rig the arm points along the bone's X axis (T-pose), the fist is at x = -0.28, and the "holding-right" pose turns the bone 60 degrees about Y,
// so the barrel (-Z of the gun) has to be turned 120 degrees about Y to point straight forward. Tweak pos / len if a gun sits a little off.
export const HAND_GUN = { bone: "arm-right", pos: [-0.316, 0.025, 0.0625], rot: [0, (2 * Math.PI) / 3, 0], len: 0.5 };
// The spare gun hangs diagonally on the soldier's back (position in the soldier's own space, before the group is turned; -Z = behind him).
export const BACK_GUN = { pos: [0.1, 1.9 * 0.62, -0.16], tilt: 0.55, len: 0.8 };
// While a soldier walks / runs the arms are kept in the "holding-right" pose, so the gun is always raised in front of him
// (the walk / sprint clips swing the arms about). The gun arm also follows the up / down look angle (pitchFollow: 0 = off, 1 = full).
export const HOLD_POSE = { clip: "holding-right", arms: ["arm-right", "arm-left"], pitchFollow: 0.8 };
// The stolen flag is carried on the back, clear of the body and above the head, so other players can see it.
export const CARRY_FLAG = { pos: [-0.45, 0.3, -0.95], scale: 0.65 };
export const TEAM_TINT = 0.45;                    // how strongly a soldier is tinted with his team colour (0 = plain character, 1 = fully coloured)
export const ANIM = { idle: "holding-right", idleAlt: "idle", walk: "walk", run: "sprint", shoot: "holding-right-shoot", die: "die", pick: "pick-up" };
export const HIT_FLASH = 0.6;                     // seconds the red damage flash lasts
/* ============================================ */

export const TEAMS = [
  { name: "RED", color: "#e5484d", hex: 0xe5484d },    // defends the WEST end room
  { name: "BLUE", color: "#3b8bff", hex: 0x3b8bff },   // defends the EAST end room
];
