// Rat Race — simultaneous fog-of-war maze escape.
//
// Rules:
//   * 1-6 players, everyone starts at the same cell
//   * one randomly generated maze per round, shared by all players
//   * each player has their own camera on the shared maze
//   * fog of war: only cells reachable through open corridors are visible
//   * the rat's colour is the temperature hint (red = hot, blue = freezing)
//   * other players appear as GREEN rats (identity hidden, you are the only
//     rat in your own slot colour)
//   * up to 3 green pills spawn in random DEAD-ENDS of the maze. Stepping
//     on one FREEZES every OTHER active player for a few seconds, based on
//     their own temperature bucket at that moment:
//        HOT 5s · WARM 4s · COOL 2s · COLD 1s · FREEZING 0s
//     The picker is never frozen by their own trap. Pill is removed.
//   * movement: joystick OR the Y/X/B/A buttons (Y = up, A = down,
//     X = left, B = right). Joystick wins if both are used.
//   * first rat to reach the CHEESE gets 1st place; 20 s window for the rest
//   * DNF for anyone still racing when the window closes
//   * 1-second compass pulse every 30 s for FREEZING players
//   * ready phase: everyone presses any button; then a brand new maze
//   * the game never exits on its own

const VIEW_W = 1280, VIEW_H = 720;
const MAZE_W = 21, MAZE_H = 15;
const START = { x: 1, y: 1 };
const VIS_DEPTH = 6;
const MOVE_SPEED = 5;
const COUNTDOWN_TIME = 3.2;
const DNF_WAIT = 20;
const COMPASS_PERIOD = 30;
const COMPASS_DURATION = 1;
const PILL_COUNT = 3;
const PILL_MIN_GAP = 5;
const PILL_START_CLEAR = 3;
const OTHER_RAT_COLOR = "#3ecf6e";

// Freeze duration in seconds by the victim's temperature bucket.
const FREEZE = {
  HOT: 5,
  WARM: 4,
  COOL: 2,
  COLD: 1,
  FREEZING: 0,
};

const BUTTON_DIR = {
  Y: "up",
  A: "down",
  X: "left",
  B: "right",
};

const lerp = (a, b, t) => a + (b - a) * t;

function ordinal(n) {
  const v = n % 100;
  const s = ["th", "st", "nd", "rd"];
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

function hexToRgb(hex) {
  if (!hex || hex[0] !== "#" || hex.length !== 7) return [136, 136, 136];
  return [
    parseInt(hex.slice(1, 3), 16),
    parseInt(hex.slice(3, 5), 16),
    parseInt(hex.slice(5, 7), 16),
  ];
}
const rgbaStr = ([r, g, b], a) => `rgba(${r},${g},${b},${a})`;

/* ---------------- Temperature colour scale ---------------- */
const HOT_RGB = [229, 72, 77];
const COLD_RGB = [59, 139, 255];

function tempBucket(ratio) {
  if (ratio < 0.15) return "HOT";
  if (ratio < 0.30) return "WARM";
  if (ratio < 0.55) return "COOL";
  if (ratio < 0.80) return "COLD";
  return "FREEZING";
}

function tempRGB(ratio) {
  const t = ({ HOT: 0, WARM: 0.25, COOL: 0.5, COLD: 0.75, FREEZING: 1 })[tempBucket(ratio)];
  return [
    Math.round(HOT_RGB[0] * (1 - t) + COLD_RGB[0] * t),
    Math.round(HOT_RGB[1] * (1 - t) + COLD_RGB[1] * t),
    Math.round(HOT_RGB[2] * (1 - t) + COLD_RGB[2] * t),
  ];
}
const rgbStr = ([r, g, b]) => `rgb(${r},${g},${b})`;

/* ---------------- Maze ---------------- */
function generateMaze(w, h) {
  const cells = [];
  for (let y = 0; y < h; y++) {
    const row = [];
    for (let x = 0; x < w; x++) row.push({ n: true, e: true, s: true, w: true, vis: false });
    cells.push(row);
  }
  const stack = [{ x: 1, y: 1 }];
  cells[1][1].vis = true;
  const dirs = [
    { dx: 0, dy: -1, wall: "n", opp: "s" },
    { dx: 1, dy: 0, wall: "e", opp: "w" },
    { dx: 0, dy: 1, wall: "s", opp: "n" },
    { dx: -1, dy: 0, wall: "w", opp: "e" },
  ];
  while (stack.length) {
    const cur = stack[stack.length - 1];
    const nbrs = [];
    for (const d of dirs) {
      const nx = cur.x + d.dx, ny = cur.y + d.dy;
      if (nx <= 0 || ny <= 0 || nx >= w - 1 || ny >= h - 1) continue;
      if (cells[ny][nx].vis) continue;
      nbrs.push({ nx, ny, d });
    }
    if (!nbrs.length) { stack.pop(); continue; }
    const { nx, ny, d } = nbrs[(Math.random() * nbrs.length) | 0];
    cells[cur.y][cur.x][d.wall] = false;
    cells[ny][nx][d.opp] = false;
    cells[ny][nx].vis = true;
    stack.push({ x: nx, y: ny });
  }
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) cells[y][x].vis = false;
  return { w, h, cells };
}

function bfsDistances(maze, from) {
  const dist = [];
  for (let y = 0; y < maze.h; y++) dist.push(new Array(maze.w).fill(-1));
  dist[from.y][from.x] = 0;
  const q = [{ x: from.x, y: from.y }];
  const dirs = [
    { dx: 0, dy: -1, wall: "n" },
    { dx: 1, dy: 0, wall: "e" },
    { dx: 0, dy: 1, wall: "s" },
    { dx: -1, dy: 0, wall: "w" },
  ];
  while (q.length) {
    const { x, y } = q.shift();
    const cell = maze.cells[y][x];
    const d = dist[y][x];
    for (const dir of dirs) {
      if (cell[dir.wall]) continue;
      const nx = x + dir.dx, ny = y + dir.dy;
      if (dist[ny][nx] !== -1) continue;
      dist[ny][nx] = d + 1;
      q.push({ x: nx, y: ny });
    }
  }
  return dist;
}

function visibleCells(maze, cx, cy, maxDepth) {
  const set = new Set();
  const map = new Map();
  const k = (x, y) => x * 1000 + y;
  set.add(k(cx, cy));
  map.set(k(cx, cy), 0);
  const q = [[cx, cy, 0]];
  const dirs = [[0, -1, "n"], [1, 0, "e"], [0, 1, "s"], [-1, 0, "w"]];
  while (q.length) {
    const [x, y, d] = q.shift();
    if (d >= maxDepth) continue;
    const cell = maze.cells[y][x];
    for (const [dx, dy, wall] of dirs) {
      if (cell[wall]) continue;
      const nx = x + dx, ny = y + dy;
      const kk = k(nx, ny);
      if (set.has(kk)) continue;
      set.add(kk);
      map.set(kk, d + 1);
      q.push([nx, ny, d + 1]);
    }
  }
  return { set, map };
}

function exitDirection(maze, distToExit, x, y) {
  if (distToExit[y][x] <= 0) return null;
  const cell = maze.cells[y][x];
  const dirs = [
    { dx: 0, dy: -1, wall: "n", dir: "n" },
    { dx: 1, dy: 0,  wall: "e", dir: "e" },
    { dx: 0, dy: 1,  wall: "s", dir: "s" },
    { dx: -1, dy: 0, wall: "w", dir: "w" },
  ];
  let best = null;
  for (const d of dirs) {
    if (cell[d.wall]) continue;
    const nx = x + d.dx, ny = y + d.dy;
    const nd = distToExit[ny]?.[nx] ?? -1;
    if (nd < 0) continue;
    if (best === null || nd < best.nd) best = { nd, dir: d.dir };
  }
  return best ? best.dir : null;
}

/* ---------------- Green pill placement (any dead-end) ---------------- */
function isDeadEnd(cell) {
  let openings = 0;
  if (!cell.n) openings++;
  if (!cell.s) openings++;
  if (!cell.e) openings++;
  if (!cell.w) openings++;
  return openings === 1;
}

function generatePills(maze, distToExit, maxDist, count) {
  const all = [];
  for (let y = 1; y < maze.h - 1; y++) {
    for (let x = 1; x < maze.w - 1; x++) {
      const d = distToExit[y][x];
      if (d < 0) continue;
      if (Math.abs(x - START.x) + Math.abs(y - START.y) < PILL_START_CLEAR) continue;
      all.push({ x, y, d, dead: isDeadEnd(maze.cells[y][x]) });
    }
  }
  if (!all.length) return [];

  const deadEnds = all.filter((c) => c.dead);
  const pool = deadEnds.length > 0
    ? deadEnds
    : all.slice().sort((a, b) => b.d - a.d).slice(0, Math.max(count, 8));

  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }

  const pills = [];
  for (const c of pool) {
    if (pills.length >= count) break;
    if (pills.some((p) => Math.abs(p.x - c.x) + Math.abs(p.y - c.y) < PILL_MIN_GAP)) continue;
    pills.push({ x: c.x, y: c.y });
  }
  return pills;
}

/* ---------------- Rat mascot ---------------- */
function drawRat(g, cx, cy, r, dir, color) {
  const angle = ({ n: -Math.PI / 2, e: 0, s: Math.PI / 2, w: Math.PI })[dir] ?? 0;
  g.save();
  g.translate(cx, cy);
  g.rotate(angle);

  const bodyRX = r * 0.95, bodyRY = r * 0.78;
  const headR = r * 0.58, headX = r * 0.68;
  const earR = r * 0.32, earInnerR = r * 0.16;

  g.strokeStyle = color;
  g.lineWidth = r * 0.16;
  g.lineCap = "round";
  g.beginPath();
  g.moveTo(-bodyRX * 0.9, 0);
  g.quadraticCurveTo(-bodyRX * 1.7, -bodyRY * 0.6, -bodyRX * 1.4, -bodyRY * 1.1);
  g.stroke();

  g.fillStyle = color;
  g.beginPath(); g.arc(headX - r * 0.1, -r * 0.62, earR, 0, Math.PI * 2); g.fill();
  g.beginPath(); g.arc(headX - r * 0.1,  r * 0.62, earR, 0, Math.PI * 2); g.fill();

  g.beginPath(); g.ellipse(0, 0, bodyRX, bodyRY, 0, 0, Math.PI * 2); g.fill();
  g.beginPath(); g.arc(headX, 0, headR, 0, Math.PI * 2); g.fill();

  g.fillStyle = "#ffb8c8";
  g.beginPath(); g.arc(headX - r * 0.1, -r * 0.62, earInnerR, 0, Math.PI * 2); g.fill();
  g.beginPath(); g.arc(headX - r * 0.1,  r * 0.62, earInnerR, 0, Math.PI * 2); g.fill();

  g.fillStyle = "#10202b";
  g.beginPath(); g.arc(headX + headR * 0.25, -headR * 0.35, r * 0.13, 0, Math.PI * 2); g.fill();
  g.beginPath(); g.arc(headX + headR * 0.25,  headR * 0.35, r * 0.13, 0, Math.PI * 2); g.fill();
  g.fillStyle = "rgba(255,255,255,0.85)";
  g.beginPath(); g.arc(headX + headR * 0.32, -headR * 0.42, r * 0.05, 0, Math.PI * 2); g.fill();
  g.beginPath(); g.arc(headX + headR * 0.32,  headR * 0.28, r * 0.05, 0, Math.PI * 2); g.fill();

  g.fillStyle = "#ff8fa8";
  g.beginPath(); g.arc(headX + headR * 0.9, 0, r * 0.11, 0, Math.PI * 2); g.fill();

  g.strokeStyle = "rgba(16,32,43,0.45)";
  g.lineWidth = r * 0.04;
  g.beginPath();
  g.moveTo(headX + headR * 0.7, -r * 0.15);
  g.lineTo(headX + headR * 1.55, -r * 0.4);
  g.moveTo(headX + headR * 0.7, r * 0.15);
  g.lineTo(headX + headR * 1.55, r * 0.4);
  g.stroke();

  g.restore();
}

/* ---------------- Green pill visual ---------------- */
function drawPill(g, cx, cy, s) {
  g.save();
  g.translate(cx, cy);
  g.rotate(-Math.PI / 5);

  const w = s * 0.55;
  const h = s * 1.05;
  const r = w / 2;
  const x = -w / 2, y = -h / 2;

  const glow = g.createRadialGradient(0, 0, 0, 0, 0, s * 1.8);
  glow.addColorStop(0, "rgba(62,207,110,0.55)");
  glow.addColorStop(1, "rgba(62,207,110,0)");
  g.fillStyle = glow;
  g.fillRect(-s * 1.8, -s * 1.8, s * 3.6, s * 3.6);

  g.fillStyle = "#3ecf6e";
  g.beginPath();
  g.moveTo(x + r, y);
  g.lineTo(x + w - r, y);
  g.arc(x + w - r, y + r, r, -Math.PI / 2, 0);
  g.lineTo(x + w, y + h - r);
  g.arc(x + w - r, y + h - r, r, 0, Math.PI / 2);
  g.lineTo(x + r, y + h);
  g.arc(x + r, y + h - r, r, Math.PI / 2, Math.PI);
  g.lineTo(x, y + r);
  g.arc(x + r, y + r, r, Math.PI, Math.PI * 1.5);
  g.closePath();
  g.fill();

  g.strokeStyle = "rgba(16,32,43,0.55)";
  g.lineWidth = 2;
  g.stroke();

  g.strokeStyle = "rgba(255,255,255,0.75)";
  g.lineWidth = 2;
  g.beginPath();
  g.moveTo(x + 1, 0);
  g.lineTo(x + w - 1, 0);
  g.stroke();

  g.fillStyle = "rgba(255,255,255,0.65)";
  g.beginPath();
  g.ellipse(x + w * 0.28, y + h * 0.22, w * 0.16, h * 0.09, 0, 0, Math.PI * 2);
  g.fill();

  g.restore();
}

/* ---------------- Cheese visual (the exit) ---------------- */
function drawCheese(g, cx, cy, s) {
  g.save();
  g.translate(cx, cy);

  const glow = g.createRadialGradient(0, 0, 0, 0, 0, s * 2.4);
  glow.addColorStop(0, "rgba(255,200,80,0.7)");
  glow.addColorStop(1, "rgba(255,200,80,0)");
  g.fillStyle = glow;
  g.fillRect(-s * 2.4, -s * 2.4, s * 4.8, s * 4.8);

  const w = s * 1.0;
  const h = s * 1.1;
  g.beginPath();
  g.moveTo(-w, h * 0.55);
  g.lineTo(w, h * 0.55);
  g.lineTo(w * 0.30, -h * 0.75);
  g.closePath();

  g.fillStyle = "#ffc850";
  g.fill();

  g.save();
  g.clip();
  g.fillStyle = "#e2a830";
  g.fillRect(-w, h * 0.30, w * 2, h);
  g.restore();

  g.strokeStyle = "#b07a12";
  g.lineWidth = Math.max(2, s * 0.09);
  g.lineJoin = "round";
  g.beginPath();
  g.moveTo(-w, h * 0.55);
  g.lineTo(w, h * 0.55);
  g.lineTo(w * 0.30, -h * 0.75);
  g.closePath();
  g.stroke();

  const holes = [
    [-w * 0.35, h * 0.25, s * 0.13],
    [ w * 0.30, h * 0.18, s * 0.10],
    [-w * 0.05, -h * 0.05, s * 0.09],
    [ w * 0.05, h * 0.42, s * 0.07],
  ];
  g.fillStyle = "#c99120";
  for (const [hx, hy, hr] of holes) {
    g.beginPath(); g.arc(hx, hy, hr, 0, Math.PI * 2); g.fill();
  }

  g.fillStyle = "rgba(255,255,255,0.55)";
  g.beginPath();
  g.moveTo(-w * 0.75, h * 0.45);
  g.lineTo(-w * 0.10, h * 0.45);
  g.lineTo(-w * 0.30, -h * 0.10);
  g.closePath();
  g.fill();

  g.restore();
}

function getLayout(n) {
  if (n <= 1) return [1, 1];
  if (n === 2) return [1, 2];
  if (n <= 4) return [2, 2];
  return [2, 3];
}

/* ---------------- Entry point ---------------- */
export function start(ctx) {
  const { root, signal } = ctx;

  const style = document.createElement("style");
  style.textContent = `
    .ratrace { width: 100%; height: 100%; display: flex; align-items: center; justify-content: center; background: #0e1a24; }
    .ratrace canvas { max-width: 100%; max-height: 100%; display: block; border-radius: 12px; }
  `;
  document.head.append(style);

  const canvas = document.createElement("canvas");
  canvas.width = VIEW_W; canvas.height = VIEW_H;
  const g = canvas.getContext("2d");
  const wrap = document.createElement("div");
  wrap.className = "ratrace";
  wrap.append(canvas);
  root.replaceChildren(wrap);

  const players = new Map();
  const inputs = new Map();
  const dpad = new Map();

  let maze = null;
  let exit = { x: 1, y: 1 };
  let distToExit = null;
  let maxDist = 1;
  let pills = [];

  let phase = "countdown";
  let countdown = COUNTDOWN_TIME;
  let elapsed = 0;
  let raceStartElapsed = 0;
  let raceEndElapsed = null;
  let nextCompassAt = Infinity;
  let shockwaveUntil = -Infinity;
  const finishers = [];

  let raf = 0;
  let last = performance.now();

  function makePlayer(slot) {
    return {
      slot,
      cellX: START.x, cellY: START.y,
      prevX: START.x, prevY: START.y,
      t: 1,
      dir: "s",
      active: false,
      ready: false,
      finished: false,
      dnf: false,
      place: 0,
      finishTime: 0,
      lastHint: "",
      compassUntil: -Infinity,
      pickupFlash: -Infinity,
      noPickupUntil: -Infinity,
      frozenUntil: -Infinity,
    };
  }

  function resetPlayer(p) {
    p.cellX = START.x; p.cellY = START.y;
    p.prevX = START.x; p.prevY = START.y;
    p.t = 1;
    p.dir = "s";
    p.finished = false;
    p.dnf = false;
    p.place = 0;
    p.finishTime = 0;
    p.ready = false;
    p.lastHint = "";
    p.compassUntil = -Infinity;
    p.pickupFlash = -Infinity;
    p.noPickupUntil = -Infinity;
    p.frozenUntil = -Infinity;
  }

  function newRound() {
    maze = generateMaze(MAZE_W, MAZE_H);
    const fromStart = bfsDistances(maze, START);
    let best = 0;
    exit = { x: START.x, y: START.y };
    for (let y = 1; y < maze.h - 1; y++) {
      for (let x = 1; x < maze.w - 1; x++) {
        if (fromStart[y][x] > best) {
          best = fromStart[y][x];
          exit = { x, y };
        }
      }
    }
    distToExit = bfsDistances(maze, exit);
    maxDist = Math.max(1, best);

    pills = generatePills(maze, distToExit, maxDist, PILL_COUNT);

    for (const p of players.values()) {
      resetPlayer(p);
      p.active = true;
    }
    inputs.clear();
    dpad.clear();
    countdown = COUNTDOWN_TIME;
    elapsed = 0;
    raceStartElapsed = 0;
    raceEndElapsed = null;
    nextCompassAt = Infinity;
    shockwaveUntil = -Infinity;
    finishers.length = 0;
    phase = "countdown";
  }

  newRound();
  ctx.players().forEach((p) => {
    const pl = makePlayer(p.slot);
    pl.active = true;
    players.set(p.slot, pl);
  });

  const on = (t, type, fn) => t.addEventListener(type, fn, { signal });

  on(window, "player-join", (e) => {
    const pl = makePlayer(e.detail.slot);
    if (phase === "race") {
      pl.active = false;
      ctx.send(e.detail.slot, { type: "hud", text: "Waiting for next round" });
    } else if (phase === "ready") {
      pl.active = true;
      pl.ready = true;
    } else {
      pl.active = true;
    }
    players.set(e.detail.slot, pl);
  });

  on(window, "player-leave", (e) => {
    players.delete(e.detail.slot);
    inputs.delete(e.detail.slot);
    dpad.delete(e.detail.slot);
  });

  on(window, "controller-input", (e) => {
    const { slot, data } = e.detail;
    if (!data) return;

    if (data.type === "move") {
      inputs.set(slot, { x: data.x, y: data.y });
      return;
    }

    if (data.type === "button") {
      if (phase === "ready" && data.pressed) {
        const p = players.get(slot);
        if (p) p.ready = true;
      }
      const dirKey = BUTTON_DIR[data.id];
      if (dirKey) {
        let d = dpad.get(slot);
        if (!d) { d = { up: false, down: false, left: false, right: false }; dpad.set(slot, d); }
        d[dirKey] = !!data.pressed;
      }
    }
  });

  function readInput(p) {
    const stick = inputs.get(p.slot);
    if (stick && Math.hypot(stick.x, stick.y) >= 0.4) {
      return { x: stick.x, y: stick.y };
    }
    const d = dpad.get(p.slot);
    if (d) {
      const x = (d.right ? 1 : 0) - (d.left ? 1 : 0);
      const y = (d.down ? 1 : 0) - (d.up ? 1 : 0);
      if (x !== 0 || y !== 0) return { x, y };
    }
    return null;
  }

  function tryMove(p) {
    if (p.finished || p.dnf) return;
    if (elapsed < p.frozenUntil) return;   // frozen by a pill — no movement
    const input = readInput(p);
    if (!input) return;
    const { x, y } = input;

    let dir;
    if (Math.abs(x) >= Math.abs(y)) dir = x > 0 ? "e" : "w";
    else                            dir = y > 0 ? "s" : "n";

    p.dir = dir;
    const cell = maze.cells[p.cellY][p.cellX];
    if (cell[dir]) return;

    const nx = p.cellX + (dir === "e" ? 1 : dir === "w" ? -1 : 0);
    const ny = p.cellY + (dir === "s" ? 1 : dir === "n" ? -1 : 0);

    p.prevX = p.cellX; p.prevY = p.cellY;
    p.cellX = nx; p.cellY = ny;
    p.t = 0;
  }

  function movePlayer(p, dt) {
    if (p.t < 1) {
      p.t = Math.min(1, p.t + dt * MOVE_SPEED);
      return;
    }
    if (p.active) tryMove(p);
  }

  // ---- Pill pickup (global freeze trap) ----
  function checkPillPickup(p) {
    if (!p.active || p.finished || p.dnf) return;
    if (elapsed < p.noPickupUntil) return;
    if (elapsed < p.frozenUntil) return;   // can't pick up while frozen
    const idx = pills.findIndex((pl) => pl.x === p.cellX && pl.y === p.cellY);
    if (idx === -1) return;

    pills.splice(idx, 1);

    // Freeze every OTHER active player for a duration set by their own
    // temperature bucket. The picker is never affected by their own trap.
    let anyFrozen = false;
    for (const q of players.values()) {
      if (q === p) continue;                     // picker is immune
      if (!q.active || q.finished || q.dnf) continue;
      const d = distToExit[q.cellY]?.[q.cellX] ?? -1;
      if (d < 0) continue;
      const bucket = tempBucket(d / maxDist);
      const secs = FREEZE[bucket] ?? 0;
      if (secs <= 0) continue;

      // Extend rather than overwrite if they were already frozen.
      const base = Math.max(elapsed, q.frozenUntil);
      q.frozenUntil = base + secs;
      q.pickupFlash = elapsed + 0.6;
      ctx.send(q.slot, { type: "vibrate", ms: [80, 40, 80, 40, 80] });
      anyFrozen = true;
    }

    // The picker always gets feedback, even if nobody was frozen.
    if (elapsed >= p.pickupFlash) {
      p.pickupFlash = elapsed + 0.6;
      p.noPickupUntil = elapsed + 0.2;
      ctx.send(p.slot, { type: "vibrate", ms: [80, 40, 80, 40, 80] });
    }

    if (anyFrozen) shockwaveUntil = elapsed + 0.7;
  }

  // Phone HUD text.
  function hintFor(p) {
    if (phase === "countdown") return "Get ready";
    if (phase === "ready") {
      const readyCount = [...players.values()].filter((x) => x.ready).length;
      if (p.finished) return `${ordinal(p.place)} place - press any button`;
      if (p.dnf)      return "DNF - press any button";
      return `Press any button (${readyCount}/${players.size})`;
    }
    if (!p.active) return "Waiting for next round";
    if (p.finished) return `${ordinal(p.place)} place - ${p.finishTime.toFixed(2)}s`;
    if (p.dnf)      return "DNF";
    if (elapsed < p.frozenUntil) {
      const remain = Math.max(0, p.frozenUntil - elapsed);
      return `FROZEN ${remain.toFixed(1)}s`;
    }
    return "";
  }

  function updateHud(force) {
    for (const p of players.values()) {
      const text = hintFor(p);
      if (force || p.lastHint !== text) {
        p.lastHint = text;
        ctx.send(p.slot, { type: "hud", text });
      }
    }
  }

  function update(dt) {
    elapsed += dt;

    if (phase === "countdown") {
      countdown = Math.max(0, countdown - dt);
      if (countdown === 0) {
        phase = "race";
        raceStartElapsed = elapsed;
        nextCompassAt = raceStartElapsed + COMPASS_PERIOD;
      }
      updateHud();
      return;
    }

    if (phase === "race") {
      for (const p of players.values()) if (p.active && !p.finished && !p.dnf) movePlayer(p, dt);

      // Compass pulse for FREEZING players
      if (elapsed >= nextCompassAt) {
        for (const p of players.values()) {
          if (!p.active || p.finished || p.dnf) continue;
          const d = distToExit[p.cellY]?.[p.cellX] ?? -1;
          if (d < 0) continue;
          if (tempBucket(d / maxDist) === "FREEZING") {
            p.compassUntil = elapsed + COMPASS_DURATION;
            ctx.send(p.slot, { type: "vibrate", ms: 45 });
          }
        }
        nextCompassAt += COMPASS_PERIOD;
      }

      // Pill pickups
      for (const p of players.values()) checkPillPickup(p);

      // Exit detection
      for (const p of players.values()) {
        if (!p.active || p.finished || p.dnf) continue;
        if (p.cellX === exit.x && p.cellY === exit.y) {
          p.finished = true;
          p.place = finishers.length + 1;
          p.finishTime = elapsed - raceStartElapsed;
          finishers.push(p.slot);
          if (raceEndElapsed === null) raceEndElapsed = elapsed + DNF_WAIT;
          ctx.send(p.slot, { type: "vibrate", ms: [120, 60, 180] });
        }
      }

      const activeList = [...players.values()].filter((p) => p.active);
      const allDone = activeList.length > 0 && activeList.every((p) => p.finished);
      const timeUp = raceEndElapsed !== null && elapsed >= raceEndElapsed;

      if (allDone || timeUp) {
        for (const p of players.values()) {
          if (p.active && !p.finished) {
            p.dnf = true;
            ctx.send(p.slot, { type: "vibrate", ms: [80, 60, 80] });
          }
        }
        phase = "ready";
        for (const p of players.values()) p.ready = false;
        updateHud(true);
        return;
      }

      updateHud();
      return;
    }

    if (phase === "ready") {
      let allReady = players.size > 0;
      for (const p of players.values()) if (!p.ready) { allReady = false; break; }
      if (allReady) { newRound(); updateHud(true); }
      else updateHud();
      return;
    }
  }

  /* ---------------- Cards ---------------- */
  function drawWinnerCard(vp, p) {
    const info = ctx.player(p.slot);
    const color = info ? info.color : "#3b8bff";
    const name = info ? info.name : "Player";
    const cx = vp.x + vp.w / 2;
    const cy = vp.y + vp.h / 2;

    g.save();
    g.beginPath(); g.rect(vp.x, vp.y, vp.w, vp.h); g.clip();
    g.fillStyle = "#0a1420";
    g.fillRect(vp.x, vp.y, vp.w, vp.h);

    const rg = g.createRadialGradient(cx, cy, 0, cx, cy, Math.max(vp.w, vp.h) * 0.7);
    rg.addColorStop(0, rgbaStr(hexToRgb(color), 0.55));
    rg.addColorStop(0.6, rgbaStr(hexToRgb(color), 0.15));
    rg.addColorStop(1, rgbaStr(hexToRgb(color), 0));
    g.fillStyle = rg;
    g.fillRect(vp.x, vp.y, vp.w, vp.h);

    const ratR = Math.min(vp.w, vp.h) * 0.13;
    drawRat(g, cx, cy - vp.h * 0.30, ratR, "e", color);

    const cheeseSize = Math.min(vp.w, vp.h) * 0.055;
    drawCheese(g, cx, cy + vp.h * 0.055, cheeseSize);

    const fs1 = Math.min(vp.w * 0.16, vp.h * 0.22);
    g.textAlign = "center"; g.textBaseline = "middle";
    g.font = `800 ${fs1}px Fredoka, system-ui, sans-serif`;
    g.fillStyle = "#e6f4fb";
    g.fillText(ordinal(p.place).toUpperCase(), cx, cy + vp.h * 0.14);

    const fs2 = Math.min(vp.w * 0.09, vp.h * 0.09);
    g.font = `700 ${fs2}px Fredoka, system-ui, sans-serif`;
    g.fillStyle = color;
    g.fillText(name, cx, cy + vp.h * 0.26);

    const fs3 = Math.min(vp.w * 0.055, vp.h * 0.055);
    g.font = `600 ${fs3}px Fredoka, system-ui, sans-serif`;
    g.fillStyle = "#c9d6e0";
    g.fillText(`${p.finishTime.toFixed(2)} s`, cx, cy + vp.h * 0.36);

    g.strokeStyle = rgbaStr(hexToRgb(color), 0.85);
    g.lineWidth = 4;
    g.strokeRect(vp.x + 3, vp.y + 3, vp.w - 6, vp.h - 6);
    g.restore();
  }

  function drawDnfCard(vp, p) {
    const info = ctx.player(p.slot);
    const name = info ? info.name : "Player";
    const color = info ? info.color : "#5a7a95";
    const cx = vp.x + vp.w / 2;
    const cy = vp.y + vp.h / 2;

    g.save();
    g.beginPath(); g.rect(vp.x, vp.y, vp.w, vp.h); g.clip();
    g.fillStyle = "#0a1420";
    g.fillRect(vp.x, vp.y, vp.w, vp.h);

    const fs1 = Math.min(vp.w * 0.22, vp.h * 0.28);
    g.textAlign = "center"; g.textBaseline = "middle";
    g.font = `800 ${fs1}px Fredoka, system-ui, sans-serif`;
    g.fillStyle = "#e5484d";
    g.fillText("DNF", cx, cy - vp.h * 0.06);

    const fs2 = Math.min(vp.w * 0.08, vp.h * 0.08);
    g.font = `700 ${fs2}px Fredoka, system-ui, sans-serif`;
    g.fillStyle = color;
    g.fillText(name, cx, cy + vp.h * 0.18);

    const fs3 = Math.min(vp.w * 0.045, vp.h * 0.045);
    g.font = `600 ${fs3}px Fredoka, system-ui, sans-serif`;
    g.fillStyle = "#5a7a95";
    g.fillText("Did not finish", cx, cy + vp.h * 0.30);

    g.strokeStyle = "rgba(229,72,77,0.6)";
    g.lineWidth = 3;
    g.strokeRect(vp.x + 3, vp.y + 3, vp.w - 6, vp.h - 6);
    g.restore();
  }

  /* ---------------- Viewport ---------------- */
  function renderViewport(vp, p) {
    if (p.finished) { drawWinnerCard(vp, p); return; }
    if (p.dnf)      { drawDnfCard(vp, p); return; }

    g.save();
    g.beginPath(); g.rect(vp.x, vp.y, vp.w, vp.h); g.clip();
    g.fillStyle = "#080e16";
    g.fillRect(vp.x, vp.y, vp.w, vp.h);

    const cellPx = Math.min(vp.w / 11, vp.h / 9);
    const px = lerp(p.prevX, p.cellX, p.t);
    const py = lerp(p.prevY, p.cellY, p.t);
    const cellsAcross = vp.w / cellPx;
    const cellsDown = vp.h / cellPx;
    const wx0 = px - cellsAcross / 2;
    const wy0 = py - cellsDown / 2;

    const w2sX = (wx) => vp.x + (wx - wx0) * cellPx;
    const w2sY = (wy) => vp.y + (wy - wy0) * cellPx;

    const vis = visibleCells(maze, p.cellX, p.cellY, VIS_DEPTH);
    const exitK = exit.x * 1000 + exit.y;

    for (const k of vis.set) {
      const x = Math.floor(k / 1000);
      const y = k % 1000;
      const d = vis.map.get(k);
      const sx = w2sX(x), sy = w2sY(y);
      if (sx + cellPx < vp.x || sx > vp.x + vp.w) continue;
      if (sy + cellPx < vp.y || sy > vp.y + vp.h) continue;
      const a = Math.max(0.35, 1 - (d / VIS_DEPTH) * 0.65);
      g.fillStyle = `rgba(230,244,251,${a})`;
      g.fillRect(sx, sy, cellPx, cellPx);
    }

    const wallW = Math.max(3, cellPx * 0.09);
    for (const k of vis.set) {
      const x = Math.floor(k / 1000);
      const y = k % 1000;
      const cell = maze.cells[y][x];
      const d = vis.map.get(k);
      const a = Math.max(0.4, 1 - (d / VIS_DEPTH) * 0.55);
      const sx = w2sX(x), sy = w2sY(y);

      g.fillStyle = `rgba(43,61,79,${a})`;
      if (cell.n) g.fillRect(sx, sy, cellPx, wallW);
      if (cell.s) g.fillRect(sx, sy + cellPx - wallW, cellPx, wallW);
      if (cell.w) g.fillRect(sx, sy, wallW, cellPx);
      if (cell.e) g.fillRect(sx + cellPx - wallW, sy, wallW, cellPx);

      g.fillStyle = `rgba(90,122,149,${a})`;
      if (cell.n) g.fillRect(sx, sy + wallW - 2, cellPx, 2);
      if (cell.s) g.fillRect(sx, sy + cellPx - wallW, cellPx, 2);
      if (cell.w) g.fillRect(sx + wallW - 2, sy, 2, cellPx);
      if (cell.e) g.fillRect(sx + cellPx - wallW, sy, 2, cellPx);
    }

    for (const pill of pills) {
      const k = pill.x * 1000 + pill.y;
      if (!vis.set.has(k)) continue;
      const pd = vis.map.get(k);
      const a = Math.max(0.5, 1 - (pd / VIS_DEPTH) * 0.5);
      const cx = w2sX(pill.x) + cellPx / 2;
      const cy = w2sY(pill.y) + cellPx / 2;
      g.globalAlpha = a;
      drawPill(g, cx, cy, cellPx * 0.42);
      g.globalAlpha = 1;
    }

    if (vis.set.has(exitK)) {
      const d = vis.map.get(exitK);
      const a = Math.max(0.55, 1 - (d / VIS_DEPTH) * 0.5);
      const ex = w2sX(exit.x) + cellPx / 2;
      const ey = w2sY(exit.y) + cellPx / 2;
      g.globalAlpha = a;
      drawCheese(g, ex, ey, cellPx * 0.34);
      g.globalAlpha = 1;
    }

    // Other rats are GREEN. Show a blue ice ring if they are frozen.
    for (const op of players.values()) {
      if (op.slot === p.slot) continue;
      if (op.finished || op.dnf) continue;
      if (!vis.set.has(op.cellX * 1000 + op.cellY)) continue;
      const ox = lerp(op.prevX, op.cellX, op.t);
      const oy = lerp(op.prevY, op.cellY, op.t);
      const oxp = w2sX(ox) + cellPx / 2;
      const oyp = w2sY(oy) + cellPx / 2;
      const orr = cellPx * 0.30;

      drawRat(g, oxp, oyp, orr, op.dir, OTHER_RAT_COLOR);

      if (elapsed < op.frozenUntil) {
        g.strokeStyle = "rgba(159,209,255,0.95)";
        g.lineWidth = 3;
        g.beginPath(); g.arc(oxp, oyp, orr * 1.7, 0, Math.PI * 2); g.stroke();
      }
    }

    // Own rat — body colour = temperature
    const ownDist = distToExit[p.cellY]?.[p.cellX] ?? -1;
    const ownTempRGB = ownDist >= 0 ? tempRGB(ownDist / maxDist) : [136, 136, 136];
    const ownColor = rgbStr(ownTempRGB);
    const ownFrozen = elapsed < p.frozenUntil;

    {
      const bxs = w2sX(px) + cellPx / 2;
      const bys = w2sY(py) + cellPx / 2;
      const br = cellPx * 0.32;

      const glow = g.createRadialGradient(bxs, bys, 0, bxs, bys, br * 2.4);
      glow.addColorStop(0, rgbaStr(ownTempRGB, ownFrozen ? 0.25 : 0.55));
      glow.addColorStop(1, rgbaStr(ownTempRGB, 0));
      g.fillStyle = glow;
      g.beginPath(); g.arc(bxs, bys, br * 2.4, 0, Math.PI * 2); g.fill();

      // Red pickup flash
      if (elapsed < p.pickupFlash) {
        const life = (p.pickupFlash - elapsed) / 0.6;
        g.strokeStyle = `rgba(229,72,77,${life})`;
        g.lineWidth = 4;
        g.beginPath();
        g.arc(bxs, bys, br + (1 - life) * br * 2.5, 0, Math.PI * 2);
        g.stroke();
      }

      drawRat(g, bxs, bys, br, p.dir, ownColor);

      // Frozen overlay: pulsing ice-blue ring + frost tint
      if (ownFrozen) {
        const remain = p.frozenUntil - elapsed;
        const wob = 1 + Math.sin(elapsed * 12) * 0.04;
        g.save();
        g.globalAlpha = 0.55;
        g.fillStyle = "#bfe3ff";
        g.beginPath(); g.arc(bxs, bys, br * 1.25, 0, Math.PI * 2); g.fill();
        g.globalAlpha = 1;
        g.strokeStyle = "rgba(159,209,255,0.95)";
        g.lineWidth = 4;
        g.beginPath(); g.arc(bxs, bys, br * 1.9 * wob, 0, Math.PI * 2); g.stroke();

        // Remaining-time digits
        g.font = `800 ${Math.max(12, br * 0.75)}px Fredoka, system-ui, sans-serif`;
        g.textAlign = "center";
        g.textBaseline = "middle";
        g.fillStyle = "#0a1420";
        g.fillText(remain.toFixed(1), bxs, bys + 0.5);
        g.fillStyle = "#e6f4fb";
        g.fillText(remain.toFixed(1), bxs, bys);
        g.restore();
      }
    }

    // Global shockwave pulse
    if (elapsed < shockwaveUntil) {
      const life = (shockwaveUntil - elapsed) / 0.7;
      const pulse = Math.min(1, life * 1.4);
      const vcx0 = vp.x + vp.w / 2, vcy0 = vp.y + vp.h / 2;
      const sg = g.createRadialGradient(
        vcx0, vcy0, Math.min(vp.w, vp.h) * 0.15,
        vcx0, vcy0, Math.max(vp.w, vp.h) * 0.75,
      );
      sg.addColorStop(0,   "rgba(159,209,255,0)");
      sg.addColorStop(0.6, `rgba(159,209,255,${0.20 * pulse})`);
      sg.addColorStop(1,   `rgba(159,209,255,${0.55 * pulse})`);
      g.fillStyle = sg;
      g.fillRect(vp.x, vp.y, vp.w, vp.h);
    }

    const vcx = vp.x + vp.w / 2, vcy = vp.y + vp.h / 2;
    const vg = g.createRadialGradient(
      vcx, vcy, Math.min(vp.w, vp.h) * 0.25,
      vcx, vcy, Math.max(vp.w, vp.h) * 0.7,
    );
    vg.addColorStop(0, "rgba(8,14,22,0)");
    vg.addColorStop(1, "rgba(8,14,22,0.55)");
    g.fillStyle = vg;
    g.fillRect(vp.x, vp.y, vp.w, vp.h);

    g.strokeStyle = "rgba(90,122,149,0.5)";
    g.lineWidth = 2;
    g.strokeRect(vp.x + 1, vp.y + 1, vp.w - 2, vp.h - 2);

    const info = ctx.player(p.slot);
    if (info) {
      const fs = Math.max(13, vp.h * 0.032);
      g.font = `700 ${fs}px Fredoka, system-ui, sans-serif`;
      g.textAlign = "left"; g.textBaseline = "top";
      const tw = g.measureText(info.name).width + 20;
      const lx = vp.x + 10, ly = vp.y + 8;
      const lh = fs + 10, rad = lh / 2;
      g.fillStyle = "rgba(8,14,22,0.6)";
      g.beginPath();
      g.moveTo(lx + rad, ly);
      g.arcTo(lx + tw, ly, lx + tw, ly + lh, rad);
      g.arcTo(lx + tw, ly + lh, lx, ly + lh, rad);
      g.arcTo(lx, ly + lh, lx, ly, rad);
      g.arcTo(lx, ly, lx + tw, ly, rad);
      g.fill();
      g.fillStyle = info.color;
      g.fillText(info.name, lx + 10, ly + 5);
    }

    if (phase === "race" && p.active && !p.finished && !p.dnf && elapsed < p.compassUntil) {
      const dir = exitDirection(maze, distToExit, p.cellX, p.cellY);
      if (dir) {
        const size = Math.min(vp.w, vp.h) * 0.13;
        const cx2 = vp.x + vp.w - size - 18;
        const cy2 = vp.y + size + 18;
        const ang = ({ n: -Math.PI / 2, e: 0, s: Math.PI / 2, w: Math.PI })[dir];
        const life = p.compassUntil - elapsed;
        const pulse = 1 + Math.sin((1 - life) * Math.PI * 3) * 0.06;

        g.save();
        g.translate(cx2, cy2);
        g.scale(pulse, pulse);
        g.fillStyle = "rgba(8,14,22,0.88)";
        g.beginPath(); g.arc(0, 0, size, 0, Math.PI * 2); g.fill();
        g.strokeStyle = "rgba(255,220,120,0.95)";
        g.lineWidth = 3;
        g.beginPath(); g.arc(0, 0, size, 0, Math.PI * 2); g.stroke();
        g.rotate(ang);
        g.fillStyle = "#ffc850";
        g.beginPath();
        g.moveTo(size * 0.55, 0);
        g.lineTo(-size * 0.35, -size * 0.5);
        g.lineTo(-size * 0.35, size * 0.5);
        g.closePath();
        g.fill();
        g.restore();
      }
    }

    if (!p.active && phase === "race") {
      g.fillStyle = "rgba(8,14,22,0.7)";
      g.fillRect(vp.x, vp.y, vp.w, vp.h);
      g.fillStyle = "#e6f4fb";
      g.font = `700 ${Math.max(14, vp.h * 0.05)}px Fredoka, system-ui, sans-serif`;
      g.textAlign = "center"; g.textBaseline = "middle";
      g.fillText("Waiting for next round", vp.x + vp.w / 2, vp.y + vp.h / 2);
    }

    g.restore();
  }

  /* ---------------- Overlay ---------------- */
  function renderOverlay() {
    if (phase === "countdown") {
      g.fillStyle = "rgba(8,14,22,0.6)";
      g.fillRect(0, 0, VIEW_W, VIEW_H);
      g.textAlign = "center"; g.textBaseline = "middle";
      g.font = "800 200px Fredoka, system-ui, sans-serif";
      g.fillStyle = "#e6f4fb";
      const n = Math.ceil(countdown);
      g.fillText(n > 0 ? String(n) : "GO", VIEW_W / 2, VIEW_H / 2);
      return;
    }

    if (phase === "race" && raceEndElapsed !== null) {
      const remaining = Math.max(0, raceEndElapsed - elapsed);
      const bw = 360, bh = 54;
      const bx = (VIEW_W - bw) / 2, by = 14;
      const rad = bh / 2;
      g.fillStyle = "rgba(8,14,22,0.82)";
      g.beginPath();
      g.moveTo(bx + rad, by);
      g.arcTo(bx + bw, by, bx + bw, by + bh, rad);
      g.arcTo(bx + bw, by + bh, bx, by + bh, rad);
      g.arcTo(bx, by + bh, bx, by, rad);
      g.arcTo(bx, by, bx + bw, by, rad);
      g.fill();
      g.strokeStyle = "rgba(90,122,149,0.5)";
      g.lineWidth = 2; g.stroke();

      g.fillStyle = "#e6f4fb";
      g.font = "700 24px Fredoka, system-ui, sans-serif";
      g.textAlign = "center"; g.textBaseline = "middle";
      g.fillText(`Race ends in ${Math.ceil(remaining)}s`, VIEW_W / 2, by + bh / 2);
      return;
    }

    if (phase === "ready") {
      g.fillStyle = "rgba(8,14,22,0.62)";
      g.fillRect(0, 0, VIEW_W, VIEW_H);
      g.textAlign = "center"; g.textBaseline = "middle";

      if (finishers.length > 0) {
        const info = ctx.player(finishers[0]);
        g.font = "800 100px Fredoka, system-ui, sans-serif";
        g.fillStyle = info ? info.color : "#e6f4fb";
        g.fillText(`${info ? info.name : "Player"} wins!`, VIEW_W / 2, VIEW_H / 2 - 60);
      } else {
        g.font = "800 90px Fredoka, system-ui, sans-serif";
        g.fillStyle = "#e6f4fb";
        g.fillText("Round over", VIEW_W / 2, VIEW_H / 2 - 60);
      }

      const readyCount = [...players.values()].filter((p) => p.ready).length;
      g.font = "600 30px Fredoka, system-ui, sans-serif";
      g.fillStyle = "#c9d6e0";
      g.fillText(`Press any button to continue (${readyCount}/${players.size})`,
                 VIEW_W / 2, VIEW_H / 2 + 40);

      const gap = 44, dotR = 12;
      const totalW = Math.max(0, players.size - 1) * gap;
      let x = VIEW_W / 2 - totalW / 2;
      for (const p of players.values()) {
        const info = ctx.player(p.slot);
        g.fillStyle = p.ready ? (info ? info.color : "#5a7a95") : "rgba(90,122,149,0.35)";
        g.beginPath(); g.arc(x, VIEW_H / 2 + 110, dotR, 0, Math.PI * 2); g.fill();
        x += gap;
      }
    }
  }

  function render() {
    g.fillStyle = "#0e1a24";
    g.fillRect(0, 0, VIEW_W, VIEW_H);

    const list = [...players.values()].sort((a, b) => a.slot - b.slot);
    const n = Math.max(1, list.length);
    const [rows, cols] = getLayout(n);
    const cellW = VIEW_W / cols;
    const cellH = VIEW_H / rows;

    list.forEach((p, i) => {
      const col = i % cols;
      const row = Math.floor(i / cols);
      renderViewport({ x: col * cellW, y: row * cellH, w: cellW, h: cellH }, p);
    });

    renderOverlay();
  }

  function frame(now) {
    let dt = (now - last) / 1000;
    if (dt > 0.05) dt = 0.05;
    if (dt < 0) dt = 0;
    last = now;
    update(dt);
    render();
    raf = requestAnimationFrame(frame);
  }
  raf = requestAnimationFrame(frame);

  return {
    destroy() {
      cancelAnimationFrame(raf);
      raf = 0;
      style.remove();
    },
  };
}