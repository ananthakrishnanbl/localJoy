// Draws one spinner: soft shadow, chrome rim, player-coloured blades, gold cap,
// name and cooldown pips.

import { ABILITY, MATCH } from "../config.js";
import { TAU, clamp } from "../core/vec.js";
import { STATUS } from "../entities/top.js";
import { mix, rgba } from "./color.js";
import { THEME } from "./theme.js";

const BLADES = 6;

// Visual-only animation state. Tops spin at a constant speed forever.
export function advanceVisual(t, dt) {
  const w = t.status === STATUS.ALIVE ? 22 : 7;
  t.angle = (t.angle + w * dt) % TAU;
}

export function drawTop(g, t, info) {
  if (t.status === STATUS.OUT || t.spectator) return;
  const color = info?.color ?? "#c8102e";
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

  // soft shadow (stays on the floor, shrinks as the top rises)
  if (alive) {
    g.save();
    g.globalAlpha = 0.28;
    g.fillStyle = "#2a2118";
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

  // soft coloured glow while dashing / after being thrown
  if (alive && (t.dashT > 0 || t.thrownT > 0)) {
    const c = t.dashT > 0 ? color : THEME.ink;
    const aura = g.createRadialGradient(0, 0, r * 0.6, 0, 0, r * 1.8);
    aura.addColorStop(0, rgba(c, 0.4));
    aura.addColorStop(1, rgba(c, 0));
    g.fillStyle = aura;
    g.beginPath(); g.arc(0, 0, r * 1.8, 0, TAU); g.fill();
  }

  // chrome rim
  const chrome = g.createLinearGradient(-r, -r, r, r);
  chrome.addColorStop(0, "#fdfdfd");
  chrome.addColorStop(0.45, "#9a9aa2");
  chrome.addColorStop(0.7, "#e9e9ee");
  chrome.addColorStop(1, "#6f6f78");
  g.beginPath(); g.arc(0, 0, r, 0, TAU);
  g.fillStyle = "#26262b"; g.fill();
  g.lineWidth = 4; g.strokeStyle = chrome; g.stroke();

  // blades
  const bladeFill = g.createLinearGradient(-r, -r, r, r);
  bladeFill.addColorStop(0, mix(color, "#ffffff", 0.3));
  bladeFill.addColorStop(1, mix(color, "#000000", 0.25));
  g.fillStyle = bladeFill;
  g.strokeStyle = mix(color, "#000000", 0.55);
  g.lineWidth = 1.2;
  for (let i = 0; i < BLADES; i++) {
    g.save();
    g.rotate(t.angle + (i * TAU) / BLADES);
    g.beginPath();
    g.moveTo(r * 0.38, -r * 0.12);
    g.quadraticCurveTo(r * 0.95, -r * 0.55, r * 0.98, -r * 0.02);
    g.quadraticCurveTo(r * 0.88, r * 0.32, r * 0.38, r * 0.18);
    g.closePath();
    g.fill(); g.stroke();
    g.restore();
  }

  // inner disc + gold cap
  const inner = g.createRadialGradient(-r * 0.12, -r * 0.12, 1, 0, 0, r * 0.5);
  inner.addColorStop(0, "#ffffff");
  inner.addColorStop(1, mix(color, "#ffffff", 0.35));
  g.fillStyle = inner;
  g.beginPath(); g.arc(0, 0, r * 0.5, 0, TAU); g.fill();
  g.strokeStyle = mix(color, "#000000", 0.35);
  g.lineWidth = 1.2;
  g.beginPath(); g.arc(0, 0, r * 0.5, 0, TAU); g.stroke();
  g.fillStyle = THEME.gold;
  g.beginPath(); g.arc(0, 0, r * 0.17, 0, TAU); g.fill();
  g.fillStyle = THEME.ink;
  g.beginPath(); g.arc(0, 0, r * 0.07, 0, TAU); g.fill();

  if (t.hitFlash > 0) {
    g.fillStyle = `rgba(255,255,255,${t.hitFlash * 0.6})`;
    g.beginPath(); g.arc(0, 0, r, 0, TAU); g.fill();
  }
  if (!alive) {
    g.fillStyle = `rgba(0,0,0,${fallK * 0.55})`;
    g.beginPath(); g.arc(0, 0, r, 0, TAU); g.fill();
  }
  g.restore();

  if (!alive) return;

  // name: dark text with a white halo (readable on the white stadium and the dark void)
  const cy = t.y - lift;
  g.font = `600 14px ${THEME.sans}`;
  g.textAlign = "center";
  g.lineJoin = "round";
  g.lineWidth = 4;
  g.strokeStyle = "rgba(255,255,255,0.92)";
  const name = info?.name ?? "";
  g.strokeText(name, t.x, cy - r * scale - 12);
  g.fillStyle = THEME.ink;
  g.fillText(name, t.x, cy - r * scale - 12);

  // cooldown pips: left = dash (crimson), right = jump (slate)
  pip(g, t.x - 9, t.y + r + 16, 5, THEME.crimson, t.cd.dash);
  pip(g, t.x + 9, t.y + r + 16, 5, "#4b5565", t.cd.jump);
}

function pip(g, x, y, rad, color, cd) {
  const ready = cd <= 0;
  g.fillStyle = "rgba(0,0,0,0.14)";
  g.beginPath(); g.arc(x, y, rad, 0, TAU); g.fill();
  g.fillStyle = color;
  g.beginPath();
  if (ready) g.arc(x, y, rad, 0, TAU);
  else { g.moveTo(x, y); g.arc(x, y, rad, -Math.PI / 2, -Math.PI / 2 + (1 - cd / ABILITY.cooldown) * TAU); }
  g.fill();
}
