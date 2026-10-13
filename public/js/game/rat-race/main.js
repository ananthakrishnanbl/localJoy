// Rat Race — simultaneous fog-of-war maze escape.
//
// Rules (unchanged):
//   * 1-6 players, everyone starts at the same cell
//   * one randomly generated maze per round, shared by all players
//   * each player has their own camera on the shared maze
//   * fog of war: only cells reachable through open corridors are visible
//   * the rat's colour is the temperature hint (red = hot, blue = freezing)
//   * other players appear as GREEN rats (you are the only rat in your
//     own slot colour; identity of others is hidden)
//   * up to 3 green pills spawn in random DEAD-ENDS. Stepping on one
//     FREEZES every OTHER active player for a few seconds based on their
//     temperature bucket: HOT 5s · WARM 4s · COOL 2s · COLD 1s · FREEZING 0s
//   * movement: joystick OR buttons (Y up, A down, X left, B right)
//   * first rat to the CHEESE gets 1st place; 20 s window for the rest
//   * DNF for anyone still racing when the window closes
//   * 1-second compass pulse every 30 s for FREEZING players
//   * ready phase: everyone presses any button; then a brand new maze
//   * the game never exits on its own
//
// Theme: dark navy (localJoy chrome). Fredoka everywhere.
//
// Performance notes:
//   * The maze is stored in flat typed arrays (one byte of wall bits per
//     cell, index = y * MAZE_W + x) instead of an object per cell.
//   * Per-player fog-of-war uses preallocated typed arrays, no Map/array
//     allocation when a rat changes cell.
//   * Per-cell colours are precomputed strings; floors / walls / wall
//     highlights are drawn in three passes so fillStyle changes only when
//     the fade depth changes.
//   * Radial gradients are created once and reused through translate().
//   * Temperature bucket / colour is a per-round lookup table.

const VIEW_W = 1280, VIEW_H = 720;
const MAZE_W = 21, MAZE_H = 15;
const MAZE_N = MAZE_W * MAZE_H;
const START = { x: 1, y: 1 };
const START_IDX = START.y * MAZE_W + START.x;
const VIS_DEPTH = 6;
const MOVE_SPEED = 5;
const COUNTDOWN_TIME = 3.2;
const DNF_WAIT = 20;
const COMPASS_PERIOD = 30;
const COMPASS_DURATION = 1;
const PILL_COUNT = 3;
const PILL_MIN_GAP = 5;
const PILL_START_CLEAR = 3;

const TAU = Math.PI * 2;
const FONT = "Fredoka, system-ui, sans-serif";

// Player / object colours.
const OTHER_RAT_COLOR = "#3ecf6e";

const BUTTON_DIR = { Y: "up", A: "down", X: "left", B: "right" };

// -------- Palette (matches localJoy chrome) --------
const BG          = "#1e2246";
const FOG         = "#161a38";
const CARD        = "#1a1e3d";
const CARD_EDGE   = "rgba(255,255,255,0.08)";
const INK         = "#ffffff";
const MUTED       = "#8b93b8";
const FLOOR_RGB   = [200, 212, 240];
const WALL_RGB    = [8, 12, 36];
const WALL_HI_RGB = [91, 141, 239];
const BLUE        = "#5b8def";

const lerp = (a, b, t) => a + (b - a) * t;
const rgbaStr = ([r, g, b], a) => `rgba(${r},${g},${b},${a})`;
const rgbStr  = ([r, g, b]) => `rgb(${r},${g},${b})`;

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

// Joystick values: coerce to a number and clamp to -1..1.
function clampAxis(v) {
  v = +v;
  return v !== v ? 0 : v > 1 ? 1 : v < -1 ? -1 : v;
}

/* ---------------- Direction / wall constants ---------------- */
// Wall bits stored per cell.
const WALL_N = 1, WALL_E = 2, WALL_S = 4, WALL_W = 8;
// Direction indices: 0 north, 1 east, 2 south, 3 west.
const DIR_N = 0, DIR_E = 1, DIR_S = 2, DIR_W = 3;
const DIR_BIT   = [WALL_N, WALL_E, WALL_S, WALL_W];
const OPP_BIT   = [WALL_S, WALL_W, WALL_N, WALL_E];
const DIR_DX    = [0, 1, 0, -1];
const DIR_DY    = [-1, 0, 1, 0];
const DIR_ANGLE = [-Math.PI / 2, 0, Math.PI / 2, Math.PI];

// Number of open sides for every wall mask.
const OPEN_COUNT = new Uint8Array(16);
for (let m = 0; m < 16; m++) {
  let c = 0;
  for (let b = 0; b < 4; b++) if (!(m & (1 << b))) c++;
  OPEN_COUNT[m] = c;
}

/* ---------------- Temperature scale ---------------- */
// Buckets: 0 HOT, 1 WARM, 2 COOL, 3 COLD, 4 FREEZING, 5 unknown (unreachable).
const TEMP_FREEZING = 4;
const TEMP_UNKNOWN = 5;
const HOT_RGB = [229, 72, 77];
const COLD_RGB = [59, 139, 255];
const TEMP_T = [0, 0.25, 0.5, 0.75, 1];
const TEMP_RGB = TEMP_T.map((t) => [
  Math.round(HOT_RGB[0] * (1 - t) + COLD_RGB[0] * t),
  Math.round(HOT_RGB[1] * (1 - t) + COLD_RGB[1] * t),
  Math.round(HOT_RGB[2] * (1 - t) + COLD_RGB[2] * t),
]);
TEMP_RGB.push([136, 136, 136]);
const TEMP_COLOR       = TEMP_RGB.map(rgbStr);
const TEMP_GLOW_ON     = TEMP_RGB.map((c) => rgbaStr(c, 0.55));
const TEMP_GLOW_FROZEN = TEMP_RGB.map((c) => rgbaStr(c, 0.25));
const TEMP_GLOW_OFF    = TEMP_RGB.map((c) => rgbaStr(c, 0));
// Freeze duration in seconds by the victim's temperature bucket.
const FREEZE_SECS = [5, 4, 2, 1, 0, 0];

function tempBucket(ratio) {
  if (ratio < 0.15) return 0;
  if (ratio < 0.30) return 1;
  if (ratio < 0.55) return 2;
  if (ratio < 0.80) return 3;
  return TEMP_FREEZING;
}

/* ---------------- Per-depth fog colours ---------------- */
const FLOOR_STYLE = [], WALL_STYLE = [], HI_STYLE = [];
for (let d = 0; d <= VIS_DEPTH; d++) {
  const a = Math.max(0.35, 1 - (d / VIS_DEPTH) * 0.65);
  FLOOR_STYLE.push(rgbaStr(FLOOR_RGB, a));
  WALL_STYLE.push(rgbaStr(WALL_RGB, a));
  HI_STYLE.push(rgbaStr(WALL_HI_RGB, a * 0.7));
}

/* ---------------- Maze ---------------- */
// maze = { w, h, walls: Uint8Array (wall bits per cell), step: index delta per direction }
function generateMaze(w, h) {
  const walls = new Uint8Array(w * h).fill(15);
  const seen = new Uint8Array(w * h);
  const stack = new Int32Array(w * h);
  const cand = [0, 0, 0, 0];
  let sp = 0;

  const first = 1 * w + 1;
  seen[first] = 1;
  stack[sp++] = first;

  while (sp > 0) {
    const cur = stack[sp - 1];
    const cy = (cur / w) | 0, cx = cur - cy * w;
    let n = 0;
    for (let d = 0; d < 4; d++) {
      const nx = cx + DIR_DX[d], ny = cy + DIR_DY[d];
      if (nx <= 0 || ny <= 0 || nx >= w - 1 || ny >= h - 1) continue;
      if (seen[ny * w + nx]) continue;
      cand[n++] = d;
    }
    if (!n) { sp--; continue; }
    const d = cand[(Math.random() * n) | 0];
    const next = (cy + DIR_DY[d]) * w + cx + DIR_DX[d];
    walls[cur] &= ~DIR_BIT[d];
    walls[next] &= ~OPP_BIT[d];
    seen[next] = 1;
    stack[sp++] = next;
  }
  return { w, h, walls, step: [-w, 1, w, -1] };
}

// BFS distances from one cell (flat Int16Array, -1 = unreachable).
function bfsDistances(maze, from) {
  const { walls, step } = maze;
  const dist = new Int16Array(maze.w * maze.h).fill(-1);
  const q = new Int32Array(dist.length);
  let head = 0, tail = 0;
  dist[from] = 0;
  q[tail++] = from;
  while (head < tail) {
    const i = q[head++];
    const m = walls[i];
    const nd = dist[i] + 1;
    for (let k = 0; k < 4; k++) {
      if (m & DIR_BIT[k]) continue;
      const j = i + step[k];
      if (dist[j] !== -1) continue;
      dist[j] = nd;
      q[tail++] = j;
    }
  }
  return dist;
}

// Fog of war: BFS up to maxDepth through open corridors.
// Fills `depth` (-1 = hidden) and `list` (visible cell indices in BFS order,
// so depths are non-decreasing). Returns the number of visible cells.
// The caller must have reset `depth` to -1 beforehand.
function computeVisibility(maze, start, maxDepth, depth, list) {
  const { walls, step } = maze;
  let head = 0, tail = 0;
  depth[start] = 0;
  list[tail++] = start;
  while (head < tail) {
    const i = list[head++];
    const d = depth[i];
    if (d >= maxDepth) continue;
    const m = walls[i];
    for (let k = 0; k < 4; k++) {
      if (m & DIR_BIT[k]) continue;
      const j = i + step[k];
      if (depth[j] >= 0) continue;
      depth[j] = d + 1;
      list[tail++] = j;
    }
  }
  return tail;
}

// Direction index (0-3) of the neighbour closest to the exit, or -1.
function exitDirection(maze, distToExit, idx) {
  if (distToExit[idx] <= 0) return -1;
  const m = maze.walls[idx];
  let best = -1, bestD = 0;
  for (let d = 0; d < 4; d++) {
    if (m & DIR_BIT[d]) continue;
    const nd = distToExit[idx + maze.step[d]];
    if (nd < 0) continue;
    if (best < 0 || nd < bestD) { best = d; bestD = nd; }
  }
  return best;
}

/* ---------------- Pills ---------------- */
function generatePills(maze, distToExit, count) {
  const all = [];
  for (let y = 1; y < maze.h - 1; y++) {
    for (let x = 1; x < maze.w - 1; x++) {
      const idx = y * maze.w + x;
      // d < 0: unreachable. d === 0: the cheese cell (a pill there would be
      // hidden under the cheese and trigger on the winning step).
      const d = distToExit[idx];
      if (d <= 0) continue;
      if (Math.abs(x - START.x) + Math.abs(y - START.y) < PILL_START_CLEAR) continue;
      all.push({ x, y, idx, d, dead: OPEN_COUNT[maze.walls[idx]] === 1 });
    }
  }
  if (!all.length) return [];

  const deadEnds = all.filter((c) => c.dead);
  const pool = deadEnds.length > 0
    ? deadEnds
    : all.slice().sort((a, b) => b.d - a.d).slice(0, Math.max(count, 8));

  for (let i = pool.length - 1; i > 0; i--) {
    const j = (Math.random() * (i + 1)) | 0;
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }

  const pills = [];
  for (const c of pool) {
    if (pills.length >= count) break;
    if (pills.some((p) => Math.abs(p.x - c.x) + Math.abs(p.y - c.y) < PILL_MIN_GAP)) continue;
    pills.push({ x: c.x, y: c.y, idx: c.idx });
  }
  return pills;
}

/* ---------------- Sprite helpers ---------------- */
// Circle as a sub-path (explicit moveTo so sub-paths never get joined).
function circlePath(g, x, y, r) {
  g.moveTo(x + r, y);
  g.arc(x, y, r, 0, TAU);
}

function roundRectPath(g, x, y, w, h, r) {
  g.beginPath();
  g.moveTo(x + r, y);
  g.arcTo(x + w, y, x + w, y + h, r);
  g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r);
  g.arcTo(x, y, x + w, y, r);
}

// dir: 0 north, 1 east, 2 south, 3 west.
function drawRat(g, cx, cy, r, dir, color) {
  g.save();
  g.translate(cx, cy);
  g.rotate(DIR_ANGLE[dir] ?? 0);

  const bodyRX = r * 0.95, bodyRY = r * 0.78;
  const headR = r * 0.58, headX = r * 0.68;
  const earR = r * 0.32, earInnerR = r * 0.16;
  const earX = headX - r * 0.1, earY = r * 0.62;

  // Tail
  g.strokeStyle = color;
  g.lineWidth = r * 0.16;
  g.lineCap = "round";
  g.beginPath();
  g.moveTo(-bodyRX * 0.9, 0);
  g.quadraticCurveTo(-bodyRX * 1.7, -bodyRY * 0.6, -bodyRX * 1.4, -bodyRY * 1.1);
  g.stroke();

  // Ears + body + head: same opaque colour, one fill.
  g.fillStyle = color;
  g.beginPath();
  circlePath(g, earX, -earY, earR);
  circlePath(g, earX,  earY, earR);
  g.moveTo(bodyRX, 0);
  g.ellipse(0, 0, bodyRX, bodyRY, 0, 0, TAU);
  circlePath(g, headX, 0, headR);
  g.fill();

  // Inner ears
  g.fillStyle = "#ffb8c8";
  g.beginPath();
  circlePath(g, earX, -earY, earInnerR);
  circlePath(g, earX,  earY, earInnerR);
  g.fill();

  // Eyes
  g.fillStyle = "#10202b";
  g.beginPath();
  circlePath(g, headX + headR * 0.25, -headR * 0.35, r * 0.13);
  circlePath(g, headX + headR * 0.25,  headR * 0.35, r * 0.13);
  g.fill();

  // Eye shine
  g.fillStyle = "rgba(255,255,255,0.85)";
  g.beginPath();
  circlePath(g, headX + headR * 0.32, -headR * 0.42, r * 0.05);
  circlePath(g, headX + headR * 0.32,  headR * 0.28, r * 0.05);
  g.fill();

  // Nose
  g.fillStyle = "#ff8fa8";
  g.beginPath();
  circlePath(g, headX + headR * 0.9, 0, r * 0.11);
  g.fill();

  // Whiskers
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

// `glow` is a cached radial gradient centred on (0,0) with radius s * 1.8.
function drawPill(g, cx, cy, s, glow) {
  g.save();
  g.translate(cx, cy);
  g.rotate(-Math.PI / 5);

  const w = s * 0.55;
  const h = s * 1.05;
  const r = w / 2;
  const x = -w / 2, y = -h / 2;

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
  g.ellipse(x + w * 0.28, y + h * 0.22, w * 0.16, h * 0.09, 0, 0, TAU);
  g.fill();

  g.restore();
}

// `glow` is a cached radial gradient centred on (0,0) with radius s * 2.4.
function drawCheese(g, cx, cy, s, glow) {
  g.save();
  g.translate(cx, cy);

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

  // The wedge path is still the current path (save/restore doesn't touch it).
  g.strokeStyle = "#b07a12";
  g.lineWidth = Math.max(2, s * 0.09);
  g.lineJoin = "round";
  g.stroke();

  g.fillStyle = "#c99120";
  g.beginPath();
  circlePath(g, -w * 0.35, h * 0.25, s * 0.13);
  circlePath(g,  w * 0.30, h * 0.18, s * 0.10);
  circlePath(g, -w * 0.05, -h * 0.05, s * 0.09);
  circlePath(g,  w * 0.05, h * 0.42, s * 0.07);
  g.fill();

  g.fillStyle = "rgba(255,255,255,0.55)";
  g.beginPath();
  g.moveTo(-w * 0.75, h * 0.45);
  g.lineTo(-w * 0.10, h * 0.45);
  g.lineTo(-w * 0.30, -h * 0.10);
  g.closePath();
  g.fill();

  g.restore();
}

// [rows, cols] by player count (index 0 unused; 6+ share the 2x3 grid).
const LAYOUTS = [[1, 1], [1, 1], [1, 2], [2, 2], [2, 2], [2, 3], [2, 3]];

/* ============================================================
   Entry point
   ============================================================ */
export function start(ctx) {
  const { root, signal } = ctx;

  // Themed wrapper. Previous inline values are restored in destroy().
  const ROOT_STYLE = [
    ["background", BG], ["position", "relative"], ["overflow", "hidden"],
    ["border", "0"], ["padding", "0"], ["margin", "0"],
  ];
  const savedRootStyle = ROOT_STYLE.map(([k]) => [
    k, root.style.getPropertyValue(k), root.style.getPropertyPriority(k),
  ]);
  for (const [k, v] of ROOT_STYLE) root.style.setProperty(k, v, "important");

  const wrap = document.createElement("div");
  Object.assign(wrap.style, {
    position: "absolute", inset: "0",
    display: "flex", alignItems: "center", justifyContent: "center",
    background: BG, border: "0", padding: "0", margin: "0",
    overflow: "hidden",
  });

  const canvas = document.createElement("canvas");
  canvas.width = VIEW_W; canvas.height = VIEW_H;
  Object.assign(canvas.style, {
    display: "block", maxWidth: "100%", maxHeight: "100%",
    aspectRatio: "16 / 9", background: BG,
    border: "0", padding: "0", margin: "0",
  });
  wrap.append(canvas);
  root.replaceChildren(wrap);
  // Opaque canvas: every frame starts with a full BG fill.
  const g = canvas.getContext("2d", { alpha: false });

  /* ---------------- Cached gradients ----------------
     Canvas gradients are painted through the current transform, so a
     gradient built around (0,0) can be reused anywhere via translate(). */
  function makeGlowCache(stops) {
    const byRadius = new Map();   // a few radii at most (one per layout / sprite size)
    return (r) => {
      let gr = byRadius.get(r);
      if (!gr) {
        if (byRadius.size > 16) byRadius.clear();
        gr = g.createRadialGradient(0, 0, 0, 0, 0, r);
        for (const [o, col] of stops) gr.addColorStop(o, col);
        byRadius.set(r, gr);
      }
      return gr;
    };
  }
  function makeViewportGradientCache(innerK, outerK, stops) {
    const c = { w: -1, h: -1, grad: null };
    return (w, h) => {
      if (c.w !== w || c.h !== h) {
        const gr = g.createRadialGradient(
          0, 0, Math.min(w, h) * innerK, 0, 0, Math.max(w, h) * outerK);
        for (const [o, col] of stops) gr.addColorStop(o, col);
        c.w = w; c.h = h; c.grad = gr;
      }
      return c.grad;
    };
  }

  const pillGlowFor   = makeGlowCache([[0, "rgba(62,207,110,0.55)"], [1, "rgba(62,207,110,0)"]]);
  const cheeseGlowFor = makeGlowCache([[0, "rgba(255,200,80,0.7)"],  [1, "rgba(255,200,80,0)"]]);
  // Own-rat glow: [bucket][frozen ? 1 : 0]
  const ownGlowFor = TEMP_RGB.map((_, b) => [
    makeGlowCache([[0, TEMP_GLOW_ON[b]],     [1, TEMP_GLOW_OFF[b]]]),
    makeGlowCache([[0, TEMP_GLOW_FROZEN[b]], [1, TEMP_GLOW_OFF[b]]]),
  ]);
  const vignetteFor = makeViewportGradientCache(0.25, 0.7, [
    [0, "rgba(8,12,26,0)"], [1, "rgba(8,12,26,0.55)"],
  ]);
  // Drawn with globalAlpha = pulse, so the stops stay constant.
  const shockFor = makeViewportGradientCache(0.15, 0.75, [
    [0, "rgba(159,209,255,0)"], [0.6, "rgba(159,209,255,0.2)"], [1, "rgba(159,209,255,0.55)"],
  ]);

  /* ---------------- Runtime state ---------------- */
  const players = new Map();
  const inputs = new Map();   // slot -> { x, y } (joystick, clamped)
  const dpad = new Map();     // slot -> { up, down, left, right }

  let maze = null;
  let exitIdx = START_IDX, exitX = START.x, exitY = START.y;
  let distToExit = null;
  let tempAt = null;          // Int8Array: temperature bucket per cell
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
  let exiting = false;

  // Scratch buffers reused by every viewport render (rendering is sequential).
  const scratchMask = new Uint8Array(MAZE_N);
  const scratchSX = new Float64Array(MAZE_N);
  const scratchSY = new Float64Array(MAZE_N);
  const vp = { x: 0, y: 0, w: 0, h: 0 };
  let inputX = 0, inputY = 0;   // result of readInput()

  // Cached player lists. Rebuilt only after join/leave.
  //   playerList  – insertion order (same as Map iteration), used for game logic
  //   playerOrder – sorted by slot, used for screen layout
  let playerList = [];
  let playerOrder = [];
  let playersDirty = true;
  function refreshPlayerLists() {
    if (!playersDirty) return;
    playerList = [...players.values()];
    playerOrder = playerList.slice().sort((a, b) => a.slot - b.slot);
    playersDirty = false;
  }

  function makePlayer(slot) {
    return {
      slot,
      cellX: START.x, cellY: START.y, idx: START_IDX,
      prevX: START.x, prevY: START.y,
      t: 1,
      dir: DIR_S,
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
      // Fog-of-war cache: recomputed only when the rat's cell changes.
      visAt: -1,
      visCount: 0,
      visDepth: new Int8Array(MAZE_N).fill(-1),
      visList: new Int32Array(MAZE_N),
    };
  }

  function clearVisibility(p) {
    const depth = p.visDepth, list = p.visList;
    for (let k = 0; k < p.visCount; k++) depth[list[k]] = -1;
    p.visCount = 0;
    p.visAt = -1;
  }

  function resetPlayer(p) {
    p.cellX = START.x; p.cellY = START.y; p.idx = START_IDX;
    p.prevX = START.x; p.prevY = START.y;
    p.t = 1;
    p.dir = DIR_S;
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
    clearVisibility(p);
  }

  function refreshVisibility(p) {
    if (p.visAt === p.idx) return;
    clearVisibility(p);
    p.visCount = computeVisibility(maze, p.idx, VIS_DEPTH, p.visDepth, p.visList);
    p.visAt = p.idx;
  }

  const isRacing = (p) => p.active && !p.finished && !p.dnf;

  function newRound() {
    maze = generateMaze(MAZE_W, MAZE_H);
    const fromStart = bfsDistances(maze, START_IDX);
    let best = 0;
    exitIdx = START_IDX;
    for (let y = 1; y < MAZE_H - 1; y++) {
      for (let x = 1; x < MAZE_W - 1; x++) {
        const i = y * MAZE_W + x;
        if (fromStart[i] > best) { best = fromStart[i]; exitIdx = i; }
      }
    }
    exitY = (exitIdx / MAZE_W) | 0;
    exitX = exitIdx - exitY * MAZE_W;
    distToExit = bfsDistances(maze, exitIdx);
    maxDist = Math.max(1, best);

    tempAt = new Int8Array(MAZE_N);
    for (let i = 0; i < MAZE_N; i++) {
      const d = distToExit[i];
      tempAt[i] = d < 0 ? TEMP_UNKNOWN : tempBucket(d / maxDist);
    }

    pills = generatePills(maze, distToExit, PILL_COUNT);

    for (const p of players.values()) { resetPlayer(p); p.active = true; }
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
  playersDirty = true;

  const on = (t, type, fn) => t.addEventListener(type, fn, { signal });

  on(window, "player-join", (e) => {
    const slot = e.detail.slot;
    const pl = makePlayer(slot);
    if (phase === "race") {
      pl.active = false;
      ctx.send(slot, { type: "hud", text: "Waiting for next round" });
    } else if (phase === "ready") {
      pl.active = true;
      pl.ready = true;
    } else {
      pl.active = true;
    }
    // A re-used slot must not inherit the previous occupant's held input.
    inputs.delete(slot);
    dpad.delete(slot);
    players.set(slot, pl);
    playersDirty = true;
  });

  on(window, "player-leave", (e) => {
    players.delete(e.detail.slot);
    inputs.delete(e.detail.slot);
    dpad.delete(e.detail.slot);
    playersDirty = true;
  });

  on(window, "controller-input", (e) => {
    const { slot, data } = e.detail;
    if (!data) return;
    const p = players.get(slot);
    if (!p) return;

    if (data.type === "move") {
      let s = inputs.get(slot);
      if (!s) { s = { x: 0, y: 0 }; inputs.set(slot, s); }
      s.x = clampAxis(data.x);
      s.y = clampAxis(data.y);
      return;
    }

    if (data.type === "button") {
      if (phase === "ready" && data.pressed) p.ready = true;
      const dirKey = BUTTON_DIR[data.id];
      if (dirKey) {
        let d = dpad.get(slot);
        if (!d) { d = { up: false, down: false, left: false, right: false }; dpad.set(slot, d); }
        d[dirKey] = !!data.pressed;
      }
    }
  });

  // Writes the wanted direction into inputX / inputY; returns false if none.
  function readInput(p) {
    const s = inputs.get(p.slot);
    if (s && s.x * s.x + s.y * s.y >= 0.16) { inputX = s.x; inputY = s.y; return true; }
    const d = dpad.get(p.slot);
    if (d) {
      const x = (d.right ? 1 : 0) - (d.left ? 1 : 0);
      const y = (d.down ? 1 : 0) - (d.up ? 1 : 0);
      if (x !== 0 || y !== 0) { inputX = x; inputY = y; return true; }
    }
    return false;
  }

  function tryMove(p) {
    if (elapsed < p.frozenUntil) return;
    if (!readInput(p)) return;

    const dir = Math.abs(inputX) >= Math.abs(inputY)
      ? (inputX > 0 ? DIR_E : DIR_W)
      : (inputY > 0 ? DIR_S : DIR_N);
    p.dir = dir;
    if (maze.walls[p.idx] & DIR_BIT[dir]) return;

    p.prevX = p.cellX; p.prevY = p.cellY;
    p.cellX += DIR_DX[dir];
    p.cellY += DIR_DY[dir];
    p.idx += maze.step[dir];
    p.t = 0;
  }

  // Only called for racing players (active, not finished, not DNF).
  function movePlayer(p, dt) {
    if (p.t < 1) { p.t = Math.min(1, p.t + dt * MOVE_SPEED); return; }
    tryMove(p);
  }

  function checkPillPickup(p) {
    if (!isRacing(p)) return;
    if (elapsed < p.noPickupUntil) return;
    if (elapsed < p.frozenUntil) return;
    let pi = -1;
    for (let i = 0; i < pills.length; i++) if (pills[i].idx === p.idx) { pi = i; break; }
    if (pi === -1) return;

    pills.splice(pi, 1);
    let anyFrozen = false;

    for (const q of playerList) {
      if (q === p || !isRacing(q)) continue;
      const secs = FREEZE_SECS[tempAt[q.idx]];
      if (secs <= 0) continue;
      const base = Math.max(elapsed, q.frozenUntil);
      q.frozenUntil = base + secs;
      q.pickupFlash = elapsed + 0.6;
      ctx.send(q.slot, { type: "vibrate", ms: [80, 40, 80, 40, 80] });
      anyFrozen = true;
    }

    if (elapsed >= p.pickupFlash) {
      p.pickupFlash = elapsed + 0.6;
      p.noPickupUntil = elapsed + 0.2;
      ctx.send(p.slot, { type: "vibrate", ms: [80, 40, 80, 40, 80] });
    }

    if (anyFrozen) shockwaveUntil = elapsed + 0.7;
  }

  function countReady() {
    let n = 0;
    for (const p of playerList) if (p.ready) n++;
    return n;
  }

  function hintFor(p, readyCount) {
    if (phase === "countdown") return "Get ready";
    if (phase === "ready") {
      if (p.finished) return `${ordinal(p.place)} place - press any button`;
      if (p.dnf)      return "DNF - press any button";
      return `Press any button (${readyCount}/${players.size})`;
    }
    if (!p.active) return "Waiting for next round";
    if (p.finished) return `${ordinal(p.place)} place - ${p.finishTime.toFixed(2)}s`;
    if (p.dnf)      return "DNF";
    if (elapsed < p.frozenUntil) {
      return `FROZEN ${Math.max(0, p.frozenUntil - elapsed).toFixed(1)}s`;
    }
    return "";
  }

  function updateHud(force) {
    const readyCount = phase === "ready" ? countReady() : 0;
    for (const p of playerList) {
      const text = hintFor(p, readyCount);
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
      for (const p of playerList) if (isRacing(p)) movePlayer(p, dt);

      if (elapsed >= nextCompassAt) {
        for (const p of playerList) {
          if (!isRacing(p)) continue;
          if (tempAt[p.idx] === TEMP_FREEZING) {
            p.compassUntil = elapsed + COMPASS_DURATION;
            ctx.send(p.slot, { type: "vibrate", ms: 45 });
          }
        }
        nextCompassAt += COMPASS_PERIOD;
      }

      for (const p of playerList) checkPillPickup(p);

      for (const p of playerList) {
        if (!isRacing(p) || p.idx !== exitIdx) continue;
        p.finished = true;
        p.place = finishers.length + 1;
        p.finishTime = elapsed - raceStartElapsed;
        finishers.push(p.slot);
        if (raceEndElapsed === null) raceEndElapsed = elapsed + DNF_WAIT;
        ctx.send(p.slot, { type: "vibrate", ms: [120, 60, 180] });
      }

      let activeCount = 0, finishedCount = 0;
      for (const p of playerList) {
        if (!p.active) continue;
        activeCount++;
        if (p.finished) finishedCount++;
      }
      const allDone = activeCount > 0 && activeCount === finishedCount;
      const timeUp = raceEndElapsed !== null && elapsed >= raceEndElapsed;

      if (allDone || timeUp) {
        for (const p of playerList) {
          if (p.active && !p.finished) {
            p.dnf = true;
            ctx.send(p.slot, { type: "vibrate", ms: [80, 60, 80] });
          }
        }
        phase = "ready";
        for (const p of playerList) p.ready = false;
        updateHud(true);
        return;
      }

      updateHud();
      return;
    }

    if (phase === "ready") {
      let allReady = playerList.length > 0;
      for (const p of playerList) if (!p.ready) { allReady = false; break; }
      if (allReady) { newRound(); updateHud(true); }
      else updateHud();
    }
  }

  /* ---------------- Cards ---------------- */
  function drawWinnerCard(vp, p) {
    const info = ctx.player(p.slot);
    const color = info ? info.color : BLUE;
    const name = info ? info.name : "Player";
    const cx = vp.x + vp.w / 2;
    const cy = vp.y + vp.h / 2;

    g.save();
    g.beginPath(); g.rect(vp.x, vp.y, vp.w, vp.h); g.clip();
    g.fillStyle = CARD;
    g.fillRect(vp.x, vp.y, vp.w, vp.h);

    const rgb = hexToRgb(color);
    const rg = g.createRadialGradient(cx, cy, 0, cx, cy, Math.max(vp.w, vp.h) * 0.7);
    rg.addColorStop(0, rgbaStr(rgb, 0.55));
    rg.addColorStop(0.6, rgbaStr(rgb, 0.15));
    rg.addColorStop(1, rgbaStr(rgb, 0));
    g.fillStyle = rg;
    g.fillRect(vp.x, vp.y, vp.w, vp.h);

    const ratR = Math.min(vp.w, vp.h) * 0.13;
    drawRat(g, cx, cy - vp.h * 0.30, ratR, DIR_E, color);

    const cheeseSize = Math.min(vp.w, vp.h) * 0.055;
    drawCheese(g, cx, cy + vp.h * 0.055, cheeseSize, cheeseGlowFor(cheeseSize * 2.4));

    const fs1 = Math.min(vp.w * 0.16, vp.h * 0.22);
    g.textAlign = "center"; g.textBaseline = "middle";
    g.font = `800 ${fs1}px ${FONT}`;
    g.fillStyle = INK;
    g.fillText(ordinal(p.place).toUpperCase(), cx, cy + vp.h * 0.14);

    const fs2 = Math.min(vp.w * 0.09, vp.h * 0.09);
    g.font = `700 ${fs2}px ${FONT}`;
    g.fillStyle = color;
    g.fillText(name, cx, cy + vp.h * 0.26);

    const fs3 = Math.min(vp.w * 0.055, vp.h * 0.055);
    g.font = `600 ${fs3}px ${FONT}`;
    g.fillStyle = MUTED;
    g.fillText(`${p.finishTime.toFixed(2)} s`, cx, cy + vp.h * 0.36);

    g.strokeStyle = rgbaStr(rgb, 0.85);
    g.lineWidth = 4;
    g.strokeRect(vp.x + 3, vp.y + 3, vp.w - 6, vp.h - 6);
    g.restore();
  }

  function drawDnfCard(vp, p) {
    const info = ctx.player(p.slot);
    const name = info ? info.name : "Player";
    const color = info ? info.color : MUTED;
    const cx = vp.x + vp.w / 2;
    const cy = vp.y + vp.h / 2;

    g.save();
    g.beginPath(); g.rect(vp.x, vp.y, vp.w, vp.h); g.clip();
    g.fillStyle = CARD;
    g.fillRect(vp.x, vp.y, vp.w, vp.h);

    const fs1 = Math.min(vp.w * 0.22, vp.h * 0.28);
    g.textAlign = "center"; g.textBaseline = "middle";
    g.font = `800 ${fs1}px ${FONT}`;
    g.fillStyle = "#e5484d";
    g.fillText("DNF", cx, cy - vp.h * 0.06);

    const fs2 = Math.min(vp.w * 0.08, vp.h * 0.08);
    g.font = `700 ${fs2}px ${FONT}`;
    g.fillStyle = color;
    g.fillText(name, cx, cy + vp.h * 0.18);

    const fs3 = Math.min(vp.w * 0.045, vp.h * 0.045);
    g.font = `600 ${fs3}px ${FONT}`;
    g.fillStyle = MUTED;
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
    g.fillStyle = FOG;
    g.fillRect(vp.x, vp.y, vp.w, vp.h);

    const cellPx = Math.min(vp.w / 11, vp.h / 9);
    const px = lerp(p.prevX, p.cellX, p.t);
    const py = lerp(p.prevY, p.cellY, p.t);
    // Screen position of the top-left corner of world cell (0,0): the
    // camera keeps the rat centred in the viewport.
    const originX = vp.x + vp.w / 2 - px * cellPx;
    const originY = vp.y + vp.h / 2 - py * cellPx;
    const half = cellPx / 2;

    refreshVisibility(p);
    const depthArr = p.visDepth, list = p.visList, count = p.visCount;
    const walls = maze.walls;
    const wallW = Math.max(3, cellPx * 0.09);
    const vx1 = vp.x + vp.w, vy1 = vp.y + vp.h;

    // ---- Pass 1: floors (+ which walls each on-screen cell must draw) ----
    // A wall between two visible cells is drawn only by the cell owning its
    // south / east side; north / west walls are drawn only when the
    // neighbour on that side is hidden. Depths are non-decreasing in the
    // BFS list, so fillStyle changes at most VIS_DEPTH times per pass.
    let curD = -1;
    for (let k = 0; k < count; k++) {
      const idx = list[k];
      const cy = (idx / MAZE_W) | 0;
      const cx = idx - cy * MAZE_W;
      const sx = originX + cx * cellPx, sy = originY + cy * cellPx;
      if (sx + cellPx < vp.x || sx > vx1 || sy + cellPx < vp.y || sy > vy1) {
        scratchMask[k] = 0;
        continue;
      }
      const d = depthArr[idx];
      if (d !== curD) { curD = d; g.fillStyle = FLOOR_STYLE[d]; }
      g.fillRect(sx, sy, cellPx, cellPx);

      const m = walls[idx];
      let wm = 0;
      if ((m & WALL_N) && depthArr[idx - MAZE_W] < 0) wm |= WALL_N;
      if (m & WALL_S) wm |= WALL_S;
      if ((m & WALL_W) && depthArr[idx - 1] < 0) wm |= WALL_W;
      if (m & WALL_E) wm |= WALL_E;
      scratchMask[k] = wm;
      scratchSX[k] = sx;
      scratchSY[k] = sy;
    }

    // ---- Pass 2: wall fills ----
    curD = -1;
    for (let k = 0; k < count; k++) {
      const wm = scratchMask[k];
      if (!wm) continue;
      const d = depthArr[list[k]];
      if (d !== curD) { curD = d; g.fillStyle = WALL_STYLE[d]; }
      const sx = scratchSX[k], sy = scratchSY[k];
      if (wm & WALL_N) g.fillRect(sx, sy, cellPx, wallW);
      if (wm & WALL_S) g.fillRect(sx, sy + cellPx - wallW, cellPx, wallW);
      if (wm & WALL_W) g.fillRect(sx, sy, wallW, cellPx);
      if (wm & WALL_E) g.fillRect(sx + cellPx - wallW, sy, wallW, cellPx);
    }

    // ---- Pass 3: wall highlights ----
    curD = -1;
    for (let k = 0; k < count; k++) {
      const wm = scratchMask[k];
      if (!wm) continue;
      const d = depthArr[list[k]];
      if (d !== curD) { curD = d; g.fillStyle = HI_STYLE[d]; }
      const sx = scratchSX[k], sy = scratchSY[k];
      if (wm & WALL_N) g.fillRect(sx, sy + wallW - 2, cellPx, 2);
      if (wm & WALL_S) g.fillRect(sx, sy + cellPx - wallW, cellPx, 2);
      if (wm & WALL_W) g.fillRect(sx + wallW - 2, sy, 2, cellPx);
      if (wm & WALL_E) g.fillRect(sx + cellPx - wallW, sy, 2, cellPx);
    }

    // ---- Pills ----
    if (pills.length) {
      const pillSize = cellPx * 0.42;
      const glow = pillGlowFor(pillSize * 1.8);
      for (let i = 0; i < pills.length; i++) {
        const pill = pills[i];
        const d = depthArr[pill.idx];
        if (d < 0) continue;
        g.globalAlpha = Math.max(0.5, 1 - (d / VIS_DEPTH) * 0.5);
        drawPill(g, originX + pill.x * cellPx + half, originY + pill.y * cellPx + half, pillSize, glow);
      }
      g.globalAlpha = 1;
    }

    // ---- Cheese ----
    const exitD = depthArr[exitIdx];
    if (exitD >= 0) {
      const cheeseSize = cellPx * 0.34;
      g.globalAlpha = Math.max(0.55, 1 - (exitD / VIS_DEPTH) * 0.5);
      drawCheese(g, originX + exitX * cellPx + half, originY + exitY * cellPx + half,
                 cheeseSize, cheeseGlowFor(cheeseSize * 2.4));
      g.globalAlpha = 1;
    }

    // ---- Other rats (racing players only) ----
    for (const op of playerList) {
      if (op === p || !isRacing(op)) continue;
      if (depthArr[op.idx] < 0) continue;
      const ox = lerp(op.prevX, op.cellX, op.t);
      const oy = lerp(op.prevY, op.cellY, op.t);
      const oxp = originX + ox * cellPx + half;
      const oyp = originY + oy * cellPx + half;
      const orr = cellPx * 0.30;

      drawRat(g, oxp, oyp, orr, op.dir, OTHER_RAT_COLOR);
      if (elapsed < op.frozenUntil) {
        g.strokeStyle = "rgba(159,209,255,0.95)";
        g.lineWidth = 3;
        g.beginPath(); g.arc(oxp, oyp, orr * 1.7, 0, TAU); g.stroke();
      }
    }

    // ---- Own rat ----
    const bucket = tempAt[p.idx];
    const ownFrozen = elapsed < p.frozenUntil;

    {
      const bxs = vp.x + vp.w / 2 + half;   // == originX + px * cellPx + half
      const bys = vp.y + vp.h / 2 + half;
      const br = cellPx * 0.32;
      const glowR = br * 2.4;

      g.setTransform(1, 0, 0, 1, bxs, bys);
      g.fillStyle = ownGlowFor[bucket][ownFrozen ? 1 : 0](glowR);
      g.beginPath(); g.arc(0, 0, glowR, 0, TAU); g.fill();
      g.setTransform(1, 0, 0, 1, 0, 0);

      if (elapsed < p.pickupFlash) {
        const life = (p.pickupFlash - elapsed) / 0.6;
        g.strokeStyle = `rgba(229,72,77,${life})`;
        g.lineWidth = 4;
        g.beginPath(); g.arc(bxs, bys, br + (1 - life) * br * 2.5, 0, TAU); g.stroke();
      }

      drawRat(g, bxs, bys, br, p.dir, TEMP_COLOR[bucket]);

      if (ownFrozen) {
        const remain = p.frozenUntil - elapsed;
        const wob = 1 + Math.sin(elapsed * 12) * 0.04;
        g.save();
        g.globalAlpha = 0.55;
        g.fillStyle = "#bfe3ff";
        g.beginPath(); g.arc(bxs, bys, br * 1.25, 0, TAU); g.fill();
        g.globalAlpha = 1;
        g.strokeStyle = "rgba(159,209,255,0.95)";
        g.lineWidth = 4;
        g.beginPath(); g.arc(bxs, bys, br * 1.9 * wob, 0, TAU); g.stroke();

        g.font = `800 ${Math.max(12, br * 0.75)}px ${FONT}`;
        g.textAlign = "center";
        g.textBaseline = "middle";
        const label = remain.toFixed(1);
        g.fillStyle = CARD;
        g.fillText(label, bxs, bys + 0.5);
        g.fillStyle = INK;
        g.fillText(label, bxs, bys);
        g.restore();
      }
    }

    const vcx = vp.x + vp.w / 2, vcy = vp.y + vp.h / 2;

    // ---- Shockwave pulse ----
    if (elapsed < shockwaveUntil) {
      const life = (shockwaveUntil - elapsed) / 0.7;
      g.globalAlpha = Math.min(1, life * 1.4);
      g.setTransform(1, 0, 0, 1, vcx, vcy);
      g.fillStyle = shockFor(vp.w, vp.h);
      g.fillRect(-vp.w / 2, -vp.h / 2, vp.w, vp.h);
      g.setTransform(1, 0, 0, 1, 0, 0);
      g.globalAlpha = 1;
    }

    // ---- Vignette ----
    g.setTransform(1, 0, 0, 1, vcx, vcy);
    g.fillStyle = vignetteFor(vp.w, vp.h);
    g.fillRect(-vp.w / 2, -vp.h / 2, vp.w, vp.h);
    g.setTransform(1, 0, 0, 1, 0, 0);

    // Frame
    g.strokeStyle = CARD_EDGE;
    g.lineWidth = 2;
    g.strokeRect(vp.x + 1, vp.y + 1, vp.w - 2, vp.h - 2);

    // Player name chip
    const info = ctx.player(p.slot);
    if (info) {
      const fs = Math.max(13, vp.h * 0.032);
      g.font = `700 ${fs}px ${FONT}`;
      g.textAlign = "left"; g.textBaseline = "top";
      const tw = g.measureText(info.name).width + 20;
      const lx = vp.x + 10, ly = vp.y + 8;
      const lh = fs + 10;
      g.fillStyle = "rgba(8,12,26,0.7)";
      roundRectPath(g, lx, ly, tw, lh, lh / 2);
      g.fill();
      g.fillStyle = info.color;
      g.fillText(info.name, lx + 10, ly + 5);
    }

    // Compass
    if (phase === "race" && isRacing(p) && elapsed < p.compassUntil) {
      const dir = exitDirection(maze, distToExit, p.idx);
      if (dir >= 0) {
        const size = Math.min(vp.w, vp.h) * 0.13;
        const cx2 = vp.x + vp.w - size - 18;
        const cy2 = vp.y + size + 18;
        const life = p.compassUntil - elapsed;
        const pulse = 1 + Math.sin((1 - life) * Math.PI * 3) * 0.06;

        g.save();
        g.translate(cx2, cy2);
        g.scale(pulse, pulse);
        g.fillStyle = "rgba(8,12,26,0.88)";
        g.beginPath(); g.arc(0, 0, size, 0, TAU); g.fill();
        g.strokeStyle = "rgba(255,220,120,0.95)";
        g.lineWidth = 3;
        g.beginPath(); g.arc(0, 0, size, 0, TAU); g.stroke();
        g.rotate(DIR_ANGLE[dir]);
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

    // Waiting overlay for late-joiners
    if (!p.active && phase === "race") {
      g.fillStyle = "rgba(8,12,26,0.75)";
      g.fillRect(vp.x, vp.y, vp.w, vp.h);
      g.fillStyle = INK;
      g.font = `700 ${Math.max(14, vp.h * 0.05)}px ${FONT}`;
      g.textAlign = "center"; g.textBaseline = "middle";
      g.fillText("Waiting for next round", vp.x + vp.w / 2, vp.y + vp.h / 2);
    }

    g.restore();
  }

  /* ---------------- Overlay ---------------- */
  function renderOverlay() {
    if (phase === "countdown") {
      g.fillStyle = "rgba(30,34,70,0.78)";
      g.fillRect(0, 0, VIEW_W, VIEW_H);
      g.textAlign = "center"; g.textBaseline = "middle";
      g.font = `800 200px ${FONT}`;
      g.fillStyle = INK;
      const n = Math.ceil(countdown);
      g.fillText(n > 0 ? String(n) : "GO", VIEW_W / 2, VIEW_H / 2);
      return;
    }

    if (phase === "race" && raceEndElapsed !== null) {
      const remaining = Math.max(0, raceEndElapsed - elapsed);
      const bw = 360, bh = 54;
      const bx = (VIEW_W - bw) / 2, by = 14;
      g.fillStyle = "rgba(26,30,61,0.92)";
      roundRectPath(g, bx, by, bw, bh, bh / 2);
      g.fill();
      g.strokeStyle = CARD_EDGE;
      g.lineWidth = 2; g.stroke();

      g.fillStyle = INK;
      g.font = `700 24px ${FONT}`;
      g.textAlign = "center"; g.textBaseline = "middle";
      g.fillText(`Race ends in ${Math.ceil(remaining)}s`, VIEW_W / 2, by + bh / 2);
      return;
    }

    if (phase === "ready") {
      g.fillStyle = "rgba(30,34,70,0.72)";
      g.fillRect(0, 0, VIEW_W, VIEW_H);
      g.textAlign = "center"; g.textBaseline = "middle";

      if (finishers.length > 0) {
        const info = ctx.player(finishers[0]);
        g.font = `800 100px ${FONT}`;
        g.fillStyle = info ? info.color : INK;
        g.fillText(`${info ? info.name : "Player"} wins!`, VIEW_W / 2, VIEW_H / 2 - 60);
      } else {
        g.font = `800 90px ${FONT}`;
        g.fillStyle = INK;
        g.fillText("Round over", VIEW_W / 2, VIEW_H / 2 - 60);
      }

      g.font = `600 30px ${FONT}`;
      g.fillStyle = MUTED;
      g.fillText(`Press any button to continue (${countReady()}/${players.size})`,
                 VIEW_W / 2, VIEW_H / 2 + 40);

      const gap = 44, dotR = 12;
      const totalW = Math.max(0, playerList.length - 1) * gap;
      let x = VIEW_W / 2 - totalW / 2;
      for (const p of playerList) {
        const info = ctx.player(p.slot);
        g.fillStyle = p.ready ? (info ? info.color : MUTED) : "rgba(90,97,136,0.35)";
        g.beginPath(); g.arc(x, VIEW_H / 2 + 110, dotR, 0, TAU); g.fill();
        x += gap;
      }
    }
  }

  function render() {
    g.fillStyle = BG;
    g.fillRect(0, 0, VIEW_W, VIEW_H);

    const n = playerOrder.length;
    const layout = LAYOUTS[Math.min(6, Math.max(1, n))];
    const rows = layout[0], cols = layout[1];
    const cellW = VIEW_W / cols;
    const cellH = VIEW_H / rows;
    const shown = Math.min(n, rows * cols);

    vp.w = cellW; vp.h = cellH;
    for (let i = 0; i < shown; i++) {
      const col = i % cols;
      const row = (i / cols) | 0;
      vp.x = col * cellW;
      vp.y = row * cellH;
      renderViewport(vp, playerOrder[i]);
    }

    renderOverlay();
  }

  function frame(now) {
    if (exiting) return;
    let dt = (now - last) / 1000;
    if (dt > 0.05) dt = 0.05;
    if (dt < 0) dt = 0;
    last = now;
    refreshPlayerLists();
    update(dt);
    render();
    raf = requestAnimationFrame(frame);
  }
  raf = requestAnimationFrame(frame);

  return {
    destroy() {
      exiting = true;
      cancelAnimationFrame(raf);
      raf = 0;
      players.clear();
      inputs.clear();
      dpad.clear();
      // Give the root back the way we found it.
      for (const [k, v, prio] of savedRootStyle) {
        if (v) root.style.setProperty(k, v, prio);
        else root.style.removeProperty(k);
      }
    },
  };
}
