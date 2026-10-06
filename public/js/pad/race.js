// "race": one pad with two modes, switched by the game.
//   select mode  the basic pad (joystick + buttons): { type: "move", x, y }, { type: "button", id, pressed }
//   drive mode   steering buttons + GAS / BRAKE: { type: "race", steer, gas, brake }
// The game switches modes with { type: "race-mode", mode: "select" | "drive" }.
// ("race-recenter" is still accepted but does nothing, there is no tilt to re-centre.)
//
// Drive layout (phone held sideways):
//   LEFT   two big steering buttons, ◀ (left) and ▶ (right)
//   RIGHT  two small buttons, GAS on top, BRAKE below
// There is no gyro / motion sensor code at all. Steering is always by touch:
//   hold ◀  -> steer = -1,  hold ▶ -> steer = 1,  neither (or both) -> steer = 0
// The drive layout uses its own inline styles, so nothing moves or resizes when a button is pressed.
import { el, makeStick, makeButtons } from "./widgets.js";

const DEBUG = true;                     // set to false once everything works

const css = (node, styles) => Object.assign(node.style, styles);

export default {
  id: "race",

  mount(root, io) {
    let mode = "select";
    let parts = [];                     // widgets of the current layout, so they can be released
    const drive = { left: false, right: false, gas: false, brake: false };
    let last = "", lastSent = 0;

    const steer = () => (drive.right ? 1 : 0) - (drive.left ? 1 : 0);

    const post = () => io.send({ type: "race", steer: steer(), gas: drive.gas, brake: drive.brake });
    function sendDrive(force = false) {
      const key = `${steer()}|${+drive.gas}|${+drive.brake}`;
      const now = performance.now();
      if (key === last || (!force && now - lastSent < 30)) return;
      last = key; lastSent = now;
      post();
    }
    // Heartbeat, so a dropped message can never leave the bike stuck on full throttle or full lock
    const beat = setInterval(() => mode === "drive" && post(), 100);

    /* ---------- Drive layout pieces ---------- */

    // A hold-to-press button with its own pointer capture. Fixed size, so it never shifts the layout.
    // Because every button captures its own pointer, steering and gas/brake work with several fingers at once.
    function holdButton(text, color, onChange, fontSize = 18) {
      const b = el("div", "", text);
      css(b, {
        flex: "1 1 0", minHeight: "0", minWidth: "0", width: "100%", height: "100%",
        display: "flex", alignItems: "center", justifyContent: "center",
        borderRadius: "18px", background: color, color: "#fff",
        font: `700 ${fontSize}px/1 Fredoka, system-ui, sans-serif`, letterSpacing: ".06em",
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

    function build() {
      parts.forEach((p) => p.release?.());
      parts = [];
      root.replaceChildren();

      if (mode === "drive") {
        const layout = el("div", "");
        css(layout, {
          display: "flex", flexDirection: "row", alignItems: "stretch", gap: "14px",
          width: "100%", height: "100%", gridColumn: "1 / -1", alignSelf: "stretch", flex: "1 1 100%",
          padding: "10px 14px", boxSizing: "border-box",
        });

        // LEFT: steering buttons
        const steerSide = el("div", "");
        css(steerSide, {
          display: "flex", flexDirection: "row", alignItems: "flex-end", justifyContent: "flex-start", gap: "12px",
          flex: "1 1 0", minWidth: "0", height: "100%", paddingBottom: "6px", boxSizing: "border-box",
        });
        const left = holdButton("◀", "#2a8fd0", (v) => { drive.left = v; sendDrive(true); }, 38);
        const right = holdButton("▶", "#2a8fd0", (v) => { drive.right = v; sendDrive(true); }, 38);
        for (const b of [left, right]) {                                    // a bit larger than before (was clamp(60px, 20vh, 88px))
          css(b.el, { flex: "0 0 auto", width: "clamp(76px, 28vh, 120px)", height: "clamp(76px, 28vh, 120px)", borderRadius: "20px" });
        }
        parts.push(left, right);
        steerSide.append(left.el, right.el);

        // RIGHT: gas and brake
        const side = el("div", "");
        css(side, {
          display: "flex", flexDirection: "column", justifyContent: "center", gap: "14px",
          width: "clamp(96px, 24vw, 150px)", flex: "0 0 auto",
        });
        const gas = holdButton("GAS", "#2fbf71", (v) => { drive.gas = v; sendDrive(true); });
        const brake = holdButton("BRAKE", "#e5484d", (v) => { drive.brake = v; sendDrive(true); });
        for (const b of [gas, brake]) css(b.el, { maxHeight: "110px" });
        parts.push(gas, brake);
        side.append(gas.el, brake.el);

        layout.append(steerSide, side);
        root.append(layout);
      } else {
        const stick = makeStick({ emit: (x, y) => io.send({ type: "move", x, y }) });
        const buttons = makeButtons(["B", "A"], io.send);              // A = lock in, B = change your mind
        parts.push(stick, buttons);
        root.append(stick.el, buttons.el);
      }
    }
    build();

    return {
      release() {
        parts.forEach((p) => p.release?.());
        drive.left = drive.right = drive.gas = drive.brake = false;
        if (mode === "drive") post();
      },
      destroy() {
        clearInterval(beat);
      },
      onMessage(msg) {
        if (DEBUG) console.log("[race pad] message from game:", msg);
        if (msg.type === "race-mode") {
          const next = msg.mode === "drive" ? "drive" : "select";
          if (next !== mode) {
            mode = next;
            build();
          }
        }
        // "race-recenter": nothing to do, there is no tilt any more
      },
    };
  },
};