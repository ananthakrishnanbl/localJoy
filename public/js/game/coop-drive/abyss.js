// Falling into the void. Pure maths, no Three.js.
// There are no rails any more, so the road edge is the only boundary: once the centre of the car is
// past the edge (plus a small margin) it can no longer be saved.

export const FALL_MARGIN = 0.25;   // m past the edge before the car tips over (raise = more forgiving)
export const GRAVITY = 32;         // m/s^2
export const FALL_DEPTH = -80;     // below this the car counts as gone

// Returns 0 when the car is still on the road, otherwise the side it left from (+1 right, -1 left).
// `loc` must have been updated this frame with track.locate(car.x, car.z, loc).
export function checkFall(car, track, loc) {
  if (!car.alive || car.falling) return 0;
  const d = track.lateral(car.x, car.z, loc);
  return Math.abs(d) > loc.half + FALL_MARGIN ? Math.sign(d) : 0;
}

// Turn a car into a falling wreck. It keeps its momentum and tips towards the edge it left from.
export function startFall(car, side, rand = Math.random) {
  car.alive = false;
  car.falling = true;
  car.fallT = 0;
  car.vy = 0;
  car.pitch = 0;
  car.rollV = side * (1.5 + rand() * 1.5);   // roll towards the edge (positive roll = right side down)
  car.ang += (rand() - 0.5) * 2;             // a bit of extra spin
}

// Use instead of stepCar() while car.falling is true. Returns true once the car is deep enough to be
// treated as gone (stop rendering it / stop the camera).
export function stepFalling(car, dt) {
  car.fallT += dt;
  car.vy -= GRAVITY * dt;
  car.y += car.vy * dt;
  const k = Math.exp(-0.15 * dt);            // almost no air drag: it sails off the edge
  car.vx *= k; car.vz *= k;
  car.x += car.vx * dt;
  car.z += car.vz * dt;
  car.h += car.ang * dt;
  car.roll += car.rollV * dt;
  car.pitch = Math.min(1.2, car.pitch + 0.9 * dt);   // nose dips
  car.speed = Math.hypot(car.vx, car.vz);
  return car.y < FALL_DEPTH;
}
