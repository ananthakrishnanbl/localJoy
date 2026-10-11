// Analogue stick, resting in the BOTTOM-LEFT of the left half so the thumb reaches it
// easily. Touch near it and the stick uses that fixed spot as its centre; touch anywhere
// else in the left half and it floats to wherever the thumb landed.
// Sends {x,y} (-1..1, dead-zone removed) at most ~30 times a second.

const DEADZONE = 0.12;
const SEND_EVERY_MS = 33;
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

export function createStick(zone, { onChange }) {
  const base = document.createElement("div");
  base.className = "spn-base";
  const knob = document.createElement("div");
  knob.className = "spn-knob";
  zone.append(base, knob);

  let pid = null;
  let ox = 0, oy = 0;       // stick origin inside the zone
  let R = 70;               // max knob travel (px)
  let home = { x: 0, y: 0 };
  let x = 0, y = 0;         // current output
  let sentX = 0, sentY = 0, lastSent = 0, timer = 0;

  function place(bx, by, kx, ky) {
    base.style.left = bx + "px"; base.style.top = by + "px";
    knob.style.left = bx + kx + "px"; knob.style.top = by + ky + "px";
  }

  function layout() {
    const r = zone.getBoundingClientRect();
    const size = clamp(Math.min(r.width, r.height) * 0.62, 110, 220);
    R = size / 2;
    zone.style.setProperty("--spn-base", size + "px");
    zone.style.setProperty("--spn-knob", size * 0.42 + "px");
    // bottom-left resting spot (kept fully on screen)
    home = {
      x: Math.max(R + 16, r.width * 0.3),
      y: Math.min(r.height - R - 16, r.height * 0.7),
    };
    if (pid === null) place(home.x, home.y, 0, 0);
  }

  function flush() {
    timer = 0;
    lastSent = performance.now();
    const rx = +x.toFixed(2), ry = +y.toFixed(2);
    if (rx === sentX && ry === sentY) return;
    sentX = rx; sentY = ry;
    onChange(rx, ry);
  }
  function queue(force) {
    if (force) { clearTimeout(timer); flush(); return; }
    const wait = SEND_EVERY_MS - (performance.now() - lastSent);
    if (wait <= 0) flush();
    else if (!timer) timer = setTimeout(flush, wait);
  }

  function move(e) {
    const r = zone.getBoundingClientRect();
    const dx = e.clientX - r.left - ox, dy = e.clientY - r.top - oy;
    const dist = Math.hypot(dx, dy);
    if (dist < 1e-3) { x = y = 0; place(ox, oy, 0, 0); return; }
    const m = Math.min(dist, R);
    const mag = m / R;
    const out = mag < DEADZONE ? 0 : (mag - DEADZONE) / (1 - DEADZONE);
    x = (dx / dist) * out;
    y = (dy / dist) * out;
    place(ox, oy, (dx / dist) * m, (dy / dist) * m);
    queue(false);
  }

  function end() {
    pid = null;
    x = y = 0;
    base.classList.remove("on");
    place(home.x, home.y, 0, 0);
    queue(true); // always tell the game the stick was let go
  }

  const onDown = (e) => {
    if (pid !== null) return;
    pid = e.pointerId;
    zone.setPointerCapture?.(pid);
    const r = zone.getBoundingClientRect();
    const tx = e.clientX - r.left, ty = e.clientY - r.top;
    // near the resting spot -> use it; otherwise float to the touch point
    if (Math.hypot(tx - home.x, ty - home.y) <= R * 1.8) { ox = home.x; oy = home.y; }
    else { ox = tx; oy = ty; }
    base.classList.add("on");
    place(ox, oy, 0, 0);
    move(e);
  };
  const onMove = (e) => { if (e.pointerId === pid) move(e); };
  const onUp = (e) => { if (e.pointerId === pid) end(); };

  zone.addEventListener("pointerdown", onDown);
  zone.addEventListener("pointermove", onMove);
  zone.addEventListener("pointerup", onUp);
  zone.addEventListener("pointercancel", onUp);
  zone.addEventListener("lostpointercapture", onUp);

  const ro = new ResizeObserver(layout);
  ro.observe(zone);
  layout();

  return {
    // Safety: let go of the stick (tab hidden, connection lost, pad swapped).
    release() { if (pid !== null || x || y) end(); },
    destroy() {
      ro.disconnect();
      clearTimeout(timer);
      zone.removeEventListener("pointerdown", onDown);
      zone.removeEventListener("pointermove", onMove);
      zone.removeEventListener("pointerup", onUp);
      zone.removeEventListener("pointercancel", onUp);
      zone.removeEventListener("lostpointercapture", onUp);
    },
  };
}
