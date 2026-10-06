// Loop Rider — trace a Google-Maps-route-style blue loop drawn on a
// dark terrain map.
//
// The big screen is split into up to four quadrants, one per player.
// Every quadrant shows the SAME randomly generated closed loop on the
// SAME /assets/games/loop-rider-back.jpg backdrop. The loop is drawn
// like a Google Maps route (blue #4285f4 with a light halo). Each
// player steers a nav chevron around it with LEFT / RIGHT taps on
// their phone (the "turner" controller). Tap once to nudge; hold to
// auto-repeat.
//
// Score starts at 1000. Each frame the distance from the arrow to the
// nearest point on the loop is multiplied by the distance travelled
// that frame and added to a penalty (the swept ribbon area). When it
// exceeds AREA_BUDGET the score hits 0 and the player DNFs.
//
// The round runs for EXACTLY LAP_TIME seconds. Any tap during the 3-2-1
// countdown is ignored. A perfect lap takes exactly LAP_TIME, so
// finishing early is impossible; anyone still moving at the buzzer
// keeps their score (shows "TIME").
//
// When the final standings appear, every player who was in the game
// must tap any button once to play again. As soon as the last one does
// a fresh 3-round match begins. The host can still press Exit.

const TAU = Math.PI * 2;
const N = 256;
const NUDGE = 9 * Math.PI / 180;
const AREA_BUDGET = 0.6;
const LAP_TIME = 15;
const ROUND_COUNTDOWN = 3.5;
const ROUND_END_PAUSE = 4;
const TOTAL_ROUNDS = 3;
const HEADER_H = 48;

// -------- dark-mode UI palette (Google Maps dark) --------
const UI_BG         = "#1a2332";
const UI_HEADER     = "#202a3a";
const UI_DIVIDER    = "#2d3949";
const UI_CARD       = "rgba(32, 36, 46, 0.92)";
const UI_CARD_EDGE  = "rgba(255,255,255,0.08)";
const UI_TEXT       = "#ffffff";
const UI_TEXT_MUTED = "#9aa0a6";
const UI_TEXT_FAINT = "#5f6368";
const MAP_LOADING   = "#1b2634";
const ROUTE_BLUE    = "#4285f4";
const ROUTE_HALO    = "rgba(66,133,244,0.35)";
const ROUTE_CASING  = "#8ab4f8";
const START_RED     = "#ea4335";
const WIN_GOLD      = "#fbbc04";
const READY_GREEN   = "#34a853";

export function start(ctx) {
  const { root, signal } = ctx;
  const on = (t, type, fn) => t.addEventListener(type, fn, { signal });
  const rand = (a, b) => a + Math.random() * (b - a);

  /* --------------------------- display --------------------------- */
  const canvas = document.createElement("canvas");
  canvas.width = 1280;
  canvas.height = 720;
  Object.assign(canvas.style, {
    display: "block",
    maxWidth: "100%",
    maxHeight: "100%",
    aspectRatio: "16 / 9",
    background: UI_BG,
  });
  const wrapEl = document.createElement("div");
  Object.assign(wrapEl.style, {
    width: "100%", height: "100%",
    display: "flex", alignItems: "center", justifyContent: "center",
    background: UI_BG,
  });
  wrapEl.append(canvas);
  root.replaceChildren(wrapEl);
  const g = canvas.getContext("2d");

  /* ------------------ load the map background -------------------- */
  const mapImg = new Image();
  let mapReady = false;
  mapImg.onload = () => { mapReady = true; };
  mapImg.onerror = () => { mapReady = false; };
  mapImg.src = "/assets/games/loop-rider-back.jpg";

  const MAP_ASPECT = 16 / 9;   // any wide image; cover-cropped if it differs
  function drawMapCover(x, y, w, h) {
    if (!mapReady) {
      g.fillStyle = MAP_LOADING;
      g.fillRect(x, y, w, h);
      return;
    }
    const rectAspect = w / h;
    let dw, dh;
    if (rectAspect > MAP_ASPECT) { dw = w; dh = w / MAP_ASPECT; }
    else                         { dh = h; dw = h * MAP_ASPECT; }
    const dx = x - (dw - w) / 2;
    const dy = y - (dh - h) / 2;
    g.drawImage(mapImg, dx, dy, dw, dh);
  }

  /* --------------------- kill switch / handles ------------------- */
  let exiting = false;
  let raf = 0;
  let last = performance.now();
  let hudTimer = 0;

  /* ----------------------- loop generation ----------------------- */
  function generateLoop() {
    const harmonics = [
      { k: 2, a: rand(0.08, 0.16), p: rand(0, TAU) },
      { k: 3, a: rand(0.05, 0.10), p: rand(0, TAU) },
      { k: 4, a: rand(0.02, 0.06), p: rand(0, TAU) },
      { k: 5, a: rand(0.02, 0.05), p: rand(0, TAU) },
    ];
    const rAt = (t) => {
      let r = 1;
      for (const h of harmonics) r += h.a * Math.cos(h.k * t + h.p);
      return r;
    };
    const FINE = 3000;
    const fine = new Array(FINE);
    let maxR = 0;
    for (let i = 0; i < FINE; i++) {
      const t = (i / FINE) * TAU;
      const r = rAt(t);
      if (r > maxR) maxR = r;
      fine[i] = { x: r * Math.cos(t), y: r * Math.sin(t) };
    }
    for (let i = 0; i < FINE; i++) { fine[i].x /= maxR; fine[i].y /= maxR; }

    const cum = new Float64Array(FINE + 1);
    for (let i = 1; i <= FINE; i++) {
      const a = fine[i - 1], b = fine[i % FINE];
      cum[i] = cum[i - 1] + Math.hypot(b.x - a.x, b.y - a.y);
    }
    const totalLen = cum[FINE];

    const pts = new Array(N);
    for (let i = 0; i < N; i++) {
      const target = (i / N) * totalLen;
      let lo = 0, hi = FINE;
      while (lo < hi - 1) {
        const mid = (lo + hi) >> 1;
        if (cum[mid] < target) lo = mid; else hi = mid;
      }
      const seg = cum[lo + 1] - cum[lo] || 1;
      const t = (target - cum[lo]) / seg;
      const a = fine[lo], b = fine[(lo + 1) % FINE];
      pts[i] = { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
    }
    return { pts, length: totalLen };
  }

  function nearestOnLoop(loop, x, y) {
    const pts = loop.pts;
    let bestI = 0, bestD2 = Infinity;
    for (let i = 0; i < pts.length; i++) {
      const dx = pts[i].x - x, dy = pts[i].y - y;
      const d2 = dx * dx + dy * dy;
      if (d2 < bestD2) { bestD2 = d2; bestI = i; }
    }
    return { index: bestI, dist: Math.sqrt(bestD2) };
  }

  /* --------------------------- layout ---------------------------- */
  const LAYOUTS = {
    1: [[0, 0, 1, 1]],
    2: [[0, 0, 0.5, 1], [0.5, 0, 0.5, 1]],
    3: [[0, 0, 0.5, 0.5], [0.5, 0, 0.5, 0.5], [0, 0.5, 0.5, 0.5]],
    4: [[0, 0, 0.5, 0.5], [0.5, 0, 0.5, 0.5], [0, 0.5, 0.5, 0.5], [0.5, 0.5, 0.5, 0.5]],
  };
  function quadrantRect(f) {
    const W = canvas.width, H = canvas.height;
    const playH = H - HEADER_H;
    return { x: f[0] * W, y: HEADER_H + f[1] * playH, w: f[2] * W, h: f[3] * playH };
  }

  /* --------------------------- state ----------------------------- */
  const players = new Map();
  let currentRound = 0;
  let state = "countdown";
  let stateTimer = ROUND_COUNTDOWN;
  let loop = null;
  let winnerSlots = [];
  // Slots that must tap once to restart, filled in when we enter "gameend".
  let pendingRestart = new Set();

  function addPlayer(slot) {
    const existing = players.get(slot);
    if (existing) { existing.connected = true; return; }
    const info = ctx.player(slot);
    if (!info) return;
    players.set(slot, {
      slot,
      connected: true,
      arrow: null,
      rect: null,
      score: 0,
      total: 0,
      roundScores: [0, 0, 0],
      lastSid: null,
      leftSeen: 0,
      rightSeen: 0,
    });
  }

  ctx.players().forEach((p) => addPlayer(p.slot));

  on(window, "player-join", (e) => { if (!exiting) addPlayer(e.detail.slot); });

  on(window, "player-leave", (e) => {
    const p = players.get(e.detail.slot);
    if (!p) return;
    p.connected = false;
    if (p.arrow) p.arrow.gone = true;

    // Someone left while we were waiting for restart taps. Drop their
    // requirement, and if that was the last one, restart now.
    if (state === "gameend" && pendingRestart.has(e.detail.slot)) {
      pendingRestart.delete(e.detail.slot);
      maybeRestart();
    }
  });

  on(window, "controller-input", (e) => {
    if (exiting) return;
    const { slot, data } = e.detail;
    const p = players.get(slot);
    if (!p || !data || data.type !== "turn") return;

    // Track running counters even during countdown / gameend so the
    // first real tap after GO is a real tap, not a sid catch-up.
    const left  = data.left  | 0;
    const right = data.right | 0;
    if (data.sid !== p.lastSid) {
      p.lastSid = data.sid;
      p.leftSeen = left;
      p.rightSeen = right;
      return;
    }
    const dl = left  - p.leftSeen;
    const dr = right - p.rightSeen;
    p.leftSeen = left;
    p.rightSeen = right;

    const tapped = (dl + dr) > 0;
    if (!tapped) return;

    // On the final standings, any tap = "I'm ready to play again".
    if (state === "gameend") {
      if (pendingRestart.has(slot)) {
        pendingRestart.delete(slot);
        ctx.send(slot, { type: "vibrate", ms: [20] });
        maybeRestart();
      }
      return;
    }

    // Pre-round / post-buzzer taps do nothing.
    if (state !== "playing") return;

    if (p.arrow && !p.arrow.done && !p.arrow.gone) {
      p.arrow.pending -= dl;    // left  = counter-clockwise
      p.arrow.pending += dr;    // right = clockwise
    }
  });

  /* ----------------------- round management ---------------------- */
  function startRound() {
    if (exiting) return;
    currentRound++;
    loop = generateLoop();

    const all = [...players.values()];
    const connected = all.filter((p) => p.connected);
    const layout = LAYOUTS[Math.min(4, Math.max(1, connected.length))];

    for (const p of all) { p.arrow = null; p.rect = null; }

    connected.forEach((p, i) => {
      const frac = layout[i];
      if (!frac) return;
      const rect = quadrantRect(frac);
      // Index N/2 sits on the LEFT side of the loop (index 0 is the
      // right). Fixed angle, so every new loop starts in the same place
      // relative to itself — just the mirror of where it used to start.
      const startIdx = N / 2;
      const start = loop.pts[startIdx];
      const next = loop.pts[(startIdx + 1) % N];
      const heading = Math.atan2(next.y - start.y, next.x - start.x);
      p.rect = rect;
      p.score = 1000;
      p.arrow = {
        x: start.x, y: start.y, heading,
        pending: 0,
        penalty: 0,
        score: 1000,
        progress: 0,
        lastIndex: startIdx,
        done: false, dnf: false, finished: false, gone: false,
        trail: [{ x: start.x, y: start.y }],
      };
    });

    state = "countdown";
    stateTimer = ROUND_COUNTDOWN;
  }

  function clearHud(slot) {
    ctx.send(slot, { type: "hud", text: "", down: false });
  }

  function endRound() {
    for (const p of players.values()) clearHud(p.slot);

    for (const p of players.values()) {
      const s = p.arrow ? Math.round(p.arrow.score) : 0;
      p.roundScores[currentRound - 1] = s;
      p.score = s;
    }
    for (const p of players.values()) {
      let t = 0;
      for (let i = 0; i < TOTAL_ROUNDS; i++) t += p.roundScores[i] || 0;
      p.total = t;
    }
    ctx.broadcast({ type: "vibrate", ms: [30, 30, 30] });
    state = "roundend";
    stateTimer = ROUND_END_PAUSE;
  }

  function nextRoundOrEnd() {
    if (exiting) return;
    if (currentRound >= TOTAL_ROUNDS) {
      // Enter the final-standings screen. Every currently connected
      // player must tap once to restart the whole match.
      let best = -1;
      winnerSlots = [];
      for (const p of players.values()) {
        if (p.total > best) { best = p.total; winnerSlots = [p.slot]; }
        else if (p.total === best) winnerSlots.push(p.slot);
      }
      for (const s of winnerSlots) {
        ctx.send(s, { type: "vibrate", ms: [120, 60, 120, 60, 240] });
      }
      pendingRestart = new Set(
        [...players.values()].filter((p) => p.connected).map((p) => p.slot)
      );
      state = "gameend";
    } else {
      startRound();
    }
  }

  // Reset everything and start a brand-new 3-round match.
  function restartGame() {
    if (exiting) return;
    pendingRestart.clear();
    currentRound = 0;
    winnerSlots = [];
    for (const p of players.values()) {
      p.roundScores = [0, 0, 0];
      p.total = 0;
      p.score = 0;
      p.arrow = null;
      p.rect = null;
      clearHud(p.slot);
    }
    startRound();
  }

  // Called whenever a "ready" flag clears. Restarts if nobody is left.
  function maybeRestart() {
    if (state !== "gameend") return;
    if (pendingRestart.size > 0) return;
    const anyConnected = [...players.values()].some((p) => p.connected);
    if (!anyConnected) return;    // console will exit us anyway
    restartGame();
  }

  startRound();

  /* --------------------------- update ---------------------------- */
  function update(dt) {
    if (exiting) return;

    if (state === "countdown") {
      stateTimer -= dt;
      if (stateTimer <= 0) {
        state = "playing";
        stateTimer = 0;
        for (const p of players.values()) if (p.arrow) p.arrow.pending = 0;
      }
      return;
    }

    if (state === "playing") {
      if (!loop) return;
      const speed = loop.length / LAP_TIME;

      for (const p of players.values()) {
        const a = p.arrow;
        if (!a || a.gone) continue;
        if (a.done) continue;

        if (a.pending !== 0) {
          a.heading += a.pending * NUDGE;
          a.pending = 0;
        }

        a.x += Math.cos(a.heading) * speed * dt;
        a.y += Math.sin(a.heading) * speed * dt;

        const near = nearestOnLoop(loop, a.x, a.y);
        a.penalty += near.dist * speed * dt;
        a.score = Math.max(0, 1000 * (1 - a.penalty / AREA_BUDGET));

        if (a.score <= 0) {
          a.score = 0; a.done = true; a.dnf = true;
          ctx.send(p.slot, { type: "vibrate", ms: [140, 70, 140] });
          continue;
        }

        if (near.dist < 0.25) {
          let delta = near.index - a.lastIndex;
          if (delta < -N / 2) delta += N;
          if (delta >  N / 2) delta -= N;
          if (delta > 0) a.progress += delta;
        }
        a.lastIndex = near.index;

        a.trail.push({ x: a.x, y: a.y });
        if (a.trail.length > 600) a.trail.shift();

        if (a.progress >= N) {
          a.done = true; a.finished = true;
          ctx.send(p.slot, { type: "vibrate", ms: [40, 30, 40, 30, 120] });
        }
      }

      stateTimer += dt;
      if (stateTimer >= LAP_TIME) {
        for (const p of players.values()) {
          if (p.arrow && !p.arrow.done) p.arrow.done = true;
        }
        endRound();
      }
      return;
    }

    if (state === "roundend") {
      stateTimer -= dt;
      if (stateTimer <= 0) nextRoundOrEnd();
      return;
    }
    // gameend: wait for every player to tap, or for the host to Exit.
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

  function drawLoopAsRoute(loop, cx, cy, scale) {
    const pts = loop.pts;

    g.strokeStyle = ROUTE_HALO;
    g.lineWidth = 14;
    g.lineJoin = "round";
    g.lineCap = "round";
    g.beginPath();
    for (let i = 0; i < pts.length; i++) {
      const sx = cx + pts[i].x * scale;
      const sy = cy + pts[i].y * scale;
      if (i === 0) g.moveTo(sx, sy); else g.lineTo(sx, sy);
    }
    g.closePath();
    g.stroke();

    g.strokeStyle = ROUTE_CASING;
    g.lineWidth = 8;
    g.stroke();

    g.strokeStyle = ROUTE_BLUE;
    g.lineWidth = 5;
    g.stroke();

    const s0 = pts[N / 2];
    const sx = cx + s0.x * scale;
    const sy = cy + s0.y * scale;
    g.fillStyle = "#ffffff";
    g.beginPath();
    g.arc(sx, sy, 8, 0, TAU);
    g.fill();
    g.fillStyle = START_RED;
    g.beginPath();
    g.arc(sx, sy, 5.5, 0, TAU);
    g.fill();
  }

  function drawTrail(a, cx, cy, scale, color) {
    const pts = a.trail;
    if (pts.length < 2) return;

    g.strokeStyle = "rgba(0,0,0,0.45)";
    g.lineWidth = 5;
    g.lineCap = "round";
    g.lineJoin = "round";
    g.beginPath();
    for (let i = 0; i < pts.length; i++) {
      const sx = cx + pts[i].x * scale;
      const sy = cy + pts[i].y * scale;
      if (i === 0) g.moveTo(sx, sy); else g.lineTo(sx, sy);
    }
    g.stroke();

    g.strokeStyle = color;
    g.lineWidth = 3;
    g.globalAlpha = 0.9;
    g.stroke();
    g.globalAlpha = 1;
  }

  function drawNavArrow(x, y, heading, color) {
    g.save();
    g.translate(x, y);
    g.rotate(heading);

    g.shadowColor = "rgba(0,0,0,0.55)";
    g.shadowBlur = 6;
    g.shadowOffsetY = 2;

    g.fillStyle = "#ffffff";
    g.beginPath();
    g.moveTo(20, 0);
    g.lineTo(-14, -14);
    g.lineTo(-6, 0);
    g.lineTo(-14, 14);
    g.closePath();
    g.fill();

    g.shadowColor = "transparent";
    g.fillStyle = color;
    g.beginPath();
    g.moveTo(15, 0);
    g.lineTo(-10, -10);
    g.lineTo(-3, 0);
    g.lineTo(-10, 10);
    g.closePath();
    g.fill();

    g.restore();
  }

  function drawQuadrant(p) {
    const r = p.rect;
    const info = ctx.player(p.slot);
    const color = (info && info.color) || "#9fb4c7";
    const name  = (info && info.name)  || `P${p.slot + 1}`;

    g.fillStyle = UI_BG;
    g.fillRect(r.x, r.y, r.w, r.h);
    g.strokeStyle = UI_DIVIDER;
    g.lineWidth = 1;
    g.strokeRect(r.x + 0.5, r.y + 0.5, r.w - 1, r.h - 1);

    const cardH = 44;
    const mapPad = 10;
    const mapX = r.x + mapPad;
    const mapY = r.y + cardH + mapPad;
    const mapW = r.w - mapPad * 2;
    const mapH = r.h - cardH - mapPad * 2 - 22;
    if (mapW <= 0 || mapH <= 0) return;

    g.save();
    g.beginPath();
    g.rect(mapX, mapY, mapW, mapH);
    g.clip();

    drawMapCover(mapX, mapY, mapW, mapH);

    const side = Math.min(mapW, mapH);
    const cx = mapX + mapW / 2;
    const cy = mapY + mapH / 2;
    const scale = side / 2;

    if (loop) drawLoopAsRoute(loop, cx, cy, scale);

    const a = p.arrow;
    if (a && a.trail.length > 1) drawTrail(a, cx, cy, scale, color);
    if (a && !a.gone) drawNavArrow(cx + a.x * scale, cy + a.y * scale, a.heading, color);

    const vg = g.createRadialGradient(cx, cy, Math.min(mapW, mapH) * 0.45,
                                      cx, cy, Math.max(mapW, mapH) * 0.62);
    vg.addColorStop(0, "rgba(0,0,0,0)");
    vg.addColorStop(1, "rgba(0,0,0,0.28)");
    g.fillStyle = vg;
    g.fillRect(mapX, mapY, mapW, mapH);

    g.restore();

    const cardX = r.x + mapPad;
    const cardY = r.y + 8;
    const cardW = Math.min(r.w - mapPad * 2, 320);

    g.save();
    g.shadowColor = "rgba(0,0,0,0.5)";
    g.shadowBlur = 8;
    g.shadowOffsetY = 2;
    g.fillStyle = UI_CARD;
    roundRect(cardX, cardY, cardW, 36, 8);
    g.fill();
    g.restore();

    g.strokeStyle = UI_CARD_EDGE;
    g.lineWidth = 1;
    roundRect(cardX + 0.5, cardY + 0.5, cardW - 1, 35, 8);
    g.stroke();

    g.fillStyle = color;
    g.beginPath();
    g.arc(cardX + 14, cardY + 18, 6, 0, TAU);
    g.fill();

    g.fillStyle = UI_TEXT;
    g.font = "600 14px system-ui, sans-serif";
    g.textAlign = "left";
    g.textBaseline = "middle";
    g.fillText(name, cardX + 26, cardY + 19);

    const shownScore = a ? Math.round(a.score) : 0;
    g.fillStyle = ROUTE_CASING;
    g.font = "800 20px system-ui, sans-serif";
    g.textAlign = "right";
    g.fillText(String(shownScore), cardX + cardW - 12, cardY + 19);

    const barW = r.w - mapPad * 2;
    const barX = r.x + mapPad;
    const barY = r.y + r.h - 14;
    g.fillStyle = "rgba(255,255,255,0.08)";
    roundRect(barX, barY, barW, 6, 3);
    g.fill();
    if (a) {
      const prog = Math.min(1, a.progress / N);
      g.fillStyle = color;
      roundRect(barX, barY, Math.max(0, barW * prog), 6, 3);
      g.fill();
    }

    if (a && a.done) {
      const label = a.dnf ? "DNF" : a.finished ? "FINISHED" : "TIME";
      const chipColor = a.dnf ? "#d93025" : a.finished ? "#1e8e3e" : "#f9ab00";
      g.font = "800 12px system-ui, sans-serif";
      const tw = g.measureText(label).width + 16;
      const chipX = r.x + r.w - mapPad - tw;
      const chipY = r.y + r.h - 26;
      g.fillStyle = chipColor;
      roundRect(chipX, chipY, tw, 18, 9);
      g.fill();
      g.fillStyle = "#ffffff";
      g.textAlign = "center";
      g.textBaseline = "middle";
      g.fillText(label, chipX + tw / 2, chipY + 10);
    }

    if (!a) {
      g.fillStyle = UI_TEXT_FAINT;
      g.font = "600 14px system-ui, sans-serif";
      g.textAlign = "center";
      g.textBaseline = "middle";
      g.fillText("Waiting for next round…", r.x + r.w / 2, r.y + r.h / 2);
    }
  }

  function drawHeader() {
    g.fillStyle = UI_HEADER;
    g.fillRect(0, 0, canvas.width, HEADER_H);
    g.strokeStyle = UI_DIVIDER;
    g.lineWidth = 1;
    g.beginPath();
    g.moveTo(0, HEADER_H + 0.5);
    g.lineTo(canvas.width, HEADER_H + 0.5);
    g.stroke();

    g.fillStyle = UI_TEXT;
    g.font = "800 15px system-ui, sans-serif";
    g.textAlign = "left";
    g.textBaseline = "middle";
    g.fillText("Loop Rider", 20, HEADER_H / 2 + 1);

    g.fillStyle = UI_TEXT_MUTED;
    g.font = "700 16px system-ui, sans-serif";
    g.textAlign = "center";
    g.fillText(`Round ${currentRound} / ${TOTAL_ROUNDS}`, canvas.width / 2, HEADER_H / 2 + 1);
  }

  function drawCountdown() {
    const W = canvas.width, H = canvas.height;
    g.fillStyle = "rgba(15, 20, 30, 0.82)";
    g.fillRect(0, HEADER_H, W, H - HEADER_H);

    g.textAlign = "center";
    g.textBaseline = "middle";

    const t = stateTimer;
    const txt = t > 2.5 ? "3" : t > 1.5 ? "2" : t > 0.5 ? "1" : "GO!";

    g.fillStyle = ROUTE_BLUE;
    g.font = "900 140px system-ui, sans-serif";
    g.fillText(txt, W / 2, H / 2 - 20);

    g.fillStyle = UI_TEXT;
    g.font = "700 22px system-ui, sans-serif";
    g.fillText("Tap or hold LEFT / RIGHT to steer", W / 2, H / 2 + 90);

    g.fillStyle = UI_TEXT_MUTED;
    g.font = "500 16px system-ui, sans-serif";
    g.fillText("Stay on the blue route. Score = 1000 minus how far you drift.", W / 2, H / 2 + 122);
  }

  function drawRoundEnd() {
    const W = canvas.width, H = canvas.height;
    g.fillStyle = "rgba(15, 20, 30, 0.92)";
    g.fillRect(0, HEADER_H, W, H - HEADER_H);

    g.textAlign = "center";
    g.textBaseline = "middle";
    g.fillStyle = UI_TEXT;
    g.font = "800 40px system-ui, sans-serif";
    g.fillText(`Round ${currentRound} complete`, W / 2, 120);

    const list = [...players.values()]
      .filter((p) => p.connected || p.arrow)
      .sort((a, b) => (b.score || 0) - (a.score || 0));

    const y0 = 210, dy = 44;
    list.forEach((p, i) => {
      const info = ctx.player(p.slot);
      const name = (info && info.name) || `P${p.slot + 1}`;
      const color = (info && info.color) || "#fff";
      const y = y0 + i * dy;

      g.fillStyle = color;
      g.beginPath();
      g.arc(W / 2 - 260, y, 8, 0, TAU);
      g.fill();

      g.textAlign = "left";
      g.font = "600 24px system-ui, sans-serif";
      g.fillStyle = UI_TEXT;
      g.fillText(name, W / 2 - 240, y);

      g.textAlign = "right";
      g.font = "800 26px system-ui, sans-serif";
      g.fillStyle = ROUTE_CASING;
      g.fillText(String(p.roundScores[currentRound - 1] || 0), W / 2 + 60, y);

      g.textAlign = "left";
      g.font = "500 14px system-ui, sans-serif";
      g.fillStyle = UI_TEXT_FAINT;
      g.fillText(`total ${p.total}`, W / 2 + 80, y + 2);
    });
  }

  function drawGameEnd() {
    const W = canvas.width, H = canvas.height;
    g.fillStyle = "rgba(15, 20, 30, 0.95)";
    g.fillRect(0, HEADER_H, W, H - HEADER_H);

    g.textAlign = "center";
    g.textBaseline = "middle";
    g.fillStyle = UI_TEXT;
    g.font = "800 44px system-ui, sans-serif";
    g.fillText("Final standings", W / 2, 90);

    g.fillStyle = UI_TEXT_MUTED;
    g.font = "500 15px system-ui, sans-serif";
    g.fillText("Host: press Exit to leave · Everyone else: tap any button to play again", W / 2, 128);

    const list = [...players.values()].sort((a, b) => (b.total || 0) - (a.total || 0));
    const y0 = 200, dy = 46;
    list.forEach((p, i) => {
      const info = ctx.player(p.slot);
      const name = (info && info.name) || `P${p.slot + 1}`;
      const color = (info && info.color) || "#fff";
      const y = y0 + i * dy;
      const isWinner = winnerSlots.includes(p.slot);
      const ready = !pendingRestart.has(p.slot);

      g.fillStyle = color;
      g.beginPath();
      g.arc(W / 2 - 300, y, 9, 0, TAU);
      g.fill();

      g.textAlign = "left";
      g.font = (isWinner ? "800 " : "600 ") + "26px system-ui, sans-serif";
      g.fillStyle = UI_TEXT;
      g.fillText((isWinner ? "🏆 " : "") + name, W / 2 - 280, y);

      g.textAlign = "right";
      g.font = (isWinner ? "900 " : "800 ") + "28px system-ui, sans-serif";
      g.fillStyle = isWinner ? WIN_GOLD : ROUTE_CASING;
      g.fillText(String(p.total || 0), W / 2 + 100, y);

      // Ready checkmark (green) or waiting dot (gray)
      if (p.connected) {
        g.textAlign = "left";
        g.font = "800 20px system-ui, sans-serif";
        if (ready) {
          g.fillStyle = READY_GREEN;
          g.fillText("✓", W / 2 + 140, y);
        } else {
          g.fillStyle = UI_TEXT_FAINT;
          g.fillText("…", W / 2 + 140, y);
        }
      }
    });

    // Ready counter strip at the bottom
    const total = pendingRestart.size;
    const were = [...players.values()].filter((p) => p.connected || p.arrow).length;
    const ready = Math.max(0, were - total);
    const stripY = H - 70;

    if (total === 0) {
      g.fillStyle = READY_GREEN;
      g.font = "800 22px system-ui, sans-serif";
      g.textAlign = "center";
      g.fillText("Everyone is ready — starting…", W / 2, stripY);
    } else {
      g.fillStyle = UI_TEXT;
      g.font = "800 22px system-ui, sans-serif";
      g.textAlign = "center";
      g.fillText(`Tap any button to play again  (${ready} / ${were} ready)`, W / 2, stripY);
    }
  }

  function draw() {
    g.fillStyle = UI_BG;
    g.fillRect(0, 0, canvas.width, canvas.height);

    drawHeader();
    for (const p of players.values()) {
      if (p.rect) drawQuadrant(p);
    }

    if (state === "countdown") drawCountdown();
    else if (state === "roundend") drawRoundEnd();
    else if (state === "gameend") drawGameEnd();
  }

  /* ------------------------- main loop --------------------------- */
  function frame(now) {
    if (exiting) return;
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;

    update(dt);

    hudTimer += dt;
    if (hudTimer >= 0.2) {
      hudTimer = 0;
      if (state === "playing") {
        for (const p of players.values()) {
          if (!p.arrow || p.arrow.gone) continue;
          const a = p.arrow;
          const score = Math.round(a.score);
          let text;
          if (a.dnf) text = "DNF";
          else if (a.finished) text = `✓ ${score}`;
          else text = `R${currentRound}  ${score}`;
          ctx.send(p.slot, {
            type: "hud",
            hp: Math.max(0, Math.min(100, a.score / 10)),
            text,
            down: a.dnf,
          });
        }
      }
    }

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