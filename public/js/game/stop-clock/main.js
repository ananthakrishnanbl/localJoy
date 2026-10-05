// Stop Clock — hidden stopwatch, one button, target 10.00 s.
//
// At t=0 a stopwatch starts and stays visible for 1 s. Then an 8-blade
// iris (iPhone-camera style) slowly sweeps shut over 1.4 s. When the
// last player taps their single button, every iris reopens together
// and each quadrant reveals its frozen time.
//
// Score = 500 - |time*100 - 1000|. Lower is better. Best of 3 rounds wins.
// Plays 1-10 players in a balanced grid.

const TAU = Math.PI * 2;
const HEADER_H = 44;

const COUNTDOWN       = 3.5;
const CLOSE_START     = 1.0;
const CLOSE_DURATION  = 1.4;
const REVEAL_DURATION = 0.8;
const TARGET          = 10.0;
const MAX_TIME        = 20.0;
const TOTAL_ROUNDS    = 3;

// -------- Dark theme palette --------
const BG          = "#0a0f15";
const BG_CELL     = "#0d141c";
const CARD        = "#1a2332";
const CARD_EDGE   = "rgba(255,255,255,0.07)";
const CARD_SHADOW = "rgba(0,0,0,0.5)";
const INK         = "#e6f0ff";
const MUTED       = "#8ba0b6";
const FAINT       = "#4f6274";
const DIVIDER     = "rgba(255,255,255,0.06)";
const FLAP        = "#050a12";
const FLAP_ALT    = "#0d1a28";
const FLAP_SEAM   = "rgba(0,0,0,0.7)";
const BLUE        = "#2aa9e0";
const GREEN       = "#2fbf71";
const GOLD        = "#ffb400";
const DIGIT       = "#e6f0ff";
const DIGIT_STOP  = "#2aa9e0";

export function start(ctx) {
  const { root, signal } = ctx;
  const on = (t, type, fn) => t.addEventListener(type, fn, { signal });

  /* --------------------------- display --------------------------- */
  const canvas = document.createElement("canvas");
  canvas.width = 1280;
  canvas.height = 720;
  Object.assign(canvas.style, {
    display: "block", maxWidth: "100%", maxHeight: "100%",
    aspectRatio: "16 / 9", background: BG,
  });
  const wrapEl = document.createElement("div");
  Object.assign(wrapEl.style, {
    width: "100%", height: "100%", display: "flex",
    alignItems: "center", justifyContent: "center", background: BG,
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
  let state = "countdown";     // countdown | running | results
  let stateTimer = COUNTDOWN;
  let roundStart = 0;
  let roundClock = 0;
  let aperture = 1;            // 1 = open, 0 = fully shut
  let revealProgress = 0;      // 0..1 during "results"
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
      stopped: false, stopTime: 0, score: 0,
      ready: false,
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
    // Reflow only outside of a live round.
    if (state !== "running") layoutRound();
  });

  on(window, "player-leave", (e) => {
    const p = players.get(e.detail.slot);
    if (!p) return;
    p.connected = false;
    p.ready = false;
    if (state !== "running") layoutRound();
    if (state === "running") checkAllStopped();
    if (state === "results") checkAllReady();
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
    } else if (state === "results" && !p.ready) {
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
    roundStart = 0;
    roundClock = 0;
    aperture = 1;
    revealProgress = 0;
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

  function checkAllStopped() {
    if (state !== "running") return;
    const active = [...players.values()].filter((p) => p.connected);
    if (active.length === 0) return;
    if (!active.every((p) => p.stopped)) return;

    let best = -Infinity;
    winnerSlots = [];
    for (const p of active) {
      if (p.score > best) { best = p.score; winnerSlots = [p.slot]; }
      else if (p.score === best) winnerSlots.push(p.slot);
    }

    // Enter results. Aperture stays at 0 (fully shut) and the update
    // loop will open it as revealProgress goes 0 -> 1.
    aperture = 0;
    revealProgress = 0;
    state = "results";
    ctx.broadcast({ type: "vibrate", ms: [40, 30, 40] });
    for (const p of players.values()) {
      if (p.connected) ctx.send(p.slot, { type: "stopper-state", state: "replay" });
    }
  }

  function checkAllReady() {
    if (state !== "results") return;
    const active = [...players.values()].filter((p) => p.connected);
    if (active.length === 0) return;
    if (!active.every((p) => p.ready)) return;
    if (currentRound >= TOTAL_ROUNDS) currentRound = 0;
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

    if (state === "results") {
      if (revealProgress < 1) {
        revealProgress = Math.min(1, revealProgress + dt / REVEAL_DURATION);
        // Opening: aperture goes 0 -> 1. (Before, this was inverted —
        // aperture = 1 - eased — which jumped to open then closed.)
        aperture = easeInOut(revealProgress);
      } else {
        aperture = 1;
      }
    }
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

  /* ---------- 8-blade iris, swept-blade style ---------- */
  // Each blade spans one angular step of the rim. Its inner edge is an
  // arc at radius r = R * ap, rotated relative to the outer edge by
  // `rot`. As ap shrinks the inner arc grows smaller and swings toward
  // the centre, so the visible "hole" closes like a real camera iris.
  // Because consecutive blades share the line from (a1, R) to
  // (a1 + rot, r), they tile perfectly — no gaps at any ap.
  function drawAperture(cx, cy, R, ap) {
    if (ap >= 0.995) return;                 // fully open, nothing to draw

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
      // outer rim arc
      g.arc(cx, cy, R, a0, a1);

      if (r > 0.6) {
        // right side: line from outer corner to inner-arc start
        g.lineTo(cx + r * Math.cos(a1 + rot),
                 cy + r * Math.sin(a1 + rot));
        // inner arc, backward
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

    // Subtle inner depth ring so the opening reads as a well, not a
    // flat hole. Single-hue dark shading only.
    const vg = g.createRadialGradient(cx, cy, Math.max(0, r * 0.6),
                                      cx, cy, R);
    vg.addColorStop(0, "rgba(0,0,0,0)");
    vg.addColorStop(1, "rgba(0,0,0,0.5)");
    g.fillStyle = vg;
    g.beginPath();
    g.arc(cx, cy, R, 0, TAU);
    g.fill();

    g.restore();
  }

  function drawClockFace(cx, cy, R, timeVal, stopped, hidden, color) {
    // Housing
    g.beginPath();
    g.arc(cx, cy, R * 1.02, 0, TAU);
    g.fillStyle = CARD;
    g.fill();
    g.strokeStyle = CARD_EDGE;
    g.lineWidth = 1.5;
    g.stroke();

    // Tick marks
    for (let i = 0; i < 12; i++) {
      const a = i * (TAU / 12) - Math.PI / 2;
      const r0 = R * 0.86;
      const r1 = R * 0.92;
      g.beginPath();
      g.moveTo(cx + r0 * Math.cos(a), cy + r0 * Math.sin(a));
      g.lineTo(cx + r1 * Math.cos(a), cy + r1 * Math.sin(a));
      g.strokeStyle = "rgba(230,240,255,0.18)";
      g.lineWidth = 2;
      g.lineCap = "round";
      g.stroke();
    }

    if (hidden) return;   // digits suppressed while the iris is shut

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

    // Cell background
    g.fillStyle = BG_CELL;
    g.fillRect(r.x, r.y, r.w, r.h);

    g.strokeStyle = DIVIDER;
    g.lineWidth = 1;
    g.strokeRect(r.x + 0.5, r.y + 0.5, r.w - 1, r.h - 1);

    // Name card
    const pad = Math.max(8, Math.min(r.w, r.h) * 0.035);
    const cardH = Math.max(24, Math.min(r.h * 0.09, 34));
    const cardW = Math.min(r.w - pad * 2, 220);

    g.save();
    g.shadowColor = CARD_SHADOW;
    g.shadowBlur = 10;
    g.shadowOffsetY = 3;
    g.fillStyle = CARD;
    roundRect(r.x + pad, r.y + pad, cardW, cardH, cardH / 2);
    g.fill();
    g.restore();

    g.strokeStyle = CARD_EDGE;
    g.lineWidth = 1;
    roundRect(r.x + pad + 0.5, r.y + pad + 0.5, cardW - 1, cardH - 1, cardH / 2);
    g.stroke();

    // Colour dot
    const dotR = cardH * 0.22;
    g.fillStyle = color;
    g.beginPath();
    g.arc(r.x + pad + cardH * 0.55, r.y + pad + cardH / 2, dotR, 0, TAU);
    g.fill();

    // Name
    g.fillStyle = INK;
    g.font = `700 ${Math.max(11, cardH * 0.42)}px Fredoka, system-ui, sans-serif`;
    g.textAlign = "left";
    g.textBaseline = "middle";
    g.fillText(name, r.x + pad + cardH, r.y + pad + cardH / 2 + 1);

    // Ready tick
    if (state === "results" && p.ready) {
      g.textAlign = "right";
      g.fillStyle = GREEN;
      g.font = `800 ${cardH * 0.55}px Fredoka, system-ui, sans-serif`;
      g.fillText("✓", r.x + pad + cardW - cardH * 0.35, r.y + pad + cardH / 2 + 1);
    }

    // Clock region
    const top = r.y + pad + cardH + pad;
    const bot = r.y + r.h - pad * 2 - Math.max(18, r.h * 0.06);
    const clockH = bot - top;
    const clockW = r.w - pad * 2;
    const R = Math.max(20, Math.min(clockW, clockH) * 0.44);
    const cx = r.x + r.w / 2;
    const cy = (top + bot) / 2;

    // Display time
    let displayTime;
    if (state === "countdown") displayTime = 0;
    else if (p.stopped) displayTime = p.stopTime;
    else displayTime = roundClock;

    // Suppress digits as soon as the iris is essentially shut — this
    // guarantees nothing can peek through a seam.
    const hidden = (state === "running" && aperture < 0.08);

    drawClockFace(cx, cy, R, displayTime, p.stopped, hidden, color);
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
    } else if (state === "results") {
      const isWinner = winnerSlots.includes(p.slot);
      g.fillStyle = isWinner ? GOLD : DIGIT_STOP;
      g.font = `800 ${Math.max(13, r.h * 0.038)}px Fredoka, system-ui, sans-serif`;
      g.fillText(`Score ${p.score}`, cx, statusY);
    }
  }

  function drawHeader() {
    g.fillStyle = BG_CELL;
    g.fillRect(0, 0, canvas.width, HEADER_H);
    g.strokeStyle = DIVIDER;
    g.lineWidth = 1;
    g.beginPath();
    g.moveTo(0, HEADER_H + 0.5);
    g.lineTo(canvas.width, HEADER_H + 0.5);
    g.stroke();

    g.fillStyle = INK;
    g.font = "800 15px Fredoka, system-ui, sans-serif";
    g.textAlign = "left";
    g.textBaseline = "middle";
    g.fillText("STOP CLOCK", 20, HEADER_H / 2 + 1);

    g.fillStyle = MUTED;
    g.font = "700 14px Fredoka, system-ui, sans-serif";
    g.textAlign = "center";
    g.fillText(`Round ${currentRound} / ${TOTAL_ROUNDS}`, canvas.width / 2, HEADER_H / 2 + 1);

    g.fillStyle = FAINT;
    g.font = "600 13px Fredoka, system-ui, sans-serif";
    g.textAlign = "right";
    g.fillText("Target 10.00 · Score = 100 − |t × 100 − 1000|", canvas.width - 20, HEADER_H / 2 + 1);
  }

  function drawCountdown() {
    const W = canvas.width, H = canvas.height;
    g.fillStyle = "rgba(10,15,21,0.92)";
    g.fillRect(0, HEADER_H, W, H - HEADER_H);

    g.textAlign = "center";
    g.textBaseline = "middle";

    const t = stateTimer;
    const txt = t > 2.5 ? "3" : t > 1.5 ? "2" : t > 0.5 ? "1" : "GO!";

    g.fillStyle = BLUE;
    g.font = "900 150px Fredoka, system-ui, sans-serif";
    g.fillText(txt, W / 2, H / 2 - 20);

    g.fillStyle = INK;
    g.font = "700 22px Fredoka, system-ui, sans-serif";
    g.fillText("Tap STOP when you think 10.00 s have passed", W / 2, H / 2 + 100);

    g.fillStyle = MUTED;
    g.font = "500 16px Fredoka, system-ui, sans-serif";
    g.fillText("The iris closes after one second. Count in your head.", W / 2, H / 2 + 132);
  }

  function drawResultsBanner() {
    if (state !== "results") return;
    if (revealProgress < 0.9) return;

    const W = canvas.width, H = canvas.height;
    const alpha = Math.min(1, (revealProgress - 0.9) / 0.1);

    g.save();
    g.globalAlpha = alpha;
    g.textAlign = "center";
    g.textBaseline = "middle";

    g.fillStyle = "rgba(26,35,50,0.94)";
    g.fillRect(0, HEADER_H, W, 54);
    g.strokeStyle = CARD_EDGE;
    g.lineWidth = 1;
    g.beginPath();
    g.moveTo(0, HEADER_H + 54.5);
    g.lineTo(W, HEADER_H + 54.5);
    g.stroke();

    const leader = winnerSlots.length === 1
      ? (ctx.player(winnerSlots[0])?.name || `P${winnerSlots[0] + 1}`)
      : "Tie";
    const score = winnerSlots.length > 0
      ? (players.get(winnerSlots[0])?.score ?? 0)
      : 0;

    g.fillStyle = GOLD;
    g.font = "800 24px Fredoka, system-ui, sans-serif";
    g.fillText(`🏆 ${leader} — ${score}`, W / 2, HEADER_H + 27);

    g.fillStyle = MUTED;
    g.font = "500 14px Fredoka, system-ui, sans-serif";
    g.fillText("Tap your button to play again · Host: Exit to leave", W / 2, H - 20);
    g.restore();
  }

  function draw() {
    g.fillStyle = BG;
    g.fillRect(0, 0, canvas.width, canvas.height);

    for (const p of players.values()) {
      if (p.rect) drawQuadrant(p);
    }

    if (state === "countdown") drawCountdown();
    drawResultsBanner();
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
