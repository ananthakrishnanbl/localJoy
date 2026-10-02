// CAPTURE THE FLAG  -  /js/game/ctf/main.js
// 2 to 4 players, first-person, split screen, on the same map.glb as the "Map Walk" demo (index.html).
//
//   1. team select   the normal pad: stick left / right picks RED or BLUE, A = confirm team
//   1b. character    stick left / right picks a character (char1 ... char6), A = ready, B = back to team pick
//                    (the screen is split into one cell per player, each with a live 3D preview of the chosen soldier)
//   2. 3-2-1         everybody ready -> the match starts, phones switch to twin sticks + FIRE
//   3. play          steal the enemy flag from the far end room, run it back to your own flag stand.
//                    Med-kits appear at random spots in the middle room and refill health.
//                    The match lasts MATCH_TIME seconds: the team with the most captures when the clock runs out wins.
//                    (A tie goes to sudden-death overtime: next capture wins.) Then everybody goes back to team select.
//
//                    Everybody spawns carrying TWO guns (g1 + g2, one of them at random in hand).
//                    SWAP switches between them. Gun pickups (g3 / g4 / g5) sit at fixed spots on the map:
//                    stand next to one and press PICK -> the gun in your hand is swapped for it (your old one is left there).
//                    Picking up a flag never makes you drop a gun.
//                    Every gun has a total bullet limit (GUNS[x].total): magazine + spare bullets. When both are empty the gun is dry (swap or pick up another).
//                    The spare gun is shown on the soldier's back. Every bullet has a range limit (GUNS[x].range).
//                    Floor guns vanish after a random time (PICKUP_LIFE) and a new random gun appears at a new random spot.
//
// Files (inside this game's folder):
//   assets/map.glb
//   assets/characters/char1.glb ... char6.glb   (a missing charN.glb falls back to char1.glb)
//   assets/guns/g1.glb ... g5.glb
//
// Phone controller: js/pad/ctf.js  (messages: "ctf-mode" / "ctf-ammo" / "ctf-gun" / "ctf-hit" game -> phone, "ctf" phone -> game)
//
// CODE LAYOUT  (this file is only the entry point; the game itself is split into small files)
//   config.js        every setting / gun / team table
//   utils.js         small helpers      styles.js   all CSS      three-loader.js   loads three.js
//   setup/           renderer, asset loading, the map world, wall collision, map layout (bases, spawns)
//   models/          soldier + gun models, first-person gun, flag / base / med-kit models
//   game/            state, characters, weapons, pickups, flags + med-kits, match flow, per-frame update, input events
//   ui/              phone messages, sound, screen layers, lobby, split-screen HUD, rendering
//
// HOW THE FILES TALK TO EACH OTHER
//   start() makes one shared object  G  and calls the  setupXxx(G)  functions below, in this order.
//   Each setup function reads what earlier ones put on G, defines its own functions / objects, and adds the ones other files
//   need back onto G at the end.  Values that change while the game runs (phase, clocks, screen size, ...) live on  G.S .

import { CSS } from "./styles.js";
import { loadThree } from "./three-loader.js";
import { h } from "./utils.js";
import { setupRenderer } from "./setup/renderer.js";
import { setupAssets } from "./setup/assets.js";
import { setupWorld } from "./setup/world.js";
import { setupCollision } from "./setup/collision.js";
import { setupMapLayout } from "./setup/map-layout.js";
import { setupAvatar } from "./models/avatar.js";
import { setupViewGun } from "./models/view-gun.js";
import { setupProps } from "./models/props.js";
import { setupState } from "./game/state.js";
import { setupPhone } from "./ui/phone.js";
import { setupAudio } from "./ui/audio.js";
import { setupLayers } from "./ui/layers.js";
import { setupObjectives } from "./game/objectives.js";
import { setupPickups } from "./game/pickups.js";
import { setupLobby } from "./ui/lobby.js";
import { setupViews } from "./ui/views.js";
import { setupCharacters } from "./game/characters.js";
import { setupWeapons } from "./game/weapons.js";
import { setupMatch } from "./game/match.js";
import { setupUpdate } from "./game/update.js";
import { setupRender } from "./ui/render.js";
import { setupInput } from "./game/input.js";

export async function start(ctx) {
  const { root, signal } = ctx;
  const on = (t, type, fn) => t.addEventListener(type, fn, { signal });

  const style = h("style");
  style.textContent = CSS;
  document.head.append(style);
  const wrap = h("div", "ctf-wrap");
  const status = h("div", "ctf-status", "Loading map…");
  wrap.append(status);
  root.replaceChildren(wrap);
  const bail = (msg) => { status.textContent = msg; return { destroy() { style.remove(); } }; };

  let lib;
  try { lib = await loadThree(); } catch (e) { return bail("Could not load three.js\n" + (e?.message || e)); }
  if (signal.aborted) { style.remove(); return { destroy() {} }; }
  const { THREE, GLTFLoader, cloneSkinned } = lib;

  // the one shared object every setup function gets (see HOW THE FILES TALK TO EACH OTHER above)
  const G = { ctx, signal, on, style, wrap, status, bail, THREE, GLTFLoader, cloneSkinned, S: {} };

  // set everything up, in order (every file is described at the top of itself)
  setupRenderer(G);
  { const early = await setupAssets(G); if (early) return early; }   // loading failed or the game was closed meanwhile
  setupWorld(G);
  setupCollision(G);
  setupMapLayout(G);
  setupAvatar(G);
  setupViewGun(G);
  setupProps(G);
  setupState(G);
  setupPhone(G);
  setupAudio(G);
  setupLayers(G);
  setupObjectives(G);
  setupPickups(G);
  setupLobby(G);
  setupViews(G);
  setupCharacters(G);
  setupWeapons(G);
  setupMatch(G);
  setupUpdate(G);
  setupRender(G);
  setupInput(G);

  const S = G.S;
  const {
    scene, renderer, ro, tex, charTpl, gunTpl, mapMat, plain, world, mid, floorTop, disposeGunModel,
    gunMats, flashMat, roster, chars, pickups, discGeo, ringGeo, discMat, clearPreviews, renderLobby,
    lobbyHud, removeChar, sendModes, updateStats, sendPhoneHud, lobbyCam, update, render
  } = G;

  /* ---------------- go ---------------- */
  renderLobby();
  for (const slot of roster.keys()) lobbyHud(slot);
  renderer.shadowMap.needsUpdate = true;
  {                                                               // the lobby no longer draws the map, so bake its (static) shadows once, before any soldier exists
    lobbyCam.position.set(mid.x + 16, floorTop + 17, mid.z + 14); lobbyCam.lookAt(mid.x, floorTop + 1, mid.z); lobbyCam.aspect = S.W / S.HH; lobbyCam.updateProjectionMatrix();
    renderer.setScissorTest(false); renderer.setViewport(0, 0, S.W, S.HH);
    renderer.render(scene, lobbyCam);
  }
  let last = performance.now(), raf = 0;
  function frame(now) {
    raf = requestAnimationFrame(frame);
    const dt = Math.min(0.05, (now - last) / 1000); last = now;
    update(dt); render();
  }
  raf = requestAnimationFrame(frame);

  // phones: keep their pad mode right (a message can be missed while the pad is still loading) + refresh the health bar
  const phoneTimer = setInterval(() => {
    sendModes();
    if (S.phase === "teams") for (const slot of roster.keys()) lobbyHud(slot);
  }, 1500);
  const hudTimer = setInterval(() => { if (S.phase !== "teams") for (const ch of chars.values()) sendPhoneHud(ch); }, 300);
  const statsTimer = setInterval(updateStats, 700);

  return {
    destroy() {
      cancelAnimationFrame(raf);
      clearInterval(phoneTimer); clearInterval(hudTimer); clearInterval(statsTimer);
      ro?.disconnect();
      for (const slot of roster.keys()) {                            // phones back to the plain pad
        ctx.send(slot, { type: "ctf-mode", mode: "select" });
        ctx.send(slot, { type: "hud", text: "", down: false });
      }
      for (const ch of chars.values()) removeChar(ch);
      chars.clear();
      clearPreviews();
      discGeo.dispose(); ringGeo.dispose(); discMat.dispose(); gunMats.forEach((m) => m.dispose()); flashMat.dispose();
      world.traverse((o) => { o.geometry?.dispose(); });
      for (const p of pickups) if (p.model) disposeGunModel(p.model);
      for (const t of Object.values(gunTpl)) t.scene.traverse((o) => { o.geometry?.dispose(); });
      for (const t of new Set(charTpl)) t?.scene.traverse((o) => { o.geometry?.dispose(); });
      tex?.dispose(); mapMat?.dispose(); plain.dispose();
      try { S.audio?.close(); } catch {}
      renderer.dispose();
      renderer.forceContextLoss?.();
      style.remove();
    },
  };
}