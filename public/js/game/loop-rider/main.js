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
const HEADER_H = 56;

/* ---------------- localJoy-style playful dark palette ------------- */
const UI_BG         = "#2a2d4a";              // deep purple-navy page bg
const UI_BG_DEEP    = "#232644";              // header / darker areas
const UI_CARD_BG    = "#333659";              // panel background
const UI_CARD_BG2   = "#2f3255";              // secondary panel
const UI_CREAM      = "#f5f0e0";              // thick card border / warm off-white
const UI_CREAM_DIM  = "rgba(245,240,224,0.18)";
const UI_DIVIDER    = "#3d4166";
const UI_TEXT       = "#ffffff";
const UI_TEXT_MUTED = "#b8bdd9";
const UI_TEXT_FAINT = "#7c82a8";
const MAP_LOADING   = "#333659";
const ROUTE_BLUE    = "#4285f4";
const ROUTE_HALO    = "rgba(66,133,244,0.40)";
const ROUTE_CASING  = "#a8c7fa";
const START_RED     = "#e8615d";
const WIN_GOLD      = "#f5c542";
const READY_GREEN   = "#5cb85c";

const ACCENT_CORAL  = "#e8615d";
const ACCENT_BLUE   = "#4a90e2";
const ACCENT_GREEN  = "#5cb85c";
const ACCENT_YELLOW = "#f5c542";

const FONT_STACK = '"Nunito", ui-rounded, "SF Pro Rounded", "Quicksand", system-ui, -apple-system, "Segoe UI", sans-serif';

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

  const MAP_ASPECT = 16 / 9;
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

    if (state === "gameend") {
      if (pendingRestart.has(slot)) {
        pendingRestart.delete(slot);
        ctx.send(slot, { type: "vibrate", ms: [20] });
        maybeRestart();
      }
      return;
    }

    if (state !== "playing") return;

    if (p.arrow && !p.arrow.done && !p.arrow.gone) {
      p.arrow.pending -= dl;
      p.arrow.pending += dr;
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

  function maybeRestart() {
    if (state !== "gameend") return;
    if (pendingRestart.size > 0) return;
    const anyConnected = [...players.values()].some((p) => p.connected);
    if (!anyConnected) return;
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
    const color = (info && info.color) || ACCENT_BLUE;
    const name  = (info && info.name)  || `P${p.slot + 1}`;

    const inset = 7;
    const cX = r.x + inset;
    const cY = r.y + inset;
    const cW = r.w - inset * 2;
    const cH = r.h - inset * 2;
    const rad = 20;

    // Card shadow + fill
    g.save();
    g.shadowColor = "rgba(10, 8, 30, 0.55)";
    g.shadowBlur = 16;
    g.shadowOffsetY = 5;
    g.fillStyle = UI_CARD_BG;
    roundRect(cX, cY, cW, cH, rad);
    g.fill();
    g.restore();

    // Thick cream border (localJoy signature)
    g.strokeStyle = UI_CREAM;
    g.lineWidth = 4;
    roundRect(cX + 2, cY + 2, cW - 4, cH - 4, rad - 2);
    g.stroke();

    // Inner content
    const pad = 12;
    const innerX = cX + pad;
    const innerY = cY + pad;
    const innerW = cW - pad * 2;
    const innerH = cH - pad * 2;

    // ---- Top row: player chip + score ----
    const rowH = 36;
    const chipH = 30;
    const chipY = innerY + (rowH - chipH) / 2;

    // Name chip pill
    g.font = `800 15px ${FONT_STACK}`;
    const nameW = g.measureText(name).width;
    const chipW = Math.min(innerW * 0.55, nameW + 48);
    g.fillStyle = "rgba(0,0,0,0.28)";
    roundRect(innerX, chipY, chipW, chipH, chipH / 2);
    g.fill();

    // Color dot
    g.fillStyle = color;
    g.beginPath();
    g.arc(innerX + 17, innerY + rowH / 2, 8, 0, TAU);
    g.fill();

    // Name
    g.fillStyle = UI_CREAM;
    g.textAlign = "left";
    g.textBaseline = "middle";
    g.fillText(name, innerX + 32, innerY + rowH / 2 + 1, chipW - 40);

    // Score (right)
    const shownScore = p.arrow ? Math.round(p.arrow.score) : 0;
    g.font = `900 22px ${FONT_STACK}`;
    g.fillStyle = ACCENT_YELLOW;
    g.textAlign = "right";
    g.fillText(String(shownScore), innerX + innerW, innerY + rowH / 2 + 1);

    // ---- Map area ----
    const mapX = innerX;
    const mapY = innerY + rowH + 10;
    const mapW = innerW;
    const mapH = innerH - rowH - 10 - 22;
    if (mapW <= 0 || mapH <= 0) return;

    g.save();
    roundRect(mapX, mapY, mapW, mapH, 12);
    g.clip();

    drawMapCover(mapX, mapY, mapW, mapH);

    const side = Math.min(mapW, mapH);
    const ccx = mapX + mapW / 2;
    const ccy = mapY + mapH / 2;
    const scale = side / 2;

    if (loop) drawLoopAsRoute(loop, ccx, ccy, scale);

    const a = p.arrow;
    if (a && a.trail.length > 1) drawTrail(a, ccx, ccy, scale, color);
    if (a && !a.gone) drawNavArrow(ccx + a.x * scale, ccy + a.y * scale, a.heading, color);

    const vg = g.createRadialGradient(ccx, ccy, Math.min(mapW, mapH) * 0.45,
                                      ccx, ccy, Math.max(mapW, mapH) * 0.62);
    vg.addColorStop(0, "rgba(0,0,0,0)");
    vg.addColorStop(1, "rgba(20,15,40,0.35)");
    g.fillStyle = vg;
    g.fillRect(mapX, mapY, mapW, mapH);

    // Waiting overlay for players with no arrow yet
    if (!a) {
      g.fillStyle = "rgba(35,38,68,0.72)";
      g.fillRect(mapX, mapY, mapW, mapH);
      g.fillStyle = UI_CREAM;
      g.font = `800 15px ${FONT_STACK}`;
      g.textAlign = "center";
      g.textBaseline = "middle";
      g.fillText("Waiting for next round…", ccx, ccy);
    }

    g.restore();

    // ---- Progress bar ----
    const barY = innerY + innerH - 14;
    const barH = 8;
    g.fillStyle = "rgba(255,255,255,0.10)";
    roundRect(innerX, barY, innerW, barH, barH / 2);
    g.fill();
    if (a) {
      const prog = Math.min(1, a.progress / N);
      g.fillStyle = color;
      roundRect(innerX, barY, Math.max(0, innerW * prog), barH, barH / 2);
      g.fill();
    }

    // ---- Status chip ----
    if (a && a.done) {
      const label = a.dnf ? "DNF" : a.finished ? "FINISHED" : "TIME";
      const chipColor = a.dnf ? ACCENT_CORAL : a.finished ? ACCENT_GREEN : ACCENT_YELLOW;
      g.font = `900 12px ${FONT_STACK}`;
      const tw = g.measureText(label).width + 24;
      const chX = innerX + innerW - tw;
      const chY = innerY + rowH + 16;
      g.fillStyle = chipColor;
      roundRect(chX, chY, tw, 22, 11);
      g.fill();
      g.fillStyle = UI_BG_DEEP;
      g.textAlign = "center";
      g.textBaseline = "middle";
      g.fillText(label, chX + tw / 2, chY + 12);
    }
  }

  function drawHeader() {
    // Deep purple header bar
    g.fillStyle = UI_BG_DEEP;
    g.fillRect(0, 0, canvas.width, HEADER_H);

    // Cream bottom accent line
    g.fillStyle = UI_CREAM;
    g.fillRect(0, HEADER_H - 3, canvas.width, 3);

    // Playful multicolor title "Loop Rider"
    const title = "Loop Rider";
    const palette = [ACCENT_CORAL, ACCENT_BLUE, ACCENT_GREEN, ACCENT_YELLOW,
                     ACCENT_CORAL, ACCENT_BLUE, ACCENT_GREEN, ACCENT_YELLOW,
                     ACCENT_CORAL, ACCENT_BLUE];
    g.font = `900 22px ${FONT_STACK}`;
    g.textBaseline = "middle";
    g.textAlign = "left";
    let tx = 22;
    const ty = HEADER_H / 2;
    for (let i = 0; i < title.length; i++) {
      const ch = title[i];
      g.fillStyle = ch === " " ? UI_CREAM : palette[i % palette.length];
      g.fillText(ch, tx, ty);
      tx += g.measureText(ch).width;
    }

    // Round pill (yellow, right side)
    const label = `ROUND ${currentRound} / ${TOTAL_ROUNDS}`;
    g.font = `900 13px ${FONT_STACK}`;
    const tw = g.measureText(label).width;
    const pillW = tw + 30;
    const pillH = 28;
    const pillX = canvas.width - 22 - pillW;
    const pillY = (HEADER_H - pillH) / 2;
    g.fillStyle = ACCENT_YELLOW;
    roundRect(pillX, pillY, pillW, pillH, pillH / 2);
    g.fill();
    g.fillStyle = UI_BG_DEEP;
    g.textAlign = "center";
    g.textBaseline = "middle";
    g.fillText(label, pillX + pillW / 2, pillY + pillH / 2 + 1);
  }

  function drawCountdown() {
    const W = canvas.width, H = canvas.height;
    g.fillStyle = "rgba(35, 38, 68, 0.82)";
    g.fillRect(0, HEADER_H, W, H - HEADER_H);

    g.textAlign = "center";
    g.textBaseline = "middle";

    const t = stateTimer;
    const txt = t > 2.5 ? "3" : t > 1.5 ? "2" : t > 0.5 ? "1" : "GO!";

    // Big playful number with cream stroke
    const bigFont = txt === "GO!" ? 170 : 200;
    g.font = `900 ${bigFont}px ${FONT_STACK}`;
    g.lineWidth = 12;
    g.lineJoin = "round";
    g.strokeStyle = UI_CREAM;
    g.strokeText(txt, W / 2, H / 2 - 30);
    g.fillStyle = txt === "GO!" ? ACCENT_GREEN : ACCENT_CORAL;
    g.fillText(txt, W / 2, H / 2 - 30);

    // Subtitle pill
    const sub = "Tap or hold LEFT / RIGHT to steer";
    g.font = `900 20px ${FONT_STACK}`;
    const sw = g.measureText(sub).width;
    const pw = sw + 48;
    const ph = 44;
    const px = (W - pw) / 2;
    const py = H / 2 + 70;
    g.fillStyle = UI_CREAM;
    roundRect(px, py, pw, ph, ph / 2);
    g.fill();
    g.fillStyle = UI_BG_DEEP;
    g.fillText(sub, W / 2, py + ph / 2 + 1);

    // Hint line
    g.fillStyle = UI_TEXT_MUTED;
    g.font = `600 15px ${FONT_STACK}`;
    g.fillText("Stay on the blue route. Score = 1000 minus how far you drift.", W / 2, py + ph + 28);
  }

  function drawRoundEnd() {
    const W = canvas.width, H = canvas.height;
    g.fillStyle = "rgba(35, 38, 68, 0.94)";
    g.fillRect(0, HEADER_H, W, H - HEADER_H);

    // Cream-bordered card
    const cardW = 720, cardH = 500;
    const cardX = (W - cardW) / 2;
    const cardY = 110;

    g.save();
    g.shadowColor = "rgba(10, 8, 30, 0.6)";
    g.shadowBlur = 20;
    g.shadowOffsetY = 6;
    g.fillStyle = UI_CARD_BG;
    roundRect(cardX, cardY, cardW, cardH, 26);
    g.fill();
    g.restore();

    g.strokeStyle = UI_CREAM;
    g.lineWidth = 4;
    roundRect(cardX + 2, cardY + 2, cardW - 4, cardH - 4, 24);
    g.stroke();

    g.textAlign = "center";
    g.textBaseline = "middle";
    g.font = `900 34px ${FONT_STACK}`;
    g.fillStyle = UI_CREAM;
    g.fillText(`Round ${currentRound} complete`, W / 2, cardY + 72);

    const list = [...players.values()]
      .filter((p) => p.connected || p.arrow)
      .sort((a, b) => (b.score || 0) - (a.score || 0));

    const y0 = cardY + 160, dy = 58;
    list.forEach((p, i) => {
      const info = ctx.player(p.slot);
      const name = (info && info.name) || `P${p.slot + 1}`;
      const color = (info && info.color) || UI_TEXT;
      const y = y0 + i * dy;

      // Row pill
      g.fillStyle = "rgba(0,0,0,0.22)";
      roundRect(cardX + 40, y - 22, cardW - 80, 44, 22);
      g.fill();

      // Color dot
      g.fillStyle = color;
      g.beginPath();
      g.arc(cardX + 72, y, 9, 0, TAU);
      g.fill();

      // Name
      g.textAlign = "left";
      g.font = `800 22px ${FONT_STACK}`;
      g.fillStyle = UI_CREAM;
      g.fillText(name, cardX + 96, y + 1);

      // Score
      g.textAlign = "right";
      g.font = `900 26px ${FONT_STACK}`;
      g.fillStyle = ACCENT_YELLOW;
      g.fillText(String(p.roundScores[currentRound - 1] || 0), cardX + cardW - 84, y + 1);
    });
  }

  function drawGameEnd() {
    const W = canvas.width, H = canvas.height;
    g.fillStyle = "rgba(35, 38, 68, 0.96)";
    g.fillRect(0, HEADER_H, W, H - HEADER_H);

    g.textAlign = "center";
    g.textBaseline = "middle";
    g.font = `900 44px ${FONT_STACK}`;
    g.fillStyle = UI_CREAM;
    g.fillText("Final standings", W / 2, 96);

    g.font = `600 15px ${FONT_STACK}`;
    g.fillStyle = UI_TEXT_MUTED;
    g.fillText("Host: press Exit to leave  ·  Everyone else: tap any button to play again", W / 2, 134);

    const list = [...players.values()].sort((a, b) => (b.total || 0) - (a.total || 0));
    const y0 = 200, dy = 54;
    list.forEach((p, i) => {
      const info = ctx.player(p.slot);
      const name = (info && info.name) || `P${p.slot + 1}`;
      const color = (info && info.color) || UI_TEXT;
      const y = y0 + i * dy;
      const isWinner = winnerSlots.includes(p.slot);
      const ready = !pendingRestart.has(p.slot);

      // Row background
      g.fillStyle = isWinner ? "rgba(245,197,66,0.16)" : "rgba(0,0,0,0.22)";
      roundRect(W / 2 - 350, y - 23, 700, 46, 23);
      g.fill();
      if (isWinner) {
        g.strokeStyle = ACCENT_YELLOW;
        g.lineWidth = 2;
        roundRect(W / 2 - 349, y - 22, 698, 44, 22);
        g.stroke();
      }

      // Color dot
      g.fillStyle = color;
      g.beginPath();
      g.arc(W / 2 - 318, y, 11, 0, TAU);
      g.fill();

      // Name
      g.textAlign = "left";
      g.font = `${isWinner ? "900" : "800"} 24px ${FONT_STACK}`;
      g.fillStyle = UI_CREAM;
      g.fillText((isWinner ? "🏆 " : "") + name, W / 2 - 294, y + 1);

      // Score
      g.textAlign = "right";
      g.font = `900 28px ${FONT_STACK}`;
      g.fillStyle = isWinner ? ACCENT_YELLOW : UI_CREAM;
      g.fillText(String(p.total || 0), W / 2 + 200, y + 1);

      // Ready indicator
      if (p.connected) {
        g.textAlign = "center";
        g.font = `900 22px ${FONT_STACK}`;
        if (ready) {
          g.fillStyle = ACCENT_GREEN;
          g.fillText("✓", W / 2 + 250, y + 1);
        } else {
          g.fillStyle = UI_TEXT_FAINT;
          g.fillText("…", W / 2 + 250, y + 1);
        }
      }
    });

    // Bottom strip
    const total = pendingRestart.size;
    const were = [...players.values()].filter((p) => p.connected || p.arrow).length;
    const ready = Math.max(0, were - total);
    const stripY = H - 66;

    g.textAlign = "center";
    g.textBaseline = "middle";
    if (total === 0) {
      g.font = `900 22px ${FONT_STACK}`;
      g.fillStyle = ACCENT_GREEN;
      g.fillText("Everyone is ready — starting…", W / 2, stripY);
    } else {
      const label = `Tap any button to play again     ${ready} / ${were} ready`;
      g.font = `900 16px ${FONT_STACK}`;
      const tw = g.measureText(label).width;
      const pw = tw + 48;
      const ph = 42;
      const px = (W - pw) / 2;
      const py = stripY - ph / 2;
      g.fillStyle = ACCENT_CORAL;
      roundRect(px, py, pw, ph, ph / 2);
      g.fill();
      g.fillStyle = UI_CREAM;
      g.fillText(label, W / 2, stripY + 1);
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