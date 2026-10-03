// Events from the console: players joining / leaving and controller input (lobby + play).

import { CHAR_COUNT } from "../config.js";
import { clampN, stickVal } from "../utils.js";

export function setupInput(G) {
  const S = G.S;
  const {
    ctx, on, roster, chars, renderLobby, lobbyHud, lobbyMove, lobbyButton, checkStart, removeChar, swapGun,
    pickGun, startReload, modeFor, layoutViews, updateStats, checkAbort
  } = G;

  /* ---------------- events from the console ---------------- */
  const newEntry = (slot) => ({ pos: 0, ready: false, latch: false, stage: "team", char: slot % CHAR_COUNT });
  for (const p of ctx.players()) roster.set(p.slot, newEntry(p.slot));
  on(window, "player-join", (e) => {
    const { slot } = e.detail;
    if (!roster.has(slot)) roster.set(slot, newEntry(slot));
    ctx.send(slot, { type: "ctf-mode", mode: modeFor(slot) });
    if (S.phase === "teams") { renderLobby(); lobbyHud(slot); }
    else ctx.send(slot, { type: "hud", text: "Match running: you join next round", down: false });
  });
  on(window, "player-leave", (e) => {
    const { slot } = e.detail;
    roster.delete(slot);
    const ch = chars.get(slot);
    if (ch) {
      removeChar(ch); chars.delete(slot);
      if (S.phase !== "teams") { layoutViews(); updateStats(); checkAbort(); }
    }
    if (S.phase === "teams") { renderLobby(); checkStart(); }
  });
  on(window, "controller-input", (e) => {
    const { slot, data } = e.detail || {};
    if (!data) return;
    if (data.type === "ctf") {                                      // twin sticks + fire (play mode)
      const ch = chars.get(slot);
      if (!ch) return;
      ch.input.mx = stickVal(data.mx); ch.input.my = stickVal(data.my);
      ch.input.fire = !!data.fire;
      ch.inputAt = performance.now();
      // look + reload arrive as running totals: act on the change since the last message
      const lookX = +data.lookX || 0, lookY = +data.lookY || 0, rl = data.rl | 0;
      const sw = data.sw | 0, pk = data.pk | 0;
      if (ch.sid !== data.sid) { ch.sid = data.sid; ch.lookPX = lookX; ch.lookPY = lookY; ch.rlSeen = rl; ch.swSeen = sw; ch.pkSeen = pk; }   // new page load: start counting from here
      const dX = lookX - ch.lookPX, dY = lookY - ch.lookPY;
      ch.lookPX = lookX; ch.lookPY = lookY;
      if (ch.alive) { ch.lookDX += clampN(dX, -2, 2); ch.lookDY += clampN(dY, -2, 2); }
      if (rl !== ch.rlSeen) { ch.rlSeen = rl; startReload(ch); }
      if (S.phase === "play") {
        if (sw !== ch.swSeen) { ch.swSeen = sw; swapGun(ch); }
        if (pk !== ch.pkSeen) { ch.pkSeen = pk; pickGun(ch); }
      } else { ch.swSeen = sw; ch.pkSeen = pk; }
    } else if (data.type === "move") lobbyMove(slot, stickVal(data.x));
    else if (data.type === "button") lobbyButton(slot, data.id, !!data.pressed);
  });
}
