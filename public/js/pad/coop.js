import { makeStick, makeButtons } from "./widgets.js";

export default {
  id: "coop",

  mount(root, io) {
    const style = document.createElement("style");
    style.textContent = `
      .coop-wrap { display: flex; width: 100%; height: 100%; gap: 4vw; padding: 4vw; box-sizing: border-box; justify-content: center; background: #111; }
      .coop-btn { flex: 1; border-radius: 24px; border: none; font-size: 15vw; background: var(--player, #555); color: white; touch-action: none; user-select: none; display: flex; justify-content: center; align-items: center; box-shadow: 0 8px 0 rgba(0,0,0,0.4); }
      .coop-btn:active { transform: translateY(8px); box-shadow: none; filter: brightness(0.8); }
      svg { width: 1.2em; height: 1.2em; stroke: currentColor; stroke-width: 3; fill: none; stroke-linecap: round; stroke-linejoin: round; }
    `;
    document.head.append(style);

    const wrap = document.createElement("div");
    wrap.className = "coop-wrap";
    root.append(wrap);

    let currentMode = null;
    let left = false, right = false, gas = false, brake = false;
    let padWidgets = null;

    const sendSteer = () => io.send({ type: "coop-steer", value: (right ? 1 : 0) - (left ? 1 : 0) });
    const sendPedal = () => io.send({ type: "coop-pedal", gas, brake });

    const buildUI = (mode) => {
      if (currentMode === mode) return;
      currentMode = mode;
      wrap.innerHTML = "";

      // Cleanup native widgets if switching back to racing
      if (padWidgets) {
        padWidgets.stick.release();
        padWidgets.buttons.release();
        padWidgets = null;
      }

      if (mode === "pad") {
        // --- NATIVE GAMEPAD FOR TEAM SELECTION ---
        // Space out the native widgets so they fit naturally on the phone screen
        wrap.style.justifyContent = "space-between";
        wrap.style.alignItems = "center";
        wrap.style.padding = "2vw 6vw"; 
        
        const stick = makeStick({ emit: (x, y) => io.send({ type: "move", x, y }) });
        const buttons = makeButtons(["Y", "X", "B", "A"], io.send);
        wrap.append(stick.el, buttons.el);
        padWidgets = { stick, buttons };

      } else {
        // --- YOUR CUSTOM CO-OP CONTROLS FOR RACING ---
        // Reset the layout styles for your custom buttons
        wrap.style.justifyContent = "center";
        wrap.style.alignItems = "stretch";
        wrap.style.padding = "4vw";

        const btn1 = document.createElement("button");
        const btn2 = document.createElement("button");
        btn1.className = "coop-btn";
        btn2.className = "coop-btn";

        if (mode === "steer") {
          btn1.innerHTML = `<svg viewBox="0 0 24 24"><polyline points="14 18 8 12 14 6"></polyline></svg>`;
          btn2.innerHTML = `<svg viewBox="0 0 24 24"><polyline points="10 18 16 12 10 6"></polyline></svg>`;

          btn1.onpointerdown = () => { left = true; sendSteer(); };
          btn1.onpointerup = btn1.onpointercancel = () => { left = false; sendSteer(); };

          btn2.onpointerdown = () => { right = true; sendSteer(); };
          btn2.onpointerup = btn2.onpointercancel = () => { right = false; sendSteer(); };
          
          wrap.append(btn1, btn2);
        } else if (mode === "pedal") {
          btn1.innerHTML = `<svg viewBox="0 0 24 24"><polyline points="6 10 12 16 18 10"></polyline></svg>`;
          btn2.innerHTML = `<svg viewBox="0 0 24 24"><polyline points="18 14 12 8 6 14"></polyline></svg>`;

          btn2.onpointerdown = () => { gas = true; sendPedal(); };
          btn2.onpointerup = btn2.onpointercancel = () => { gas = false; sendPedal(); };

          btn1.onpointerdown = () => { brake = true; sendPedal(); };
          btn1.onpointerup = btn1.onpointercancel = () => { brake = false; sendPedal(); };
          
          wrap.append(btn1, btn2);
        } else {
          wrap.innerHTML = `<div style="color:white;font-size:8vw;margin:auto;">SPECTATING...</div>`;
        }
      }
    };

    return {
      release() {
        left = right = gas = brake = false;
        if (currentMode === "steer") sendSteer();
        if (currentMode === "pedal") sendPedal();
        if (padWidgets) { padWidgets.stick.release(); padWidgets.buttons.release(); }
      },
      destroy() {
        style.remove();
        if (padWidgets) { padWidgets.stick.release(); padWidgets.buttons.release(); }
      },
      onMessage(msg) {
        // main.js sends "set-mode" for the pad, and "set-role" for steer/pedal/spectator.
        // Capturing both seamlessly maps the UI to whatever phase the game is in!
        if (msg.type === "set-role" || msg.type === "set-mode") {
          buildUI(msg.role || msg.mode);
        }
      }
    };
  }
};