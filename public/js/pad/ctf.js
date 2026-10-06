// "ctf": one pad with two modes, switched by the game.
//   select mode  the basic pad (joystick + B / A buttons), used on the team-select screen:
//                { type: "move", x, y }, { type: "button", id, pressed }
//                stick left / right = pick a team, A = ready, B = not ready
//   play mode    MOVE stick + drag-to-look + FIRE + RELOAD:
//                { type: "ctf", mx, my, lookX, lookY, rl, sw, pk, sc, sid, fire }
//                  FIRE: hold it and slide the same finger to turn the camera while shooting (like PUBG)
//                  SCOPE: small button next to SWAP / PICK, or double-tap the look area (sc = running count of taps)
//                  bottom LEFT    MOVE stick  (my: -1 = forward, mx: 1 = strafe right)
//                  RIGHT HALF     drag anywhere to turn the camera (like most mobile shooters)
//                  bottom RIGHT   FIRE (big) and RELOAD (shows your ammo)
//                  top LEFT       a second FIRE, for when the right thumb is busy looking
//                  top MIDDLE     small circular SWAP & PICK buttons (out of the way, easy to reach)
//   sw / pk are running counts of SWAP / PICK taps (same idea as rl).
//
//   lookX / lookY are running TOTALS of how far the finger has dragged (in "screen heights"),
//   and rl is a running count of reload taps. The game works out the difference since the last
//   message, so a dropped message can never lose a turn or a reload. sid is a random id for this
//   page load, so the game knows when the totals start again from zero.
//
// The game sends the phone:
//   { type: "ctf-mode", mode: "select" | "play" }
//   { type: "ctf-ammo", ammo, max, reloading, time, left }   keeps the ammo counter / reload ring up to date
//   { type: "ctf-hit", ang }                                  you were shot (red flash + little shake)
//   { type: "ctf-gun", cur, other, near }                     gun names: SWAP shows `other`, PICK lights up when `near` is set
//
// The play layout is built with its own inline styles (like race.js) so it never moves or resizes
// when something is pressed. Drag maths handles the phone being held upright (see `turned`).
import { el, turned, makeStick, makeButtons } from "./widgets.js";

const clamp = (v) => Math.max(-1, Math.min(1, v));
const css = (node, styles) => Object.assign(node.style, styles);

const LEFT_FIRE = true;                               // second FIRE button on the left side (set false to remove it)
const RING_BG = "rgba(16,32,43,.18)";

export default {
  id: "ctf",

  mount(root, io) {
    let mode = "select";
    let parts = [];                                   // widgets of the current layout, so they can be released
    const sid = Math.random().toString(36).slice(2, 8);
    const st = { mx: 0, my: 0, lookX: 0, lookY: 0, rl: 0, sw: 0, pk: 0, sc: 0, fire: false };
    let gunInfo = { cur: "", other: "", near: "" }, swapUI = null, pickUI = null, scopeUI = null;
    let scopeOn = false;                              // the game tells us when the scope is on (it owns the state; we only count taps)
    let last = "", lastSent = 0;

    // ammo state, kept here so a rebuilt layout can show it straight away
    let ammo = { n: 50, max: 50, reloading: false, time: 1.8, t0: 0 };
    let reloadUI = null, fx = null, shakeTarget = null, raf = 0;

    const post = () => io.send({ type: "ctf", mx: st.mx, my: st.my, lookX: st.lookX, lookY: st.lookY, rl: st.rl, sw: st.sw, pk: st.pk, sc: st.sc, sid, fire: st.fire });
    function send(force = false) {
      const key = `${st.mx}|${st.my}|${st.lookX}|${st.lookY}|${st.rl}|${st.sw}|${st.pk}|${st.sc}|${+st.fire}`;
      const now = performance.now();
      if (key === last || (!force && now - lastSent < 30)) return;
      last = key; lastSent = now;
      post();
    }
    // Heartbeat, so one dropped message can never leave a stick or the trigger stuck
    const beat = setInterval(() => mode === "play" && post(), 100);

    /* ---------- shared look maths: the look zone AND the FIRE buttons turn the camera through this ---------- */
    let padEl = null;                                 // the play layout, set in build(); its size gives the drag unit
    const FIRE_DRAG_DEAD = 8;                         // px a finger must slide on FIRE before it starts turning (so a plain press never jitters the aim)
    const LOOK_CAP = 0.5;                             // most one pointer event may turn, in pad heights (guards against a wild double drag)
    function addLook(dx, dy) {
      if (turned.matches) [dx, dy] = [dy, -dx];       // phone held upright: the pad is turned sideways by CSS
      const r = padEl ? padEl.getBoundingClientRect() : { width: 0, height: 0 };
      const unit = Math.max(120, turned.matches ? r.width : r.height);   // drags are measured in "pad heights", so every phone feels the same
      st.lookX = +(st.lookX + Math.max(-LOOK_CAP, Math.min(LOOK_CAP, dx / unit))).toFixed(4);
      st.lookY = +(st.lookY + Math.max(-LOOK_CAP, Math.min(LOOK_CAP, dy / unit))).toFixed(4);
      send();
    }

    /* ---------- a round thumb-stick (used for MOVE), drawn with inline styles ---------- */
    function thumbStick(label, emit) {
      const base = el("div", "");
      css(base, {
        position: "relative", height: "100%", aspectRatio: "1 / 1", borderRadius: "50%", boxSizing: "border-box",
        background: "radial-gradient(circle, rgba(16,32,43,.05) 0%, rgba(16,32,43,.16) 100%)",
        border: "6px solid rgba(16,32,43,.28)", boxShadow: "inset 0 0 0 10px rgba(255,255,255,.35), 0 5px 0 rgba(0,0,0,.18)",
        touchAction: "none", userSelect: "none", webkitUserSelect: "none",
      });
      base.setAttribute("aria-label", label);
      const tag = el("div", "", label);
      css(tag, {
        position: "absolute", left: 0, right: 0, bottom: "9%", textAlign: "center", pointerEvents: "none",
        font: "600 11px/1 Fredoka, system-ui, sans-serif", letterSpacing: ".08em", color: "rgba(16,32,43,.55)",
      });
      const knob = el("div", "");
      css(knob, {
        position: "absolute", left: "50%", top: "50%", width: "40%", height: "40%", marginLeft: "-20%", marginTop: "-20%",
        borderRadius: "50%", pointerEvents: "none", willChange: "transform",
        background: "radial-gradient(circle at 35% 30%, #ffffffaa, var(--player, #2aa9e0) 62%)",
        boxShadow: "0 5px 0 rgba(0,0,0,.25)",
      });
      base.append(tag, knob);

      let pid = null;
      function update(e) {
        const r = base.getBoundingClientRect();
        const max = (r.width - knob.offsetWidth) / 2;
        let dx = e.clientX - (r.left + r.width / 2);
        let dy = e.clientY - (r.top + r.height / 2);
        if (turned.matches) [dx, dy] = [dy, -dx];     // phone held upright: the pad is turned sideways by CSS
        const d = Math.hypot(dx, dy);
        if (d > max) { dx = (dx / d) * max; dy = (dy / d) * max; }
        knob.style.transition = "none";
        knob.style.transform = `translate(${dx}px, ${dy}px)`;
        let x = dx / max, y = dy / max;
        if (Math.hypot(x, y) < 0.12) { x = 0; y = 0; }   // dead zone
        emit(+clamp(x).toFixed(2), +clamp(y).toFixed(2), false);
      }
      function release() {
        if (pid === null) return;
        pid = null;
        knob.style.transition = "transform 100ms ease-out";
        knob.style.transform = "";
        emit(0, 0, true);                              // letting go is never throttled
      }
      base.addEventListener("pointerdown", (e) => {
        if (pid !== null) return;
        e.preventDefault();
        pid = e.pointerId;
        base.setPointerCapture?.(pid);
        navigator.vibrate?.(8);
        update(e);
      });
      base.addEventListener("pointermove", (e) => e.pointerId === pid && update(e));
      for (const ev of ["pointerup", "pointercancel", "lostpointercapture"])
        base.addEventListener(ev, (e) => e.pointerId === pid && release());
      base.addEventListener("contextmenu", (e) => e.preventDefault());
      return { el: base, release };
    }

    /* ---------- drag-to-look: the whole right half of the pad ---------- */
    function lookZone(layout) {
      const z = el("div", "");
      css(z, {
        position: "absolute", right: 0, top: 0, width: "50%", height: "100%", borderRadius: "20px", boxSizing: "border-box",
        background: "linear-gradient(90deg, rgba(16,32,43,0), rgba(16,32,43,.07))", transition: "background .15s",
        touchAction: "none", userSelect: "none", webkitUserSelect: "none",
      });
      z.setAttribute("aria-label", "LOOK");
      const hint = el("div", "", "DRAG HERE TO LOOK");
      css(hint, {
        position: "absolute", left: 0, right: 0, top: "16%", textAlign: "center", pointerEvents: "none", transition: "opacity .4s",
        font: "600 12px/1 Fredoka, system-ui, sans-serif", letterSpacing: ".12em", color: "rgba(16,32,43,.4)",
      });
      z.append(hint);

      let pid = null, px = 0, py = 0;
      let downT = 0, moved = 0, lastTap = 0;           // for double-tap = SCOPE
      function release() {
        if (pid === null) return;
        pid = null;
        z.style.background = "linear-gradient(90deg, rgba(16,32,43,0), rgba(16,32,43,.07))";
        const now = performance.now();
        if (moved < 10 && now - downT < 220) {          // a quick tap that did not drag: two of them in a row toggle the scope
          if (now - lastTap < 320) { lastTap = 0; st.sc++; navigator.vibrate?.(12); }
          else lastTap = now;
        }
        send(true);                                    // the last bit of a drag is never throttled
      }
      z.addEventListener("pointerdown", (e) => {
        if (pid !== null) return;
        e.preventDefault();
        downT = performance.now(); moved = 0;
        pid = e.pointerId; px = e.clientX; py = e.clientY;
        z.setPointerCapture?.(pid);
        hint.style.opacity = "0";
        z.style.background = "linear-gradient(90deg, rgba(255,255,255,0), rgba(255,255,255,.18))";
      });
      z.addEventListener("pointermove", (e) => {
        if (e.pointerId !== pid) return;
        const dx = e.clientX - px, dy = e.clientY - py;
        px = e.clientX; py = e.clientY;
        moved += Math.hypot(dx, dy);
        addLook(dx, dy);
      });
      for (const ev of ["pointerup", "pointercancel", "lostpointercapture"])
        z.addEventListener(ev, (e) => e.pointerId === pid && release());
      z.addEventListener("contextmenu", (e) => e.preventDefault());
      return { el: z, release };
    }

    /* ---------- FIRE buttons (there can be two; either one fires) ---------- */
    const holds = new Set();
    function fireButton(extra = {}) {
      const b = el("div", "", "FIRE");
      css(b, {
        aspectRatio: "1 / 1", flex: "0 0 auto", borderRadius: "50%", boxSizing: "border-box",
        display: "flex", alignItems: "center", justifyContent: "center",
        background: "radial-gradient(circle at 35% 30%, #ff8a8e, #e5484d 60%, #b8282d)", color: "#fff",
        font: "700 20px/1 Fredoka, system-ui, sans-serif", letterSpacing: ".08em",
        border: "4px solid rgba(255,255,255,.55)", boxShadow: "0 6px 0 rgba(0,0,0,.28)",
        touchAction: "none", userSelect: "none", webkitUserSelect: "none", cursor: "pointer", ...extra,
      });
      const key = {};
      let down = false;
      let fpid = null, sx = 0, sy = 0, fx0 = 0, fy0 = 0, sliding = false;   // finger tracking for fire-and-look with one thumb
      const set = (v) => {
        if (v === down) return;
        down = v;
        if (!v) { fpid = null; sliding = false; }
        b.style.filter = v ? "brightness(1.2)" : "none";
        b.style.transform = v ? "translateY(5px)" : "none";                 // looks pressed, layout stays put
        b.style.boxShadow = v ? "0 1px 0 rgba(0,0,0,.28)" : "0 6px 0 rgba(0,0,0,.28)";
        if (v) holds.add(key); else holds.delete(key);
        st.fire = holds.size > 0;
        send(true);
      };
      b.addEventListener("pointerdown", (e) => {
        e.preventDefault();
        if (fpid === null) { fpid = e.pointerId; sx = fx0 = e.clientX; sy = fy0 = e.clientY; sliding = false; }
        b.setPointerCapture?.(e.pointerId); set(true); navigator.vibrate?.(8);
      });
      // keep holding FIRE and slide: the camera turns while the gun keeps shooting (pointer capture keeps the events coming outside the button)
      b.addEventListener("pointermove", (e) => {
        if (e.pointerId !== fpid || !down) return;
        if (!sliding) {
          if (Math.hypot(e.clientX - sx, e.clientY - sy) < FIRE_DRAG_DEAD) return;
          sliding = true; fx0 = e.clientX; fy0 = e.clientY;                 // start turning from here, so there is no jump
          return;
        }
        const dx = e.clientX - fx0, dy = e.clientY - fy0;
        fx0 = e.clientX; fy0 = e.clientY;
        addLook(dx, dy);
      });
      for (const ev of ["pointerup", "pointercancel", "lostpointercapture"]) b.addEventListener(ev, () => set(false));
      b.addEventListener("contextmenu", (e) => e.preventDefault());
      return { el: b, release: () => set(false) };
    }

    /* ---------- RELOAD button, also shows the ammo and a progress ring while reloading ---------- */
    function reloadButton() {
      const b = el("div", "");
      css(b, {
        aspectRatio: "1 / 1", flex: "0 0 auto", borderRadius: "50%", boxSizing: "border-box",
        display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: "3px",
        background: RING_BG, color: "#10202b",
        border: "4px solid rgba(255,255,255,.55)", boxShadow: "0 5px 0 rgba(0,0,0,.25)",
        touchAction: "none", userSelect: "none", webkitUserSelect: "none", cursor: "pointer",
      });
      const count = el("div", "");
      css(count, { font: "700 20px/1 Fredoka, system-ui, sans-serif", pointerEvents: "none" });
      const label = el("div", "");
      css(label, { font: "600 9px/1 Fredoka, system-ui, sans-serif", letterSpacing: ".08em", pointerEvents: "none", opacity: ".75" });
      b.append(count, label);

      let down = false;
      const set = (v) => {
        if (v === down) return;
        down = v;
        b.style.transform = v ? "translateY(4px)" : "none";
        b.style.boxShadow = v ? "0 1px 0 rgba(0,0,0,.25)" : "0 5px 0 rgba(0,0,0,.25)";
        if (v) { st.rl++; send(true); navigator.vibrate?.(12); }
      };
      b.addEventListener("pointerdown", (e) => { e.preventDefault(); b.setPointerCapture?.(e.pointerId); set(true); });
      for (const ev of ["pointerup", "pointercancel", "lostpointercapture"]) b.addEventListener(ev, () => set(false));
      b.addEventListener("contextmenu", (e) => e.preventDefault());
      return { el: b, count, label, release: () => set(false) };
    }

    /* ---------- SWAP / PICK: small circular buttons ---------- */
    function circleTapButton(title, counter, colors) {
      const b = el("div", "");
      css(b, {
        height: "100%", aspectRatio: "1 / 1", flex: "0 0 auto", borderRadius: "50%", boxSizing: "border-box",
        display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
        background: colors.bg, color: colors.fg, border: "3px solid rgba(255,255,255,.55)", boxShadow: "0 4px 0 rgba(0,0,0,.25)",
        touchAction: "none", userSelect: "none", webkitUserSelect: "none", cursor: "pointer", transition: "opacity .2s, background .2s",
      });
      const t = el("div", "", title);
      css(t, { font: "700 11px/1 Fredoka, system-ui, sans-serif", letterSpacing: ".06em", pointerEvents: "none" });
      const sub = el("div", "");
      css(sub, { font: "600 7px/1 Fredoka, system-ui, sans-serif", letterSpacing: ".04em", pointerEvents: "none", opacity: ".85", whiteSpace: "nowrap", overflow: "hidden", maxWidth: "90%", marginTop: "2px" });
      b.append(t, sub);

      let down = false;
      const set = (v) => {
        if (v === down) return;
        down = v;
        b.style.transform = v ? "translateY(3px)" : "none";
        b.style.boxShadow = v ? "0 1px 0 rgba(0,0,0,.25)" : "0 4px 0 rgba(0,0,0,.25)";
        if (v) { st[counter]++; send(true); navigator.vibrate?.(12); }
      };
      b.addEventListener("pointerdown", (e) => { e.preventDefault(); b.setPointerCapture?.(e.pointerId); set(true); });
      for (const ev of ["pointerup", "pointercancel", "lostpointercapture"]) b.addEventListener(ev, () => set(false));
      b.addEventListener("contextmenu", (e) => e.preventDefault());
      return { el: b, sub, release: () => set(false) };
    }

    function paintGuns() {
      if (swapUI) swapUI.sub.textContent = gunInfo.other ? gunInfo.other : "";
      if (pickUI) {
        const on = !!gunInfo.near;
        pickUI.sub.textContent = on ? gunInfo.near : "";
        pickUI.el.style.opacity = on ? "1" : ".45";
        pickUI.el.style.background = on ? "radial-gradient(circle at 35% 30%, #ffe7a0, #ffc23d 65%, #d99a10)" : RING_BG;
      }
    }

    function paintScope() {
      if (!scopeUI) return;
      scopeUI.sub.textContent = scopeOn ? "ON" : "";
      scopeUI.el.style.background = scopeOn ? "radial-gradient(circle at 35% 30%, #b9ffcf, #2fc66b 65%, #1c8f4b)" : "radial-gradient(circle at 35% 30%, #e3d3ff, #8b5cf6 65%, #5b34c4)";
    }

    function paintAmmo() {
      cancelAnimationFrame(raf);
      if (!reloadUI) return;
      const { n, max, reloading, time, t0 } = ammo;
      reloadUI.count.textContent = reloading ? "…" : String(n);
      reloadUI.count.style.color = !reloading && n <= max * 0.2 ? "#e5484d" : "#10202b";
      reloadUI.label.textContent = reloading ? "RELOADING" : n >= max ? "FULL" : "RELOAD";
      if (reloading) {
        const step = () => {
          const p = Math.min(1, (performance.now() - t0) / (time * 1000));
          reloadUI.el.style.background = `conic-gradient(#ffd060 ${p * 360}deg, ${RING_BG} 0)`;
          if (p < 1) raf = requestAnimationFrame(step);
        };
        step();
      } else {
        reloadUI.el.style.background = RING_BG;
      }
    }

    /* ---------- "you were hit": red edge flash + a small shake of the pad ---------- */
    function hitEffect() {
      if (!fx) return;
      fx.style.transition = "none";
      fx.style.opacity = "1";
      requestAnimationFrame(() => requestAnimationFrame(() => {
        if (!fx) return;
        fx.style.transition = "opacity .45s ease-out";
        fx.style.opacity = "0";
      }));
      shakeTarget?.animate?.(
        [{ transform: "translate(0,0)" }, { transform: "translate(-6px,3px)" }, { transform: "translate(5px,-3px)" },
          { transform: "translate(-3px,2px)" }, { transform: "translate(0,0)" }],
        { duration: 220, easing: "ease-out" },
      );
    }

    function build() {
      cancelAnimationFrame(raf);
      parts.forEach((p) => p.release?.());
      parts = [];
      reloadUI = null; fx = null; shakeTarget = null; swapUI = null; pickUI = null; scopeUI = null;
      root.replaceChildren();

      if (mode === "play") {
        const layout = el("div", "");
        css(layout, {
          position: "relative", width: "100%", height: "100%", minHeight: "180px",
          gridColumn: "1 / -1", alignSelf: "stretch", flex: "1 1 100%",
          boxSizing: "border-box", touchAction: "none", userSelect: "none", webkitUserSelect: "none",
        });
        shakeTarget = layout;
        padEl = layout;

        // right half: drag to look (sits underneath everything else)
        const look = lookZone(layout);

        // bottom-left: MOVE
        const left = el("div", "");
        css(left, { position: "absolute", left: "3%", bottom: "5%", height: "62%", aspectRatio: "1 / 1" });
        const move = thumbStick("MOVE", (x, y, f) => { st.mx = x; st.my = y; send(f); });
        move.el.style.height = "100%";
        left.append(move.el);

        // bottom-right: RELOAD next to a big FIRE
        const right = el("div", "");
        css(right, {
          position: "absolute", right: "3%", bottom: "6%", height: "42%",
          display: "flex", alignItems: "flex-end", gap: "14px",
        });
        reloadUI = reloadButton();
        reloadUI.el.style.height = "62%";
        const fire = fireButton({ height: "100%" });
        right.append(reloadUI.el, fire.el);

        parts.push(look, move, reloadUI, fire);
        layout.append(look.el, left, right);

        // top-left: a second FIRE, so you can shoot with the left thumb while the right one keeps looking
        if (LEFT_FIRE) {
          const fire2 = fireButton({ position: "absolute", left: "5%", top: "4%", height: "26%", opacity: ".9", fontSize: "15px" });
          parts.push(fire2);
          layout.append(fire2.el);
        }

        // top-middle: small circular SWAP + PICK buttons
        const gunRow = el("div", "");
        css(gunRow, {
          position: "absolute", left: "50%", transform: "translateX(-50%)", top: "5%",
          height: "22%", display: "flex", gap: "12px", alignItems: "center", justifyContent: "center",
          zIndex: "2",
        });
        swapUI = circleTapButton("SWAP", "sw", { bg: "radial-gradient(circle at 35% 30%, #a9d8ff, #3b8bff 65%, #2563c9)", fg: "#fff" });
        pickUI = circleTapButton("PICK", "pk", { bg: RING_BG, fg: "#10202b" });
        scopeUI = circleTapButton("SCOPE", "sc", { bg: "radial-gradient(circle at 35% 30%, #e3d3ff, #8b5cf6 65%, #5b34c4)", fg: "#fff" });
        gunRow.append(swapUI.el, pickUI.el, scopeUI.el);
        parts.push(swapUI, pickUI, scopeUI);
        layout.append(gunRow);
        paintGuns();
        paintScope();

        // red flash around the edges when you get shot (never blocks touches)
        fx = el("div", "");
        css(fx, {
          position: "absolute", inset: 0, pointerEvents: "none", opacity: 0, borderRadius: "20px",
          boxShadow: "inset 0 0 60px 18px rgba(229,72,77,.9)",
        });
        layout.append(fx);

        root.append(layout);
        paintAmmo();
      } else {
        // the default controller: joystick + buttons (A = ready, B = not ready)
        const stick = makeStick({ emit: (x, y) => io.send({ type: "move", x, y }) });
        const buttons = makeButtons(["B", "A"], io.send);
        parts.push(stick, buttons);
        root.append(stick.el, buttons.el);
      }
    }
    build();

    return {
      release() {
        parts.forEach((p) => p.release?.());
        st.mx = st.my = 0; st.fire = false;
        holds.clear();
        if (mode === "play") post();
      },
      destroy() {
        clearInterval(beat);
        cancelAnimationFrame(raf);
      },
      onMessage(msg) {
        if (msg.type === "ctf-ammo") {
          const time = +msg.time || 1.8;
          ammo = {
            n: msg.ammo | 0, max: (msg.max | 0) || 50, reloading: !!msg.reloading, time,
            t0: performance.now() - (time - (+msg.left || 0)) * 1000,   // re-synced on every message
          };
          paintAmmo();
          return;
        }
        if (msg.type === "ctf-hit") { hitEffect(); return; }
        if (msg.type === "ctf-scope") { scopeOn = !!msg.on; paintScope(); return; }
        if (msg.type === "ctf-gun") { gunInfo = { cur: msg.cur || "", other: msg.other || "", near: msg.near || "" }; paintGuns(); return; }
        if (msg.type !== "ctf-mode") return;
        const next = msg.mode === "play" ? "play" : "select";
        if (next === mode) return;
        mode = next;
        scopeOn = false;
        st.mx = st.my = 0; st.fire = false; holds.clear(); last = "";   // lookX / lookY / rl / sw / pk / sc keep counting: they are running totals
        build();
      },
    };
  },
};