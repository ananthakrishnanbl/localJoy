// Visual juice only: sparks, shockwave rings, dash/throw trails, floating text and
// screen shake. Listens to the event bus.

import { TAU, rand } from "../core/vec.js";
import { rgba } from "./color.js";
import { THEME } from "./theme.js";

export function createEffects({ colorOf }) {
  const sparks = [], rings = [], texts = [], ghosts = [];
  let shake = 0, tick = 0;

  const burst = (x, y, n, o = {}) => {
    const { speed = [120, 420], life = [0.25, 0.55], colors = ["#fff"], angle = 0, spread = TAU, size = 2.2 } = o;
    for (let i = 0; i < n; i++) {
      const a = angle + (Math.random() - 0.5) * spread;
      const s = rand(speed[0], speed[1]);
      const l = rand(life[0], life[1]);
      sparks.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: l, max: l, color: colors[(Math.random() * colors.length) | 0], size });
    }
    if (sparks.length > 600) sparks.splice(0, sparks.length - 600);
  };
  const ring = (x, y, maxR, color, life = 0.45, width = 4) => rings.push({ x, y, maxR, color, life, max: life, width });
  const text = (x, y, str, color) => texts.push({ x, y, str, color, life: 1.1, max: 1.1 });
  const bump = (v) => { shake = Math.max(shake, v); };

  function bind(bus) {
    bus.on("bump", (e) => {
      burst(e.x, e.y, 4 + Math.round(e.power * 8), { colors: [THEME.ink, THEME.gold, ...e.slots.map(colorOf)], speed: [100, 100 + e.power * 260] });
      ring(e.x, e.y, 22 + e.power * 14, THEME.ink, 0.2, 2);
      bump(e.power * 2.5);
    });
    bus.on("wall", (e) => {
      burst(e.x, e.y, 3 + Math.round(e.power * 8), {
        angle: Math.atan2(-e.ny, -e.nx), spread: 1.5, colors: [THEME.gold, THEME.ink, "#c9c9d0"], speed: [90, 90 + e.power * 260], life: [0.2, 0.45],
      });
      bump(e.power * 2.5);
    });
    bus.on("wallsDown", () => {
      ring(640, 360, 360, THEME.gold, 0.9, 7);
      text(640, 330, "The walls are down!", THEME.crimson);
      bump(7);
    });
    bus.on("throw", (e) => {
      const c = colorOf(e.attacker);
      burst(e.x, e.y, 34, { angle: Math.atan2(e.dy, e.dx), spread: 1.4, colors: [c, THEME.crimson, THEME.gold, THEME.ink], speed: [200, 700], life: [0.3, 0.7], size: 3 });
      ring(e.x, e.y, 80, THEME.crimson, 0.35, 5);
      ring(e.x, e.y, 50, c, 0.45, 4);
      text(e.x, e.y - 34, "Smash!", THEME.crimson);
      bump(10);
    });
    bus.on("dash", (e) => {
      const c = colorOf(e.slot);
      ring(e.x, e.y, 44, c, 0.3, 3);
      burst(e.x, e.y, 12, { angle: Math.atan2(-e.dy, -e.dx), spread: 0.9, colors: [c, THEME.ink], speed: [200, 500] });
    });
    bus.on("jump", (e) => ring(e.x, e.y, 38, THEME.ink, 0.35, 3));
    bus.on("land", (e) => {
      ring(e.x, e.y, 34, THEME.inkSoft, 0.3, 3);
      burst(e.x, e.y, 8, { colors: [THEME.inkSoft, THEME.gold], speed: [60, 180], life: [0.2, 0.4] });
    });
    bus.on("out", (e) => {
      const c = colorOf(e.slot);
      ring(e.x, e.y, 70, c, 0.5, 4);
      burst(e.x, e.y, 18, { colors: [c, THEME.ink], speed: [80, 380], life: [0.3, 0.7] });
      text(e.x, e.y - 30, "Out!", THEME.ink);
      bump(4);
    });
  }

  function age(list, dt, fn) {
    let w = 0;
    for (let i = 0; i < list.length; i++) {
      const p = list[i];
      p.life -= dt;
      if (p.life > 0) { if (fn) fn(p); list[w++] = p; }
    }
    list.length = w;
  }

  function update(dt, tops) {
    tick++;
    for (const t of tops) {
      if ((t.dashT > 0 || t.thrownT > 0) && t.status === "alive" && tick % 2 === 0) {
        ghosts.push({ x: t.x, y: t.y - t.z * 0.55, color: t.thrownT > 0 && t.dashT <= 0 ? THEME.ink : colorOf(t.slot), r: t.r, life: 0.26, max: 0.26 });
      }
    }
    if (ghosts.length > 90) ghosts.splice(0, ghosts.length - 90);

    const drag = Math.exp(-4.5 * dt);
    age(sparks, dt, (s) => { s.x += s.vx * dt; s.y += s.vy * dt; s.vx *= drag; s.vy *= drag; });
    age(rings, dt);
    age(ghosts, dt);
    age(texts, dt, (t) => { t.y -= 28 * dt; });
    shake *= Math.exp(-9 * dt);
  }

  function drawUnder(g) {
    for (const r of rings) {
      const p = 1 - r.life / r.max;
      const rad = r.maxR * (1 - (1 - p) * (1 - p));
      g.strokeStyle = rgba(r.color, 1 - p);
      g.lineWidth = r.width * (1 - p * 0.6);
      g.beginPath();
      g.arc(r.x, r.y, rad, 0, TAU);
      g.stroke();
    }
    for (const gh of ghosts) {
      g.fillStyle = rgba(gh.color, (gh.life / gh.max) * 0.35);
      g.beginPath();
      g.arc(gh.x, gh.y, gh.r, 0, TAU);
      g.fill();
    }
  }

  function drawOver(g) {
    g.save();
    g.lineCap = "round";
    for (const s of sparks) {
      const k = s.life / s.max;
      g.strokeStyle = rgba(s.color, k);
      g.lineWidth = s.size * (0.4 + k);
      g.beginPath();
      g.moveTo(s.x, s.y);
      g.lineTo(s.x - s.vx * 0.035, s.y - s.vy * 0.035);
      g.stroke();
    }
    g.restore();

    g.textAlign = "center";
    g.font = `italic 700 26px ${THEME.serif}`;
    g.lineJoin = "round";
    g.lineWidth = 5;
    g.strokeStyle = "rgba(255,255,255,0.95)";
    for (const t of texts) {
      g.globalAlpha = Math.min(1, t.life / (t.max * 0.5));
      g.strokeText(t.str, t.x, t.y);
      g.fillStyle = t.color;
      g.fillText(t.str, t.x, t.y);
    }
    g.globalAlpha = 1;
  }

  return { bind, update, drawUnder, drawOver, get shake() { return shake; } };
}
