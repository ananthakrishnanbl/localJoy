// Turns phone messages ("controller-input" window events) into top state.
// Sticks are stored; buttons are queued and consumed inside the physics step.

import { clamp } from "./vec.js";

export function attachInput({ roster, on }) {
  on(window, "controller-input", (e) => {
    const { slot, data } = e.detail || {};
    if (!data || typeof data !== "object") return;
    const t = roster.get(slot);
    if (!t) return;

    switch (data.type) {
      case "stick": {
        let x = clamp(Number(data.x) || 0, -1, 1);
        let y = clamp(Number(data.y) || 0, -1, 1);
        const m = Math.hypot(x, y);
        if (m > 1) { x /= m; y /= m; }
        t.input.x = x;
        t.input.y = y;
        break;
      }
      case "btn":
        if (data.pressed) {
          if (data.id === "dash") t.queue.dash = true;
          else if (data.id === "jump") t.queue.jump = true;
        }
        break;
    }
  });
}
