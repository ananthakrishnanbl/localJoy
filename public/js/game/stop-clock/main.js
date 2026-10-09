// Stop Clock — hidden stopwatch, one button, target 10.00 s.
//
// Flow: countdown → running → reveal (3 s of frozen clocks) →
//       leaderboard (all players tap START / PLAY AGAIN).
//
// Round score = 500 - |t*100 - 1000|, in [0, 500]. Highest total over
// three rounds wins. Plays 1-10 players.

const TAU = Math.PI * 2;
const HEADER_H = 44;

const COUNTDOWN       = 3.5;
const CLOSE_START     = 1.0;
const CLOSE_DURATION  = 1.4;
const REVEAL_DURATION = 3.0;    // seconds the frozen clocks stay visible
const REVEAL_ANIM     = 0.6;    // portion of that used to open the irises
const TOTALS_DELAY    = 3.0;    // seconds the final results stay up before totals
const TARGET          = 10.0;
const MAX_TIME        = 20.0;
const TOTAL_ROUNDS    = 3;

// -------- Palette matched to the localJoy site --------
const BG          = "#1e2246";
const BG_CELL     = "#232850";
const BG_HEADER   = "#1a1e3d";
const CARD        = "#ffffff";
const CARD_EDGE   = "rgba(255,255,255,0.10)";
const CARD_SHADOW = "rgba(0,0,0,0.45)";
const INK         = "#1a1f3d";
const INK_LIGHT   = "#ffffff";
const MUTED       = "#8b93b8";
const FAINT       = "#5a6188";
const DIVIDER     = "rgba(255,255,255,0.08)";
const FLAP        = "#0a0f2a";
const FLAP_ALT    = "#141a3f";
const FLAP_SEAM   = "rgba(255,255,255,0.06)";
const BLUE        = "#5b8def";
const GREEN       = "#2fbf71";
const GOLD        = "#ffb400";
const PILL_BG     = "rgba(91,141,239,0.16)";
const PILL_TEXT   = "#8ab4f8";

export function start(ctx) {
  const { root, signal } = ctx;
  const on = (t, type, fn) => t.addEventListener(type, fn, { signal });

  /* --------------------------- display --------------------------- */
  root.style.setProperty("background", BG, "important");
  root.style.setProperty("position", "relative", "important");
  root.style.setProperty("overflow", "hidden", "important");
  root.style.setProperty("border", "0", "important");
  root.style.setProperty("padding", "0", "important");
  root.style.setProperty("margin", "0", "important");

  const wrapEl = document.createElement("div");
  Object.assign(wrapEl.style, {
    position: "absolute", inset: "0",
    display: "flex", alignItems: "center", justifyContent: "center",
    background: BG, border: "0", padding: "0", margin: "0",
    overflow: "hidden",
  });

  const canvas = document.createElement("canvas");
  canvas.width = 1280;
  canvas.height = 720;
  Object.assign(canvas.style, {
    display: "block", maxWidth: "100%", maxHeight: "100%",
    aspectRatio: "16 / 9", background: BG,
    border: "0", padding: "0", margin: "0",
  });

  wrapEl.append(canvas);
  root.replaceChildren(wrapEl);
  const g = canvas.getContext("2d");

  /* ---------------------- kill switch / handles ------------------ */
  let exiting = false;
  let raf = 0;
  let last = performance.now();

  /* --------------------------- state ----------------------------- */
  const players = new Map();
  // countdown | running | reveal | leaderboard | totals
  let state = "countdown";
  let stateTimer = COUNTDOWN;
  let roundStart = 0;
  let roundClock = 0;
  let aperture = 1;
  let currentRound = 0;
  let winnerSlots = [];

  /* ------------------------ player management -------------------- */
  function addPlayer(slot) {
    const existing = players.get(slot);
    if (existing) { existing.connected = true; return; }
    const info = ctx.player(slot);
    if (!info) return;
    players.set(slot, {
      slot, connected: true, rect: null,
      stopped: false, stopTime: 0, score: 0, total: 0,
      ready: false,
      roundScores: [],
      lastSid: null, lastCount: 0,
    });
  }

  ctx.players().forEach((p) => addPlayer(p.slot));

  on(window, "player-join", (e) => {
    if (exiting) return;
    addPlayer(e.detail.slot);
    if (state === "running") {
      ctx.send(e.detail.slot, { type: "stopper-state", state: "armed" });
    }
    if (state === "countdown") layoutRound();
  });

  on(window, "player-leave", (e) => {
    const p = players.get(e.detail.slot);
    if (!p) return;
    p.connected = false;
    p.ready = false;
    if (state === "countdown") layoutRound();
    if (state === "running") checkAllStopped();
    if (state === "leaderboard" || state === "totals") checkAllReady();
  });

  on(window, "controller-input", (e) => {
    if (exiting) return;
    const { slot, data } = e.detail;
    const p = players.get(slot);
    if (!p || !data || data.type !== "stop") return;

    const count = data.count | 0;
    if (data.sid !== p.lastSid) {
      p.lastSid = data.sid;
      p.lastCount = count;
      return;
    }
    if (count <= p.lastCount) return;
    p.lastCount = count;

    if (state === "running" && !p.stopped) {
      p.stopped = true;
      p.stopTime = Math.max(0, (performance.now() - roundStart) / 1000);
      p.score = Math.max(0, 500 - Math.round(Math.abs(p.stopTime * 100 - TARGET * 100)));
      ctx.send(slot, { type: "vibrate", ms: 30 });
      ctx.send(slot, { type: "stopper-state", state: "stopped" });
      checkAllStopped();
    } else if ((state === "leaderboard" || state === "totals") && !p.ready) {
      p.ready = true;
      ctx.send(slot, { type: "vibrate", ms: 20 });
      checkAllReady();
    }
  });

  /* --------------------------- layout ---------------------------- */
  function getGridFor(n) {
    if (n <= 1) return [1, 1];
    if (n === 2) return [2, 1];
    if (n === 3) return [3, 1];
    if (n === 4) return [2, 2];
    if (n <= 6) return [3, 2];
    if (n <= 8) return [4, 2];
    if (n === 9) return [3, 3];
    return [5, 2];
  }

  function layoutRound() {
    const all = [...players.values()];
    const connected = all.filter((p) => p.connected);
    const n = Math.max(1, connected.length);
    const [cols, rows] = getGridFor(n);
    const W = canvas.width;
    const H = canvas.height - HEADER_H;
    const cellW = W / cols;
    const cellH = H / rows;

    for (const p of all) p.rect = null;

    connected.forEach((p, i) => {
      const r = Math.floor(i / cols);
      const c = i - r * cols;
      const itemsInRow = Math.min(cols, n - r * cols);
      const rowOffset = (cols - itemsInRow) * cellW / 2;
      p.rect = {
        x: c * cellW + rowOffset,
        y: HEADER_H + r * cellH,
        w: cellW,
        h: cellH,
      };
    });
  }

  /* ---------------------- round control -------------------------- */
  function startRound() {
    if (exiting) return;
    currentRound++;
    if (currentRound === 1) {
      for (const p of players.values()) p.roundScores = [];
    }
    roundStart = 0;
    roundClock = 0;
    aperture = 1;
    winnerSlots = [];
    for (const p of players.values()) {
      p.stopped = false;
      p.stopTime = 0;
      p.score = 0;
      p.ready = false;
      if (p.connected) ctx.send(p.slot, { type: "stopper-state", state: "idle" });
    }
    layoutRound();
    state = "countdown";
    stateTimer = COUNTDOWN;
  }

  function beginRunning() {
    roundStart = performance.now();
    roundClock = 0;
    state = "running";
    for (const p of players.values()) {
      if (p.connected && !p.stopped) {
        ctx.send(p.slot, { type: "stopper-state", state: "armed" });
      }
    }
  }

  // Everyone stopped → reveal the clocks for a few seconds. Buttons
  // stay on "stopped" so nobody can advance the game early.
  function checkAllStopped() {
    if (state !== "running") return;
    const active = [...players.values()].filter((p) => p.connected);
    if (active.length === 0) return;
    if (!active.every((p) => p.stopped)) return;

    // Round winner = highest round score.
    let best = -Infinity;
    winnerSlots = [];
    for (const p of active) {
      if (p.score > best) { best = p.score; winnerSlots = [p.slot]; }
      else if (p.score === best) winnerSlots.push(p.slot);
    }
    // Fold round score into match total and keep per-round history.
    for (const p of active) {
      p.total += p.score;
      p.roundScores.push(p.score);
    }

    aperture = 0;
    state = "reveal";
    stateTimer = REVEAL_DURATION;
    ctx.broadcast({ type: "vibrate", ms: [40, 30, 40] });
  }

  // Reveal is done → full-screen leaderboard. Now the phone button
  // becomes START (rounds 1-2) or PLAY AGAIN (final round).
  // After the final round the leaderboard lingers for TOTALS_DELAY
  // seconds, then flips to the total-scores view.
  function enterLeaderboard() {
    state = "leaderboard";
    const isFinal = currentRound >= TOTAL_ROUNDS;
    stateTimer = isFinal ? TOTALS_DELAY : 0;
    for (const p of players.values()) {
      if (p.connected) {
        ctx.send(p.slot, {
          type: "stopper-state",
          state: isFinal ? "replay" : "start",
        });
      }
    }
  }

  function checkAllReady() {
    if (state !== "leaderboard" && state !== "totals") return;
    const active = [...players.values()].filter((p) => p.connected);
    if (active.length === 0) return;
    if (!active.every((p) => p.ready)) return;
    if (currentRound >= TOTAL_ROUNDS) {
      // Fresh match: reset totals.
      for (const p of players.values()) p.total = 0;
      currentRound = 0;
    }
    startRound();
  }

  startRound();

  /* --------------------------- update ---------------------------- */
  function easeInOut(t) {
    return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
  }

  function update(dt) {
    if (exiting) return;

    if (state === "countdown") {
      stateTimer -= dt;
      if (stateTimer <= 0) beginRunning();
      return;
    }

    if (state === "running") {
      roundClock = (performance.now() - roundStart) / 1000;

      if (roundClock < CLOSE_START) {
        aperture = 1;
      } else if (roundClock < CLOSE_START + CLOSE_DURATION) {
        const t = (roundClock - CLOSE_START) / CLOSE_DURATION;
        aperture = 1 - easeInOut(t);
      } else {
        aperture = 0;
      }

      if (roundClock >= MAX_TIME) {
        for (const p of players.values()) {
          if (p.connected && !p.stopped) {
            p.stopped = true;
            p.stopTime = MAX_TIME;
            p.score = Math.max(0, 500 - Math.round(Math.abs(MAX_TIME * 100 - TARGET * 100)));
            ctx.send(p.slot, { type: "stopper-state", state: "stopped" });
          }
        }
        checkAllStopped();
      }
      return;
    }

    if (state === "reveal") {
      stateTimer -= dt;
      // Open the irises during the first REVEAL_ANIM seconds, then hold
      // so the frozen times are readable for the rest of the reveal.
      const elapsed = REVEAL_DURATION - stateTimer;
      const t = Math.max(0, Math.min(1, elapsed / REVEAL_ANIM));
      aperture = easeInOut(t);
      if (stateTimer <= 0) enterLeaderboard();
      return;
    }

    if (state === "leaderboard") {
      // After the final round, hold on the round results for a beat,
      // then show the total-scores view.
      if (stateTimer > 0) {
        stateTimer -= dt;
        if (stateTimer <= 0) {
          stateTimer = 0;
          state = "totals";
          ctx.broadcast({ type: "vibrate", ms: [30, 40, 30] });
        }
      }
      return;
    }

    // totals: waiting for taps.
  }

  /* ---------------------------- draw ----------------------------- */
  function roundRect(x, y, w, h, r) {
    if (w < 2 * r) r = w / 2;
    if (h < 2 * r) r = h / 2;
    g.beginPath();
    g.moveTo(x + r, y);
    g.arcTo(x + w, y, x + w, y + h, r);
    g.arcTo(x + w, y + h, x, y + h, r);
    g.arcTo(x, y + h, x, y, r);
    g.arcTo(x, y, x + w, y, r);
    g.closePath();
  }

  function formatClock(t) {
    const v = Math.max(0, t);
    const s = Math.floor(v);
    const c = Math.floor((v - s) * 100);
    return `${String(s).padStart(2, "0")}.${String(c).padStart(2, "0")}`;
  }

  /* ---------- 8-blade iris ---------- */
  function drawAperture(cx, cy, R, ap) {
    if (ap >= 0.995) return;

    const N = 8;
    const step = TAU / N;
    const r = R * ap;
    const rot = step * 0.35 * (1 - ap);

    g.save();
    g.beginPath();
    g.arc(cx, cy, R, 0, TAU);
    g.clip();

    for (let i = 0; i < N; i++) {
      const a0 = i * step;
      const a1 = (i + 1) * step;

      g.beginPath();
      g.arc(cx, cy, R, a0, a1);

      if (r > 0.6) {
        g.lineTo(cx + r * Math.cos(a1 + rot),
                 cy + r * Math.sin(a1 + rot));
        g.arc(cx, cy, r, a1 + rot, a0 + rot, true);
      } else {
        g.lineTo(cx, cy);
      }
      g.closePath();

      g.fillStyle = (i % 2 === 0) ? FLAP : FLAP_ALT;
      g.fill();
      g.strokeStyle = FLAP_SEAM;
      g.lineWidth = 1;
      g.stroke();
    }

    const vg = g.createRadialGradient(cx, cy, Math.max(0, r * 0.6), cx, cy, R);
    vg.addColorStop(0, "rgba(0,0,0,0)");
    vg.addColorStop(1, "rgba(0,0,0,0.55)");
    g.fillStyle = vg;
    g.beginPath();
    g.arc(cx, cy, R, 0, TAU);
    g.fill();

    g.restore();
  }

  function drawClockFace(cx, cy, R, timeVal, hidden, color) {
    g.save();
    g.shadowColor = CARD_SHADOW;
    g.shadowBlur = 16;
    g.shadowOffsetY = 5;
    g.beginPath();
    g.arc(cx, cy, R * 1.02, 0, TAU);
    g.fillStyle = CARD;
    g.fill();
    g.restore();

    g.beginPath();
    g.arc(cx, cy, R * 1.02, 0, TAU);
    g.strokeStyle = "rgba(255,255,255,0.6)";
    g.lineWidth = 1.5;
    g.stroke();

    for (let i = 0; i < 12; i++) {
      const a = i * (TAU / 12) - Math.PI / 2;
      const r0 = R * 0.86;
      const r1 = R * 0.92;
      g.beginPath();
      g.moveTo(cx + r0 * Math.cos(a), cy + r0 * Math.sin(a));
      g.lineTo(cx + r1 * Math.cos(a), cy + r1 * Math.sin(a));
      g.strokeStyle = "rgba(26,31,61,0.22)";
      g.lineWidth = 2;
      g.lineCap = "round";
      g.stroke();
    }

    if (hidden) return;

    const txt = formatClock(timeVal);
    const fontSize = Math.max(18, R * 0.52);
    g.font = `800 ${fontSize}px "SF Mono", Menlo, Consolas, monospace`;
    g.textAlign = "center";
    g.textBaseline = "middle";
    g.fillStyle = color;
    g.fillText(txt, cx, cy + R * 0.02);
  }

  function drawQuadrant(p) {
    const r = p.rect;
    const info = ctx.player(p.slot);
    const color = (info && info.color) || BLUE;
    const name = (info && info.name) || `P${p.slot + 1}`;

    g.fillStyle = BG_CELL;
    g.fillRect(r.x, r.y, r.w, r.h);

    g.strokeStyle = DIVIDER;
    g.lineWidth = 1;
    g.strokeRect(r.x + 0.5, r.y + 0.5, r.w - 1, r.h - 1);

    // Name card
    const pad = Math.max(8, Math.min(r.w, r.h) * 0.035);
    const cardH = Math.max(24, Math.min(r.h * 0.09, 34));
    const cardW = Math.min(r.w - pad * 2, 240);

    g.save();
    g.shadowColor = CARD_SHADOW;
    g.shadowBlur = 12;
    g.shadowOffsetY = 3;
    g.fillStyle = CARD;
    roundRect(r.x + pad, r.y + pad, cardW, cardH, cardH / 2);
    g.fill();
    g.restore();

    const dotR = cardH * 0.22;
    g.fillStyle = color;
    g.beginPath();
    g.arc(r.x + pad + cardH * 0.55, r.y + pad + cardH / 2, dotR, 0, TAU);
    g.fill();

    g.fillStyle = INK;
    g.font = `700 ${Math.max(11, cardH * 0.42)}px Fredoka, system-ui, sans-serif`;
    g.textAlign = "left";
    g.textBaseline = "middle";
    g.fillText(name, r.x + pad + cardH, r.y + pad + cardH / 2 + 1);

    // Clock region
    const top = r.y + pad + cardH + pad;
    const bot = r.y + r.h - pad * 2 - Math.max(18, r.h * 0.06);
    const clockH = bot - top;
    const clockW = r.w - pad * 2;
    const R = Math.max(20, Math.min(clockW, clockH) * 0.44);
    const cx = r.x + r.w / 2;
    const cy = (top + bot) / 2;

    let displayTime;
    if (state === "countdown") displayTime = 0;
    else if (p.stopped) displayTime = p.stopTime;
    else displayTime = roundClock;

    // Suppress digits only while the iris is genuinely shut during play.
    const hidden = (state === "running" && aperture < 0.08);

    drawClockFace(cx, cy, R, displayTime, hidden, color);
    drawAperture(cx, cy, R, aperture);

    // Status strip
    const statusY = r.y + r.h - pad - Math.max(9, r.h * 0.03);
    g.textAlign = "center";
    g.textBaseline = "middle";

    if (state === "countdown") {
      g.fillStyle = MUTED;
      g.font = `600 ${Math.max(11, r.h * 0.028)}px Fredoka, system-ui, sans-serif`;
      g.fillText("Get ready…", cx, statusY);
    } else if (state === "running") {
      if (p.stopped) {
        g.fillStyle = GREEN;
        g.font = `700 ${Math.max(12, r.h * 0.032)}px Fredoka, system-ui, sans-serif`;
        g.fillText("STOPPED", cx, statusY);
      } else {
        g.fillStyle = MUTED;
        g.font = `600 ${Math.max(11, r.h * 0.028)}px Fredoka, system-ui, sans-serif`;
        g.fillText("Tap when it's 10.00", cx, statusY);
      }
    } else if (state === "reveal") {
      // Frozen time is on the clock face; the strip shows the score.
      const isWinner = winnerSlots.includes(p.slot);
      g.fillStyle = isWinner ? GOLD : PILL_TEXT;
      g.font = `800 ${Math.max(13, r.h * 0.038)}px Fredoka, system-ui, sans-serif`;
      g.fillText(`Score ${p.score}`, cx, statusY);
    }
  }

  /* -------------- Leaderboard (full-screen table) --------------- */
  function drawLeaderboard() {
    const W = canvas.width, H = canvas.height;
    g.fillStyle = BG;
    g.fillRect(0, 0, W, H);

    const isFinal = currentRound >= TOTAL_ROUNDS;
    const active = [...players.values()].filter((p) => p.connected);

    // Sort by round score descending; ties by total, then name.
    const rows = [...active].sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      if (b.total !== a.total) return b.total - a.total;
      const an = (ctx.player(a.slot)?.name || "");
      const bn = (ctx.player(b.slot)?.name || "");
      return an.localeCompare(bn);
    });

    // Title
    g.textAlign = "center";
    g.textBaseline = "middle";
    g.fillStyle = INK_LIGHT;
    g.font = "800 34px Fredoka, system-ui, sans-serif";
    g.fillText(isFinal ? "Final Results" : `Round ${currentRound} Results`, W / 2, HEADER_H + 34);

    // Ready counter / prompt
    const readyCount = active.filter((p) => p.ready).length;
    g.fillStyle = MUTED;
    g.font = "600 14px Fredoka, system-ui, sans-serif";
    g.fillText(
      isFinal
        ? `Tap PLAY AGAIN to start a fresh match · ${readyCount} / ${active.length} ready`
        : `Tap START for the next round · ${readyCount} / ${active.length} ready`,
      W / 2, HEADER_H + 62
    );

    // Table geometry
    const tableX = 140;
    const tableW = W - tableX * 2;
    const rowH = Math.min(46, (H - HEADER_H - 190) / Math.max(1, rows.length));
    const headerY = HEADER_H + 100;
    const firstRowY = headerY + 26;

    const colRank  = tableX + 20;
    const colName  = tableX + 80;
    const colTime  = tableX + tableW * 0.54;
    const colScore = tableX + tableW * 0.72;
    const colTotal = tableX + tableW * 0.90;

    // Header row
    g.textBaseline = "middle";
    g.font = "700 12px Fredoka, system-ui, sans-serif";
    g.fillStyle = FAINT;
    g.textAlign = "left";
    g.fillText("RANK", colRank, headerY);
    g.fillText("PLAYER", colName, headerY);
    g.textAlign = "right";
    g.fillText("TIME", colTime, headerY);
    g.fillText("ROUND", colScore, headerY);
    g.fillText("TOTAL", colTotal, headerY);

    // Divider under the header
    g.strokeStyle = DIVIDER;
    g.lineWidth = 1;
    g.beginPath();
    g.moveTo(tableX, headerY + 16);
    g.lineTo(tableX + tableW, headerY + 16);
    g.stroke();

    // Rows
    rows.forEach((p, i) => {
      const info = ctx.player(p.slot);
      const name = (info && info.name) || `P${p.slot + 1}`;
      const color = (info && info.color) || BLUE;
      const y = firstRowY + i * rowH + rowH / 2;
      const isWinner = winnerSlots.includes(p.slot);

      // Rank with ties sharing the top rank of their group.
      let rank = i + 1;
      for (let j = i - 1; j >= 0; j--) {
        if (rows[j].score === p.score) rank = j + 1;
        else break;
      }

      // Row separator (skip the first row's top border)
      if (i > 0) {
        g.strokeStyle = DIVIDER;
        g.lineWidth = 1;
        g.beginPath();
        g.moveTo(tableX, y - rowH / 2 + 0.5);
        g.lineTo(tableX + tableW, y - rowH / 2 + 0.5);
        g.stroke();
      }

      // Rank
      g.textAlign = "left";
      g.textBaseline = "middle";
      g.font = "800 18px Fredoka, system-ui, sans-serif";
      g.fillStyle = isWinner ? GOLD : MUTED;
      g.fillText(String(rank), colRank, y);

      // Colour dot
      g.fillStyle = color;
      g.beginPath();
      g.arc(colName - 14, y, 6, 0, TAU);
      g.fill();

      // Name
      g.fillStyle = INK_LIGHT;
      g.font = "700 18px Fredoka, system-ui, sans-serif";
      g.textAlign = "left";
      g.fillText(name, colName, y);

      // Time
      g.fillStyle = INK_LIGHT;
      g.font = "600 18px 'SF Mono', Menlo, Consolas, monospace";
      g.textAlign = "right";
      g.fillText(formatClock(p.stopTime), colTime, y);

      // Round score
      g.fillStyle = isWinner ? GOLD : PILL_TEXT;
      g.font = "800 20px Fredoka, system-ui, sans-serif";
      g.fillText(String(p.score), colScore, y);

      // Match total
      g.fillStyle = MUTED;
      g.font = "700 16px Fredoka, system-ui, sans-serif";
      g.fillText(String(p.total), colTotal, y);

      // Ready tick
      if (p.ready) {
        g.fillStyle = GREEN;
        g.font = "800 18px Fredoka, system-ui, sans-serif";
        g.textAlign = "left";
        g.fillText("✓", colTotal + 44, y);
      }
    });

    // Footer
    g.textAlign = "center";
    g.textBaseline = "middle";
    g.fillStyle = FAINT;
    g.font = "500 13px Fredoka, system-ui, sans-serif";
    g.fillText("Host: press Exit to leave the game", W / 2, H - 20);
  }

  /* -------------- Total scores (full-screen table) -------------- */
  function drawTotals() {
    const W = canvas.width, H = canvas.height;
    g.fillStyle = BG;
    g.fillRect(0, 0, W, H);

    const active = [...players.values()].filter((p) => p.connected);

    // Sort by match total descending; ties by name.
    const rows = [...active].sort((a, b) => {
      if (b.total !== a.total) return b.total - a.total;
      const an = (ctx.player(a.slot)?.name || "");
      const bn = (ctx.player(b.slot)?.name || "");
      return an.localeCompare(bn);
    });

    const bestTotal = rows.length ? rows[0].total : 0;

    // Title
    g.textAlign = "center";
    g.textBaseline = "middle";
    g.fillStyle = INK_LIGHT;
    g.font = "800 34px Fredoka, system-ui, sans-serif";
    g.fillText("Total Scores", W / 2, HEADER_H + 34);

    // Ready counter / prompt
    const readyCount = active.filter((p) => p.ready).length;
    g.fillStyle = MUTED;
    g.font = "600 14px Fredoka, system-ui, sans-serif";
    g.fillText(
      `Tap PLAY AGAIN to start a fresh match · ${readyCount} / ${active.length} ready`,
      W / 2, HEADER_H + 62
    );

    // Table geometry
    const tableX = 100;
    const tableW = W - tableX * 2;
    const rowH = Math.min(52, (H - HEADER_H - 190) / Math.max(1, rows.length));
    const headerY = HEADER_H + 100;
    const firstRowY = headerY + 26;

    const colRank  = tableX + 20;
    const colName  = tableX + 80;
    const colR1    = tableX + tableW * 0.50;
    const colR2    = tableX + tableW * 0.62;
    const colR3    = tableX + tableW * 0.74;
    const colTotal = tableX + tableW * 0.88;

    // Header row
    g.textBaseline = "middle";
    g.font = "700 12px Fredoka, system-ui, sans-serif";
    g.fillStyle = FAINT;
    g.textAlign = "left";
    g.fillText("RANK", colRank, headerY);
    g.fillText("PLAYER", colName, headerY);
    g.textAlign = "right";
    g.fillText("ROUND 1", colR1, headerY);
    g.fillText("ROUND 2", colR2, headerY);
    g.fillText("ROUND 3", colR3, headerY);
    g.fillText("TOTAL", colTotal, headerY);

    // Divider under the header
    g.strokeStyle = DIVIDER;
    g.lineWidth = 1;
    g.beginPath();
    g.moveTo(tableX, headerY + 16);
    g.lineTo(tableX + tableW, headerY + 16);
    g.stroke();

    const roundCols = [colR1, colR2, colR3];

    // Rows
    rows.forEach((p, i) => {
      const info = ctx.player(p.slot);
      const name = (info && info.name) || `P${p.slot + 1}`;
      const color = (info && info.color) || BLUE;
      const y = firstRowY + i * rowH + rowH / 2;
      const isWinner = bestTotal > 0 && p.total === bestTotal;

      // Rank with ties sharing the top rank of their group.
      let rank = i + 1;
      for (let j = i - 1; j >= 0; j--) {
        if (rows[j].total === p.total) rank = j + 1;
        else break;
      }

      // Winner row highlight
      if (isWinner) {
        g.fillStyle = "rgba(255,180,0,0.12)";
        roundRect(tableX, y - rowH / 2 + 2, tableW, rowH - 4, 8);
        g.fill();
      }

      // Row separator (skip the first row's top border)
      if (i > 0) {
        g.strokeStyle = DIVIDER;
        g.lineWidth = 1;
        g.beginPath();
        g.moveTo(tableX, y - rowH / 2 + 0.5);
        g.lineTo(tableX + tableW, y - rowH / 2 + 0.5);
        g.stroke();
      }

      // Rank
      g.textAlign = "left";
      g.textBaseline = "middle";
      g.font = "800 18px Fredoka, system-ui, sans-serif";
      g.fillStyle = isWinner ? GOLD : MUTED;
      g.fillText(String(rank), colRank, y);

      // Colour dot
      g.fillStyle = color;
      g.beginPath();
      g.arc(colName - 14, y, 6, 0, TAU);
      g.fill();

      // Name
      g.fillStyle = INK_LIGHT;
      g.font = "700 18px Fredoka, system-ui, sans-serif";
      g.textAlign = "left";
      g.fillText(name, colName, y);

      // Per-round scores
      g.textAlign = "right";
      g.font = "600 16px 'SF Mono', Menlo, Consolas, monospace";
      for (let r = 0; r < TOTAL_ROUNDS; r++) {
        const v = p.roundScores[r];
        g.fillStyle = (v == null) ? FAINT : MUTED;
        g.fillText(v == null ? "—" : String(v), roundCols[r], y);
      }

      // Match total
      g.fillStyle = isWinner ? GOLD : INK_LIGHT;
      g.font = "800 22px Fredoka, system-ui, sans-serif";
      g.fillText(String(p.total), colTotal, y);

      // Ready tick
      if (p.ready) {
        g.fillStyle = GREEN;
        g.font = "800 18px Fredoka, system-ui, sans-serif";
        g.textAlign = "left";
        g.fillText("✓", colTotal + 40, y);
      }
    });

    // Footer
    g.textAlign = "center";
    g.textBaseline = "middle";
    g.fillStyle = FAINT;
    g.font = "500 13px Fredoka, system-ui, sans-serif";
    g.fillText("Host: press Exit to leave the game", W / 2, H - 20);
  }

  function drawHeader() {
    g.fillStyle = BG_HEADER;
    g.fillRect(0, 0, canvas.width, HEADER_H);
    g.strokeStyle = DIVIDER;
    g.lineWidth = 1;
    g.beginPath();
    g.moveTo(0, HEADER_H + 0.5);
    g.lineTo(canvas.width, HEADER_H + 0.5);
    g.stroke();

    g.fillStyle = INK_LIGHT;
    g.font = "800 16px Fredoka, system-ui, sans-serif";
    g.textAlign = "left";
    g.textBaseline = "middle";
    g.fillText("STOP CLOCK", 20, HEADER_H / 2 + 1);

    const roundText = state === "totals"
      ? "Match complete"
      : `Round ${Math.max(1, currentRound)} / ${TOTAL_ROUNDS}`;
    g.font = "700 13px Fredoka, system-ui, sans-serif";
    const tw = g.measureText(roundText).width;
    const pillW = tw + 24;
    const pillX = canvas.width / 2 - pillW / 2;
    const pillY = HEADER_H / 2 - 12;

    g.fillStyle = PILL_BG;
    roundRect(pillX, pillY, pillW, 24, 12);
    g.fill();

    g.fillStyle = PILL_TEXT;
    g.textAlign = "center";
    g.fillText(roundText, canvas.width / 2, HEADER_H / 2 + 1);

    g.fillStyle = FAINT;
    g.font = "600 13px Fredoka, system-ui, sans-serif";
    g.textAlign = "right";
    g.fillText("Target 10.00 · Perfect = 500", canvas.width - 20, HEADER_H / 2 + 1);
  }

  function drawCountdown() {
    const W = canvas.width, H = canvas.height;
    g.fillStyle = "rgba(30,34,70,0.94)";
    g.fillRect(0, HEADER_H, W, H - HEADER_H);

    g.textAlign = "center";
    g.textBaseline = "middle";

    const t = stateTimer;
    const txt = t > 2.5 ? "3" : t > 1.5 ? "2" : t > 0.5 ? "1" : "GO!";

    g.fillStyle = BLUE;
    g.font = "900 150px Fredoka, system-ui, sans-serif";
    g.fillText(txt, W / 2, H / 2 - 20);

    g.fillStyle = INK_LIGHT;
    g.font = "700 22px Fredoka, system-ui, sans-serif";
    g.fillText("Tap STOP when you think 10.00 s have passed", W / 2, H / 2 + 100);

    g.fillStyle = MUTED;
    g.font = "500 16px Fredoka, system-ui, sans-serif";
    g.fillText("The iris closes after one second. Count in your head.", W / 2, H / 2 + 132);
  }

  function draw() {
    g.fillStyle = BG;
    g.fillRect(0, 0, canvas.width, canvas.height);

    if (state === "leaderboard") {
      drawLeaderboard();
    } else if (state === "totals") {
      drawTotals();
    } else {
      for (const p of players.values()) {
        if (p.rect) drawQuadrant(p);
      }
      if (state === "countdown") drawCountdown();
    }

    drawHeader();
  }

  /* ------------------------- main loop --------------------------- */
  function frame(now) {
    if (exiting) return;
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    update(dt);
    draw();
    raf = requestAnimationFrame(frame);
  }
  raf = requestAnimationFrame(frame);

  return {
    destroy() {
      exiting = true;
      cancelAnimationFrame(raf);
      raf = 0;
    },
  };
}