// =====================================================================
//  SPIN CLASH - every tunable number lives in this file.
//  Change values here to re-balance the game; no other file has magic numbers.
// =====================================================================

export const CANVAS = { w: 1280, h: 720 };

export const ARENA = {
  cx: 640,
  cy: 360,
  radius: 322,       // stadium radius (px). There are NO walls: fall off = out.
  spawnRatio: 0.6,   // spawn circle as a fraction of the radius
};

// Stops endless stalemates: after `delay` seconds of a round the stadium
// slowly shrinks. Set enabled:false to turn it off.
export const SHRINK = {
  enabled: true,
  delay: 25,         // seconds into the round before it starts
  duration: 35,      // seconds to shrink to the minimum
  minRadius: 110,
  growSpeed: 300,    // px/s the stadium re-grows between rounds
};

export const TOP = { radius: 26, mass: 1 };

export const PHYSICS = {
  step: 1 / 120,       // fixed simulation step (seconds)
  maxFrame: 0.05,      // longest real frame we simulate (seconds)

  moveAccel: 560,      // px/s^2 at full stick   -> top speed ~ moveAccel / drag
  airControl: 0.3,     // steering while jumping
  drag: 1.25,          // ground drag (1/s)
  dashDrag: 0.35,      // drag while dashing (keeps the charge going)
  airDrag: 0.25,       // little drag in the air: a jump carries momentum
  dishPull: 90,        // px/s^2 gentle pull toward the centre (shallow bowl)
  maxSpeed: 1300,
  restitution: 0.9,    // normal top-vs-top bounciness
};

export const ABILITY = {
  cooldown: 10,          // seconds, for BOTH dash and jump
  dash: {
    speed: 780,          // velocity burst (px/s)
    duration: 0.3,       // seconds of "battering ram" status
    mass: 2.4,           // mass multiplier while dashing
    brakeSpeed: 300,     // speed is capped to this when the dash ends (so you don't slide off)
  },
  jump: {
    vz: 560,             // take-off speed (airtime ~0.75 s)
    gravity: 1500,
  },
};

// What happens when a DASHING top hits a normal top.
export const THROW = {
  speed: 400,            // launch speed of the victim (travels ~ speed / drag px, about one stadium radius)
  dashDirBlend: 0.6,     // 0 = thrown away from contact point, 1 = thrown along the dash direction
  attackerKeep: 0.3,     // fraction of speed the attacker keeps after the hit
  stun: 0.6,             // seconds the victim keeps the "thrown" trail
};

export const SCORING = {
  rounds: 3,
  // points by finishing position: 1st, 2nd, 3rd ... (missing entries = 0)
  points: [10, 7, 5, 4, 3, 2, 1, 0, 0, 0],
};

export const MATCH = {
  minPlayers: 2,
  countdown: 3,          // seconds
  roundEnd: 6,           // seconds the round results stay up
  final: 20,             // seconds the final leaderboard stays up, then a new game starts
  fallTime: 1.0,         // seconds the falling animation lasts
  hudInterval: 0.25,     // how often phones receive their status text
};
