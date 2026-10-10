// A round ability button with a cooldown pie + seconds counter.
// The GAME owns the cooldown: the button only presses when ready and shows the pie when
// the game sends { type: "cd", id, ms, total }.
//
// Structure (so nothing positioned is ever transformed - that is what made the old button drift):
//   div.spn-slot       absolutely positioned, never animated
//     button.spn-btn   fills the slot
//       span.spn-face  the visible disc; this is what scales when pressed
//       span.spn-shade cooldown pie
//       span.spn-count seconds left

export function createAbilityButton({ id, label, icon, onPress }) {
  const el = document.createElement("div");
  el.className = `spn-slot ${id}`;
  el.innerHTML = `
    <button type="button" class="spn-btn" tabindex="-1" aria-label="${label}">
      <span class="spn-face">${icon}<span class="spn-label">${label}</span></span>
      <span class="spn-shade"></span>
      <span class="spn-count"></span>
    </button>`;
  const btn = el.querySelector(".spn-btn");
  const count = el.querySelector(".spn-count");

  let endAt = 0, total = 1, raf = 0, lockUntil = 0, activePointer = null;

  function tick() {
    const left = endAt - performance.now();
    if (left <= 0) {
      el.style.setProperty("--cd", "0");
      btn.classList.remove("cooling");
      count.textContent = "";
      raf = 0;
      return;
    }
    el.style.setProperty("--cd", String(left / total));
    count.textContent = String(Math.ceil(left / 1000));
    raf = requestAnimationFrame(tick);
  }

  function setCooldown(ms, totalMs) {
    endAt = performance.now() + ms;
    total = Math.max(1, totalMs || ms || 1);
    cancelAnimationFrame(raf);
    if (ms > 0) btn.classList.add("cooling");
    tick();
  }

  const release = () => {
    activePointer = null;
    btn.classList.remove("down");
  };

  const down = (e) => {
    e.preventDefault();
    if (activePointer !== null) return;
    activePointer = e.pointerId;
    try { btn.setPointerCapture(e.pointerId); } catch { /* not critical */ }
    btn.classList.add("down");
    const now = performance.now();
    if (now >= endAt && now >= lockUntil) {
      lockUntil = now + 250; // ignore double taps while the game answers
      navigator.vibrate?.(15);
      onPress();
    }
  };
  const up = (e) => { if (e.pointerId === activePointer) release(); };

  btn.addEventListener("pointerdown", down);
  btn.addEventListener("pointerup", up);
  btn.addEventListener("pointercancel", up);
  btn.addEventListener("lostpointercapture", up);
  btn.addEventListener("contextmenu", (e) => e.preventDefault());
  window.addEventListener("blur", release);

  return {
    el,
    setCooldown,
    destroy() {
      cancelAnimationFrame(raf);
      window.removeEventListener("blur", release);
    },
  };
}
