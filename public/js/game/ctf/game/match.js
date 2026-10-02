// Match flow: countdown, match clock, overtime, end of match and back to team select.

import { MATCH_TIME, OVERTIME, TEAMS } from "../config.js";

export function setupMatch(G) {
  const S = G.S;
  const {
    ctx, roster, chars, caps, flags, medkits, resetPickups, vibrate, ding, scoreEl, feedEl, bannerEl,
    lobbyEl, banner, feedItems, clearPreviews, renderLobby, lastLobbyHud, lobbyHud, spawnChar, removeChar,
    returnFlag, placeMedkit, sendModes, layoutViews, updateStats, sendPhoneHud
  } = G;

  function startMatch() {
    caps[0] = caps[1] = 0; S.matchT = MATCH_TIME; S.overtime = false;
    for (const f of flags) returnFlag(f);
    for (const k of medkits) { k.active = false; k.group.visible = false; k.lastX = k.lastZ = 1e9; }
    for (const k of medkits) placeMedkit(k);
    const players = [...roster.entries()].filter(([, r]) => r.pos !== 0).sort((a, b) => a[0] - b[0]).slice(0, 4);   // four split-screen cells at most
    resetPickups();
    clearPreviews();
    for (const [slot, r] of players) chars.set(slot, spawnChar(slot, r.pos < 0 ? 0 : 1, r.char));
    layoutViews(); updateStats();
    feedEl.replaceChildren(); feedItems.length = 0;
    lobbyEl.style.display = "none";
    scoreEl.style.display = "flex";
    S.phase = "count"; S.countT = 3;
    sendModes();
    for (const ch of chars.values()) sendPhoneHud(ch);
    for (const [slot] of roster) if (!chars.has(slot)) ctx.send(slot, { type: "hud", text: "Match running: you join next round", down: false });
  }
  function updateClock(dt) {
    if (S.overtime) return;
    const before = Math.ceil(S.matchT);
    S.matchT -= dt;
    const after = Math.ceil(Math.max(0, S.matchT));
    if (after !== before) {
      if (after === 60) banner("1 MINUTE LEFT", `${caps[0]} – ${caps[1]}`, 2);
      else if (after === 30) banner("30 SECONDS LEFT", `${caps[0]} – ${caps[1]}`, 2);
      else if (after <= 10 && after > 0) ding(880, 0.06);          // tick for the last ten seconds
    }
    if (S.matchT > 0) return;
    S.matchT = 0;
    if (caps[0] !== caps[1]) endMatch(caps[0] > caps[1] ? 0 : 1);   // most captures wins
    else if (OVERTIME) { S.overtime = true; banner("OVERTIME!", "tied · next capture wins", 3); ding(600, 0.2); setTimeout(() => ding(900, 0.3), 180); }
    else endMatch(-1);
  }
  function endMatch(winner) {
    if (S.phase === "over") return;
    S.phase = "over";
    if (winner === null) { S.overT = 2.5; banner("MATCH CANCELLED", "a team has no players left", S.overT); }
    else if (winner === -1) {                                       // time up and still tied (only when OVERTIME is false)
      S.overT = 7;
      banner("DRAW!", `${caps[0]} – ${caps[1]}  ·  back to team select…`, S.overT);
      ding(440, 0.3); setTimeout(() => ding(440, 0.4), 250);
      for (const ch of chars.values()) vibrate(ch.slot, [150, 80, 150]);
    }
    else {
      S.overT = 7;
      banner(`${TEAMS[winner].name} TEAM WINS!`, `${caps[0]} – ${caps[1]}  ·  back to team select…`, S.overT);
      ding(523, 0.3); setTimeout(() => ding(659, 0.3), 200); setTimeout(() => ding(784, 0.5), 400);
      for (const ch of chars.values()) vibrate(ch.slot, ch.team === winner ? [100, 60, 100, 60, 300] : [300]);
    }
  }
  function toTeams() {
    for (const ch of chars.values()) removeChar(ch);
    chars.clear();
    for (const v of S.views) v.el.remove();
    S.views = []; S.statsEl?.remove(); S.statsEl = null;
    for (const f of flags) returnFlag(f);
    for (const k of medkits) { k.active = false; k.group.visible = false; }
    for (const r of roster.values()) { r.ready = false; r.latch = false; r.stage = r.pos ? "char" : "team"; }   // keep team + character, just ready up again
    lastLobbyHud.clear();
    S.phase = "teams";
    scoreEl.style.display = "none"; bannerEl.style.display = "none";
    feedEl.replaceChildren(); feedItems.length = 0;
    lobbyEl.style.display = "flex";
    renderLobby();
    sendModes();
    for (const slot of roster.keys()) lobbyHud(slot);
  }
  function checkAbort() {
    if (S.phase !== "play" && S.phase !== "count") return;
    const n = [0, 0]; for (const c of chars.values()) n[c.team]++;
    if (!n[0] || !n[1]) endMatch(null);
  }

  // shared with the modules set up after this one
  Object.assign(G, { startMatch, updateClock, endMatch, toTeams, checkAbort });
}
