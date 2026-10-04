export default {
  id: "coop",

  mount(root, io) {
    const style = document.createElement("style");
    style.textContent = `
      .coop-wrap { display: flex; width: 100%; height: 100%; gap: 4vw; padding: 4vw; box-sizing: border-box; justify-content: center; background: #111; }
      .coop-btn { flex: 1; border-radius: 24px; border: none; font-size: 15vw; background: var(--player, #555); color: white; touch-action: none; user-select: none; display: flex; justify-content: center; align-items: center; box-shadow: 0 8px 0 rgba(0,0,0,0.4); }
      .coop-btn:active { transform: translateY(8px); box-shadow: none; filter: brightness(0.8); }
    `;
    document.head.append(style);

    const wrap = document.createElement("div");
    wrap.className = "coop-wrap";
    root.append(wrap);

    let currentRole = null;
    let left = false, right = false, gas = false, brake = false;

    const sendSteer = () => io.send({ type: "coop-steer", value: (right ? 1 : 0) - (left ? 1 : 0) });
    const sendPedal = () => io.send({ type: "coop-pedal", gas, brake });

    const buildUI = (role) => {
      currentRole = role;
      wrap.innerHTML = "";
      
      const btn1 = document.createElement("button");
      const btn2 = document.createElement("button");
      btn1.className = "coop-btn";
      btn2.className = "coop-btn";

      if (role === "steer") {
        // Chunky Left Arrow
        btn1.innerHTML = `<svg viewBox="0 0 24 24"><polyline points="14 18 8 12 14 6"></polyline></svg>`;
        // Chunky Right Arrow
        btn2.innerHTML = `<svg viewBox="0 0 24 24"><polyline points="10 18 16 12 10 6"></polyline></svg>`;
        
        btn1.onpointerdown = () => { left = true; sendSteer(); };
        btn1.onpointerup = btn1.onpointercancel = () => { left = false; sendSteer(); };
        
        btn2.onpointerdown = () => { right = true; sendSteer(); };
        btn2.onpointerup = btn2.onpointercancel = () => { right = false; sendSteer(); };
      } else {
       btn1.innerHTML = `<svg viewBox="0 0 24 24"><polyline points="6 10 12 16 18 10"></polyline></svg>`;
        btn2.innerHTML = `<svg viewBox="0 0 24 24"><polyline points="18 14 12 8 6 14"></polyline></svg>`;
        
        btn2.onpointerdown = () => { gas = true; sendPedal(); };
        btn2.onpointerup = btn2.onpointercancel = () => { gas = false; sendPedal(); };
        
        btn1.onpointerdown = () => { brake = true; sendPedal(); };
        btn1.onpointerup = btn1.onpointercancel = () => { brake = false; sendPedal(); };
      }
      wrap.append(btn1, btn2);
    };

    return {
      release() {
        left = right = gas = brake = false;
        if (currentRole === "steer") sendSteer();
        if (currentRole === "pedal") sendPedal();
      },
      destroy() {
        style.remove();
      },
      onMessage(msg) {
        if (msg.type === "set-role") buildUI(msg.role);
      }
    };
  }
};