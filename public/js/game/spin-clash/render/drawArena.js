// The stadium: a floating round platform with NO walls, over a dark void.
// The platform radius is passed in each frame because it shrinks late in a round.

import { ARENA, CANVAS } from "../config.js";
import { TAU } from "../core/vec.js";

export function createArenaPainter(g) {
  const { cx, cy } = ARENA;

  const bg = g.createRadialGradient(cx, cy, 120, cx, cy, CANVAS.w * 0.65);
  bg.addColorStop(0, "#0d1428");
  bg.addColorStop(1, "#02030a");

  // a few static stars so the void doesn't look empty
  const stars = Array.from({ length: 70 }, (_, i) => {
    const a = (i * 2.399963) % TAU, d = 340 + ((i * 97) % 520);
    return { x: cx + Math.cos(a) * d, y: cy + Math.sin(a) * d * 0.7, r: 0.6 + ((i * 7) % 10) / 10 };
  });

  return function paint(R, shrinking) {
    g.fillStyle = bg;
    g.fillRect(-30, -30, CANVAS.w + 60, CANVAS.h + 60);
    g.fillStyle = "rgba(255,255,255,0.35)";
    for (const s of stars) { g.beginPath(); g.arc(s.x, s.y, s.r, 0, TAU); g.fill(); }

    // platform thickness (the side you'd see if it were tilted)
    g.save();
    g.shadowColor = "rgba(0,0,0,0.7)";
    g.shadowBlur = 36;
    g.fillStyle = "#0a0f22";
    g.beginPath(); g.arc(cx, cy + 16, R, 0, TAU); g.fill();
    g.restore();

    // floor
    const floor = g.createRadialGradient(cx, cy, 10, cx, cy, R);
    floor.addColorStop(0, "#34457a");
    floor.addColorStop(0.55, "#26335e");
    floor.addColorStop(1, "#18214a");
    g.fillStyle = floor;
    g.beginPath(); g.arc(cx, cy, R, 0, TAU); g.fill();

    // danger zone glow near the edge
    const glow = g.createRadialGradient(cx, cy, R * 0.8, cx, cy, R);
    glow.addColorStop(0, "rgba(255,70,90,0)");
    glow.addColorStop(1, "rgba(255,70,90,0.3)");
    g.fillStyle = glow;
    g.beginPath(); g.arc(cx, cy, R, 0, TAU); g.fill();

    // rings + spokes
    g.strokeStyle = "rgba(255,255,255,0.08)";
    g.lineWidth = 2;
    for (const k of [0.25, 0.5, 0.75]) { g.beginPath(); g.arc(cx, cy, R * k, 0, TAU); g.stroke(); }
    g.strokeStyle = "rgba(255,255,255,0.05)";
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * TAU;
      g.beginPath();
      g.moveTo(cx + Math.cos(a) * R * 0.12, cy + Math.sin(a) * R * 0.12);
      g.lineTo(cx + Math.cos(a) * R * 0.97, cy + Math.sin(a) * R * 0.97);
      g.stroke();
    }

    // edge line: turns red and pulses while the stadium shrinks
    const pulse = shrinking ? 0.55 + 0.45 * Math.sin(performance.now() / 120) : 0;
    g.lineWidth = shrinking ? 6 : 4;
    g.strokeStyle = shrinking ? `rgba(255,${Math.round(90 + 40 * pulse)},90,${0.7 + 0.3 * pulse})` : "rgba(160,180,255,0.55)";
    g.beginPath(); g.arc(cx, cy, R, 0, TAU); g.stroke();
  };
}
