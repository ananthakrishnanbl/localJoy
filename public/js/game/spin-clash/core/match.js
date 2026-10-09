// The 3-round game:
//   waiting -> countdown -> fight -> roundEnd -> (countdown ... x3) -> final -> new game
// A round ends when one player is left standing. Finishing position gives points
// (SCORING.points). After the last round the leaderboard decides the winner.
// No drawing, no networking.

import { ARENA, MATCH, SCORING, SHRINK } from "../config.js";
import { clamp, lerp } from "./vec.js";

export function createMatch({ roster, bus }) {
  const table = new Map(); // slot -> { rounds: [points|null ...], total, firsts }
  let order = [];          // uids in the order they were eliminated this round
  let fighters = 0;        // how many played this round

  const row = (slot) => {
    if (!table.has(slot)) table.set(slot, { rounds: Array(SCORING.rounds).fill(null), total: 0, firsts: 0 });
    return table.get(slot);
  };

  const m = {
    phase: "waiting",
    t: 0,              // seconds spent in the current phase
    round: 0,          // 1..SCORING.rounds
    radius: ARENA.radius,
    shrinking: false,
    roundResult: [],   // [{ slot, place, points }] best first, after each round
    leaderboard: [],   // [{ slot, rank, rounds, total }] after the last round
    winnerSlot: null,  // overall winner after the last round

    get physicsOn() { return this.phase === "fight" || this.phase === "roundEnd"; },
    get combatOn() { return this.phase === "fight"; },

    totalOf(slot) { return table.get(slot)?.total ?? 0; },
    rankOf(slot) { return m.leaderboard.find((r) => r.slot === slot)?.rank ?? 0; },
    forget(slot) { table.delete(slot); },

    // Call BEFORE removing a leaving player's top from the roster.
    playerLeft(top) {
      if (m.phase === "fight" && !top.spectator && top.status === "alive") order.push(top.uid);
    },

    update(h) {
      m.t += h;
      updateRadius(h);

      // People joined/left before the fight: re-space everyone.
      if (roster.isDirty() && (m.phase === "waiting" || m.phase === "countdown")) {
        roster.resetForRound();
      }

      switch (m.phase) {
        case "waiting":
          if (roster.size >= MATCH.minPlayers) enter("countdown");
          break;
        case "countdown":
          if (roster.size < MATCH.minPlayers) enter("waiting");
          else if (m.t >= MATCH.countdown) enter("fight");
          break;
        case "fight":
          if (roster.alive().length <= 1) endRound();
          break;
        case "roundEnd":
          if (m.t >= MATCH.roundEnd) {
            if (m.round >= SCORING.rounds) endGame();
            else enter(roster.size >= MATCH.minPlayers ? "countdown" : "waiting");
          }
          break;
        case "final":
          if (m.t >= MATCH.final) {
            newSeries();
            enter(roster.size >= MATCH.minPlayers ? "countdown" : "waiting");
          }
          break;
      }
    },
  };

  function updateRadius(h) {
    if (m.phase === "fight") {
      const k = SHRINK.enabled ? clamp((m.t - SHRINK.delay) / SHRINK.duration, 0, 1) : 0;
      m.radius = lerp(ARENA.radius, SHRINK.minRadius, k * k * (3 - 2 * k));
      m.shrinking = k > 0;
    } else if (m.phase !== "roundEnd") {
      m.radius = Math.min(ARENA.radius, m.radius + SHRINK.growSpeed * h);
      m.shrinking = false;
    } else {
      m.shrinking = false;
    }
  }

  function newSeries() {
    table.clear();
    m.round = 0;
    m.roundResult = [];
    m.leaderboard = [];
    m.winnerSlot = null;
  }

  // Bus listener: remember who fell, and which position they finished in.
  bus.on("out", (e) => {
    const t = roster.findByUid(e.uid);
    if (t) t.place = Math.max(1, fighters - order.length);
    order.push(e.uid);
  });

  function enter(phase) {
    m.phase = phase;
    m.t = 0;
    if (phase === "waiting") {
      newSeries();
      roster.resetForRound();
    } else if (phase === "countdown") {
      m.round++;
      roster.resetForRound();
      bus.emit({ type: "round", round: m.round });
    } else if (phase === "fight") {
      fighters = roster.list().filter((t) => !t.spectator).length;
      order = [];
      roster.clearQueues();
      bus.emit({ type: "fight" });
    }
  }

  function endRound() {
    // Whoever is still standing wins the round.
    for (const t of roster.alive()) t.place = Math.max(1, fighters - order.length);

    const result = [];
    for (const t of roster.list()) {
      if (t.spectator || !t.place) continue;
      const points = SCORING.points[t.place - 1] ?? 0;
      const r = row(t.slot);
      r.rounds[m.round - 1] = points;
      r.total += points;
      if (t.place === 1) r.firsts++;
      result.push({ slot: t.slot, place: t.place, points });
    }
    result.sort((a, b) => a.place - b.place);
    m.roundResult = result;

    m.phase = "roundEnd";
    m.t = 0;
    bus.emit({ type: "roundEnd", round: m.round, winnerSlot: result[0]?.slot ?? null });
  }

  function endGame() {
    const rows = [...table.entries()]
      .filter(([slot]) => roster.get(slot))
      .map(([slot, r]) => ({ slot, rounds: r.rounds, total: r.total, firsts: r.firsts, last: r.rounds[SCORING.rounds - 1] ?? 0 }));
    // most points wins; ties: more round wins, then better last round
    rows.sort((a, b) => b.total - a.total || b.firsts - a.firsts || b.last - a.last);
    rows.forEach((r, i) => { r.rank = i + 1; });

    m.leaderboard = rows;
    m.winnerSlot = rows[0]?.slot ?? null;
    m.phase = "final";
    m.t = 0;
    bus.emit({ type: "winner", slot: m.winnerSlot });
  }

  return m;
}
