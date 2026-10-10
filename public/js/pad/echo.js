// "echo": 4 colored buttons in a single row on the phone.
//
// Every tap sends { type: "echo-press", color, seq, sid }.
// seq is a running total for this page, sid identifies the page. The
// game diffs seq to detect new presses, and a heartbeat re-sends the
// last color at the same seq so a dropped press can be recovered.
//
// The game sends { type: "echo-phase", phase }:
//   "wait"     buttons dimmed (countdown)
//   "watch"    buttons dimmed (sequence playing)
//   "press"    buttons live (input window)
//   "ghost"    buttons dimmed (eliminated, taps ignored by game)
//   "results"  buttons dimmed (game over, taps = play again)
//
// release() / destroy() fully self-destruct. Idempotent.
export default {
  id: "echo",

  mount(root, io) {
    const sid = Math.random().toString(36).slice(2, 8);
    let seq = 0;
    let lastColor = null;
    let dead = false;
    let beat = 0;

    const send = () => {
      if (dead) return;
      io.send({
        type: "echo-press",
        color: lastColor || "_hb",
        seq,
        sid,
      });
    };

    const style = document.createElement("style");
    style.textContent = `
      .echo-wrap {
        width: 100%;
        height: 100%;
        display: flex;
        flex-direction: row;
        gap: 2vmin;
        padding: 3vmin;
        box-sizing: border-box;
        touch-action: none;
        user-select: none;
        -webkit-user-select: none;
      }
      .echo-btn {
        flex: 1 1 0;
        border: none;
        border-radius: 3vmin;
        padding: 0;
        margin: 0;
        box-sizing: border-box;
        cursor: pointer;
        touch-action: none;
        user-select: none;
        -webkit-user-select: none;
        transition: filter 120ms ease, transform 90ms ease, box-shadow 120ms ease;
      }
      .echo-btn.blue   { background: #5b8def; box-shadow: inset 0 -14px 22px rgba(0,0,0,0.20), inset 0 8px 14px rgba(255,255,255,0.30), 0 8px 0 rgba(16,32,43,0.20); }
      .echo-btn.yellow { background: #ffb400; box-shadow: inset 0 -14px 22px rgba(0,0,0,0.20), inset 0 8px 14px rgba(255,255,255,0.30), 0 8px 0 rgba(16,32,43,0.20); }
      .echo-btn.green  { background: #2fbf71; box-shadow: inset 0 -14px 22px rgba(0,0,0,0.20), inset 0 8px 14px rgba(255,255,255,0.30), 0 8px 0 rgba(16,32,43,0.20); }
      .echo-btn.red    { background: #e5484d; box-shadow: inset 0 -14px 22px rgba(0,0,0,0.20), inset 0 8px 14px rgba(255,255,255,0.30), 0 8px 0 rgba(16,32,43,0.20); }
      .echo-btn.flash {
        filter: brightness(1.35);
        transform: translateY(6px);
        box-shadow: inset 0 -5px 12px rgba(0,0,0,0.20), inset 0 5px 12px rgba(255,255,255,0.35), 0 2px 0 rgba(16,32,43,0.20);
      }
      .echo-wrap.locked .echo-btn {
        filter: brightness(0.72) saturate(0.7);
        opacity: 0.75;
      }
      .echo-wrap.ghost .echo-btn {
        filter: brightness(0.6) saturate(0.5);
        opacity: 0.6;
      }
    `;
    document.head.append(style);

    const wrap = document.createElement("div");
    wrap.className = "echo-wrap locked";

    const COLORS = ["blue", "yellow", "green", "red"];
    const btns = COLORS.map((c) => {
      const b = document.createElement("button");
      b.className = `echo-btn ${c}`;
      b.dataset.color = c;
      b.setAttribute("aria-label", c);
      return b;
    });
    btns.forEach((b) => wrap.append(b));
    root.append(wrap);

    const flashTimers = new WeakMap();
    function flash(btn) {
      btn.classList.add("flash");
      clearTimeout(flashTimers.get(btn));
      flashTimers.set(btn, setTimeout(() => btn.classList.remove("flash"), 140));
    }

    function onDown(e) {
      if (dead) return;
      e.preventDefault();
      const btn = e.currentTarget;
      btn.setPointerCapture?.(e.pointerId);
      flash(btn);
      navigator.vibrate?.(20);
      seq++;
      lastColor = btn.dataset.color;
      io.send({ type: "echo-press", color: lastColor, seq, sid });
    }

    btns.forEach((b) => {
      b.addEventListener("pointerdown", onDown);
      b.addEventListener("contextmenu", (e) => e.preventDefault());
    });

    function setPhase(p) {
      wrap.classList.remove("locked", "ghost");
      if (p === "wait" || p === "watch" || p === "results") wrap.classList.add("locked");
      else if (p === "ghost") wrap.classList.add("ghost");
      // "press" — no extra class.
    }

    send();
    beat = setInterval(send, 250);

    function teardown() {
      if (dead) {
        try { style.remove(); } catch {}
        if (wrap.parentNode) wrap.parentNode.removeChild(wrap);
        return;
      }
      dead = true;
      clearInterval(beat);
      beat = 0;
      btns.forEach((b) => {
        b.removeEventListener("pointerdown", onDown);
        clearTimeout(flashTimers.get(b));
        b.classList.remove("flash");
      });
      try { style.remove(); } catch {}
      if (wrap.parentNode) wrap.parentNode.removeChild(wrap);
    }

    return {
      release() { teardown(); },
      destroy() { teardown(); },
      onMessage(msg) {
        if (!msg || msg.type !== "echo-phase") return;
        setPhase(msg.phase);
      },
    };
  },
};