export const TOP = 42;            
export const ACC = 24;            
export const BRAKE = 46;          
export const REV_MAX = 11;        
export const MAXTURN = 1.9;       
export const CAR_HW = 0.95;       
export const CAR_HL = 2.0;        

export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));

export function createCar(x, z, h) {
  return {
    x, z, h,
    vx: 0, vz: 0,
    ang: 0,                  
    y: 0, vy: 0,             
    roll: 0, rollV: 0,       
    alive: true,
    crashT: 0,               
    bump: 0,                 
    speed: 0,                
  };
}

export function stepCar(car, input, dt) {
  if (car.alive) {
    const steer = clamp((input && input.steer) || 0, -1, 1);
    const gas = !!(input && input.gas);
    const brake = !!(input && input.brake);

    let fx = Math.sin(car.h), fz = Math.cos(car.h);
    const fwd0 = car.vx * fx + car.vz * fz;
    const target = -steer * MAXTURN * Math.min(1, Math.abs(fwd0) / 6) / (1 + Math.abs(fwd0) / 45) * (fwd0 < -0.5 ? -1 : 1);
    car.ang += (target - car.ang) * Math.min(1, 5 * dt);
    car.h += car.ang * dt;

    fx = Math.sin(car.h); fz = Math.cos(car.h);
    const rx = -fz, rz = fx;
    let fwd = car.vx * fx + car.vz * fz;
    let lat = car.vx * rx + car.vz * rz;

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

    lat += car.ang * fwd * 0.5 * dt;
    const grip = Math.max(2.5, 9 - Math.abs(fwd) * 0.14 - (brake ? 2 : 0));
    lat -= lat * Math.min(1, grip * dt);

    car.vx = fx * fwd + rx * lat;
    car.vz = fz * fwd + rz * lat;
  } else {
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

export function resolveCarCollision(a, b, dt) {
  const boxA = carBox(a);
  const boxB = carBox(b);
  const dx = b.x - a.x;
  const dz = b.z - a.z;
  const maxDist = Math.hypot(CAR_HW * 2, CAR_HL * 2);

  if (dx * dx + dz * dz > maxDist * maxDist) return false;
  if (!boxHit(boxA, boxB)) return false;

  let bestOverlap = Infinity;
  let nx = 0, nz = 0;
  const axes = [];

  for (const box of [boxA, boxB]) {
    const fx = Math.sin(box.h), fz = Math.cos(box.h);
    axes.push([fx, fz]);
    axes.push([-fz, fx]);
  }

  for (const [ax, az] of axes) {
    const centerDist = Math.abs(dx * ax + dz * az);
    const overlap = ext(boxA, ax, az) + ext(boxB, ax, az) - centerDist;

    if (overlap <= 0) return false;
    if (overlap < bestOverlap) {
      bestOverlap = overlap;
      const direction = dx * ax + dz * az >= 0 ? 1 : -1;
      nx = ax * direction;
      nz = az * direction;
    }
  }

  const push = bestOverlap * 0.51;
  a.x -= nx * push; a.z -= nz * push;
  b.x += nx * push; b.z += nz * push;

  const rvx = b.vx - a.vx, rvz = b.vz - a.vz;
  const closing = rvx * nx + rvz * nz;

  if (closing < 0) {
    const correction = -closing * 0.5;
    a.vx -= nx * correction; a.vz -= nz * correction;
    b.vx += nx * correction; b.vz += nz * correction;
  }

  a.speed = Math.hypot(a.vx, a.vz);
  b.speed = Math.hypot(b.vx, b.vz);
  return true;
}

export function carBox(car, out = {}) {
  out.x = car.x; out.z = car.z; out.h = car.h; out.hw = CAR_HW; out.hl = CAR_HL;
  return out;
}