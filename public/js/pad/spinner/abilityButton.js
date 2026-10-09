// A round button with a cooldown ring + seconds counter.
// The GAME owns the cooldown: the button only presses when ready, and shows
// the ring when the game sends { type: "cd", id, ms, total }.

export function createAbilityButton({ id, label, icon, onPress }) {
  const el = document.createElement("button");
  el.type = "button";
  el.className = `spn-btn ${id}`;
  el.innerHTML = `<span class="spn-icon">${icon}</span><span class="spn-label">${label}</span><span class="spn-count"></span>`;
  const count = el.querySelector(".spn-count");

  let endAt = 0, total = 1, raf = 0, lockUntil = 0;

  function tick() {
    const left = endAt - performance.now();
    if (left <= 0) {
      el.style.setProperty("--cd", "0");
      el.classList.remove("cooling");
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
    if (ms > 0) el.classList.add("cooling");
    tick();
  }

  const down = (e) => {
    e.preventDefault();
    el.classList.add("down");
    const now = performance.now();
    if (now >= endAt && now >= lockUntil) {
      lockUntil = now + 250; // ignore double taps while the game answers
      navigator.vibrate?.(15);
      onPress();
    }
  };
  const up = () => el.classList.remove("down");

  el.addEventListener("pointerdown", down);
  el.addEventListener("pointerup", up);
  el.addEventListener("pointercancel", up);
  el.addEventListener("pointerleave", up);

  return {
    el,
    setCooldown,
    destroy() {
      cancelAnimationFrame(raf);
      el.removeEventListener("pointerdown", down);
      el.removeEventListener("pointerup", up);
      el.removeEventListener("pointercancel", up);
      el.removeEventListener("pointerleave", up);
    },
  };
}
