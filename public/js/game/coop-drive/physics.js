// Car physics. Pure maths, no Three.js, so it is easy to tweak and test.
//
// World: x/z is the ground plane, y is up. Heading h: forward = (sin h, cos h).
// Velocity is kept in world space (vx, vz) and split every step into a forward part and a sideways
// part. The tires grip the sideways part away, which is what makes drifting possible.
//
// Every function here is meant to be called from a fixed timestep (see main.js).

export const TOP = 42;            // m/s, engine stops pulling here
export const ACC = 24;            // m/s^2 at zero speed
export const BRAKE = 46;          // m/s^2
export const REV_MAX = 11;        // max reverse speed
export const MAXTURN = 1.9;       // rad/s, max yaw rate
export const CAR_HW = 0.95;       // half width of the collision box
export const CAR_HL = 2.0;        // half length of the collision box
export const RAIL_CRASH_SPEED = 15;   // hitting a rail faster than this (m/s, along the normal) wrecks the car

export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));

export function createCar(x, z, h) {
  return {
    x, z, h,
    vx: 0, vz: 0,
    ang: 0,                  // yaw rate, rad/s
    y: 0, vy: 0,             // only used while tumbling after a crash
    roll: 0, rollV: 0,       // visual only
    alive: true,
    crashT: 0,               // seconds since the crash
    bump: 0,                 // cooldown for the "scraped a rail" vibration
    speed: 0,                // |velocity|, m/s
  };
}

// input: { steer: -1..1 (right is positive), gas: bool, brake: bool }
export function stepCar(car, input, dt) {
  if (car.alive) {
    const steer = clamp((input && input.steer) || 0, -1, 1);
    const gas = !!(input && input.gas);
    const brake = !!(input && input.brake);

    // Steering: yaw rate target fades in from walking pace and gets gentler at speed
    let fx = Math.sin(car.h), fz = Math.cos(car.h);
    const fwd0 = car.vx * fx + car.vz * fz;
    const target = -steer * MAXTURN * Math.min(1, Math.abs(fwd0) / 6) / (1 + Math.abs(fwd0) / 45) * (fwd0 < -0.5 ? -1 : 1);
    car.ang += (target - car.ang) * Math.min(1, 5 * dt);
    car.h += car.ang * dt;

    // Split the world velocity into forward and sideways parts along the new heading
    fx = Math.sin(car.h); fz = Math.cos(car.h);
    const rx = -fz, rz = fx;
    let fwd = car.vx * fx + car.vz * fz;
    let lat = car.vx * rx + car.vz * rz;

    // Longitudinal: engine, brake, reverse, drag
    if (gas && !brake) {
      if (fwd < 0) fwd += BRAKE * dt; else fwd += ACC * (1 - fwd / TOP) * dt;
    } else if (brake && !gas) {
      if (fwd > 0.5) fwd = Math.max(0, fwd - BRAKE * dt);
      else fwd = Math.max(-REV_MAX, fwd - ACC * 0.6 * dt);
    }
    const drag = (0.25 * Math.abs(fwd) + 1.8) * dt;
    if (!gas && !brake) {
      if (Math.abs(fwd) < drag) fwd = 0; else fwd -= Math.sign(fwd) * drag;
    } else {
      fwd -= fwd * 0.12 * dt;
    }

    // Lateral: centrifugal push, then tire grip (weaker at speed and under braking = drifting)
    lat += car.ang * fwd * 0.5 * dt;
    const grip = Math.max(2.5, 9 - Math.abs(fwd) * 0.14 - (brake ? 2 : 0));
    lat -= lat * Math.min(1, grip * dt);

    car.vx = fx * fwd + rx * lat;
    car.vz = fz * fwd + rz * lat;
  } else {
    // Wrecked: slide to a stop, spin and tumble
    const k = Math.exp(-1.8 * dt);
    car.vx *= k; car.vz *= k;
    car.h += car.ang * dt;
    car.ang *= Math.exp(-1.5 * dt);
    car.crashT += dt;
    car.y += car.vy * dt;
    car.vy -= 18 * dt;
    if (car.y < 0) { car.y = 0; car.vy = car.vy < -3 ? -car.vy * 0.3 : 0; }
    if (car.crashT < 0.9) car.roll += car.rollV * dt;
  }

  car.x += car.vx * dt;
  car.z += car.vz * dt;
  car.bump -= dt;
  car.speed = Math.hypot(car.vx, car.vz);
}

// Turn a car into a wreck. `rand` is any () => [0,1) function, so this stays deterministic if you want.
export function wreckCar(car, rand = Math.random) {
  if (!car.alive) return;
  car.alive = false;
  car.crashT = 0;
  car.ang = (rand() - 0.5) * 9;
  car.vy = 5;
  car.rollV = (rand() < 0.5 ? -1 : 1) * (4 + rand() * 3);
  car.vx *= 0.5;
  car.vz *= 0.5;
}

/* ---------- Collisions ---------- */

// Guard rails. (cx, cz, th) is the nearest centreline point and its heading, `half` is the distance
// from the centreline to the inner face of the rail. Pushes the car back inside and bounces it.
// Returns null when the car is not touching a rail, otherwise
//   { nx, nz, vn, fatal }   (nx, nz) points into the rail, vn is the impact speed along it.
// When fatal is true the car is only pushed out; the caller should wreck it.
export function collideRail(car, cx, cz, th, half, dt) {
  const fx = Math.sin(car.h), fz = Math.cos(car.h);
  const rx = -Math.cos(th), rz = Math.sin(th);

  // test the four corners of the car in road space
  let dmax = -1e9, dmin = 1e9;
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    const wx = car.x + fx * sz * CAR_HL - fz * sx * CAR_HW;
    const wz = car.z + fz * sz * CAR_HL + fx * sx * CAR_HW;
    const d = (wx - cx) * rx + (wz - cz) * rz;
    if (d > dmax) dmax = d;
    if (d < dmin) dmin = d;
  }
  const overR = dmax - half, overL = -dmin - half;
  if (!(overR > 0 || overL > 0)) return null;

  const side = overR >= overL ? 1 : -1, over = Math.max(overR, overL);
  car.x -= side * rx * over;
  car.z -= side * rz * over;
  const nx = side * rx, nz = side * rz;
  const vn = car.vx * nx + car.vz * nz;

  if (vn > RAIL_CRASH_SPEED) return { nx, nz, vn, fatal: true };

  if (vn > 0) {
    car.vx -= 1.3 * vn * nx;
    car.vz -= 1.3 * vn * nz;
    const loss = Math.exp(-2.4 * dt);
    car.vx *= loss; car.vz *= loss;
    car.h += wrap(th - car.h) * (1 - Math.exp(-6 * dt));   // the rail straightens the car out
  }
  const scrape = Math.exp(-0.8 * dt);
  car.vx *= scrape; car.vz *= scrape;
  return { nx, nz, vn, fatal: false };
}

// Oriented box overlap (SAT). Box: { x, z, h, hw, hl }; forward = (sin h, cos h).
function ext(o, ax, az) {
  const fx = Math.sin(o.h), fz = Math.cos(o.h);
  return o.hl * Math.abs(fx * ax + fz * az) + o.hw * Math.abs(-fz * ax + fx * az);
}

export function boxHit(a, b) {
  const dx = b.x - a.x, dz = b.z - a.z;
  for (const o of [a, b]) {
    const fx = Math.sin(o.h), fz = Math.cos(o.h);
    for (const [ax, az] of [[fx, fz], [-fz, fx]]) {
      if (Math.abs(dx * ax + dz * az) > ext(a, ax, az) + ext(b, ax, az)) return false;
    }
  }
  return true;
}

// Soft car-to-car collision.
// Cars are pushed apart so they cannot occupy the same space.
// Normal velocity is removed instead of reflecting it, so there is NO bounce.
export function resolveCarCollision(a, b, dt) {
  const boxA = carBox(a);
  const boxB = carBox(b);

  // Quick distance check.
  const dx = b.x - a.x;
  const dz = b.z - a.z;

  const maxDist = Math.hypot(
    CAR_HW * 2,
    CAR_HL * 2
  );

  if (dx * dx + dz * dz > maxDist * maxDist) {
    return false;
  }

  // Proper oriented-box collision test.
  if (!boxHit(boxA, boxB)) {
    return false;
  }

  // Find the smallest-overlap SAT axis.
  let bestOverlap = Infinity;
  let nx = 0;
  let nz = 0;

  const axes = [];

  for (const box of [boxA, boxB]) {
    const fx = Math.sin(box.h);
    const fz = Math.cos(box.h);

    // Forward
    axes.push([fx, fz]);

    // Right
    axes.push([-fz, fx]);
  }

  for (const [ax, az] of axes) {
    const centerDist = Math.abs(dx * ax + dz * az);

    const overlap =
      ext(boxA, ax, az) +
      ext(boxB, ax, az) -
      centerDist;

    if (overlap <= 0) {
      return false;
    }

    if (overlap < bestOverlap) {
      bestOverlap = overlap;

      // Make the normal point from A -> B.
      const direction = dx * ax + dz * az >= 0 ? 1 : -1;

      nx = ax * direction;
      nz = az * direction;
    }
  }

  // Push the cars apart.
  // Slightly more than half prevents them remaining embedded.
  const push = bestOverlap * 0.51;

  a.x -= nx * push;
  a.z -= nz * push;

  b.x += nx * push;
  b.z += nz * push;

  // Remove only the velocity that is pushing the cars INTO each other.
  // We intentionally do NOT reflect the velocity -> no bounce.
  const rvx = b.vx - a.vx;
  const rvz = b.vz - a.vz;

  const closing = rvx * nx + rvz * nz;

  if (closing < 0) {
    const correction = -closing * 0.5;

    a.vx -= nx * correction;
    a.vz -= nz * correction;

    b.vx += nx * correction;
    b.vz += nz * correction;
  }

  // Keep speed values synchronized with the corrected velocity.
  a.speed = Math.hypot(a.vx, a.vz);
  b.speed = Math.hypot(b.vx, b.vz);

  return true;
}

// Fill (or create) the collision box of a car
export function carBox(car, out = {}) {
  out.x = car.x; out.z = car.z; out.h = car.h; out.hw = CAR_HW; out.hl = CAR_HL;
  return out;
}
