// The golden war-emblem in the middle of the stadium: a saw-tooth crown, six curved
// talons, thorns between them and a hexagon core (a nod to the hexagon on the real stadium).
// s = size in px, now = time in ms (slow rotation).

import { TAU } from "../core/vec.js";
import { THEME } from "./theme.js";

const CLAWS = 6;
const TEETH = 24;

function hex(g, r, rot) {
  g.beginPath();
  for (let i = 0; i < 6; i++) {
    const a = rot + (i / 6) * TAU;
    if (i === 0) g.moveTo(Math.cos(a) * r, Math.sin(a) * r);
    else g.lineTo(Math.cos(a) * r, Math.sin(a) * r);
  }
  g.closePath();
}

export function drawEmblem(g, x, y, s, now) {
  const ang = now / 9000;
  g.save();
  g.translate(x, y);

  const gold = g.createLinearGradient(-s * 1.5, -s * 1.5, s * 1.5, s * 1.5);
  gold.addColorStop(0, THEME.goldBright);
  gold.addColorStop(0.5, "#c9a24a");
  gold.addColorStop(1, THEME.goldDeep);

  // soft shadow so the gold reads on the white floor
  g.shadowColor = "rgba(90,60,10,0.35)";
  g.shadowBlur = 8;
  g.shadowOffsetY = 3;

  // saw-tooth crown (turns the opposite way, teeth lean like a saw blade)
  g.save();
  g.rotate(-ang * 0.6);
  g.fillStyle = gold;
  const r0 = s * 1.26, r1 = s * 1.64, w = (TAU / TEETH) * 0.3;
  for (let i = 0; i < TEETH; i++) {
    const a = (i / TEETH) * TAU;
    g.beginPath();
    g.moveTo(Math.cos(a - w) * r0, Math.sin(a - w) * r0);
    g.lineTo(Math.cos(a + w * 0.2) * r1, Math.sin(a + w * 0.2) * r1);
    g.lineTo(Math.cos(a + w) * r0, Math.sin(a + w) * r0);
    g.closePath();
    g.fill();
  }
  g.restore();
  g.strokeStyle = gold;
  g.lineWidth = s * 0.05;
  g.beginPath(); g.arc(0, 0, s * 1.24, 0, TAU); g.stroke();

  // thorns between the talons
  g.rotate(ang);
  g.fillStyle = THEME.goldDeep;
  for (let i = 0; i < CLAWS; i++) {
    g.save();
    g.rotate((i / CLAWS) * TAU + TAU / 12);
    g.beginPath();
    g.moveTo(s * 0.5, -s * 0.09);
    g.lineTo(s * 1.3, 0);
    g.lineTo(s * 0.5, s * 0.09);
    g.closePath();
    g.fill();
    g.restore();
  }

  // curved talons
  g.fillStyle = gold;
  g.strokeStyle = THEME.goldDeep;
  g.lineWidth = s * 0.025;
  g.lineJoin = "round";
  for (let i = 0; i < CLAWS; i++) {
    g.save();
    g.rotate((i / CLAWS) * TAU);
    g.beginPath();
    g.moveTo(s * 0.25, s * 0.16);
    g.quadraticCurveTo(s * 0.95, s * 0.62, s * 1.34, -s * 0.44); // outer edge sweeping out to a sharp tip
    g.quadraticCurveTo(s * 0.8, s * 0.02, s * 0.25, -s * 0.18);  // inner edge back
    g.closePath();
    g.fill();
    g.stroke();
    g.restore();
  }
  g.rotate(-ang);

  // hexagon core
  g.shadowColor = "transparent";
  hex(g, s * 0.52, 0);
  g.fillStyle = THEME.ink;
  g.fill();
  g.lineWidth = s * 0.06;
  g.strokeStyle = gold;
  g.stroke();
  hex(g, s * 0.32, TAU / 12);
  g.fillStyle = gold;
  g.fill();
  g.fillStyle = THEME.ink;
  g.beginPath(); g.arc(0, 0, s * 0.1, 0, TAU); g.fill();

  g.restore();
}
