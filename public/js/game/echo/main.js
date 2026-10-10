// Echo — the classic memory game.
//
// Flow per round:
//   3-2-1-GO → sequence plays (one color at a time) → 3-2-1-GO → press
//
// Round 1 has 1 color. Each round one new color is appended. Wrong
// press or failing to finish in time = OUT. Score = rounds passed.
//
// Last survivor keeps going until they fail. Then a final scoreboard
// appears; every player taps once to start a fresh match. Plays 1-10
// players. Ghost mode: eliminated players can keep tapping for fun,
// but their presses don't count.

const TAU = Math.PI * 2;
const HEADER_H = 48;
const TIMER_STRIP_H = 38;
const BOARD_TOP = HEADER_H + TIMER_STRIP_H + 10;

const COUNTDOWN = 3.5;
const WATCH_LIT = 1.0;
const WATCH_GAP = 0.4;
const WATCH_CYCLE = WATCH_LIT + WATCH_GAP;
const PRESS_PER_COLOR = 3;         // seconds of input budget per color
const RESOLVE_PAUSE = 1.4;

// Palette — matches the site chrome.
const BG          = "#1e2246";
const BG_CELL     = "#232850";
const BG_HEADER   = "#1a1e3d";
const INK_LIGHT   = "#ffffff";
const MUTED       = "#8b93b8";
const FAINT       = "#5a6188";
const DIVIDER     = "rgba(255,255,255,0.08)";
const PILL_BG     = "rgba(91,141,239,0.16)";
const PILL_TEXT   = "#8ab4f8";
const GOLD        = "#ffb400";
const GREEN       = "#2fbf71";
const RED         = "#e5484d";

const COLORS = [
  { id: "blue",   hex: "#5b8def" },
  { id: "yellow", hex: "#ffb400" },
  { id: "green",  hex: "#2fbf71" },
  { id: "red",    hex: "#e5484d" },
];
const COLOR_INDEX = { blue: 0, yellow: 1, green: 2, red: 3 };

export function start(ctx) {
  const { root, signal } = ctx;
  const on = (t, type, fn) => t.addEventListener(type, fn, { signal });
  const rand = (n) => Math.floor(Math.random() * n);

  /* ---------------- display ---------------- */
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
  canvas.width = 1280; canvas.height = 720;
  Object.assign(canvas.style, {
    display: "block", maxWidth: "100%", maxHeight: "100%",
    aspectRatio: "16 / 9", background: BG,
    border: "0", padding: "0", margin: "0",
  });
  wrapEl.append(canvas);
  root.replaceChildren(wrapEl);
  const g = canvas.getContext("2d");

  /* ---------------- kill switch ---------------- */
  let exiting = false;
  let raf = 0;
  let last = performance.now();

  /* ---------------- state ---------------- */
  const players = new Map();
  let phase = "countdown";        // countdown | watch | press | resolve | results
  let countdownNext = "watch";    // what to do when the current countdown ends
  let countdownTimer = COUNTDOWN;
  let watchTimer = 0;
  let pressTimer = 0;
  let resolveTimer = 0;
  let round = 0;
  let sequence = [];
  let pendingRestart = new Set();

  function addPlayer(slot) {
    const existing = players.get(slot);
    if (existing) { existing.connected = true; return; }
    const info = ctx.player(slot);
    if (!info) return;
    players.set(slot, {
      slot, connected: true,
      alive: true,
      score: 0,
      inputIndex: 0,
      doneThisRound: true,
      lastSid: null,
      lastSeq: 0,
    });
  }

  ctx.players().forEach((p) => addPlayer(p.slot));

  on(window, "player-join", (e) => {
    if (exiting) return;
    addPlayer(e.detail.slot);
    ctx.send(e.detail.slot, { type: "echo-phase", phase: "wait", round });
  });

  on(window, "player-leave", (e) => {
    const p = players.get(e.detail.slot);
    if (!p) return;
    p.connected = false;
    if (phase === "press") checkPressEnd();
    if (phase === "results" && pendingRestart.has(e.detail.slot)) {
      pendingRestart.delete(e.detail.slot);
      maybeRestart();
    }
  });

  on(window, "controller-input", (e) => {
    if (exiting) return;
    const { slot, data } = e.detail;
    const p = players.get(slot);
    if (!p || !data || data.type !== "echo-press") return;

    const seq = data.seq | 0;
    if (data.sid !== p.lastSid) {
      p.lastSid = data.sid;
      p.lastSeq = seq;
      return;
    }
    if (seq <= p.lastSeq) return;
    p.lastSeq = seq;

    // Results phase: any press = "I'm ready to play again".
    if (phase === "results") {
      if (pendingRestart.has(slot)) {
        pendingRestart.delete(slot);
        ctx.send(slot, { type: "vibrate", ms: [20] });
        maybeRestart();
      }
      return;
    }

    if (phase !== "press") return;
    if (!p.alive || p.doneThisRound) return;

    const got = COLOR_INDEX[data.color];
    if (got === undefined) return;    // heartbeat or unknown — ignore

    const expected = sequence[p.inputIndex];
    if (got === expected) {
      p.inputIndex++;
      ctx.send(slot, { type: "vibrate", ms: 15 });
      if (p.inputIndex >= sequence.length) {
        p.score++;
        p.doneThisRound = true;
        ctx.send(slot, { type: "vibrate", ms: [30, 30, 30] });
      }
    } else {
      p.alive = false;
      p.doneThisRound = true;
      ctx.send(slot, { type: "vibrate", ms: [80, 40, 80] });
    }

    checkPressEnd();
  });

  /* ---------------- phases ---------------- */
  function beginRound() {
    round++;
    sequence.push(rand(4));

    for (const p of players.values()) {
      p.inputIndex = 0;
      p.doneThisRound = !p.alive;
      if (p.connected) {
        ctx.send(p.slot, {
          type: "echo-phase",
          phase: "wait",
          round,
          alive: p.alive,
        });
      }
    }

    phase = "countdown";
    countdownNext = "watch";
    countdownTimer = COUNTDOWN;
  }

  function beginWatch() {
    phase = "watch";
    watchTimer = 0;
    for (const p of players.values()) {
      if (p.connected) {
        ctx.send(p.slot, { type: "echo-phase", phase: "watch", round, alive: p.alive });
      }
    }
  }

  function beginPress() {
    phase = "press";
    pressTimer = PRESS_PER_COLOR * sequence.length;
    for (const p of players.values()) {
      if (!p.connected) continue;
      ctx.send(p.slot, {
        type: "echo-phase",
        phase: p.alive ? "press" : "ghost",
        round,
        alive: p.alive,
      });
    }
  }

  function endPress() {
    for (const p of players.values()) {
      if (p.alive && !p.doneThisRound) {
        p.alive = false;
        p.doneThisRound = true;
        ctx.send(p.slot, { type: "vibrate", ms: [80, 40, 80] });
        if (p.connected) ctx.send(p.slot, { type: "echo-phase", phase: "ghost", round, alive: false });
      }
    }

    phase = "resolve";
    resolveTimer = RESOLVE_PAUSE;
  }

  function checkPressEnd() {
    if (phase !== "press") return;
    const stillPlaying = [...players.values()].filter(
      (p) => p.connected && p.alive && !p.doneThisRound
    );
    if (stillPlaying.length === 0) endPress();
  }

  function afterResolve() {
    const anyoneAlive = [...players.values()].some((p) => p.connected && p.alive);
    if (!anyoneAlive) enterResults();
    else beginRound();
  }

  function enterResults() {
    phase = "results";
    let best = -1;
    for (const p of players.values()) {
      if (p.connected && p.score > best) best = p.score;
    }
    pendingRestart = new Set(
      [...players.values()].filter((p) => p.connected).map((p) => p.slot)
    );
    for (const p of players.values()) {
      if (!p.connected) continue;
      const isWinner = p.score === best;
      if (isWinner) ctx.send(p.slot, { type: "vibrate", ms: [120, 60, 120, 60, 240] });
      ctx.send(p.slot, { type: "echo-phase", phase: "results", round, alive: p.alive });
    }
  }

  function restartGame() {
    pendingRestart.clear();
    round = 0;
    sequence = [];
    for (const p of players.values()) {
      p.alive = true;
      p.score = 0;
      p.inputIndex = 0;
      p.doneThisRound = true;
    }
    beginRound();
  }

  function maybeRestart() {
    if (phase !== "results") return;
    if (pendingRestart.size > 0) return;
    if (![...players.values()].some((p) => p.connected)) return;
    restartGame();
  }

  beginRound();

  /* ---------------- update ---------------- */
  function update(dt) {
    if (exiting) return;

    if (phase === "countdown") {
      countdownTimer -= dt;
      if (countdownTimer <= 0) {
        if (countdownNext === "watch") beginWatch();
        else if (countdownNext === "press") beginPress();
      }
      return;
    }

    if (phase === "watch") {
      watchTimer += dt;
      if (watchTimer >= sequence.length * WATCH_CYCLE) {
        phase = "countdown";
        countdownNext = "press";
        countdownTimer = COUNTDOWN;
      }
      return;
    }

    if (phase === "press") {
      pressTimer -= dt;
      if (pressTimer <= 0) { pressTimer = 0; endPress(); }
      return;
    }

    if (phase === "resolve") {
      resolveTimer -= dt;
      if (resolveTimer <= 0) afterResolve();
      return;
    }
  }

  /* ---------------- drawing ---------------- */
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

  const BOARD = { x: 40, y: BOARD_TOP, w: 680, h: 610 };
  const PAD_GAP = 24;
  const PAD_W = (BOARD.w - PAD_GAP) / 2;
  const PAD_H = (BOARD.h - PAD_GAP) / 2;
  const PAD_POS = [
    { x: BOARD.x, y: BOARD.y },
    { x: BOARD.x + PAD_W + PAD_GAP, y: BOARD.y },
    { x: BOARD.x, y: BOARD.y + PAD_H + PAD_GAP },
    { x: BOARD.x + PAD_W + PAD_GAP, y: BOARD.y + PAD_H + PAD_GAP },
  ];

  function drawPad(pos, colorIdx, glow) {
    const c = COLORS[colorIdx];
    g.save();
    if (glow) {
      g.shadowColor = c.hex;
      g.shadowBlur = 50;
      g.fillStyle = c.hex;
      roundRect(pos.x, pos.y, PAD_W, PAD_H, 20);
      g.fill();
      g.shadowBlur = 0;
      const grd = g.createRadialGradient(
        pos.x + PAD_W / 2, pos.y + PAD_H / 2, 0,
        pos.x + PAD_W / 2, pos.y + PAD_H / 2, Math.max(PAD_W, PAD_H) / 2
      );
      grd.addColorStop(0, "rgba(255,255,255,0.35)");
      grd.addColorStop(1, "rgba(255,255,255,0)");
      g.fillStyle = grd;
      roundRect(pos.x, pos.y, PAD_W, PAD_H, 20);
      g.fill();
    } else {
      g.globalAlpha = 0.35;
      g.fillStyle = c.hex;
      roundRect(pos.x, pos.y, PAD_W, PAD_H, 20);
      g.fill();
      g.globalAlpha = 1;
    }
    g.restore();
  }

  function drawBoard() {
    for (let i = 0; i < 4; i++) {
      let glow = false;
      if (phase === "watch") {
        const idx = Math.floor(watchTimer / WATCH_CYCLE);
        const t = watchTimer % WATCH_CYCLE;
        if (idx < sequence.length && t < WATCH_LIT && sequence[idx] === i) glow = true;
      }
      drawPad(PAD_POS[i], i, glow);
    }
  }

  function drawPlayerList() {
    const LIST = { x: 760, y: BOARD_TOP, w: 480, h: 610 };
    const list = [...players.values()].filter((p) => p.connected);
    if (list.length === 0) return;

    const rowH = Math.min(64, LIST.h / list.length);

    list.forEach((p, i) => {
      const info = ctx.player(p.slot);
      const name = (info && info.name) || `P${p.slot + 1}`;
      const color = (info && info.color) || "#fff";
      const y = LIST.y + i * rowH;
      const h = rowH - 6;

      g.fillStyle = BG_CELL;
      roundRect(LIST.x, y, LIST.w, h, 12);
      g.fill();
      g.strokeStyle = DIVIDER;
      g.lineWidth = 1;
      roundRect(LIST.x + 0.5, y + 0.5, LIST.w - 1, h - 1, 12);
      g.stroke();

      const dotX = LIST.x + 22;
      const dotY = y + h / 2;
      g.fillStyle = color;
      g.beginPath();
      g.arc(dotX, dotY, 8, 0, TAU);
      g.fill();

      g.fillStyle = INK_LIGHT;
      g.font = "700 16px Fredoka, system-ui, sans-serif";
      g.textAlign = "left";
      g.textBaseline = "middle";
      g.fillText(name, LIST.x + 42, dotY);

      g.textAlign = "right";
      g.font = "800 20px Fredoka, system-ui, sans-serif";
      g.fillStyle = p.alive ? PILL_TEXT : FAINT;
      g.fillText(String(p.score), LIST.x + LIST.w - 16, dotY);

      g.textAlign = "left";
      g.font = "600 11px Fredoka, system-ui, sans-serif";
      if (!p.alive) {
        g.fillStyle = FAINT;
        g.fillText("OUT", LIST.x + 42, dotY + 18);
      } else if (phase === "press" && p.doneThisRound) {
        g.fillStyle = GREEN;
        g.fillText("PASSED", LIST.x + 42, dotY + 18);
      } else if (phase === "press" && p.inputIndex > 0) {
        g.fillStyle = PILL_TEXT;
        g.fillText(`${p.inputIndex} / ${sequence.length}`, LIST.x + 42, dotY + 18);
      }

      if (phase === "press" && p.alive) {
        const bw = LIST.w - 60;
        const bx = LIST.x + 42;
        const by = y + h - 6;
        g.fillStyle = "rgba(255,255,255,0.08)";
        roundRect(bx, by, bw, 3, 2);
        g.fill();
        const prog = Math.min(1, p.inputIndex / sequence.length);
        g.fillStyle = color;
        roundRect(bx, by, bw * prog, 3, 2);
        g.fill();
      }
    });
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
    g.fillText("ECHO", 20, HEADER_H / 2 + 1);

    const roundText = `Round ${Math.max(1, round)}`;
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

    const phaseLabel = {
      countdown: "GET READY",
      watch: "WATCH THE SEQUENCE",
      press: "PRESS NOW",
      resolve: "ROUND OVER",
      results: "FINAL RESULTS",
    }[phase] || "";
    g.fillStyle = FAINT;
    g.font = "700 13px Fredoka, system-ui, sans-serif";
    g.textAlign = "right";
    g.fillText(phaseLabel, canvas.width - 20, HEADER_H / 2 + 1);
  }

  function drawTimerStrip() {
    const y = HEADER_H;

    if (phase === "press") {
      const total = PRESS_PER_COLOR * sequence.length;
      const left = Math.max(0, pressTimer);
      const prog = total > 0 ? left / total : 0;
      g.fillStyle = "rgba(255,255,255,0.08)";
      g.fillRect(0, y, canvas.width, TIMER_STRIP_H);
      const barColor = prog > 0.5 ? GREEN : prog > 0.2 ? GOLD : RED;
      g.fillStyle = barColor;
      g.fillRect(0, y, canvas.width * prog, TIMER_STRIP_H);

      g.fillStyle = INK_LIGHT;
      g.font = "800 16px 'SF Mono', Menlo, Consolas, monospace";
      g.textAlign = "center";
      g.textBaseline = "middle";
      g.fillText(`${left.toFixed(1)} s left`, canvas.width / 2, y + TIMER_STRIP_H / 2);
    } else if (phase === "watch" || phase === "countdown") {
      g.fillStyle = "rgba(0,0,0,0.15)";
      g.fillRect(0, y, canvas.width, TIMER_STRIP_H);
      const msg = phase === "countdown"
        ? (countdownNext === "watch" ? "Get ready to watch…" : "Get ready to press…")
        : `Watching — ${sequence.length} color${sequence.length === 1 ? "" : "s"}`;
      g.fillStyle = MUTED;
      g.font = "600 14px Fredoka, system-ui, sans-serif";
      g.textAlign = "center";
      g.textBaseline = "middle";
      g.fillText(msg, canvas.width / 2, y + TIMER_STRIP_H / 2);
    } else if (phase === "resolve") {
      g.fillStyle = "rgba(0,0,0,0.15)";
      g.fillRect(0, y, canvas.width, TIMER_STRIP_H);
      g.fillStyle = MUTED;
      g.font = "600 14px Fredoka, system-ui, sans-serif";
      g.textAlign = "center";
      g.textBaseline = "middle";
      g.fillText("Round complete", canvas.width / 2, y + TIMER_STRIP_H / 2);
    }
  }

  function drawCountdownOverlay() {
    const W = canvas.width, H = canvas.height;
    g.fillStyle = "rgba(30,34,70,0.90)";
    g.fillRect(0, BOARD_TOP, W, H - BOARD_TOP);

    g.textAlign = "center";
    g.textBaseline = "middle";

    const t = countdownTimer;
    const txt = t > 2.5 ? "3" : t > 1.5 ? "2" : t > 0.5 ? "1" : "GO!";

    g.fillStyle = PILL_TEXT;
    g.font = "900 150px Fredoka, system-ui, sans-serif";
    g.fillText(txt, W / 2, H / 2 - 20);

    g.fillStyle = INK_LIGHT;
    g.font = "700 22px Fredoka, system-ui, sans-serif";
    const sub = countdownNext === "watch"
      ? "Watch the sequence carefully"
      : "Press the colors in order on your phone";
    g.fillText(sub, W / 2, H / 2 + 100);
  }

  function drawResults() {
    const W = canvas.width, H = canvas.height;
    g.fillStyle = BG;
    g.fillRect(0, 0, W, H);

    g.fillStyle = BG_HEADER;
    g.fillRect(0, 0, W, HEADER_H);
    g.strokeStyle = DIVIDER;
    g.beginPath();
    g.moveTo(0, HEADER_H + 0.5);
    g.lineTo(W, HEADER_H + 0.5);
    g.stroke();

    g.fillStyle = INK_LIGHT;
    g.font = "800 16px Fredoka, system-ui, sans-serif";
    g.textAlign = "left";
    g.textBaseline = "middle";
    g.fillText("ECHO", 20, HEADER_H / 2 + 1);

    g.textAlign = "center";
    g.font = "800 34px Fredoka, system-ui, sans-serif";
    g.fillText("Final Results", W / 2, HEADER_H + 40);

    const list = [...players.values()]
      .filter((p) => p.connected)
      .sort((a, b) => b.score - a.score);

    const best = list.length > 0 ? list[0].score : 0;
    const ready = list.filter((p) => !pendingRestart.has(p.slot)).length;
    const total = list.length;

    g.font = "600 14px Fredoka, system-ui, sans-serif";
    g.fillStyle = MUTED;
    g.fillText(`Tap any button to play again · ${ready} / ${total} ready`, W / 2, HEADER_H + 72);

    const rowH = Math.min(56, (H - HEADER_H - 180) / Math.max(1, list.length));
    const startY = HEADER_H + 110;

    list.forEach((p, i) => {
      const info = ctx.player(p.slot);
      const name = (info && info.name) || `P${p.slot + 1}`;
      const color = (info && info.color) || "#fff";
      const y = startY + i * rowH;
      const isWinner = p.score === best && best > 0;

      g.fillStyle = BG_CELL;
      roundRect(240, y, W - 480, rowH - 8, 12);
      g.fill();

      g.fillStyle = color;
      g.beginPath();
      g.arc(280, y + (rowH - 8) / 2, 9, 0, TAU);
      g.fill();

      g.textAlign = "left";
      g.font = (isWinner ? "800 " : "700 ") + "20px Fredoka, system-ui, sans-serif";
      g.fillStyle = INK_LIGHT;
      g.fillText((isWinner ? "🏆 " : "") + name, 300, y + (rowH - 8) / 2 + 1);

      g.textAlign = "right";
      g.font = "800 24px Fredoka, system-ui, sans-serif";
      g.fillStyle = isWinner ? GOLD : PILL_TEXT;
      g.fillText(String(p.score), W - 280, y + (rowH - 8) / 2 + 1);

      if (!pendingRestart.has(p.slot)) {
        g.fillStyle = GREEN;
        g.font = "800 18px Fredoka, system-ui, sans-serif";
        g.textAlign = "left";
        g.fillText("✓", W - 260, y + (rowH - 8) / 2 + 1);
      }
    });

    g.fillStyle = FAINT;
    g.font = "500 13px Fredoka, system-ui, sans-serif";
    g.textAlign = "center";
    g.fillText("Host: press Exit to leave the game", W / 2, H - 20);
  }

  function draw() {
    g.fillStyle = BG;
    g.fillRect(0, 0, canvas.width, canvas.height);

    if (phase === "results") { drawResults(); return; }

    drawHeader();
    drawTimerStrip();
    drawBoard();
    drawPlayerList();
    if (phase === "countdown") drawCountdownOverlay();
  }

  /* ---------------- main loop ---------------- */
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