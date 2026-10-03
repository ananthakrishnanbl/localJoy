export const FALL_MARGIN = 0.25;  
export const GRAVITY = 32;         
export const FALL_DEPTH = -80;     

export function checkFall(car, track, loc) {
  // Allow already wrecked cars to fall if they slide off the edge!
  if (car.falling) return 0;
  const d = track.lateral(car.x, car.z, loc);
  return Math.abs(d) > loc.half + FALL_MARGIN ? Math.sign(d) : 0;
}

export function startFall(car, side, rand = Math.random) {
  car.alive = false;
  car.falling = true;
  car.fallT = 0;
  car.vy = 0;
  car.pitch = 0;
  car.rollV = side * (1.5 + rand() * 1.5);   
  car.ang += (rand() - 0.5) * 2;             
}

export function stepFalling(car, dt) {
  car.fallT += dt;
  car.vy -= GRAVITY * dt;
  car.y += car.vy * dt;
  const k = Math.exp(-0.15 * dt);            
  car.vx *= k; car.vz *= k;
  car.x += car.vx * dt;
  car.z += car.vz * dt;
  car.h += car.ang * dt;
  car.roll += car.rollV * dt;
  car.pitch = Math.min(1.2, car.pitch + 0.9 * dt);   
  car.speed = Math.hypot(car.vx, car.vz);
  return car.y < FALL_DEPTH;
}