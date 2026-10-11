// The stadium: a white platform shaped like the Beyblade-X stadium - 4 flat-edged lobes
// with open gaps between them - floating over a dark void.
// The flat lobe edges carry raised walls; the gaps are open edges (shown with a red line).
// When the shrinking starts the walls lower, and the platform closes in to the RED circle and
// then the YELLOW circle, which are drawn on the floor from the start.
// A golden war-emblem sits in the middle.

import { ARENA, CANVAS, SHRINK } from "../config.js";
import { TAU } from "../core/vec.js";
import { edgeRadius, wallAxis, wallSegments } from "../core/stadium.js";
import { THEME } from "./theme.js";
import { drawEmblem } from "./drawEmblem.js";

const STEPS = 360;

function shapePath(g, cx, cy, shape, dy = 0, inset = 0) {
  g.beginPath();
  for (let i = 0; i <= STEPS; i++) {
    const a = (i / STEPS) * TAU;
    const r = edgeRadius(shape, a) - inset;
    const x = cx + Math.cos(a) * r, y = cy + dy + Math.sin(a) * r;
    if (i === 0) g.moveTo(x, y); else g.lineTo(x, y);
  }
  g.closePath();
}

export function createArenaPainter(g) {
  const { cx, cy } = ARENA;
  const RED = SHRINK.redRadius, YEL = SHRINK.yellowRadius;

  const bg = g.createRadialGradient(cx, cy, 80, cx, cy, CANVAS.w * 0.7);
  bg.addColorStop(0, THEME.bgInner);
  bg.addColorStop(1, THEME.bgOuter);

  return function paint(shape, shrinking, wall) {
    const now = performance.now();

    g.fillStyle = bg;
    g.fillRect(-30, -30, CANVAS.w + 60, CANVAS.h + 60);

    // platform thickness + soft drop shadow
    g.save();
    g.shadowColor = "rgba(0,0,0,0.7)";
    g.shadowBlur = 46;
    g.shadowOffsetY = 20;
    g.fillStyle = THEME.side;
    shapePath(g, cx, cy, shape, 14);
    g.fill();
    g.restore();
    g.fillStyle = "#a39c8e";
    shapePath(g, cx, cy, shape, 6);
    g.fill();

    // white top surface (slightly warmer toward the outer slope)
    const floor = g.createRadialGradient(cx, cy, 0, cx, cy, shape.base);
    floor.addColorStop(0, "#ffffff");
    floor.addColorStop(0.55, "#f9f7f2");
    floor.addColorStop(1, "#e4ded1");
    g.fillStyle = floor;
    shapePath(g, cx, cy, shape);
    g.fill();

    // everything painted on the floor is clipped to the current outline
    g.save();
    shapePath(g, cx, cy, shape);
    g.clip();

    // soft darker rim band
    shapePath(g, cx, cy, shape);
    g.lineWidth = 44;
    g.strokeStyle = "rgba(120,100,70,0.07)";
    g.stroke();

    // brighter inner zones: inside the red circle, then inside the yellow circle
    const redZone = g.createRadialGradient(cx, cy, 0, cx, cy, RED);
    redZone.addColorStop(0, "#ffffff");
    redZone.addColorStop(1, "#fbfaf6");
    g.fillStyle = redZone;
    g.beginPath(); g.arc(cx, cy, RED, 0, TAU); g.fill();
    g.fillStyle = "#ffffff";
    g.beginPath(); g.arc(cx, cy, YEL, 0, TAU); g.fill();

    // engraved hairline rings
    g.strokeStyle = "rgba(70,55,40,0.08)";
    g.lineWidth = 1.5;
    for (const r of [YEL * 0.55, (YEL + RED) / 2, RED + 40]) {
      g.beginPath(); g.arc(cx, cy, r, 0, TAU); g.stroke();
    }

    // the RED circle: red line with a fine white line inside, like the real stadium
    g.strokeStyle = "rgba(0,0,0,0.09)";
    g.lineWidth = 4;
    g.beginPath(); g.arc(cx, cy, RED + 5, 0, TAU); g.stroke();
    g.strokeStyle = THEME.crimson;
    g.lineWidth = 5;
    g.beginPath(); g.arc(cx, cy, RED, 0, TAU); g.stroke();
    g.strokeStyle = "#ffffff";
    g.lineWidth = 1.6;
    g.beginPath(); g.arc(cx, cy, RED - 5, 0, TAU); g.stroke();

    // the YELLOW circle: gold line with eight heavier segments
    g.strokeStyle = THEME.gold;
    g.lineWidth = 3.5;
    g.beginPath(); g.arc(cx, cy, YEL, 0, TAU); g.stroke();
    g.strokeStyle = "#e0b640";
    g.lineWidth = 9;
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * TAU + TAU / 16;
      g.beginPath(); g.arc(cx, cy, YEL, a - 0.1, a + 0.1); g.stroke();
    }

    // small gold fangs pointing inward, just inside the yellow circle
    g.fillStyle = "rgba(201,162,74,0.7)";
    for (let i = 0; i < 24; i++) {
      const a = (i / 24) * TAU, w = TAU / 24 * 0.22;
      g.beginPath();
      g.moveTo(cx + Math.cos(a - w) * (YEL - 5), cy + Math.sin(a - w) * (YEL - 5));
      g.lineTo(cx + Math.cos(a) * (YEL - 17), cy + Math.sin(a) * (YEL - 17));
      g.lineTo(cx + Math.cos(a + w) * (YEL - 5), cy + Math.sin(a + w) * (YEL - 5));
      g.closePath();
      g.fill();
    }

    // golden war-emblem
    drawEmblem(g, cx, cy, 64, now);

    // fine tick marks following the edge
    for (let i = 0; i < 90; i++) {
      const a = (i / 90) * TAU;
      const major = i % 6 === 0;
      const e = edgeRadius(shape, a);
      g.strokeStyle = major ? "rgba(70,55,40,0.45)" : "rgba(70,55,40,0.22)";
      g.lineWidth = major ? 1.8 : 1.1;
      g.beginPath();
      g.moveTo(cx + Math.cos(a) * (e - 7), cy + Math.sin(a) * (e - 7));
      g.lineTo(cx + Math.cos(a) * (e - (major ? 19 : 13)), cy + Math.sin(a) * (e - (major ? 19 : 13)));
      g.stroke();
    }
    g.restore();

    // edge line: neutral normally, pulses in the colour of the circle it is closing in on
    if (shrinking) {
      const pulse = 0.5 + 0.5 * Math.sin(now / 160);
      const rgb = shape.stage < 1 ? "200,16,46" : "201,162,74";
      g.lineWidth = 6;
      g.strokeStyle = `rgba(${rgb},${0.65 + 0.35 * pulse})`;
    } else {
      g.lineWidth = 3;
      g.strokeStyle = "#d3ccbd";
    }
    shapePath(g, cx, cy, shape);
    g.stroke();
    if (!shrinking) {
      shapePath(g, cx, cy, shape, 0, 4);
      g.lineWidth = 1.5;
      g.strokeStyle = "rgba(255,255,255,0.9)";
      g.stroke();
    }

    // the open gaps between the lobes: a red danger line while the walls are up
    if (wall > 0.35 && shape.lobe > 0.9) {
      g.beginPath();
      let drawing = false;
      for (let i = 0; i <= STEPS; i++) {
        const a = (i / STEPS) * TAU;
        if (wallAxis(a) === null) {
          const r = edgeRadius(shape, a);
          const x = cx + Math.cos(a) * r, y = cy + Math.sin(a) * r;
          if (!drawing) { g.moveTo(x, y); drawing = true; } else g.lineTo(x, y);
        } else drawing = false;
      }
      g.lineWidth = 4.5;
      g.lineCap = "round";
      g.strokeStyle = `rgba(200,16,46,${0.9 * wall})`;
      g.stroke();
      g.lineCap = "butt";
    }

    drawWalls(g, cx, cy, shape, wall);
  };
}

// Raised wall along each flat lobe edge. `h` (0..1) is its height; it sinks away as h -> 0.
function drawWalls(g, cx, cy, shape, h) {
  if (h <= 0.02) return;
  const T = 22; // thickness of the wall top at full height
  g.save();
  g.globalAlpha = Math.min(1, h * 1.6);
  for (const w of wallSegments(shape)) {
    const nx = w.nx, ny = w.ny, tx = -ny, ty = nx;
    const P = (along, out) => [cx + nx * (w.plane + out) + tx * along, cy + ny * (w.plane + out) + ty * along];
    const poly = (pts) => {
      g.beginPath();
      pts.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y)));
      g.closePath();
    };

    // shadow cast on the floor
    let [x0, y0] = P(0, -18 * h), [x1, y1] = P(0, 0);
    let grad = g.createLinearGradient(x0, y0, x1, y1);
    grad.addColorStop(0, "rgba(0,0,0,0)");
    grad.addColorStop(1, `rgba(0,0,0,${0.2 * h})`);
    g.fillStyle = grad;
    poly([P(-w.half, -18 * h), P(w.half, -18 * h), P(w.half, 0), P(-w.half, 0)]);
    g.fill();

    // the face of the wall you see from above
    [x0, y0] = P(0, -9 * h);
    grad = g.createLinearGradient(x0, y0, x1, y1);
    grad.addColorStop(0, "#9a9aa3");
    grad.addColorStop(1, "#5d5d66");
    g.fillStyle = grad;
    poly([P(-w.half, -9 * h), P(w.half, -9 * h), P(w.half, 0), P(-w.half, 0)]);
    g.fill();

    // top of the wall: graphite with a chrome inner edge and a gold outer line
    const th = 4 + (T - 4) * h;
    [x0, y0] = P(0, 0);
    [x1, y1] = P(0, th);
    grad = g.createLinearGradient(x0, y0, x1, y1);
    grad.addColorStop(0, "#4b4b54");
    grad.addColorStop(1, "#212125");
    g.fillStyle = grad;
    poly([P(-w.half, 0), P(w.half, 0), P(w.half - 7, th), P(-w.half + 7, th)]);
    g.fill();
    g.lineWidth = 2;
    g.strokeStyle = "#dcdce2";
    g.beginPath(); g.moveTo(...P(-w.half, 0)); g.lineTo(...P(w.half, 0)); g.stroke();
    g.lineWidth = 1.4;
    g.strokeStyle = THEME.gold;
    g.beginPath(); g.moveTo(...P(-w.half + 7, th)); g.lineTo(...P(w.half - 7, th)); g.stroke();
  }
  g.restore();
}
