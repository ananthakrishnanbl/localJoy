// Stop Clock — hidden stopwatch, one button, target 10.00 s.
//
// Flow: countdown → running → reveal (3 s of frozen clocks) →
//       leaderboard (all players tap START / PLAY AGAIN).
//
// Round score = 500 - |t*100 - 1000|, in [0, 500]. Highest total over
// three rounds wins. Plays 1-10 players.
//
// Rendering notes
//   * The loop ticks every animation frame (cheap), but the canvas is only
//     repainted when something visible changed (`dirty`), plus a slow
//     heartbeat so name / colour changes still show up.
//   * The expensive static art (cells, name cards, clock faces and their
//     drop shadows) is painted once into an off-screen layer and blitted.
//     Only digits, iris and status text are drawn live.
//   * Tap timestamps are taken inside the input handler, never in the
//     render loop, so drawing cost can never change a player's time.

const TAU = Math.PI * 2;
const W = 1280;
const H = 720;
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
const HIDE_BELOW      = 0.08;   // iris opening below which the digits are hidden
const HEARTBEAT_MS    = 250;    // longest gap between repaints

// -------- Palette matched to the localJoy site --------
const BG          = "#1e2246";
const BG_CELL     = "#232850";
const BG_HEADER   = "#1a1e3d";
const CARD        = "#ffffff";
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

// -------- Fonts (built once instead of every frame) --------
const UI   = "Fredoka, system-ui, sans-serif";
const MONO = '"SF Mono", Menlo, Consolas, monospace';
const F = {
  brand:     `800 16px ${UI}`,
  pill:      `700 13px ${UI}`,
  rule:      `600 13px ${UI}`,
  countBig:  `900 150px ${UI}`,
  countHint: `700 22px ${UI}`,
  countSub:  `500 16px ${UI}`,
  title:     `800 34px ${UI}`,
  hint:      `600 14px ${UI}`,
  colHead:   `700 12px ${UI}`,
  rank:      `800 18px ${UI}`,
  name:      `700 18px ${UI}`,
  footer:    `500 13px ${UI}`,
  tick:      `800 18px ${UI}`,
  lbTime:    `600 18px ${MONO}`,
  lbRound:   `800 20px ${UI}`,
  lbTotal:   `700 16px ${UI}`,
  totRound:  `600 16px ${MONO}`,
  totTotal:  `800 22px ${UI}`,
};

/* ----------------------- pure helpers (no state) ----------------------- */
const easeInOut = (t) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);
const clamp01 = (t) => (t < 0 ? 0 : t > 1 ? 1 : t);

// Round score: 500 for a perfect 10.00, minus 1 per hundredth of error.
const scoreFor = (t) => Math.max(0, 500 - Math.round(Math.abs(t * 100 - TARGET * 100)));

function formatClock(t) {
  const v = Math.max(0, t);
  const s = Math.floor(v);
  const c = Math.floor((v - s) * 100);
  return `${String(s).padStart(2, "0")}.${String(c).padStart(2, "0")}`;
}

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

// Geometry of one player's cell. Depends only on the cell rectangle, so it
// is computed once per layout instead of every frame.
function quadGeo(r) {
  const pad = Math.max(8, Math.min(r.w, r.h) * 0.035);
  const cardH = Math.max(24, Math.min(r.h * 0.09, 34));
  const cardW = Math.min(r.w - pad * 2, 240);
  const top = r.y + pad + cardH + pad;
  const bot = r.y + r.h - pad * 2 - Math.max(18, r.h * 0.06);
  const clockW = r.w - pad * 2;
  const R = Math.max(20, Math.min(clockW, bot - top) * 0.44);
  return {
    pad, cardH, cardW, R,
    cx: r.x + r.w / 2,
    cy: (top + bot) / 2,
    statusY: r.y + r.h - pad - Math.max(9, r.h * 0.03),
    fontWait:    `600 ${Math.max(11, r.h * 0.028)}px ${UI}`,
    fontStopped: `700 ${Math.max(12, r.h * 0.032)}px ${UI}`,
    fontScore:   `800 ${Math.max(13, r.h * 0.038)}px ${UI}`,
    fontCard:    `700 ${Math.max(11, cardH * 0.42)}px ${UI}`,
    fontDigits:  `800 ${Math.max(18, R * 0.52)}px ${MONO}`,
  };
}

function pillPath(c, x, y, w, h, r) {
  if (w < 2 * r) r = w / 2;
  if (h < 2 * r) r = h / 2;
  c.beginPath();
  c.moveTo(x + r, y);
  c.arcTo(x + w, y, x + w, y + h, r);
  c.arcTo(x + w, y + h, x, y + h, r);
  c.arcTo(x, y + h, x, y, r);
  c.arcTo(x, y, x + w, y, r);
  c.closePath();
}

export function start(ctx) {
  const { root, signal } = ctx;
  const on = (t, type, fn) => t.addEventListener(type, fn, { signal });

  /* --------------------------- display --------------------------- */
  // Remember what we override on #gameRoot so destroy() can put it back
  // (the page is not reloaded between games, so leftovers would leak).
  const ROOT_STYLE = {
    background: BG, position: "relative", overflow: "hidden",
    border: "0", padding: "0", margin: "0",
  };
  const savedRootStyle = Object.keys(ROOT_STYLE).map((k) =>
    [k, root.style.getPropertyValue(k), root.style.getPropertyPriority(k)]);
  for (const [k, v] of Object.entries(ROOT_STYLE)) root.style.setProperty(k, v, "important");

  const wrapEl = document.createElement("div");
  Object.assign(wrapEl.style, {
    position: "absolute", inset: "0",
    display: "flex", alignItems: "center", justifyContent: "center",
    background: BG, border: "0", padding: "0", margin: "0",
    overflow: "hidden",
  });

  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  Object.assign(canvas.style, {
    display: "block", maxWidth: "100%", maxHeight: "100%",
    aspectRatio: "16 / 9", background: BG,
    border: "0", padding: "0", margin: "0",
  });

  wrapEl.append(canvas);
  root.replaceChildren(wrapEl);
  // Opaque contexts: everything is painted over a solid background anyway,
  // and the browser can skip alpha blending when compositing.
  const g = canvas.getContext("2d", { alpha: false });
  g.lineCap = "round";   // the original look: every line on the main canvas has round ends

  // Off-screen layer holding the static art of the quadrant scene.
  const layer = document.createElement("canvas");
  layer.width = W;
  layer.height = H;
  const lg = layer.getContext("2d", { alpha: false });
  let layerKey = "";

  /* ---------------------- kill switch / handles ------------------ */
  let exiting = false;
  let raf = 0;
  let last = performance.now();
  let lastDraw = 0;
  let dirty = true;            // something changed → repaint next frame
  let shownLabel = "";         // last countdown label that was painted

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

  const invalidate = () => { dirty = true; };

  const connectedPlayers = () => {
    const out = [];
    for (const p of players.values()) if (p.connected) out.push(p);
    return out;
  };

  const countdownLabel = () =>
    stateTimer > 2.5 ? "3" : stateTimer > 1.5 ? "2" : stateTimer > 0.5 ? "1" : "GO!";

  // The phone button state that matches the current game state. Used to
  // bring a late joiner / returning player in sync.
  const phoneStateFor = (p) => {
    switch (state) {
      case "running":     return p.stopped ? "stopped" : "armed";
      case "reveal":      return "stopped";
      case "leaderboard":
      case "totals":      return currentRound >= TOTAL_ROUNDS ? "replay" : "start";
      default:            return "idle";
    }
  };

  /* ------------------------ player management -------------------- */
  function addPlayer(slot) {
    const existing = players.get(slot);
    if (existing) { existing.connected = true; return; }
    const info = ctx.player(slot);
    if (!info) return;
    players.set(slot, {
      slot, connected: true, rect: null, geo: null,
      stopped: false, stopTime: 0, score: 0, total: 0,
      ready: false,
      roundScores: [],
      lastSid: null, lastCount: 0,
      name: "", color: BLUE,
    });
  }

  ctx.players().forEach((p) => addPlayer(p.slot));

  on(window, "player-join", (e) => {
    if (exiting) return;
    const slot = e.detail.slot;
    addPlayer(slot);
    const p = players.get(slot);
    // Put the phone's button in the right state (it only ever got "armed"
    // mid-round before, so a joiner during the leaderboard could not tap
    // START and the whole table waited on them).
    if (p && p.connected) ctx.send(slot, { type: "stopper-state", state: phoneStateFor(p) });
    if (state === "countdown") layoutRound();
    invalidate();
  });

  on(window, "player-leave", (e) => {
    const p = players.get(e.detail.slot);
    if (!p) return;
    p.connected = false;
    p.ready = false;
    if (state === "countdown") layoutRound();
    if (state === "running") checkAllStopped();
    if (state === "leaderboard" || state === "totals") checkAllReady();
    invalidate();
  });

  on(window, "controller-input", (e) => {
    if (exiting) return;
    const { slot, data } = e.detail;
    const p = players.get(slot);
    if (!p || !data || data.type !== "stop") return;

    // Per-phone de-duplication: the first message of a new session only
    // syncs the counter; afterwards only a higher count is a real tap.
    const count = data.count | 0;
    if (data.sid !== p.lastSid) {
      p.lastSid = data.sid;
      p.lastCount = count;
      return;
    }
    if (count <= p.lastCount) return;
    p.lastCount = count;

    if (state === "running" && !p.stopped) {
      // Timestamp taken here, in the handler, not in the render loop.
      p.stopped = true;
      p.stopTime = Math.max(0, (performance.now() - roundStart) / 1000);
      p.score = scoreFor(p.stopTime);
      ctx.send(slot, { type: "vibrate", ms: 30 });
      ctx.send(slot, { type: "stopper-state", state: "stopped" });
      invalidate();
      checkAllStopped();
    } else if ((state === "leaderboard" || state === "totals") && !p.ready) {
      p.ready = true;
      ctx.send(slot, { type: "vibrate", ms: 20 });
      invalidate();
      checkAllReady();
    }
  });

  /* --------------------------- layout ---------------------------- */
  function layoutRound() {
    const connected = connectedPlayers();
    const n = Math.max(1, connected.length);
    const [cols, rows] = getGridFor(n);
    const cellW = W / cols;
    const cellH = (H - HEADER_H) / rows;

    for (const p of players.values()) { p.rect = null; p.geo = null; }

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
      p.geo = quadGeo(p.rect);
    });
    invalidate();
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
    shownLabel = "";
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
    invalidate();
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
    invalidate();
  }

  // Everyone stopped → reveal the clocks for a few seconds. Buttons
  // stay on "stopped" so nobody can advance the game early.
  function checkAllStopped() {
    if (state !== "running") return;
    const active = connectedPlayers();
    if (active.length === 0) return;
    if (!active.every((p) => p.stopped)) return;

    // Round winner = highest round score.
    let best = -Infinity;
    winnerSlots = [];
    for (const p of active) {
      if (p.score > best) { best = p.score; winnerSlots = [p.slot]; }
      else if (p.score === best) winnerSlots.push(p.slot);
    }
    // Fold round score into match total. History is stored by round
    // number, so a late joiner's first score lands under the right column.
    for (const p of active) {
      p.total += p.score;
      p.roundScores[currentRound - 1] = p.score;
    }

    aperture = 0;
    state = "reveal";
    stateTimer = REVEAL_DURATION;
    ctx.broadcast({ type: "vibrate", ms: [40, 30, 40] });
    invalidate();
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
    invalidate();
  }

  function checkAllReady() {
    if (state !== "leaderboard" && state !== "totals") return;
    const active = connectedPlayers();
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
  function update(dt) {
    if (state === "countdown") {
      stateTimer -= dt;
      if (stateTimer <= 0) { beginRunning(); return; }
      const label = countdownLabel();
      if (label !== shownLabel) { shownLabel = label; dirty = true; }
      return;
    }

    if (state === "running") {
      roundClock = (performance.now() - roundStart) / 1000;

      let ap;
      if (roundClock < CLOSE_START) {
        ap = 1;
      } else if (roundClock < CLOSE_START + CLOSE_DURATION) {
        ap = 1 - easeInOut((roundClock - CLOSE_START) / CLOSE_DURATION);
      } else {
        ap = 0;
      }
      // Digits tick every frame while visible and the iris moves while it
      // closes. Once it is fully shut nothing changes until someone taps.
      if (ap !== aperture || ap >= HIDE_BELOW) dirty = true;
      aperture = ap;

      if (roundClock >= MAX_TIME) {
        for (const p of players.values()) {
          if (p.connected && !p.stopped) {
            p.stopped = true;
            p.stopTime = MAX_TIME;
            p.score = scoreFor(MAX_TIME);
            ctx.send(p.slot, { type: "stopper-state", state: "stopped" });
          }
        }
        dirty = true;
        checkAllStopped();
      }
      return;
    }

    if (state === "reveal") {
      stateTimer -= dt;
      // Open the irises during the first REVEAL_ANIM seconds, then hold
      // so the frozen times are readable for the rest of the reveal.
      const ap = easeInOut(clamp01((REVEAL_DURATION - stateTimer) / REVEAL_ANIM));
      if (ap !== aperture) { aperture = ap; dirty = true; }
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
          invalidate();
        }
      }
    }
    // totals: waiting for taps.
  }

  /* ---------------------------- draw ----------------------------- */
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

    g.strokeStyle = FLAP_SEAM;
    g.lineWidth = 1;
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

  /* ---- static art of one cell: painted once into the off-screen layer ---- */
  function paintCellStatic(c, p) {
    const r = p.rect, q = p.geo;

    c.fillStyle = BG_CELL;
    c.fillRect(r.x, r.y, r.w, r.h);
    c.strokeStyle = DIVIDER;
    c.lineWidth = 1;
    c.strokeRect(r.x + 0.5, r.y + 0.5, r.w - 1, r.h - 1);

    // Name card
    c.save();
    c.shadowColor = CARD_SHADOW;
    c.shadowBlur = 12;
    c.shadowOffsetY = 3;
    c.fillStyle = CARD;
    pillPath(c, r.x + q.pad, r.y + q.pad, q.cardW, q.cardH, q.cardH / 2);
    c.fill();
    c.restore();

    c.fillStyle = p.color;
    c.beginPath();
    c.arc(r.x + q.pad + q.cardH * 0.55, r.y + q.pad + q.cardH / 2, q.cardH * 0.22, 0, TAU);
    c.fill();

    c.fillStyle = INK;
    c.font = q.fontCard;
    c.textAlign = "left";
    c.textBaseline = "middle";
    c.fillText(p.name, r.x + q.pad + q.cardH, r.y + q.pad + q.cardH / 2 + 1);

    // Clock face (without digits)
    const { cx, cy, R } = q;
    c.save();
    c.shadowColor = CARD_SHADOW;
    c.shadowBlur = 16;
    c.shadowOffsetY = 5;
    c.beginPath();
    c.arc(cx, cy, R * 1.02, 0, TAU);
    c.fillStyle = CARD;
    c.fill();
    c.restore();

    c.beginPath();
    c.arc(cx, cy, R * 1.02, 0, TAU);
    c.strokeStyle = "rgba(255,255,255,0.6)";
    c.lineWidth = 1.5;
    c.stroke();

    // 12 hour ticks, stroked one by one (cached, so cost is irrelevant)
    c.strokeStyle = "rgba(26,31,61,0.22)";
    c.lineWidth = 2;
    c.lineCap = "round";
    for (let i = 0; i < 12; i++) {
      const a = i * (TAU / 12) - Math.PI / 2;
      c.beginPath();
      c.moveTo(cx + R * 0.86 * Math.cos(a), cy + R * 0.86 * Math.sin(a));
      c.lineTo(cx + R * 0.92 * Math.cos(a), cy + R * 0.92 * Math.sin(a));
      c.stroke();
    }
  }

  // Rebuild the layer only when a cell moved or a name / colour changed.
  function syncLayer() {
    let key = "";
    for (const p of players.values()) {
      if (!p.rect) continue;
      const r = p.rect;
      key += `${p.slot}|${r.x}|${r.y}|${r.w}|${r.h}|${p.color}|${p.name};`;
    }
    if (key === layerKey) return;
    layerKey = key;
    lg.fillStyle = BG;
    lg.fillRect(0, 0, W, H);
    for (const p of players.values()) if (p.rect) paintCellStatic(lg, p);
  }

  /* ---- live art of one cell: digits, iris, status strip ---- */
  function paintCellLive(p) {
    const q = p.geo;

    let displayTime;
    if (state === "countdown") displayTime = 0;
    else if (p.stopped) displayTime = p.stopTime;
    else displayTime = roundClock;

    // Suppress digits only while the iris is genuinely shut during play.
    const hidden = state === "running" && aperture < HIDE_BELOW;
    if (!hidden) {
      g.font = q.fontDigits;
      g.textAlign = "center";
      g.textBaseline = "middle";
      g.fillStyle = p.color;
      g.fillText(formatClock(displayTime), q.cx, q.cy + q.R * 0.02);
    }

    drawAperture(q.cx, q.cy, q.R, aperture);

    // Status strip
    g.textAlign = "center";
    g.textBaseline = "middle";
    if (state === "countdown") {
      g.fillStyle = MUTED;
      g.font = q.fontWait;
      g.fillText("Get ready…", q.cx, q.statusY);
    } else if (state === "running") {
      if (p.stopped) {
        g.fillStyle = GREEN;
        g.font = q.fontStopped;
        g.fillText("STOPPED", q.cx, q.statusY);
      } else {
        g.fillStyle = MUTED;
        g.font = q.fontWait;
        g.fillText("Tap when it's 10.00", q.cx, q.statusY);
      }
    } else if (state === "reveal") {
      // Frozen time is on the clock face; the strip shows the score.
      g.fillStyle = winnerSlots.includes(p.slot) ? GOLD : PILL_TEXT;
      g.font = q.fontScore;
      g.fillText(`Score ${p.score}`, q.cx, q.statusY);
    }
  }

  /* -------- Shared table renderer (leaderboard + totals) -------- */
  // cfg.heads  : [[label, xFraction], ...] right-aligned column headers
  // cfg.cells  : (p, y, xs, win) => void   draws the right-aligned columns
  function drawTable(cfg) {
    const { title, hint, tableX, maxRowH, heads, rows, tieKey, isWinner, tickDx, cells } = cfg;
    const tableW = W - tableX * 2;
    const rowH = Math.min(maxRowH, (H - HEADER_H - 190) / Math.max(1, rows.length));
    const headerY = HEADER_H + 100;
    const firstRowY = headerY + 26;
    const colRank = tableX + 20;
    const colName = tableX + 80;
    const xs = heads.map((h) => tableX + tableW * h[1]);
    const tickX = xs[xs.length - 1] + tickDx;

    g.textAlign = "center";
    g.textBaseline = "middle";
    g.fillStyle = INK_LIGHT;
    g.font = F.title;
    g.fillText(title, W / 2, HEADER_H + 34);
    g.fillStyle = MUTED;
    g.font = F.hint;
    g.fillText(hint, W / 2, HEADER_H + 62);

    // Header row
    g.font = F.colHead;
    g.fillStyle = FAINT;
    g.textAlign = "left";
    g.fillText("RANK", colRank, headerY);
    g.fillText("PLAYER", colName, headerY);
    g.textAlign = "right";
    heads.forEach((h, i) => g.fillText(h[0], xs[i], headerY));

    // Divider under the header
    g.strokeStyle = DIVIDER;
    g.lineWidth = 1;
    g.beginPath();
    g.moveTo(tableX, headerY + 16);
    g.lineTo(tableX + tableW, headerY + 16);
    g.stroke();

    // Rows. Ties share the top rank of their group.
    let rank = 1;
    rows.forEach((p, i) => {
      if (i === 0 || p[tieKey] !== rows[i - 1][tieKey]) rank = i + 1;
      const y = firstRowY + i * rowH + rowH / 2;
      const win = isWinner(p);

      if (win && cfg.highlight) {
        g.fillStyle = "rgba(255,180,0,0.12)";
        pillPath(g, tableX, y - rowH / 2 + 2, tableW, rowH - 4, 8);
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

      g.textAlign = "left";
      g.textBaseline = "middle";
      g.font = F.rank;
      g.fillStyle = win ? GOLD : MUTED;
      g.fillText(String(rank), colRank, y);

      g.fillStyle = p.color;
      g.beginPath();
      g.arc(colName - 14, y, 6, 0, TAU);
      g.fill();

      g.fillStyle = INK_LIGHT;
      g.font = F.name;
      g.fillText(p.name, colName, y);

      g.textAlign = "right";
      cells(p, y, xs, win);

      if (p.ready) {
        g.fillStyle = GREEN;
        g.font = F.tick;
        g.textAlign = "left";
        g.fillText("✓", tickX, y);
      }
    });

    g.textAlign = "center";
    g.textBaseline = "middle";
    g.fillStyle = FAINT;
    g.font = F.footer;
    g.fillText("Host: press Exit to leave the game", W / 2, H - 20);
  }

  const byName = (a, b) => a.name.localeCompare(b.name);

  function drawLeaderboard() {
    const isFinal = currentRound >= TOTAL_ROUNDS;
    const active = connectedPlayers();
    // Sort by round score descending; ties by total, then name.
    const rows = active.sort((a, b) =>
      (b.score - a.score) || (b.total - a.total) || byName(a, b));
    const readyCount = active.filter((p) => p.ready).length;

    drawTable({
      title: isFinal ? "Final Results" : `Round ${currentRound} Results`,
      hint: isFinal
        ? `Tap PLAY AGAIN to start a fresh match · ${readyCount} / ${active.length} ready`
        : `Tap START for the next round · ${readyCount} / ${active.length} ready`,
      tableX: 140, maxRowH: 46,
      heads: [["TIME", 0.54], ["ROUND", 0.72], ["TOTAL", 0.90]],
      rows, tieKey: "score",
      isWinner: (p) => winnerSlots.includes(p.slot),
      highlight: false, tickDx: 44,
      cells(p, y, xs, win) {
        g.fillStyle = INK_LIGHT;
        g.font = F.lbTime;
        g.fillText(formatClock(p.stopTime), xs[0], y);

        g.fillStyle = win ? GOLD : PILL_TEXT;
        g.font = F.lbRound;
        g.fillText(String(p.score), xs[1], y);

        g.fillStyle = MUTED;
        g.font = F.lbTotal;
        g.fillText(String(p.total), xs[2], y);
      },
    });
  }

  function drawTotals() {
    const active = connectedPlayers();
    // Sort by match total descending; ties by name.
    const rows = active.sort((a, b) => (b.total - a.total) || byName(a, b));
    const bestTotal = rows.length ? rows[0].total : 0;
    const readyCount = active.filter((p) => p.ready).length;

    drawTable({
      title: "Total Scores",
      hint: `Tap PLAY AGAIN to start a fresh match · ${readyCount} / ${active.length} ready`,
      tableX: 100, maxRowH: 52,
      heads: [["ROUND 1", 0.50], ["ROUND 2", 0.62], ["ROUND 3", 0.74], ["TOTAL", 0.88]],
      rows, tieKey: "total",
      isWinner: (p) => bestTotal > 0 && p.total === bestTotal,
      highlight: true, tickDx: 40,
      cells(p, y, xs, win) {
        g.font = F.totRound;
        for (let r = 0; r < TOTAL_ROUNDS; r++) {
          const v = p.roundScores[r];
          g.fillStyle = v == null ? FAINT : MUTED;
          g.fillText(v == null ? "—" : String(v), xs[r], y);
        }
        g.fillStyle = win ? GOLD : INK_LIGHT;
        g.font = F.totTotal;
        g.fillText(String(p.total), xs[3], y);
      },
    });
  }

  function drawHeader() {
    g.fillStyle = BG_HEADER;
    g.fillRect(0, 0, W, HEADER_H);
    g.strokeStyle = DIVIDER;
    g.lineWidth = 1;
    g.beginPath();
    g.moveTo(0, HEADER_H + 0.5);
    g.lineTo(W, HEADER_H + 0.5);
    g.stroke();

    g.fillStyle = INK_LIGHT;
    g.font = F.brand;
    g.textAlign = "left";
    g.textBaseline = "middle";
    g.fillText("STOP CLOCK", 20, HEADER_H / 2 + 1);

    const roundText = state === "totals"
      ? "Match complete"
      : `Round ${Math.max(1, currentRound)} / ${TOTAL_ROUNDS}`;
    g.font = F.pill;
    const pillW = g.measureText(roundText).width + 24;

    g.fillStyle = PILL_BG;
    pillPath(g, W / 2 - pillW / 2, HEADER_H / 2 - 12, pillW, 24, 12);
    g.fill();

    g.fillStyle = PILL_TEXT;
    g.textAlign = "center";
    g.fillText(roundText, W / 2, HEADER_H / 2 + 1);

    g.fillStyle = FAINT;
    g.font = F.rule;
    g.textAlign = "right";
    g.fillText("Target 10.00 · Perfect = 500", W - 20, HEADER_H / 2 + 1);
  }

  function drawCountdown() {
    g.fillStyle = "rgba(30,34,70,0.94)";
    g.fillRect(0, HEADER_H, W, H - HEADER_H);

    g.textAlign = "center";
    g.textBaseline = "middle";

    g.fillStyle = BLUE;
    g.font = F.countBig;
    g.fillText(countdownLabel(), W / 2, H / 2 - 20);

    g.fillStyle = INK_LIGHT;
    g.font = F.countHint;
    g.fillText("Tap STOP when you think 10.00 s have passed", W / 2, H / 2 + 100);

    g.fillStyle = MUTED;
    g.font = F.countSub;
    g.fillText("The iris closes after one second. Count in your head.", W / 2, H / 2 + 132);
  }

  function draw() {
    // Names can change at any time, so look them up when drawing.
    for (const p of players.values()) {
      const info = ctx.player(p.slot);
      p.color = (info && info.color) || BLUE;
      p.name = (info && info.name) || `P${p.slot + 1}`;
    }

    if (state === "leaderboard" || state === "totals") {
      g.fillStyle = BG;
      g.fillRect(0, 0, W, H);
      if (state === "leaderboard") drawLeaderboard(); else drawTotals();
    } else {
      syncLayer();
      g.drawImage(layer, 0, 0);          // replaces the full-canvas clear
      for (const p of players.values()) if (p.rect) paintCellLive(p);
      if (state === "countdown") drawCountdown();
    }

    drawHeader();
  }

  /* ------------------------- main loop --------------------------- */
  function frame(now) {
    if (exiting) return;
    // Schedule first: one bad frame must never freeze the game.
    raf = requestAnimationFrame(frame);

    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    update(dt);

    if (dirty || now - lastDraw >= HEARTBEAT_MS) {
      dirty = false;
      lastDraw = now;
      draw();
    }
  }

  // The canvas is opaque, so paint once now instead of showing black
  // for the first frame.
  draw();
  dirty = false;
  lastDraw = performance.now();

  // The canvas can be dropped while the tab is hidden; repaint on return.
  on(document, "visibilitychange", invalidate);

  raf = requestAnimationFrame(frame);

  return {
    destroy() {
      if (exiting) return;
      exiting = true;
      cancelAnimationFrame(raf);
      raf = 0;

      // Give #gameRoot back exactly as we found it.
      for (const [k, v, prio] of savedRootStyle) {
        if (v) root.style.setProperty(k, v, prio);
        else root.style.removeProperty(k);
      }
      wrapEl.remove();
      layer.width = layer.height = 0;   // release the off-screen bitmap
      players.clear();
    },
  };
}
