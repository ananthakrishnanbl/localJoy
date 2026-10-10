// Draws one whole frame: arena -> effects -> tops -> effects -> HUD.

import { CANVAS } from "../config.js";
import { rand } from "../core/vec.js";
import { STATUS } from "../entities/top.js";
import { createArenaPainter } from "./drawArena.js";
import { advanceVisual, drawTop } from "./drawTop.js";
import { drawHud } from "./drawHud.js";

export function createRenderer({ canvas, roster, match, effects, getInfo }) {
  const g = canvas.getContext("2d");
  const paintArena = createArenaPainter(g);

  // falling tops underneath, then by height so jumpers draw on top
  const depth = (t) => (t.status === STATUS.ALIVE ? 1000 : 0) + t.z;

  return {
    draw(dt) {
      const tops = roster.list();
      for (const t of tops) advanceVisual(t, dt);

      g.setTransform(1, 0, 0, 1, 0, 0);
      g.clearRect(0, 0, CANVAS.w, CANVAS.h);

      g.save();
      const s = effects.shake;
      if (s > 0.05) g.translate(rand(-s, s), rand(-s, s));
      paintArena(match.shape, match.shrinking, match.wall);
      effects.drawUnder(g);
      tops.sort((a, b) => depth(a) - depth(b));
      for (const t of tops) drawTop(g, t, getInfo(t.slot));
      effects.drawOver(g);
      g.restore();

      drawHud(g, { roster, match, getInfo });
    },
  };
}
