// Phone controller "spinner": analogue stick on the left,
// JUMP and DASH buttons on the right (10 s cooldown each, enforced by the game).
//
// Sends:     { type: "stick", x, y }                 -1..1
//            { type: "btn", id: "dash"|"jump", pressed: true }
// Receives:  { type: "cd", id: "dash"|"jump"|"all", ms, total }

import { installPadStyles } from "./spinner/styles.js";
import { createStick } from "./spinner/stick.js";
import { createAbilityButton } from "./spinner/abilityButton.js";

export default {
  id: "spinner",

  mount(root, io) {
    const style = installPadStyles();

    const pad = document.createElement("div");
    pad.className = "spn-pad";
    const left = document.createElement("div");
    left.className = "spn-zone-left";
    const right = document.createElement("div");
    right.className = "spn-zone-right";
    pad.append(left, right);
    root.append(pad);

    const stick = createStick(left, { onChange: (x, y) => io.send({ type: "stick", x, y }) });
    const jump = createAbilityButton({
      id: "jump", label: "JUMP", icon: "⤴", onPress: () => io.send({ type: "btn", id: "jump", pressed: true }),
    });
    const dash = createAbilityButton({
      id: "dash", label: "DASH", icon: "⚡", onPress: () => io.send({ type: "btn", id: "dash", pressed: true }),
    });
    right.append(jump.el, dash.el);

    return {
      release() { stick.release(); },
      destroy() {
        stick.destroy();
        jump.destroy();
        dash.destroy();
        style.remove();
      },
      onMessage(msg) {
        if (msg.type !== "cd") return;
        const ms = Number(msg.ms) || 0, total = Number(msg.total) || ms;
        if (msg.id === "dash" || msg.id === "all") dash.setCooldown(ms, total);
        if (msg.id === "jump" || msg.id === "all") jump.setCooldown(ms, total);
      },
    };
  },
};
