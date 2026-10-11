// The shape of the stadium, shared by physics (where are the walls / the edge?) and rendering.
//
//   * 4 lobes with FLAT outer edges (these carry the walls)
//   * 4 open gaps ("bays") between the lobes (no wall: you fall out here)
//
// "stage" runs 0 -> 2:
//   0  full lobed shape
//   1  the red circle
//   2  the yellow circle (final)
// A shape is { base, lobe, stage }: base = overall size, lobe = how much of the lobed outline
// remains (1 -> 0 as it turns into a plain circle).

import { ARENA, SHRINK } from "../config.js";
import { TAU, clamp, lerp } from "./vec.js";

const LOBE0 = -Math.PI / 2;                    // first lobe points up the screen
const SECTOR = TAU / ARENA.lobes;              // angle between lobe axes
const ALPHA = (ARENA.lobeFlatDeg * Math.PI) / 180;
const BAY_R = ARENA.radius * ARENA.bayRatio;
const smooth = (k) => k * k * (3 - 2 * k);

// angle from the nearest lobe axis, in -SECTOR/2 .. SECTOR/2
function lobeOffset(theta) {
  let d = (((theta - LOBE0) % SECTOR) + SECTOR) % SECTOR;
  if (d > SECTOR / 2) d -= SECTOR;
  return d;
}

// radius of the FULL lobed outline (stage 0) in direction theta
function fullOutline(theta) {
  const d = Math.abs(lobeOffset(theta));
  if (d <= ALPHA) return (ARENA.radius * Math.cos(ALPHA)) / Math.cos(d); // flat lobe edge
  const k = (d - ALPHA) / (SECTOR / 2 - ALPHA);
  return lerp(ARENA.radius, BAY_R, smooth(k));                            // rounded gap
}

export function shapeAt(stage) {
  const s = clamp(stage, 0, 2);
  if (s <= 1) return { base: lerp(ARENA.radius, SHRINK.redRadius, s), lobe: 1 - s, stage: s };
  return { base: lerp(SHRINK.redRadius, SHRINK.yellowRadius, s - 1), lobe: 0, stage: s };
}

// Distance from the centre to the edge in direction `theta`.
export function edgeRadius(shape, theta) {
  const f = fullOutline(theta) / ARENA.radius;
  return shape.base * (1 - shape.lobe * (1 - f));
}

// If `theta` points at a walled (flat) part of a lobe, returns that lobe's axis angle, else null.
export function wallAxis(theta) {
  const off = lobeOffset(theta);
  return Math.abs(off) <= ALPHA ? theta - off : null;
}

// The wall lines for drawing: [{ nx, ny, plane, half }] (plane = distance of the wall from the centre,
// half = half the length of the flat edge).
export function wallSegments(shape) {
  const out = [];
  for (let k = 0; k < ARENA.lobes; k++) {
    const axis = LOBE0 + k * SECTOR;
    const plane = edgeRadius(shape, axis);
    out.push({ nx: Math.cos(axis), ny: Math.sin(axis), plane, half: plane * Math.tan(ALPHA) });
  }
  return out;
}

// Where the stadium is, `t` seconds into a round.
export function stageAt(t) {
  if (!SHRINK.enabled) return { stage: 0, moving: false, warn: false };
  const t1 = SHRINK.delay;
  const t2 = t1 + SHRINK.toRed;
  const t3 = t2 + SHRINK.holdRed;
  const t4 = t3 + SHRINK.toYellow;
  if (t < t1) return { stage: 0, moving: false, warn: t > t1 - SHRINK.warn };
  if (t < t2) return { stage: smooth((t - t1) / SHRINK.toRed), moving: true, warn: false };
  if (t < t3) return { stage: 1, moving: false, warn: t > t3 - SHRINK.warn };
  if (t < t4) return { stage: 1 + smooth((t - t3) / SHRINK.toYellow), moving: true, warn: false };
  return { stage: 2, moving: false, warn: false };
}
