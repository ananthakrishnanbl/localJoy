// Everything sent to the phones: names / colours, vibration, HUD text and the controller mode.

import { TEAMS } from "../config.js";

export function setupPhone(G) {
  const S = G.S;
  const { ctx, roster, chars, caps } = G;

  const nameOf = (ch) => ctx.player(ch.slot)?.name ?? `P${ch.slot}`;
  const colorOf = (slot) => ctx.player(slot)?.color || "#888888";
  const vibrate = (slot, ms) => ctx.send(slot, { type: "vibrate", ms });

  function modeFor(slot) { return chars.has(slot) && S.phase !== "teams" ? "play" : "select"; }
  function sendModes() { for (const slot of roster.keys()) ctx.send(slot, { type: "ctf-mode", mode: modeFor(slot) }); }

  /* ---------------- phone HUD (health bar etc.) ---------------- */
  function phoneText(ch) {
    if (ch.carrying) return "🚩 YOU HAVE THE FLAG!";
    return `${TEAMS[ch.team].name} · ${caps[ch.team]}–${caps[1 - ch.team]} · ${ch.kills} kills`;
  }
  function sendPhoneHud(ch) {
    ctx.send(ch.slot, { type: "hud", hp: Math.round(ch.hp), text: phoneText(ch), down: !ch.alive });
  }

  // shared with the modules set up after this one
  Object.assign(G, { nameOf, colorOf, vibrate, modeFor, sendModes, sendPhoneHud });
}
