// "choice": big answer buttons for quiz-style games.
// The game decides the options by sending a phone: { type: "choices", options: ["Paris", "Rome", ...] }
// Tapping one sends { type: "choice", index } and locks the buttons until the next "choices" message.
import { el } from "./widgets.js";

const COLORS = ["var(--red)", "var(--blue)", "var(--yel)", "var(--grn)"];

export default {
  id: "choice",

  mount(root, io) {
    const wrap = el("div", "choices");
    wrap.append(el("p", "choices-msg", "Waiting for the question…"));
    root.append(wrap);

    function show(options) {
      wrap.replaceChildren(...options.map((text, index) => {
        const b = el("button", "toy choice", text);
        b.style.setProperty("--c", COLORS[index % COLORS.length]);
        b.onclick = () => {
          io.send({ type: "choice", index });
          navigator.vibrate?.(20);
          wrap.querySelectorAll("button").forEach((x) => (x.disabled = true));
          b.classList.add("picked");
        };
        return b;
      }));
    }

    return {
      // anything the controller does not recognise is passed here
      onMessage(msg) {
        if (msg.type === "choices" && Array.isArray(msg.options)) show(msg.options.slice(0, 6).map(String));
      },
    };
  },
};