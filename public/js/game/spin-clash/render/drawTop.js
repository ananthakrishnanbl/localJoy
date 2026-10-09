// Draws one spinner: shadow, blades, glow, name and cooldown pips.

import { ABILITY, MATCH } from "../config.js";
import { TAU, clamp } from "../core/vec.js";
import { STATUS } from "../entities/top.js";
import { mix, rgba } from "./color.js";

const BLADES = 6;

// Visual-only animation state. Tops spin at a constant speed forever.
export function advanceVisual(t, dt) {
  const w = t.status === STATUS.ALIVE ? 22 : 7;
  t.angle = (t.angle + w * dt) % TAU;
}

export function drawTop(g, t, info) {
  if (t.status === STATUS.OUT || t.spectator) return;
  const color = info?.color ?? "#ffffff";
  const r = t.r;
  const alive = t.status === STATUS.ALIVE;

  let alpha = 1;
  let scale = 1 + t.z / 240;
  let drop = 0;
  let fallK = 0;
  if (!alive) {
    fallK = clamp(t.deadT / MATCH.fallTime, 0, 1);
    scale *= 1 - 0.8 * fallK;
    alpha = 1 - fallK * 0.9;
    drop = fallK * 46; // sinks "down" the screen into the void
  }
  const lift = t.z * 0.55;

  // shadow (stays on the floor, shrinks as the top rises)
  if (alive) {
    g.save();
    g.globalAlpha = 0.38;
    g.fillStyle = "#000";
    const sr = r * (1 - Math.min(t.z, 140) / 380);
    g.beginPath();
    g.ellipse(t.x + t.z * 0.12 + 2, t.y + 5 + t.z * 0.2, sr, sr * 0.9, 0, 0, TAU);
    g.fill();
    g.restore();
  }

  g.save();
  g.globalAlpha = alpha;
  g.translate(t.x, t.y - lift + drop);
  g.scale(scale, scale);

  // dash / thrown aura
  if (alive && (t.dashT > 0 || t.thrownT > 0)) {
    const c = t.dashT > 0 ? color : "#ffffff";
    g.save();
    g.globalCompositeOperation = "lighter";
    const aura = g.createRadialGradient(0, 0, r * 0.7, 0, 0, r * 1.7);
    aura.addColorStop(0, rgba(c, 0.6));
    aura.addColorStop(1, rgba(c, 0));
    g.fillStyle = aura;
    g.beginPath(); g.arc(0, 0, r * 1.7, 0, TAU); g.fill();
    g.restore();
  }

  // outer ring
  g.beginPath(); g.arc(0, 0, r, 0, TAU);
  g.fillStyle = "#1a1f33"; g.fill();
  g.lineWidth = 3.5; g.strokeStyle = color; g.stroke();

  // blades
  g.fillStyle = color;
  g.strokeStyle = mix(color, "#000000", 0.5);
  g.lineWidth = 1.5;
  for (let i = 0; i < BLADES; i++) {
    g.save();
    g.rotate(t.angle + (i * TAU) / BLADES);
    g.beginPath();
    g.moveTo(r * 0.38, -r * 0.12);
    g.quadraticCurveTo(r * 0.95, -r * 0.55, r * 1.0, -r * 0.02);
    g.quadraticCurveTo(r * 0.9, r * 0.32, r * 0.38, r * 0.18);
    g.closePath();
    g.fill(); g.stroke();
    g.restore();
  }

  // motion-blur streaks
  if (alive) {
    g.save();
    g.strokeStyle = "rgba(255,255,255,0.09)";
    g.lineWidth = 3;
    g.setLineDash([r * 0.5, r * 0.8]);
    g.lineDashOffset = -t.angle * r;
    g.beginPath(); g.arc(0, 0, r * 0.8, 0, TAU); g.stroke();
    g.restore();
  }

  // inner disc + cap
  const inner = g.createRadialGradient(-r * 0.12, -r * 0.12, 1, 0, 0, r * 0.52);
  inner.addColorStop(0, mix(color, "#ffffff", 0.65));
  inner.addColorStop(1, color);
  g.fillStyle = inner;
  g.beginPath(); g.arc(0, 0, r * 0.52, 0, TAU); g.fill();
  g.fillStyle = "#10131f";
  g.beginPath(); g.arc(0, 0, r * 0.17, 0, TAU); g.fill();
  g.fillStyle = "rgba(255,255,255,0.7)";
  g.beginPath(); g.arc(-r * 0.05, -r * 0.05, r * 0.05, 0, TAU); g.fill();

  if (t.hitFlash > 0) {
    g.fillStyle = `rgba(255,255,255,${t.hitFlash * 0.55})`;
    g.beginPath(); g.arc(0, 0, r, 0, TAU); g.fill();
  }
  if (!alive) {
    g.fillStyle = `rgba(0,0,0,${fallK * 0.6})`;
    g.beginPath(); g.arc(0, 0, r, 0, TAU); g.fill();
  }
  g.restore();

  if (!alive) return;

  // name
  const cy = t.y - lift;
  g.font = "700 14px system-ui, sans-serif";
  g.textAlign = "center";
  g.lineWidth = 4;
  g.strokeStyle = "rgba(0,0,0,0.75)";
  const name = info?.name ?? "";
  g.strokeText(name, t.x, cy - r * scale - 12);
  g.fillStyle = "#fff";
  g.fillText(name, t.x, cy - r * scale - 12);

  // cooldown pips: left = dash (orange), right = jump (blue)
  pip(g, t.x - 9, t.y + r + 16, 5, "#ffb13b", t.cd.dash);
  pip(g, t.x + 9, t.y + r + 16, 5, "#4fd8ff", t.cd.jump);
}

function pip(g, x, y, rad, color, cd) {
  const ready = cd <= 0;
  g.fillStyle = "rgba(255,255,255,0.15)";
  g.beginPath(); g.arc(x, y, rad, 0, TAU); g.fill();
  g.fillStyle = color;
  g.beginPath();
  if (ready) g.arc(x, y, rad, 0, TAU);
  else { g.moveTo(x, y); g.arc(x, y, rad, -Math.PI / 2, -Math.PI / 2 + (1 - cd / ABILITY.cooldown) * TAU); }
  g.fill();
}
