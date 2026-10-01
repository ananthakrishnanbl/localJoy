// Building blocks shared by every pad: the joystick and the buttons.
// A pad module assembles these (and anything else it needs) into its own controller.

// Phone held upright: the whole controller is turned sideways by CSS, so stick math is turned too.
export const turned = matchMedia("(orientation: portrait)");

export function el(tag, cls, text) {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text !== undefined) n.textContent = text;
  return n;
}

/* ---------------- Joystick ---------------- */
// emit(x, y) gets -1..1 on each axis (y: -1 up, 1 down).
// Returns { el, release }. release() lets go of the stick and sends 0,0.
export function makeStick({ emit, label = "", aim = false }) {
  const stick = el("div", aim ? "stick aim" : "stick");
  if (label) stick.dataset.label = label;
  stick.setAttribute("aria-label", label || "Joystick");
  const knob = el("div", "knob");
  stick.append(knob);

  let pointerId = null;
  let last = "";
  let lastSent = 0;

  function report(x, y, force = false) {
    const key = `${x},${y}`;
    const now = performance.now();
    if (key === last || (!force && now - lastSent < 25)) return;   // ~40 updates per second max
    last = key;
    lastSent = now;
    emit(x, y);
  }

  function update(e) {
    const rect = stick.getBoundingClientRect();
    const max = (rect.width - knob.offsetWidth) / 2;
    let dx = e.clientX - (rect.left + rect.width / 2);
    let dy = e.clientY - (rect.top + rect.height / 2);
    if (turned.matches) [dx, dy] = [dy, -dx];
    const dist = Math.hypot(dx, dy);
    if (dist > max) { dx = (dx / dist) * max; dy = (dy / dist) * max; }
    knob.style.transform = `translate(${dx}px, ${dy}px)`;

    let x = dx / max;
    let y = dy / max;
    if (Math.hypot(x, y) < 0.12) { x = 0; y = 0; }   // dead zone
    report(+x.toFixed(2), +y.toFixed(2));
  }

  function release() {
    if (pointerId === null) return;
    pointerId = null;
    knob.classList.remove("active");
    knob.style.transform = "";
    report(0, 0, true);
  }

  stick.addEventListener("pointerdown", (e) => {
    if (pointerId !== null) return;
    e.preventDefault();
    pointerId = e.pointerId;
    stick.setPointerCapture(pointerId);
    knob.classList.add("active");
    navigator.vibrate?.(8);
    update(e);
  });
  stick.addEventListener("pointermove", (e) => e.pointerId === pointerId && update(e));
  stick.addEventListener("pointerup", (e) => e.pointerId === pointerId && release());
  stick.addEventListener("pointercancel", (e) => e.pointerId === pointerId && release());
  stick.addEventListener("lostpointercapture", (e) => e.pointerId === pointerId && release());

  return { el: stick, release };
}

/* ---------------- Buttons ---------------- */
// One round button. Sends { type: "button", id, pressed }.
export function makeButton(id, send) {
  const btn = el("button", "btn", id);
  btn.dataset.id = id;

  const set = (pressed) => {
    btn.classList.toggle("down", pressed);
    send({ type: "button", id, pressed });
    if (pressed) navigator.vibrate?.(12);
  };
  const up = () => btn.classList.contains("down") && set(false);

  btn.addEventListener("pointerdown", (e) => {
    e.preventDefault();
    btn.setPointerCapture(e.pointerId);
    set(true);
  });
  btn.addEventListener("pointerup", up);
  btn.addEventListener("pointercancel", up);

  return { el: btn, release: up };
}

// A diamond of buttons. ids is any of "Y", "X", "B", "A", e.g. ["A", "B"].
export function makeButtons(ids, send) {
  const AREAS = { Y: "y", X: "x", B: "b", A: "a" };
  const wrap = el("div", "buttons");
  const list = ids.map((id) => {
    const b = makeButton(id, send);
    b.el.style.gridArea = AREAS[id] || "a";
    wrap.append(b.el);
    return b;
  });
  return { el: wrap, release: () => list.forEach((b) => b.release()) };
}