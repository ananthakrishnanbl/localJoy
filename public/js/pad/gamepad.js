// "pad": joystick on the left, A / B / X / Y on the right.
// Sends { type: "move", x, y } and { type: "button", id, pressed }.
// Also the pad the host gets on the select-game page.
import { makeStick, makeButtons } from "./widgets.js";

export default {
  id: "pad",

  mount(root, io) {
    const stick = makeStick({ emit: (x, y) => io.send({ type: "move", x, y }) });
    const buttons = makeButtons(["Y", "X", "B", "A"], io.send);
    root.append(stick.el, buttons.el);

    return {
      release() { stick.release(); buttons.release(); },
    };
  },
};