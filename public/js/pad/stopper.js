// "stopper": one big tap button, styled like the site's toy controls.
//
// Tap sends { type: "stop", count, sid }. count is a running total for
// this page load, sid identifies the page. The game diffs counts so a
// dropped message can never lose a tap.
//
// The game sends { type: "stopper-state", state } to change the look:
//   "idle"    grey   "WAIT"
//   "armed"   red    "STOP"
//   "stopped" navy   "STOPPED"
//   "replay"  green  "PLAY AGAIN"
//
// release() and destroy() fully self-destruct the pad. Idempotent.
export default {
  id: "stopper",

  mount(root, io) {
    const sid = Math.random().toString(36).slice(2, 8);
    let count = 0;
    let dead = false;
    let beat = 0;

    const send = () => { if (!dead) io.send({ type: "stop", count, sid }); };

    /* -------- styles (chunky toy button, matches controller.css) -------- */
    const style = document.createElement("style");
    style.textContent = `
      .stopper-wrap {
        width: 100%;
        height: 100%;
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 5vmin;
        box-sizing: border-box;
        touch-action: none;
        user-select: none;
        -webkit-user-select: none;
        background: transparent;
      }
      .stopper-btn {
        width: min(80vmin, 92%);
        height: min(80vmin, 92%);
        border-radius: 50%;
        display: flex;
        align-items: center;
        justify-content: center;
        font-family: Fredoka, system-ui, sans-serif;
        font-weight: 700;
        font-size: clamp(26px, 8vmin, 52px);
        letter-spacing: 0.14em;
        color: #ffffff;
        background: #aebdcc;
        border: none;
        cursor: pointer;
        padding: 0;
        touch-action: none;
        user-select: none;
        -webkit-user-select: none;
        transition: transform 90ms ease, box-shadow 90ms ease,
                    background-color 220ms ease, color 220ms ease;
        box-shadow:
          inset 0 -16px 24px rgba(0,0,0,0.20),
          inset 0 10px 16px rgba(255,255,255,0.28),
          0 10px 0 rgba(16,32,43,0.28);
      }
      .stopper-btn.pressed {
        transform: translateY(8px);
        box-shadow:
          inset 0 -8px 16px rgba(0,0,0,0.20),
          inset 0 6px 12px rgba(255,255,255,0.28),
          0 2px 0 rgba(16,32,43,0.28);
      }
      .stopper-btn.idle    { background-color: #aebdcc; color: #eef6fb; }
      .stopper-btn.armed   { background-color: #e5484d; color: #ffffff; }
      .stopper-btn.stopped { background-color: #2b3d4f; color: #7b8b9c; }
      .stopper-btn.replay  { background-color: #2fbf71; color: #ffffff; }
    `;
    document.head.append(style);

    /* -------- DOM -------- */
    const wrap = document.createElement("div");
    wrap.className = "stopper-wrap";

    const btn = document.createElement("button");
    btn.className = "stopper-btn idle";
    btn.textContent = "WAIT";
    btn.setAttribute("aria-label", "Stop the clock");

    wrap.append(btn);
    root.append(wrap);

    /* -------- tap handling -------- */
    const onDown = (e) => {
      if (dead) return;
      e.preventDefault();
      btn.setPointerCapture?.(e.pointerId);
      btn.classList.add("pressed");
      navigator.vibrate?.(25);
      count++;
      send();
    };
    const onUp = () => btn.classList.remove("pressed");

    btn.addEventListener("pointerdown", onDown);
    for (const ev of ["pointerup", "pointercancel", "lostpointercapture"]) {
      btn.addEventListener(ev, onUp);
    }
    btn.addEventListener("contextmenu", (e) => e.preventDefault());

    /* -------- state from the game -------- */
    const LABELS = { idle: "WAIT", armed: "STOP", stopped: "STOPPED", replay: "PLAY AGAIN" };
    function setState(s) {
      if (dead) return;
      if (!LABELS[s]) return;
      btn.className = `stopper-btn ${s}`;
      btn.textContent = LABELS[s];
    }

    // Tell the game our sid right away, then heartbeat for dropped msgs.
    send();
    beat = setInterval(send, 250);

    /* -------- teardown -------- */
    function teardown() {
      if (dead) {
        try { style.remove(); } catch {}
        if (wrap.parentNode) wrap.parentNode.removeChild(wrap);
        return;
      }
      dead = true;
      clearInterval(beat);
      beat = 0;
      btn.classList.remove("pressed");
      btn.removeEventListener("pointerdown", onDown);
      for (const ev of ["pointerup", "pointercancel", "lostpointercapture"]) {
        btn.removeEventListener(ev, onUp);
      }
      try { style.remove(); } catch {}
      if (wrap.parentNode) wrap.parentNode.removeChild(wrap);
      try { btn.releasePointerCapture?.(0); } catch {}
    }

    return {
      release() { teardown(); },
      destroy() { teardown(); },
      onMessage(msg) {
        if (msg && msg.type === "stopper-state") setState(msg.state);
      },
    };
  },
};