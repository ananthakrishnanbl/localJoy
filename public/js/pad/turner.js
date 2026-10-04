// "turner": two large tap buttons for LEFT / RIGHT nudging.
// Tap once for a single nudge; hold to auto-repeat.
//
// Sends a running total for each side plus a session id:
//   { type: "turn", left, right, sid }
// The game diffs the totals, so a dropped message can never lose a tap.
//
// release() and destroy() both fully self-destruct the pad: the
// heartbeat stops, buttons are un-pressed, the injected <style> and
// the wrap element are removed, and no further messages leave the
// phone. Calling either twice is safe.
export default {
  id: "turner",

  mount(root, io) {
    const HOLD_DELAY_MS  = 300;   // hold this long before auto-repeat starts
    const HOLD_REPEAT_MS = 120;   // gap between repeats while held

    const sid = Math.random().toString(36).slice(2, 8);
    let left = 0, right = 0;
    let dead = false;
    let beat = 0;

    const send = () => { if (!dead) io.send({ type: "turn", left, right, sid }); };

    /* -------- injected style -------- */
    const style = document.createElement("style");
    style.textContent = `
    .turner-wrap {
      display: flex;
      width: 100%;
      height: 100%;
      gap: 12px;
      padding: 14px;
      box-sizing: border-box;
      position: relative;
      touch-action: none;
      user-select: none;
      -webkit-user-select: none;
    }
    .turner-btn {
      flex: 1 1 0;
      display: flex;
      align-items: center;
      justify-content: center;
      border-radius: 26px;
      color: #fff;
      font: 700 clamp(56px, 16vh, 120px)/1 Fredoka, system-ui, sans-serif;
      letter-spacing: .02em;
      box-shadow: 0 8px 0 rgba(0,0,0,.28);
      border: 4px solid rgba(255,255,255,.35);
      box-sizing: border-box;
      touch-action: none;
      user-select: none;
      -webkit-user-select: none;
      cursor: pointer;
      transition: filter .06s, transform .06s, box-shadow .06s;
    }
    .turner-btn.left  { background: radial-gradient(circle at 35% 30%, #8fd8ff, #2aa9e0 62%, #1a7ca9); }
    .turner-btn.right { background: radial-gradient(circle at 35% 30%, #ffbe7a, #ff8a3d 62%, #cc5c17); }
    .turner-btn.down  { filter: brightness(.9); transform: translateY(5px); box-shadow: 0 3px 0 rgba(0,0,0,.28); }
    .turner-hint {
      position: absolute;
      top: 8px; left: 0; right: 0;
      text-align: center;
      font: 600 12px/1 Fredoka, system-ui, sans-serif;
      letter-spacing: .1em;
      color: rgba(255,255,255,.55);
      pointer-events: none;
    }
    `;
    document.head.append(style);

    /* -------- DOM -------- */
    const wrap = document.createElement("div");
    wrap.className = "turner-wrap";

    const leftBtn = document.createElement("div");
    leftBtn.className = "turner-btn left";
    leftBtn.textContent = "◀";
    leftBtn.setAttribute("aria-label", "Turn left");

    const rightBtn = document.createElement("div");
    rightBtn.className = "turner-btn right";
    rightBtn.textContent = "▶";
    rightBtn.setAttribute("aria-label", "Turn right");

    const hint = document.createElement("div");
    hint.className = "turner-hint";
    hint.textContent = "TAP OR HOLD TO NUDGE";

    wrap.append(leftBtn, rightBtn, hint);
    root.append(wrap);

    /* -------- tap + hold-to-repeat -------- */
    const cleaners = [];

    function wireTap(btn, onTap) {
      let holdTimer = 0, holdRepeat = 0;

      const stopHold = () => {
        clearTimeout(holdTimer);
        clearInterval(holdRepeat);
        holdTimer = holdRepeat = 0;
      };

      const onDown = (e) => {
        if (dead) return;
        e.preventDefault();
        btn.setPointerCapture?.(e.pointerId);
        btn.classList.add("down");
        navigator.vibrate?.(15);

        // Immediate single nudge.
        onTap();
        send();

        // After a short delay, keep nudging while the finger stays down.
        holdTimer = setTimeout(() => {
          if (dead) return;
          holdRepeat = setInterval(() => {
            if (dead) { stopHold(); return; }
            onTap();
            send();
          }, HOLD_REPEAT_MS);
        }, HOLD_DELAY_MS);
      };

      const onUp = () => {
        stopHold();
        btn.classList.remove("down");
      };

      btn.addEventListener("pointerdown", onDown);
      for (const ev of ["pointerup", "pointercancel", "lostpointercapture"]) {
        btn.addEventListener(ev, onUp);
      }
      const onCtx = (e) => e.preventDefault();
      btn.addEventListener("contextmenu", onCtx);

      cleaners.push(() => {
        stopHold();
        btn.removeEventListener("pointerdown", onDown);
        for (const ev of ["pointerup", "pointercancel", "lostpointercapture"]) {
          btn.removeEventListener(ev, onUp);
        }
        btn.removeEventListener("contextmenu", onCtx);
        btn.classList.remove("down");
      });
    }

    wireTap(leftBtn,  () => { left++;  });
    wireTap(rightBtn, () => { right++; });

    // Heartbeat so a dropped tap gets re-synced. Guarded by `dead`.
    beat = setInterval(send, 200);
    send();   // tell the game our sid right away

    /* -------- shared teardown -------- */
    function teardown() {
      if (dead) {
        // release() ran first; still make sure nothing is left behind.
        try { style.remove(); } catch {}
        if (wrap.parentNode) wrap.parentNode.removeChild(wrap);
        return;
      }
      dead = true;
      clearInterval(beat);
      beat = 0;
      for (const c of cleaners) { try { c(); } catch {} }
      try { style.remove(); } catch {}
      if (wrap.parentNode) wrap.parentNode.removeChild(wrap);
      // Free any pointer captures still held by our buttons.
      for (const el of [leftBtn, rightBtn]) {
        try { el.releasePointerCapture?.(0); } catch {}
      }
    }

    return {
      release() { teardown(); },
      destroy() { teardown(); },
      onMessage(_msg) { /* hud / vibrate handled by the console */ },
    };
  },
};
