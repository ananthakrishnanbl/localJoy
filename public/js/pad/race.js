// "race": one pad with two modes, switched by the game.
//   select mode  the basic pad (joystick + buttons): { type: "move", x, y }, { type: "button", id, pressed }
//   drive mode   steering + GAS / BRAKE: { type: "race", steer, gas, brake }
// The game switches modes with { type: "race-mode", mode: "select" | "drive" }
// and re-centres the wheel with { type: "race-recenter" }.
//
// Drive layout (phone held sideways):
//   LEFT   steering wheel: an outer circle with a knob inside
//          tilt steering  -> circle in the middle of the left area, the knob follows the phone
//          manual steering -> circle in the bottom-left corner (easy thumb reach); touch anywhere in the
//                             left area and drag, the knob follows your thumb, let go to go straight
//   RIGHT  two small buttons, GAS on top, BRAKE below
// The drive layout is built with its own inline styles, so it does not move or resize when a button is pressed.
//
// Steering has two methods:
//   TILT    used when the phone gives sensor data (HTTPS or localhost; iOS asks for permission first).
//           Turn the phone like a wheel. Tap the steering zone to re-centre.
//   MANUAL  used when there is no sensor (plain HTTP, no data within 2 s, permission denied).
//           Drag your thumb left/right (the knob follows), let go to go straight.
// If sensor data shows up later, tilt takes over by itself.
import { el, makeStick, makeButtons } from "./widgets.js";

const DEBUG = true;                     // set to false once everything works
const RANGE = 32;                       // degrees of wheel turn that count as full lock
const SENSOR_TIMEOUT = 2000;            // ms to wait for the first tilt reading before using manual steering
const D2R = Math.PI / 180, R2D = 180 / Math.PI;
const clamp = (v) => Math.max(-1, Math.min(1, v));
const wrap = (d) => ((d + 540) % 360) - 180;

const css = (node, styles) => Object.assign(node.style, styles);

export default {
  id: "race",

  mount(root, io) {
    let mode = "select";
    let parts = [];                     // widgets of the current layout, so they can be released
    let zone = null, knob = null, label = null, watchdog = null;
    let zero = null, angle = 0, tiltOn = false;
    let manual = !window.isSecureContext;   // plain HTTP: browsers never deliver motion data, go manual at once
    let dragging = false;
    const drive = { steer: 0, gas: false, brake: false };
    let last = "", lastSent = 0;

    const needsPermission = typeof DeviceOrientationEvent !== "undefined" &&
      typeof DeviceOrientationEvent.requestPermission === "function";      // iOS
    const enableBtn = el("button", "toy primary", "📱 Enable tilt");

    const post = () => io.send({ type: "race", steer: drive.steer, gas: drive.gas, brake: drive.brake });
    function sendDrive(force = false) {
      const key = `${drive.steer}|${+drive.gas}|${+drive.brake}`;
      const now = performance.now();
      if (key === last || (!force && now - lastSent < 30)) return;
      last = key; lastSent = now;
      post();
    }
    // Heartbeat, so a dropped message can never leave the bike stuck on full throttle
    const beat = setInterval(() => mode === "drive" && post(), 100);

    // Knob position inside the outer circle: vis.x / vis.y run from -1 to 1 (1 = touching the ring).
    // The knob is 38% of the ring, so full travel is 81.6% of the knob's own size.
    const vis = { x: 0, y: 0 };
    const setKnob = () => {
      if (knob) knob.style.transform = `translate(${-50 + vis.x * 81.6}%, ${-50 + vis.y * 81.6}%)`;
    };

    function useManual(why) {
      if (manual) return;
      manual = true;
      if (DEBUG) console.log("[race pad] manual steering on:", why);
      if (mode === "drive") build();
    }

    function onTilt(e) {
      if (e.beta == null || e.gamma == null) return;
      clearTimeout(watchdog);
      if (manual) {                                                    // a sensor works after all: tilt takes over
        manual = false;
        if (DEBUG) console.log("[race pad] sensor data received, back to tilt steering");
        if (mode === "drive") build();
      }
      const b = e.beta * D2R, g = e.gamma * D2R;
      // Which way is "up" in the phone's own frame? Its screen-plane angle is the wheel angle,
      // positive when the phone is turned clockwise (steer right).
      const theta = Math.atan2(Math.cos(b) * Math.sin(g), Math.sin(b)) * R2D;
      if (zero === null) zero = theta;
      angle += (wrap(theta - zero) - angle) * 0.4;                     // a little smoothing
      let s = clamp(angle / RANGE);
      if (Math.abs(s) < 0.04) s = 0;
      drive.steer = +s.toFixed(2);
      vis.x = drive.steer; vis.y = 0;
      setKnob();
      if (mode === "drive") sendDrive();
    }

    async function enableTilt() {
      try {
        if (needsPermission && (await DeviceOrientationEvent.requestPermission()) !== "granted") throw new Error("denied");
        window.addEventListener("deviceorientation", onTilt);
        tiltOn = true;
        enableBtn.remove();
        if (mode === "drive") build();                                 // restart the sensor timeout
      } catch {
        enableBtn.textContent = "Motion access was blocked";
        useManual("motion permission blocked");
      }
    }
    enableBtn.onclick = enableTilt;
    if (!needsPermission) enableTilt();                                // Android: no prompt needed

    /* ---------- Drive layout pieces ---------- */

    // A hold-to-press button with its own pointer capture. Fixed size, so it never shifts the layout.
    function holdButton(text, color, onChange) {
      const b = el("div", "", text);
      css(b, {
        flex: "1 1 0", minHeight: "0", maxHeight: "110px", width: "100%",
        display: "flex", alignItems: "center", justifyContent: "center",
        borderRadius: "18px", background: color, color: "#fff",
        font: "700 18px/1 Fredoka, system-ui, sans-serif", letterSpacing: ".06em",
        boxShadow: "0 5px 0 rgba(0,0,0,.25)", userSelect: "none", webkitUserSelect: "none",
        touchAction: "none", cursor: "pointer", boxSizing: "border-box",
      });
      let down = false;
      const set = (v) => {
        if (v === down) return;
        down = v;
        b.style.filter = v ? "brightness(1.15)" : "none";
        b.style.boxShadow = v ? "0 1px 0 rgba(0,0,0,.25)" : "0 5px 0 rgba(0,0,0,.25)";   // looks pressed, size stays the same
        onChange(v);
      };
      b.addEventListener("pointerdown", (e) => { e.preventDefault(); b.setPointerCapture?.(e.pointerId); set(true); navigator.vibrate?.(8); });
      for (const ev of ["pointerup", "pointercancel", "lostpointercapture"]) b.addEventListener(ev, () => set(false));
      b.addEventListener("contextmenu", (e) => e.preventDefault());
      return { el: b, release: () => set(false) };
    }

    // The steering wheel: an outer circle with a knob inside.
    // Returns the left-hand area that holds it (touch handling for manual mode lives on that whole area).
    function steerZone() {
      const manualMode = manual;
      zone = el("div", "");
      css(zone, {
        position: "relative", flex: "1 1 0", minWidth: "0", height: "100%", display: "flex",
        alignItems: manualMode ? "flex-end" : "center",            // manual: bottom-left corner
        justifyContent: manualMode ? "flex-start" : "center",
        padding: manualMode ? "0 0 6px 6px" : "0", boxSizing: "border-box",
        touchAction: "none", userSelect: "none", webkitUserSelect: "none",
      });

      const ring = el("div", "");
      css(ring, {
        position: "relative", flex: "0 0 auto", boxSizing: "border-box",
        width: "clamp(140px, 54vh, 240px)", aspectRatio: "1 / 1", borderRadius: "50%",
        background: "radial-gradient(circle, rgba(16,32,43,.04) 0%, rgba(16,32,43,.14) 100%)",
        border: "6px solid rgba(16,32,43,.28)", boxShadow: "inset 0 0 0 10px rgba(255,255,255,.35), 0 5px 0 rgba(0,0,0,.18)",
        pointerEvents: "none",
      });
      // inner guide ring, left/right arrows and a centre dot
      const inner = el("div", "");
      css(inner, { position: "absolute", inset: "22%", borderRadius: "50%", border: "2px dashed rgba(16,32,43,.2)" });
      const arrow = (txt, side) => {
        const a = el("div", "", txt);
        css(a, { position: "absolute", top: "50%", [side]: "9%", transform: "translateY(-50%)", font: "700 20px/1 system-ui, sans-serif", color: "rgba(16,32,43,.35)" });
        return a;
      };
      knob = el("div", "");
      css(knob, {
        position: "absolute", top: "50%", left: "50%", width: "38%", height: "38%", borderRadius: "50%",
        background: "radial-gradient(circle at 35% 30%, #6fd0ff, #2aa9e0 60%, #1c86b8)",
        boxShadow: "0 5px 0 rgba(0,0,0,.25)", willChange: "transform",
      });
      label = el("div", "");
      css(label, {
        position: "absolute", left: 0, right: 0, bottom: "11%", textAlign: "center",
        font: "600 11px/1 Fredoka, system-ui, sans-serif", letterSpacing: ".06em", color: "rgba(16,32,43,.55)",
      });
      ring.append(inner, arrow("◀", "left"), arrow("▶", "right"), knob, label);
      zone.append(ring);

      vis.x = 0; vis.y = 0;

      if (manualMode) {
        label.textContent = "DRAG TO STEER";
        const steerFrom = (e) => {
          const r = ring.getBoundingClientRect();
          const maxR = r.width * 0.31;                                // how far the knob can travel
          const dx = (e.clientX - (r.left + r.width / 2)) / maxR;
          const dy = (e.clientY - (r.top + r.height / 2)) / maxR;
          const len = Math.hypot(dx, dy) || 1;
          const k = len > 1 ? 1 / len : 1;                            // keep the knob inside the ring
          vis.x = dx * k; vis.y = dy * k;
          drive.steer = +clamp(dx).toFixed(2);                        // only the sideways part steers
          setKnob();
          sendDrive();
        };
        const end = () => {
          if (!dragging) return;
          dragging = false;
          drive.steer = 0; vis.x = 0; vis.y = 0;
          if (knob) knob.style.transition = "transform 120ms ease-out";   // springs back to the centre
          setKnob();
          sendDrive(true);
        };
        zone.addEventListener("pointerdown", (e) => {
          e.preventDefault();
          dragging = true;
          zone.setPointerCapture?.(e.pointerId);
          if (knob) knob.style.transition = "none";
          steerFrom(e);
        });
        zone.addEventListener("pointermove", (e) => { if (dragging) steerFrom(e); });
        for (const ev of ["pointerup", "pointercancel", "lostpointercapture"]) zone.addEventListener(ev, end);
      } else {
        label.textContent = tiltOn ? "TAP TO CENTER" : "ENABLE TILT";
        zone.addEventListener("pointerdown", () => { zero = null; angle = 0; navigator.vibrate?.(15); });
        if (tiltOn) watchdog = setTimeout(() => useManual("no sensor data"), SENSOR_TIMEOUT);   // nothing arrived: use touch steering
      }
      setKnob();
      return zone;
    }

    function build() {
      parts.forEach((p) => p.release?.());
      parts = [];
      root.replaceChildren();
      zone = knob = label = null;
      dragging = false;
      clearTimeout(watchdog);

      if (mode === "drive") {
        const layout = el("div", "");
        css(layout, {
          display: "flex", flexDirection: "row", alignItems: "stretch", gap: "14px",
          width: "100%", height: "100%", gridColumn: "1 / -1", alignSelf: "stretch", flex: "1 1 100%",
          padding: "10px 14px", boxSizing: "border-box",
        });

        const side = el("div", "");
        css(side, {
          display: "flex", flexDirection: "column", justifyContent: "center", gap: "14px",
          width: "clamp(96px, 24vw, 150px)", flex: "0 0 auto",
        });
        const gas = holdButton("GAS", "#2fbf71", (v) => { drive.gas = v; sendDrive(true); });
        const brake = holdButton("BRAKE", "#e5484d", (v) => { drive.brake = v; sendDrive(true); });
        parts.push(gas, brake);
        side.append(gas.el, brake.el);

        layout.append(steerZone(), side);
        root.append(layout);
      } else {
        const stick = makeStick({ emit: (x, y) => io.send({ type: "move", x, y }) });
        const buttons = makeButtons(["B", "A"], io.send);              // A = lock in, B = change your mind
        parts.push(stick, buttons);
        root.append(stick.el, buttons.el);
      }
      if (!tiltOn && !manual) root.append(enableBtn);                  // offer tilt only when it can work
    }
    build();

    return {
      release() {
        parts.forEach((p) => p.release?.());
        drive.gas = drive.brake = false;
        if (manual) drive.steer = 0;
        dragging = false;
        if (mode === "drive") post();
      },
      destroy() {
        window.removeEventListener("deviceorientation", onTilt);
        clearInterval(beat);
        clearTimeout(watchdog);
      },
      onMessage(msg) {
        if (DEBUG) console.log("[race pad] message from game:", msg);
        if (msg.type === "race-mode") {
          const next = msg.mode === "drive" ? "drive" : "select";
          if (next !== mode) {
            mode = next;
            zero = null; angle = 0;
            build();
          }
        } else if (msg.type === "race-recenter") {
          zero = null; angle = 0;
        }
      },
    };
  },
};