// "tilt": steer by tilting the phone, plus one big A button.
// Sends { type: "tilt", x, y } (-1..1) and { type: "button", id: "A", pressed }.
// Tap the dish to set the current angle as "straight".
// Note: browsers only give motion data on HTTPS (or localhost), and iOS asks for permission first.
import { el, makeButton } from "./widgets.js";

const RANGE = 30;   // degrees of tilt that count as full deflection
const clamp = (v) => Math.max(-1, Math.min(1, v));

function axes(beta, gamma) {
  const angle = screen.orientation?.angle ?? 0;
  if (angle === 90) return [clamp(beta / RANGE), clamp(-gamma / RANGE)];
  if (angle === 270) return [clamp(-beta / RANGE), clamp(gamma / RANGE)];
  return [clamp(gamma / RANGE), clamp(beta / RANGE)];   // phone upright
}

export default {
  id: "tilt",

  mount(root, io) {
    const dish = el("div", "stick");
    dish.dataset.label = "TAP TO CENTER";
    const knob = el("div", "knob active");   // "active" = follows the phone with no easing
    dish.append(knob);

    const a = makeButton("A", io.send);
    a.el.classList.add("big");

    let raw = { b: 0, g: 0 };
    let zero = null;
    let last = "";
    let lastSent = 0;
    let watchdog = null;

    function onTilt(e) {
      clearTimeout(watchdog);
      raw = { b: e.beta ?? 0, g: e.gamma ?? 0 };
      if (!zero) zero = { ...raw };                       // first reading = straight
      const [x, y] = axes(raw.b - zero.b, raw.g - zero.g);
      knob.style.transform = `translate(${x * 60}%, ${y * 60}%)`;

      const key = `${x.toFixed(2)},${y.toFixed(2)}`;
      const now = performance.now();
      if (key === last || now - lastSent < 30) return;
      last = key;
      lastSent = now;
      io.send({ type: "tilt", x: +x.toFixed(2), y: +y.toFixed(2) });
    }

    dish.addEventListener("pointerdown", () => { zero = { ...raw }; navigator.vibrate?.(15); });

    const enable = el("button", "toy primary", "📱 Enable tilt");
    enable.onclick = async () => {
      try {
        if (window.DeviceOrientationEvent?.requestPermission) {          // iOS
          if ((await DeviceOrientationEvent.requestPermission()) !== "granted") throw new Error("denied");
        }
        window.addEventListener("deviceorientation", onTilt);
        root.replaceChildren(dish, a.el);
        watchdog = setTimeout(() => { dish.dataset.label = "NO SENSOR (NEEDS HTTPS)"; }, 2000);
      } catch {
        enable.textContent = "Motion access was blocked";
      }
    };
    root.append(enable);

    return {
      release() { a.release(); io.send({ type: "tilt", x: 0, y: 0 }); },
      destroy() { window.removeEventListener("deviceorientation", onTilt); clearTimeout(watchdog); },
    };
  },
};