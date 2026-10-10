// Optional test player so you can develop without a phone.
// Enable by opening the console with ?kb=1 in the URL.
//   WASD / arrows = move   Space = DASH   Shift or E = JUMP

export const KB_SLOT = "kb";
export const KB_INFO = { slot: KB_SLOT, name: "Keyboard", color: "#ffffff", animal: "⌨️", host: false };

export function keyboardEnabled() {
  return new URLSearchParams(location.search).has("kb");
}

export function attachKeyboardPlayer({ roster, on }) {
  const top = roster.add(KB_SLOT);
  const down = new Set();

  const refresh = () => {
    let x = (down.has("KeyD") || down.has("ArrowRight") ? 1 : 0) - (down.has("KeyA") || down.has("ArrowLeft") ? 1 : 0);
    let y = (down.has("KeyS") || down.has("ArrowDown") ? 1 : 0) - (down.has("KeyW") || down.has("ArrowUp") ? 1 : 0);
    const m = Math.hypot(x, y);
    if (m > 1) { x /= m; y /= m; }
    top.input.x = x; top.input.y = y;
  };

  on(window, "keydown", (e) => {
    if (e.repeat) return;
    down.add(e.code);
    if (e.code === "Space") { top.queue.dash = true; e.preventDefault(); }
    if (e.code === "ShiftLeft" || e.code === "ShiftRight" || e.code === "KeyE") top.queue.jump = true;
    refresh();
  });
  on(window, "keyup", (e) => { down.delete(e.code); refresh(); });

  return { destroy() { roster.remove(KB_SLOT); } };
}
