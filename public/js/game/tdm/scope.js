// TEAM DEATHMATCH  -  /js/game/tdm/scope.js
// The SCOPE: tap SCOPE (or double-tap the look area) on the phone and the view becomes a scope: a round lens with a dark housing and a
// reticle, zoomed in by the gun's range (see SCOPE in config.js). Tap again to leave it.
//
// Everything about the scope lives here, game.js only calls:
//   scope.toggle(ch)        the phone's SCOPE tap
//   scope.set(ch, false)    swap / pick up / reload / death switch it off
//   scope.reset(ch)         on (re)spawn
//   scope.tick(ch, dt, on)  every frame, per soldier: eases the zoom, zooms the camera, hides the in-hand gun, draws the scope overlay,
//                           and returns { lookMul, speedMul } (turning is divided by the zoom, walking slows down)
//   scope.remove(ch)        when a soldier is removed
//
// The phone counts SCOPE taps ("sc", a running total, like sw / pk), game.js turns the change into toggle(ch).
// The phone is told with { type: "ctf-scope", on, gun } so the SCOPE button can light up.
import { SCOPE, SCOPE_EASE, GUNS } from "./config.js";

// 100 units = half of the cell's shorter side, so the lens always fits the cell. The black outside the lens is the CSS background of the overlay.
const SCOPE_SVG = (() => {
  let ticks = "";
  for (let i = 1; i <= 4; i++) {                                  // mil marks along the cross hairs
    const p = i * 9, l = i === 2 || i === 4 ? 2.6 : 1.6;
    ticks += `<path d="M ${p} ${-l} V ${l} M ${-p} ${-l} V ${l} M ${-l} ${p} H ${l} M ${-l} ${-p} H ${l}" stroke="#0b0b0b" stroke-width=".5" fill="none"/>`;
  }
  return `<svg viewBox="-100 -100 200 200" preserveAspectRatio="xMidYMid meet" style="position:absolute;inset:0;width:100%;height:100%">
    <rect x="-9" y="-98" width="18" height="15" rx="3" fill="#2b2d33" stroke="#555a64" stroke-width="1"/>
    <rect x="83" y="-9" width="15" height="18" rx="3" fill="#2b2d33" stroke="#555a64" stroke-width="1"/>
    <circle r="80.5" fill="none" stroke="#3b3e46" stroke-width="6"/>
    <circle r="84" fill="none" stroke="#111216" stroke-width="2"/>
    <circle r="77.2" fill="none" stroke="#8c919c" stroke-width="1"/>
    <path d="M -62 -34 A 70 70 0 0 1 -30 -63" stroke="#fff" stroke-opacity=".3" stroke-width="3" fill="none" stroke-linecap="round"/>
    <path d="M -77 0 H 77 M 0 -77 V 77" stroke="#0b0b0b" stroke-width=".55" fill="none"/>
    <path d="M -77 0 H -36 M 36 0 H 77 M 0 -77 V -36 M 0 36 V 77" stroke="#0b0b0b" stroke-width="2.6" fill="none"/>
    ${ticks}
    <circle r="1" fill="#ff2a2a"/>
    <text data-z x="0" y="66" text-anchor="middle" fill="#fff" font-size="6" font-weight="700" font-family="Fredoka, system-ui, sans-serif" style="paint-order:stroke" stroke="#000" stroke-width="1.4"></text>
    <text data-r x="0" y="-60" text-anchor="middle" fill="#fff" font-size="4.6" font-weight="600" font-family="Fredoka, system-ui, sans-serif" style="paint-order:stroke" stroke="#000" stroke-width="1.2"></text>
  </svg>`;
})();
const SCOPE_MASK = "radial-gradient(circle closest-side at 50% 50%, rgba(0,0,0,0) 0%, rgba(120,170,255,.12) 74%, rgba(0,0,0,0) 76.5%, #000 77.5%)";

export function createScope(S, { ding, vibrate, gunOf }) {
  const { ctx } = S;
  let warned = false;

  const send = (ch) => ctx.send(ch.slot, { type: "ctf-scope", on: !!ch.scoped, gun: gunOf(ch).name });

  function set(ch, on) {
    on = !!on;
    if (!!ch.scoped === on) return;
    ch.scoped = on;
    if (on) ch.scopeId = gunOf(ch).id;                            // the zoom of the gun you scoped with, even while it eases out
    ding(on ? 760 : 520, 0.04);
    send(ch);
  }
  function toggle(ch) {
    if (!ch.alive || S.st.phase !== "play") return;
    if (!ch.scoped && ch.reloadT > 0) { vibrate(ch.slot, [10, 20, 10]); return; }   // no scoping while reloading
    set(ch, !ch.scoped);
  }
  function reset(ch) {                                            // fresh spawn: no scope, no zoom
    ch.scoped = false; ch.scopeK = 0; ch.scopeId = "";
    if (ch.cam && ch.cam.zoom !== 1) { ch.cam.zoom = 1; ch.cam.updateProjectionMatrix(); }
    ch._gunHid = false;
    send(ch);
  }
  function remove(ch) { ch.scopeEl?.remove(); ch.scopeEl = null; }

  // the scope picture, inside this soldier's split-screen cell (so it never shows in another player's view)
  function overlay(ch, e, cfg, gid) {
    const host = ch.view?.el;
    if (!host) {
      if (!warned && e > 0.01) { warned = true; console.warn("[tdm] scope: no split-screen cell found (ch.view.el), the zoom works but the scope picture is not drawn"); }
      return;
    }
    let o = ch.scopeEl;
    if (!o) {
      if (getComputedStyle(host).position === "static") host.style.position = "relative";
      o = ch.scopeEl = document.createElement("div");
      Object.assign(o.style, { position: "absolute", inset: "0", pointerEvents: "none", opacity: "0", display: "none", background: SCOPE_MASK });
      o.innerHTML = SCOPE_SVG;
      o._z = o.querySelector("[data-z]"); o._r = o.querySelector("[data-r]");
    }
    if (o.parentNode !== host) { host.prepend(o); o._xh = host.querySelector(".tdm-xh"); }   // first child = under the health / ammo HUD; also re-attaches if the cells were rebuilt
    if (o._xh) o._xh.style.opacity = e > 0.35 ? "0" : "";          // the normal crosshair makes way for the scope's reticle
    if (e < 0.01) { o.style.display = "none"; return; }
    o.style.display = "block"; o.style.opacity = String(Math.min(1, e * 1.6));
    const z = cfg.zoom.toFixed(1) + "x", r = "RANGE " + GUNS[gid].range;
    if (o._zt !== z) { o._zt = z; o._z.textContent = z; }
    if (o._rt !== r) { o._rt = r; o._r.textContent = r; }
  }

  function tick(ch, dt, active) {
    if (ch.scoped && (!ch.alive || !active)) set(ch, false);
    ch.scopeK = ch.scopeK || 0;
    const tgt = ch.scoped ? 1 : 0, dk = tgt - ch.scopeK;
    ch.scopeK = Math.abs(dk) < 0.002 ? tgt : ch.scopeK + dk * Math.min(1, dt * SCOPE_EASE);
    const gid = ch.scopeId || gunOf(ch).id, cfg = SCOPE[gid] || SCOPE.g1;
    const e = ch.scopeK * ch.scopeK * (3 - 2 * ch.scopeK);        // smooth 0..1
    const zoom = 1 + (cfg.zoom - 1) * e;
    // PerspectiveCamera.zoom scales the projection itself, so it keeps working even if the renderer sets its own fov / aspect every frame
    if (Math.abs(ch.cam.zoom - zoom) > 0.001) { ch.cam.zoom = zoom; ch.cam.updateProjectionMatrix(); }
    ch._gunHid = e > 0.35;                                        // the scope replaces the in-hand gun (ui.js skips drawing it while this is set)
    overlay(ch, e, cfg, gid);
    return { lookMul: (1 + (cfg.sens - 1) * e) / zoom, speedMul: 1 + (cfg.speed - 1) * e };   // turning is divided by the zoom, so aiming stays precise
  }

  return { set, toggle, reset, remove, tick };
}