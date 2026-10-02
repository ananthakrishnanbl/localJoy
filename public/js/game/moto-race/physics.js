// Bike physics. Pure maths, no Three.js, so it is easy to tweak and test.
//
// World: x/z is the ground plane, y is up. Heading psi: forward = (sin psi, cos psi).
// Increasing psi turns LEFT (counter-clockwise seen from above). "lateral" is the bike's left.
//
// The model, in a nutshell:
//  - Velocity is kept in world space and split every step into forward (vf) and sideways (vl) parts.
//  - Forward: engine force that fades toward top speed, quadratic air drag, rolling resistance,
//    engine braking and a brake that never reverses the bike.
//  - Sideways: the tires push against vl with a spring-like grip, capped by a friction limit
//    (mu * g). Past the limit the bike slides, which is what makes drifting and braking-in-corners work.
//  - Yaw: the steering sets a target turn rate that is limited by low-speed steering lock and
//    by what the tires can hold at the current speed, so full lock at 150 km/h is gentle.
//  - Sand: low grip, heavy drag, weak engine.

export const G = 9.81;
export const BIKE_RADIUS = 2.3;      // collision circle, sized for the larger bike models

const ENGINE = 18;          // m/s^2 at zero speed, full throttle
const VMAX = 70;            // engine stops pulling here (drag keeps real top speed lower, ~190 km/h)
const BRAKE = 30;           // m/s^2
const DRAG = 0.0016;        // quadratic air drag
const ROLL = 0.5;           // rolling resistance
const ENGINE_BRAKE = 2.5;   // slowdown when off the throttle
const GRIP = 9;             // tire stiffness (1/s)
const MU_ROAD = 1.9;        // friction coefficient on tarmac (times g)
const MU_SAND = 0.7;
const SAND_DRAG = 1.0;      // extra linear drag on sand: bleeds off high speed quickly, then settles
const SAND_POWER = 0.5;     // engine strength on sand. With the drag above, top speed on sand is ~30 km/h
const WHEELBASE = 2.4;      // scaled up with the bigger bike and track
const MAX_LOCK = 0.55;      // steering lock in radians at walking pace

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

export function createBike(x, z, psi) {
  return {
    x, z, psi,
    vx: 0, vz: 0,
    omega: 0,                 // yaw rate, rad/s, positive = turning left
    steer: 0, throttle: 0, brake: 0,   // smoothed rider inputs
    lean: 0, pitch: 0,        // visual only
    speed: 0, slip: 0,
  };
}

// inp: { steer: -1..1 (right is positive), gas: bool, brake: bool }
// surface: "road" | "sand"
export function stepBike(b, inp, surface, dt) {
  const sand = surface === "sand";
  const mu = (sand ? MU_SAND : MU_ROAD) * G;

  // The rider's hands and feet are not instant
  b.throttle += ((inp.gas ? 1 : 0) - b.throttle) * Math.min(1, 5 * dt);
  b.brake += ((inp.brake ? 1 : 0) - b.brake) * Math.min(1, 10 * dt);
  b.steer += (clamp(inp.steer || 0, -1, 1) - b.steer) * Math.min(1, 14 * dt);

  const sn = Math.sin(b.psi), cs = Math.cos(b.psi);
  let vf = b.vx * sn + b.vz * cs;     // forward speed
  let vl = b.vx * cs - b.vz * sn;     // sideways speed (left positive)
  const vf0 = vf;

  /* ---- longitudinal ---- */
  let af = ENGINE * b.throttle * Math.max(0, 1 - vf / VMAX) * (sand ? SAND_POWER : 1);
  const dir = Math.sign(vf);
  af -= dir * (ROLL + DRAG * vf * vf);
  af -= dir * ENGINE_BRAKE * (1 - b.throttle) * Math.min(1, Math.abs(vf) / 4);
  af -= dir * BRAKE * b.brake * Math.min(1, Math.abs(vf) / 2);
  if (sand) af -= SAND_DRAG * vf;
  vf += af * dt;
  if (vf0 * vf < 0) vf = 0;           // drag and brakes stop the bike, they never reverse it

  /* ---- lateral grip ---- */
  // Hard braking moves weight to the front and the rear lets go sooner
  const muEff = mu * (1 - 0.4 * b.brake * Math.min(1, Math.abs(vf) / 12));
  const al = clamp(-vl * GRIP, -muEff, muEff);
  vl += al * dt;
  b.slip = Math.abs(vl);

  b.vx = vf * sn + vl * cs;
  b.vz = vf * cs - vl * sn;

  /* ---- yaw ---- */
  const fwd = Math.max(0, vf);
  const omegaLock = (fwd * Math.tan(MAX_LOCK)) / WHEELBASE;      // geometric limit of the steering
  const omegaGrip = (0.96 * muEff) / Math.max(fwd, 1);           // what the tires can hold
  const target = -b.steer * Math.min(omegaLock, omegaGrip);      // steer right = negative yaw
  b.omega += (target - b.omega) * Math.min(1, 10 * dt);
  b.psi += b.omega * dt;

  b.x += b.vx * dt;
  b.z += b.vz * dt;
  b.speed = Math.hypot(b.vx, b.vz);

  /* ---- visual lean and pitch ---- */
  const leanT = clamp(Math.atan((b.omega * vf) / G) * 0.9, -0.85, 0.85);
  b.lean += (leanT - b.lean) * Math.min(1, 8 * dt);
  const pitchT = clamp(-af * 0.006, -0.07, 0.09);                 // nose dives under braking
  b.pitch += (pitchT - b.pitch) * Math.min(1, 6 * dt);
}

// Two bikes are circles. Push them apart and bounce them (equal mass).
// Returns the impact speed, or 0 when they do not touch.
export function collideBikes(a, b) {
  const dx = b.x - a.x, dz = b.z - a.z;
  const d = Math.hypot(dx, dz), min = BIKE_RADIUS * 2;
  if (d >= min || d < 1e-4) return 0;
  const nx = dx / d, nz = dz / d, pen = min - d;
  a.x -= (nx * pen) / 2; a.z -= (nz * pen) / 2;
  b.x += (nx * pen) / 2; b.z += (nz * pen) / 2;
  const rel = (b.vx - a.vx) * nx + (b.vz - a.vz) * nz;
  if (rel >= 0) return 0;
  const j = (-(1 + 0.35) * rel) / 2;
  a.vx -= j * nx; a.vz -= j * nz;
  b.vx += j * nx; b.vz += j * nz;
  return -rel;
}