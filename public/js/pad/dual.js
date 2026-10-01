// "dual": twin sticks. Left moves, right aims and fires.
// Sends { type: "dual", mx, my, ax, ay } with both sticks in every message.
import { makeStick } from "./widgets.js";

export default {
  id: "dual",

  mount(root, io) {
    const state = { mx: 0, my: 0, ax: 0, ay: 0 };
    const out = () => io.send({ type: "dual", ...state });

    const move = makeStick({ label: "MOVE", emit: (x, y) => { state.mx = x; state.my = y; out(); } });
    const aim = makeStick({ label: "AIM + FIRE", aim: true, emit: (x, y) => { state.ax = x; state.ay = y; out(); } });
    root.append(move.el, aim.el);

    return {
      release() { move.release(); aim.release(); },
    };
  },
};