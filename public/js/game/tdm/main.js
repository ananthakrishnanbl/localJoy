// TEAM DEATHMATCH  -  /js/game/tdm/main.js   (entry point: export start(ctx), as described in How_To_Add_A_Game)
// 2 to 4 players, first-person, split screen, on the map in assets/map.glb.
//
//   1. select      stick ◀ ▶ = RED team · SOLO · BLUE team, A = confirm.  Then stick ◀ ▶ = character, A = ready, B = back.
//   2. 3-2-1       everybody ready (and at least two sides) -> the match starts, phones switch to twin sticks + FIRE
//   3. play        team deathmatch: every kill is a point for the killer's side. Teammates never hurt each other,
//                  a SOLO player fights everybody. Most kills when the clock runs out wins (a tie = sudden-death overtime).
//                  Med-kits: one in the exact middle of the map + one in each of two RANDOM corners (new corners every match).
//                  Everybody spawns with two guns (SWAP switches), floor guns can be taken with PICK (see config.js).
//
// Files:  config.js (settings + helpers) · world.js (renderer, map, collision, spawns) · models.js (soldiers, guns, med-kit)
//         lobby.js (select screen) · ui.js (HUD, score bar, drawing) · game.js (rules, combat, match flow, input)
// Phone controller: js/pad/ctf.js (unchanged: "ctf-mode" / "ctf-ammo" / "ctf-gun" / "ctf-hit" game -> phone, "ctf" phone -> game)
import { CSS, createUI } from "./ui.js";
import { loadThree, createWorld } from "./world.js";
import { createModels } from "./models.js";
import { createLobby } from "./lobby.js";
import { createGame } from "./game.js";
import { MATCH_TIME, h } from "./config.js";

export async function start(ctx) {
  const { root, signal } = ctx;
  const on = (t, type, fn) => t.addEventListener(type, fn, { signal });

  const style = h("style");
  style.textContent = CSS;
  document.head.append(style);
  const wrap = h("div", "tdm-wrap");
  const status = h("div", "tdm-status", "Loading map…");
  wrap.append(status);
  root.replaceChildren(wrap);
  const bail = (msg) => { status.textContent = msg; return { destroy() { style.remove(); } }; };
  const aborted = () => signal.aborted;

  let lib;
  try { lib = await loadThree(); } catch (e) { return bail("Could not load three.js\n" + (e?.message || e)); }
  if (aborted()) { style.remove(); return { destroy() {} }; }
  const { THREE } = lib;

  // S = the shared box every file reads from (filled step by step below)
  const S = {
    ...lib, ctx, root, signal, wrap, status,
    dim: { W: 1280, HH: 720 },                                    // current size of the screen
    st: { phase: "teams", countT: 0, overT: 0, bannerT: 0, tNow: 0, matchT: MATCH_TIME, overtime: false },   // teams -> count -> play -> over -> teams
    roster: new Map(),                                            // everybody connected: slot -> { side, ready, latch, stage, char }
    chars: new Map(),                                             // players in the match: slot -> character
    factions: [], medkits: [],
  };
  // a faction = RED team, BLUE team, or one solo player: its name / colour (a solo player uses his own console colour)
  S.fac = {
    name: (f) => (f.solo ? ctx.player(f.slot)?.name ?? `P${f.slot}` : f.name),
    color: (f) => (f.solo ? ctx.player(f.slot)?.color || "#888888" : f.color),
    hex: (f) => (f.solo ? new THREE.Color(S.fac.color(f)).getHex() : f.hex),
  };

  const world = await createWorld(S);
  if (!world) return { destroy() { style.remove(); } };
  status.textContent = "Loading characters and guns…";
  S.models = await createModels(S);
  if (aborted()) { S.models.dispose(); world.dispose(); style.remove(); return { destroy() {} }; }
  S.ui = createUI(S);
  S.lobby = createLobby(S);
  S.game = createGame(S);
  const { renderer, scene, mid, floorTop, dim, st } = S;

  /* ---------------- events from the console ---------------- */
  on(window, "player-join", (e) => S.game.onJoin(e.detail.slot));
  on(window, "player-leave", (e) => S.game.onLeave(e.detail.slot));
  on(window, "controller-input", (e) => { const { slot, data } = e.detail || {}; S.game.onInput(slot, data); });

  /* ---------------- go ---------------- */
  S.lobby.show();
  renderer.shadowMap.needsUpdate = true;
  {                                                               // the select screen does not draw the map, so bake its (static) shadows once, before any soldier exists
    const cam = new THREE.PerspectiveCamera(60, dim.W / dim.HH, 0.1, 500);
    cam.position.set(mid.x + 16, floorTop + 17, mid.z + 14); cam.lookAt(mid.x, floorTop + 1, mid.z);
    renderer.setScissorTest(false); renderer.setViewport(0, 0, dim.W, dim.HH);
    renderer.render(scene, cam);
  }
  let last = performance.now(), raf = 0;
  function frame(now) {
    raf = requestAnimationFrame(frame);
    const dt = Math.min(0.05, (now - last) / 1000); last = now;
    S.game.update(dt); S.ui.render();
  }
  raf = requestAnimationFrame(frame);
  S.game.sendModes();

  return {
    destroy() {
      cancelAnimationFrame(raf);
      S.game.dispose();
      S.lobby.dispose();
      S.models.dispose();
      world.dispose();
      style.remove();
    },
  };
}
