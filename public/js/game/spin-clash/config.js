// =====================================================================
//  SPIN CLASH - every tunable number lives in this file.
//  Change values here to re-balance the game; no other file has magic numbers.
// =====================================================================

export const CANVAS = { w: 1280, h:720 };

export const SOUND = { volume: 0.6 };

export const ARENA = {
  cx: 640,
  cy: 360,
  radius: 360,        // reach of the lobe corners (px)
  spawnRatio: 0.55,   // spawn circle as a fraction of the radius
  // Beyblade-X style outline: 4 flat-edged lobes with open gaps (bays) between them.
  // The flat lobe edges have a WALL (spinners bounce off); the gaps have no wall, so
  // that is where spinners fall out. The walls go down when the shrinking starts.
  lobes: 4,
  lobeFlatDeg: 20,    // half-width of each flat, walled lobe edge (degrees, seen from the centre)
  bayRatio: 0.76,     // how deep the gaps cut in (their bottom radius / radius)
};

// Stops endless stalemates. The round starts with the walls up. When the shrinking
// begins the walls go down, and the stadium closes in from the lobed shape to the
// RED circle, then to the YELLOW circle (both are drawn on the floor).
export const SHRINK = {
  enabled: true,
  delay: 30,          // seconds of full stadium (walls up) before the walls start to go down
  toRed: 40,          // seconds to close from the lobed shape to the red circle
  holdRed: 25,        // seconds the red circle stays
  toYellow: 40,       // seconds to close from the red to the yellow circle
  warn: 3,            // seconds of warning before the walls drop / each shrink starts
  wallDown: 2,        // seconds the walls take to lower
  wallUp: 0.8,        // seconds the walls take to rise again before a round
  redRadius: 205,
  yellowRadius: 130,
  regrow: 1.4,        // how fast the stadium re-forms between rounds (stages per second)
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
  wallRestitution: 0.7,// how lively the lobe walls bounce you back
};

export const ABILITY = {
  cooldown: 6,          // seconds, for BOTH dash and jump
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
