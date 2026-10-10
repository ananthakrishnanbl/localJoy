// SPIN CLASH - entry point. The console calls start(ctx); we wire the modules
// together, run the fixed-step loop and return destroy().
//
//   core/      roster, match (rounds), input, phone link, keyboard test player
//   entities/  top data + dash/jump abilities
//   physics/   motion, collisions (dash throws), stadium edge, fixed-step world
//   render/    arena, tops, HUD, effects, CSS

import { CANVAS, PHYSICS } from "./config.js";
import { createBus } from "./core/bus.js";
import { createRoster } from "./core/roster.js";
import { createMatch } from "./core/match.js";
import { attachInput } from "./core/input.js";
import { attachKeyboardPlayer, keyboardEnabled, KB_INFO, KB_SLOT } from "./core/keyboard.js";
import { createPhoneLink } from "./core/phoneLink.js";
import { createWorld } from "./physics/world.js";
import { createEffects } from "./render/effects.js";
import { createRenderer } from "./render/renderer.js";
import { installStyles } from "./render/styles.js";
import { createSound } from "./core/sound.js";

export function start(ctx) {
  const { root, signal } = ctx;
  const on = (target, type, fn) => target.addEventListener(type, fn, { signal });

  // ---- display ---------------------------------------------------------
  const style = installStyles();
  const canvas = document.createElement("canvas");
  canvas.className = "spinclash-canvas";
  canvas.width = CANVAS.w;
  canvas.height = CANVAS.h;
  const wrap = document.createElement("div");
  wrap.className = "spinclash-wrap";
  wrap.append(canvas);
  root.replaceChildren(wrap);

  // ---- state + systems ---------------------------------------------------
  const getInfo = (slot) => (slot === KB_SLOT ? KB_INFO : ctx.player(slot));
  const colorOf = (slot) => getInfo(slot)?.color ?? "#ffffff";

  const bus = createBus();
  const roster = createRoster();
  const match = createMatch({ roster, bus });
  const world = createWorld({ roster, bus });
  const effects = createEffects({ colorOf });
  const phone = createPhoneLink({ ctx, bus, roster, match });
  const sound = createSound({ bus, match, on });
  const renderer = createRenderer({ canvas, roster, match, effects, getInfo });
  effects.bind(bus);

  // ---- players -----------------------------------------------------------
  ctx.players().forEach((p) => roster.add(p.slot));
  on(window, "player-join", (e) => roster.add(e.detail.slot));
  on(window, "player-leave", (e) => {
    const top = roster.get(e.detail.slot);
    if (top) match.playerLeft(top); // counts as eliminated if they leave mid-fight
    roster.remove(e.detail.slot);
    match.forget(e.detail.slot);
  });
  attachInput({ roster, on });
  const keyboard = keyboardEnabled() ? attachKeyboardPlayer({ roster, on }) : null;

  // ---- loop --------------------------------------------------------------
  function simulate(h) {
    match.update(h);
    if (match.physicsOn) {
      world.sim.shape = match.shape;
      world.sim.wall = match.wall;
      world.sim.combat = match.combatOn;
      world.sim.abilities = true;
      world.step(h);
    }
  }

  let raf = 0, last = performance.now(), acc = 0;
  function frame(now) {
    const dt = Math.min(PHYSICS.maxFrame, (now - last) / 1000);
    last = now;
    acc += dt;
    while (acc >= PHYSICS.step) { simulate(PHYSICS.step); acc -= PHYSICS.step; }

    effects.update(dt, roster.list());
    phone.update(dt);
    sound.update(dt);
    renderer.draw(dt);
    raf = requestAnimationFrame(frame);
  }
  raf = requestAnimationFrame(frame);

  return {
    destroy() {
      cancelAnimationFrame(raf);
      sound.destroy();
      bus.clear();
      if (keyboard) keyboard.destroy();
      style.remove();
    },
  };
}
