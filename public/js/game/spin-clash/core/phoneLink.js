// Everything the game says to phones: vibration, a short status line (round,
// points, finishing place) and the cooldown state that drives the DASH / JUMP rings.

import { ABILITY, MATCH, SCORING } from "../config.js";
import { KB_SLOT } from "./keyboard.js";

export function createPhoneLink({ ctx, bus, roster, match }) {
  const lastHud = new Map();
  const lastVib = new Map();
  let acc = 0;

  const send = (slot, msg) => { if (slot !== KB_SLOT) ctx.send(slot, msg); };

  const vibrate = (slot, ms) => {
    const now = performance.now();
    if (now - (lastVib.get(slot) || 0) < 120) return; // don't machine-gun the motor
    lastVib.set(slot, now);
    send(slot, { type: "vibrate", ms });
  };

  const cooldown = (slot, id, ms) =>
    send(slot, { type: "cd", id, ms, total: ABILITY.cooldown * 1000 });

  bus.on("throw", (e) => {
    vibrate(e.victim, [60, 30, 120]);
    vibrate(e.attacker, 35);
  });
  bus.on("bump", (e) => e.slots.forEach((s) => vibrate(s, 18)));
  bus.on("wall", (e) => vibrate(e.slot, 14));
  bus.on("dash", (e) => cooldown(e.slot, "dash", ABILITY.cooldown * 1000));
  bus.on("jump", (e) => cooldown(e.slot, "jump", ABILITY.cooldown * 1000));
  bus.on("out", (e) => send(e.slot, { type: "vibrate", ms: [120, 60, 220] }));
  bus.on("roundEnd", (e) => { if (e.winnerSlot !== null) send(e.winnerSlot, { type: "vibrate", ms: [60, 40, 60] }); });
  bus.on("winner", (e) => { if (e.slot !== null) send(e.slot, { type: "vibrate", ms: [80, 40, 80, 40, 260] }); });
  bus.on("round", () => {
    lastHud.clear();
    for (const t of roster.list()) cooldown(t.slot, "all", 0); // fresh round = both abilities ready
  });

  function statusText(t) {
    if (t.spectator) return "Joining next round";
    const pts = match.totalOf(t.slot);
    if (match.phase === "final") return `Final: #${match.rankOf(t.slot)} · ${pts} pts`;
    if (match.phase === "fight" && t.status !== "alive") return `Out! Place #${t.place} · ${pts} pts`;
    return `Round ${Math.max(1, match.round)}/${SCORING.rounds} · ${pts} pts`;
  }

  return {
    // Call every frame; sends a few updates per second, only when the text changed.
    update(dt) {
      acc += dt;
      if (acc < MATCH.hudInterval) return;
      acc = 0;
      for (const t of roster.list()) {
        if (t.slot === KB_SLOT) continue;
        const hud = { type: "hud", text: statusText(t) };
        const key = hud.text;
        if (lastHud.get(t.slot) !== key) { lastHud.set(t.slot, key); send(t.slot, hud); }
      }
    },
  };
}
