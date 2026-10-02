// Registry of controller types. A game picks one with `controller: "..."` in gameinfo.js.
//
// A pad module is { id, mount(root, io) }.
//   root  the element to build the controller into
//   io    { send(msg) }, sends a message to the console
// mount() may return any of:
//   release()       let go of every input (tab hidden, disconnected, pad swapped)
//   destroy()       remove window listeners and timers
//   onMessage(msg)  messages from the game that controller.js does not handle itself
//
// To add a pad: create js/pad/<name>.js, import it here and add it to PADS.
import gamepad from "./gamepad.js";
import dual from "./dual.js";
import tilt from "./tilt.js";
import choice from "./choice.js";
import race from "./race.js";
import ctf from "./ctf.js";

const PADS = {
  [gamepad.id]: gamepad,
  [dual.id]: dual,
  [tilt.id]: tilt,
  [choice.id]: choice,
  [race.id]: race,            // <-- was missing: without it "race" fell back to the joystick pad
  [ctf.id]: ctf,              // capture the flag: basic pad for team select, twin sticks + fire in play
};

export function getPad(type) {
  if (!PADS[type]) console.warn(`No pad called "${type}", using the joystick pad.`);
  return PADS[type] || gamepad;
}