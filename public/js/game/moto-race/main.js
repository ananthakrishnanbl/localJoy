// Turbo Bikes: 3D motorbike racing for 1-4 phones, split screen, tilt steering.
// Controller type "race" (see /js/pad/race.js). Loaded by console.js, which calls start(ctx).
//
// Flow:  select (pick a cube bike with the basic pad)  ->  countdown (phones switch to tilt)
//        ->  race (3 laps)  ->  results  ->  back to select
//
// Phone -> game messages
//   select mode: { type: "move", x, y }, { type: "button", id: "A" | "B", pressed }
//   drive mode:  { type: "race", steer: -1..1 (right +), gas: bool, brake: bool }
// Game -> phone messages
//   { type: "race-mode", mode: "select" | "drive" }, { type: "race-recenter" }, { type: "hud", text }, { type: "vibrate", ms }
//
// Keyboard test player (no phone): arrows or WASD to drive/browse, Enter or Space to lock in a bike.

import * as THREE from "./three.js";
import { createBike, stepBike, collideBikes } from "./physics.js";
import { createTrack } from "./track.js";
import { createBikeMesh } from "./bike.js";

const LAPS = 3;
const MAX_RACERS = 4;
const STEP = 1 / 120;            // physics step
const COUNTDOWN = 3;
// Sand never respawns you any more: it just slows you down (see SAND_DRAG / SAND_POWER in physics.js).
// Only the mountains behind the sand send you back to the road.
const FINISH_TIMEOUT = 20;       // others get this long once somebody finishes
const RESULTS_TIME = 10;

const KEYBOARD = "kb";
const KB_INFO = { name: "Keyboard", animal: "⌨️" };

// Same order as the models in bike.js: B1 scooter, B2 chopper, B3 cruiser, B4 sport bike.
// "color" is only used for the swatches and name tags, it matches the model's main colour.
const BIKES = [
  { name: "Pearl Scooter", color: "#e4e6ea" },
  { name: "Gold Chopper", color: "#f0a41e" },
  { name: "Navy Cruiser", color: "#2f3f9e" },
  { name: "Red Rocket", color: "#e0401c" },
];

const COAST = { steer: 0, gas: false, brake: true };
const IDLE = { steer: 0, gas: false, brake: false };

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const angDiff = (a, b) => Math.atan2(Math.sin(a - b), Math.cos(a - b));
const ordinal = (n) => ["1st", "2nd", "3rd", "4th"][n - 1] || `${n}th`;
const fmt = (t) => `${Math.floor(t / 60)}:${(t % 60).toFixed(2).padStart(5, "0")}`;
const set = (node, text) => { if (node.textContent !== text) node.textContent = text; };

function el(tag, cls, text) {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text !== undefined) n.textContent = text;
  return n;
}

// Viewport rectangles as fractions of the stage: [x, y, w, h], y measured from the top.
function layout(n) {
  if (n <= 1) return [[0, 0, 1, 1]];
  if (n === 2) return [[0, 0, 0.5, 1], [0.5, 0, 0.5, 1]];
  return [[0, 0, 0.5, 0.5], [0.5, 0, 0.5, 0.5], [0, 0.5, 0.5, 0.5], [0.5, 0.5, 0.5, 0.5]];
}

const CSS = `
.moto-stage { position: relative; width: 100%; height: 100%; min-height: 0; box-sizing: border-box;
  background: #0a1620; border: 6px solid var(--ink); border-radius: 28px; box-shadow: 0 10px 0 var(--shadow); overflow: hidden; }
.moto-stage canvas { position: absolute; inset: 0; width: 100%; height: 100%; display: block; }
.moto-huds { position: absolute; inset: 0; pointer-events: none; }
.mv { position: absolute; box-sizing: border-box; container-type: size; font-family: Fredoka, sans-serif; color: #fff;
  text-shadow: 0 2px 0 rgba(0,0,0,.5); overflow: hidden; outline: 2px solid rgba(10,22,32,.9); outline-offset: -1px; }
.mv > * { position: absolute; }
.mv .tag { left: 2.5cqw; top: 3cqh; padding: .25em .8em; border-radius: 999px; font-weight: 700; font-size: clamp(12px, 3.2cqw, 26px); color: #10202b; text-shadow: none; }
.mv .lap { left: 0; right: 0; top: 3cqh; text-align: center; font-weight: 700; font-size: clamp(14px, 4cqw, 32px); }
.mv .time { left: 0; right: 0; top: 11cqh; text-align: center; font-size: clamp(12px, 3cqw, 24px); opacity: .9; }
.mv .pos { right: 3cqw; top: 2cqh; font-weight: 700; font-size: clamp(20px, 7cqw, 56px); }
.mv .speed { right: 3cqw; bottom: 3cqh; font-weight: 700; font-size: clamp(16px, 5cqw, 40px); }
.mv .msg { left: 0; right: 0; top: 28%; text-align: center; font-weight: 700; font-size: clamp(28px, 12cqw, 110px); white-space: pre-line; line-height: 1.05; }
.mv .pick { left: 0; right: 0; bottom: 0; padding: 2cqh 2cqw 3cqh; text-align: center; background: linear-gradient(transparent, rgba(10,22,32,.85) 35%); }
.pick .pt { font-size: clamp(12px, 3cqw, 22px); letter-spacing: .12em; opacity: .85; }
.pick .sw { display: flex; gap: 2cqw; justify-content: center; margin: 1cqh 0; }
.pick .sw span { display: block; width: 9cqw; height: 9cqw; max-width: 56px; max-height: 56px; border-radius: 12px; border: 4px solid transparent; }
.pick .sw span.cur { border-color: #fff; transform: scale(1.18); }
.pick .sw span.taken { opacity: .25; }
.pick .bn { font-size: clamp(16px, 5cqw, 34px); font-weight: 700; }
.pick .ph { font-size: clamp(11px, 2.6cqw, 18px); opacity: .85; }
.mv.panel { background: #0f2230; display: grid; place-items: center; text-align: center; white-space: pre; font-size: clamp(14px, 3.4cqw, 28px); line-height: 1.5; }
.mv.panel > * { position: static; }
`;

export function start(ctx) {
  const { root, signal } = ctx;
  const on = (target, type, fn) => target.addEventListener(type, fn, { signal });

  const style = document.createElement("style");
  style.textContent = CSS;
  document.head.append(style);

  /* ---------------- Renderer: one canvas, one viewport per player ---------------- */

  const stage = el("div", "moto-stage");
  const hudLayer = el("div", "moto-huds");
  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  stage.append(renderer.domElement, hudLayer);
  root.replaceChildren(stage);

  let W = 1, H = 1;
  const ro = new ResizeObserver(() => {
    W = Math.max(1, stage.clientWidth);
    H = Math.max(1, stage.clientHeight);
    renderer.setSize(W, H, false);
  });
  ro.observe(stage);

  /* ---------------- Scenes ---------------- */

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x8ec9f0);
  scene.fog = new THREE.Fog(0xbfdcf0, 250, 1500);
  scene.add(new THREE.HemisphereLight(0xdff1ff, 0xd8bd80, 1.0));
  const sun = new THREE.DirectionalLight(0xffffff, 1.2);
  sun.position.set(300, 500, 200);
  scene.add(sun);

  const track = createTrack();
  scene.add(track.group);

  // Showroom for the bike-select phase: the four bike models on a turntable, each viewport shows the one its player picked
  const show = new THREE.Scene();
  show.background = new THREE.Color(0x14283a);
  show.add(new THREE.HemisphereLight(0xffffff, 0x334455, 1.1));
  const showLight = new THREE.DirectionalLight(0xffffff, 1.2);
  showLight.position.set(4, 8, 6);
  show.add(showLight);
  const floor = new THREE.Mesh(new THREE.CylinderGeometry(5.4, 5.4, 0.2, 48), new THREE.MeshLambertMaterial({ color: 0x2b4257 }));
  floor.position.y = -0.1;
  show.add(floor);
  const showBikes = BIKES.map((_, i) => createBikeMesh(i));      // models swap in by themselves once loaded
  showBikes.forEach((s) => show.add(s.root));
  const showCam = new THREE.PerspectiveCamera(40, 1, 0.1, 100);
  showCam.position.set(0, 4.4, 12.5);
  showCam.lookAt(0, 1.5, 0);

  /* ---------------- State ---------------- */

  const racers = new Map();     // slot -> racer
  const order = [];             // slots in viewport order
  let phase = "select";         // "select" | "countdown" | "race" | "results"
  let cd = 0, raceTime = 0, goT = 0, endT = Infinity, resultsT = 0;
  let finishedCount = 0, tick = 0;
  let lb = null;                // standings panel, shown in the spare quadrant with 3 players

  const who = (r) => (r.slot === KEYBOARD ? KB_INFO : ctx.player(r.slot) || { name: "?", animal: "🏍️" });
  const buzz = (r, ms) => ctx.send(r.slot, { type: "vibrate", ms });
  const hudText = (r, text) => ctx.send(r.slot, { type: "hud", text });
  const takenByOther = (r, k) => [...racers.values()].some((o) => o !== r && o.locked && o.bikeIdx === k);

  /* ---------------- Racers ---------------- */

  function freeBike() {
    const used = new Set([...racers.values()].map((r) => r.bikeIdx));
    for (let k = 0; k < BIKES.length; k++) if (!used.has(k)) return k;
    return 0;
  }

  function addRacer(slot) {
    if (phase !== "select" || racers.has(slot) || racers.size >= MAX_RACERS) return;
    const r = {
      slot, bikeIdx: freeBike(), locked: false, navDir: 0,
      input: { ...IDLE },
      bike: null, mesh: null, hud: null,
      cam: new THREE.PerspectiveCamera(66, 1, 0.5, 3000), camYaw: 0, camPos: new THREE.Vector3(),
      idx: 0, prevIdx: 0, lap: -1, progress: 0,
      finished: false, finishTime: 0, place: 0, dnf: false,
      sandT: 0, shield: 0, msg: "", msgT: 0, wrongT: 0, surface: "road",
    };
    racers.set(slot, r);
    order.push(slot);
    ctx.send(slot, { type: "race-mode", mode: "select" });
    hudText(r, "Pick your bike");
    layoutHuds();
  }

  function removeRacer(slot) {
    const r = racers.get(slot);
    if (!r) return;
    if (r.mesh) scene.remove(r.mesh.root);
    racers.delete(slot);
    order.splice(order.indexOf(slot), 1);
    layoutHuds();
    if (phase === "select" && racers.size && [...racers.values()].every((q) => q.locked)) startCountdown();
    if (phase === "race" && racers.size && [...racers.values()].every((q) => q.finished)) startResults();
  }

  /* ---------------- Bike select ---------------- */

  function cycle(r, d) {
    for (let k = 0; k < BIKES.length; k++) {
      r.bikeIdx = (r.bikeIdx + d + BIKES.length) % BIKES.length;
      if (!takenByOther(r, r.bikeIdx)) break;      // skip colours somebody else already locked
    }
    buzz(r, 10);
  }

  function navigate(r, x) {                         // stick left/right = previous/next bike
    if (phase !== "select" || r.locked) return;
    const d = x > 0.6 ? 1 : x < -0.6 ? -1 : 0;
    if (d && d !== r.navDir) cycle(r, d);
    r.navDir = d;
  }

  function lock(r) {
    if (phase !== "select" || r.locked) return;
    if (takenByOther(r, r.bikeIdx)) { r.msg = "Taken!"; r.msgT = 1; buzz(r, 80); return; }
    r.locked = true;
    buzz(r, 30);
    if ([...racers.values()].every((q) => q.locked)) startCountdown();
  }

  function unlock(r) {
    if (phase === "select") r.locked = false;
  }

  /* ---------------- Race flow ---------------- */

  function startCountdown() {
    phase = "countdown";
    cd = COUNTDOWN;
    finishedCount = 0;
    endT = Infinity;
    order.forEach((slot, k) => {
      const r = racers.get(slot);
      const p = track.gridPose(k);
      r.bike = createBike(p.x, p.z, p.psi);
      r.mesh = createBikeMesh(r.bikeIdx);
      scene.add(r.mesh.root);
      r.idx = r.prevIdx = p.idx;
      r.lap = -1; r.progress = 0;
      r.finished = false; r.place = 0; r.dnf = false;
      r.sandT = 0; r.shield = 0; r.msgT = 0; r.wrongT = 0;
      r.input = { ...IDLE };
      r.camYaw = p.psi;
      syncMesh(r);
      updateCamera(r, 0, true);
      ctx.send(slot, { type: "race-mode", mode: "drive" });   // phone switches from the basic pad to the gyroscope
      hudText(r, "Get ready…");
    });
  }

  function startRace() {
    phase = "race";
    raceTime = 0;
    goT = 1.2;
    racers.forEach((r) => ctx.send(r.slot, { type: "race-recenter" }));   // "straight" = how you hold the phone right now
  }

  function finish(r) {
    r.finished = true;
    r.finishTime = raceTime;
    r.place = ++finishedCount;
    buzz(r, [100, 60, 100, 60, 200]);
    if (finishedCount === 1) endT = FINISH_TIMEOUT;
    if ([...racers.values()].every((q) => q.finished)) startResults();
  }

  function startResults() {
    if (phase !== "race") return;
    phase = "results";
    resultsT = RESULTS_TIME;
    endT = Infinity;
    [...racers.values()].filter((r) => !r.place).sort((a, b) => b.progress - a.progress)
      .forEach((r) => { r.place = ++finishedCount; r.dnf = true; });
    racers.forEach((r) => hudText(r, "Race over"));
  }

  function resetToSelect() {
    racers.forEach((r) => {
      if (r.mesh) scene.remove(r.mesh.root);
      r.mesh = null; r.bike = null;
      r.locked = false; r.finished = false; r.place = 0; r.dnf = false;
      r.input = { ...IDLE }; r.navDir = 0; r.msgT = 0;
    });
    phase = "select";
    finishedCount = 0;
    endT = Infinity;
    ctx.players().forEach((p) => addRacer(p.slot));                  // anyone who joined during the race
    racers.forEach((r) => { ctx.send(r.slot, { type: "race-mode", mode: "select" }); hudText(r, "Pick your bike"); });
  }

  function rankOf(r) {
    if (r.place) return r.place;
    let rank = finishedCount + 1;
    for (const o of racers.values()) if (!o.place && o !== r && o.progress > r.progress) rank++;
    return rank;
  }

  /* ---------------- Simulation ---------------- */

  function respawn(r, q) {
    const p = track.respawnPose(q.idx, q.d);
    const b = r.bike;
    b.x = p.x; b.z = p.z; b.psi = p.psi;
    b.vx = Math.sin(p.psi) * 8; b.vz = Math.cos(p.psi) * 8;          // rolling again, not stopped dead
    b.omega = 0; b.steer = 0; b.throttle = 0; b.brake = 0; b.lean = 0; b.pitch = 0;
    r.idx = p.idx;
    r.sandT = 0;
    r.shield = 1.6;                                                    // blinking and untouchable for a moment
    r.msg = "RESPAWNED"; r.msgT = 1.4;
    r.camYaw = p.psi;
    updateCamera(r, 0, true);
    buzz(r, [60, 40, 60]);
  }

  // Lap counting by watching the sample index wrap around the loop
  function progress(r, q, dt) {
    const N = track.N;
    if (r.prevIdx > N * 0.75 && q.idx < N * 0.25) r.lap++;
    else if (r.prevIdx < N * 0.25 && q.idx > N * 0.75) r.lap--;
    r.prevIdx = q.idx;
    r.progress = r.lap * track.length + track.samples[q.idx].s + q.along;

    const s = track.samples[q.idx], b = r.bike;
    r.wrongT = b.vx * s.tx + b.vz * s.tz < -3 ? r.wrongT + dt : 0;

    if (phase === "race" && !r.finished && r.lap >= LAPS) finish(r);
  }

  function simulate(dt) {
    const list = [...racers.values()].filter((r) => r.bike);
    for (const r of list) {
      const b = r.bike;
      const racing = phase === "race" && !r.finished;
      const q = track.query(b.x, b.z, r.idx);
      stepBike(b, racing ? r.input : COAST, q.surface === "road" ? "road" : "sand", dt);
      const q2 = track.query(b.x, b.z, q.idx);
      r.idx = q2.idx;
      r.surface = q2.surface;
      r.shield -= dt;
      if (q2.surface === "road") r.sandT = 0; else r.sandT += dt;
      if (racing && q2.surface === "wall") respawn(r, q2);   // only hitting the mountains puts you back on the road
      else progress(r, q2, dt);
    }
    if (phase !== "race") return;

    for (let i = 0; i < list.length; i++) {
      for (let j = i + 1; j < list.length; j++) {
        const a = list[i], c = list[j];
        if (a.shield > 0 || c.shield > 0) continue;
        const hit = collideBikes(a.bike, c.bike);
        if (hit > 2) { const ms = Math.min(160, Math.round(hit * 14)); buzz(a, ms); buzz(c, ms); }
      }
    }
    if (isFinite(endT)) { endT -= dt; if (endT <= 0) startResults(); }
  }

  function step(dt) {
    tick++;
    for (const r of racers.values()) if (r.msgT > 0) r.msgT -= dt;
    if (goT > 0) goT -= dt;

    if (phase === "countdown") {
      cd -= dt;
      if (cd <= 0) startRace();
    } else if (phase === "race") {
      raceTime += dt;
      simulate(dt);
    } else if (phase === "results") {
      simulate(dt);                                  // finished bikes roll to a stop
      resultsT -= dt;
      if (resultsT <= 0) resetToSelect();
    }

    if (tick % 30 === 0 && (phase === "race" || phase === "results")) {
      const n = racers.size;
      racers.forEach((r) => r.bike && hudText(r,
        `${ordinal(rankOf(r))}/${n} · Lap ${clamp(r.lap + 1, 1, LAPS)}/${LAPS} · ${Math.round(r.bike.speed * 3.6)} km/h`));
    }
  }

  /* ---------------- Visuals: bike meshes and third-person cameras ---------------- */

  function syncMesh(r) {
    const b = r.bike, m = r.mesh;
    m.root.position.set(b.x, 0, b.z);
    m.root.rotation.set(b.pitch, b.psi, 0);
    m.lean.rotation.z = -b.lean;                                      // lean into the turn
    m.root.visible = r.shield <= 0 || Math.floor(r.shield * 10) % 2 === 0;
  }

  function updateCamera(r, dt, snap = false) {
    const b = r.bike;
    const sp = Math.hypot(b.vx, b.vz);
    r.camYaw += angDiff(b.psi, r.camYaw) * (snap ? 1 : 1 - Math.exp(-6 * dt));   // swings round behind the bike with a little lag
    const dist = 15 + sp * 0.02, h = 5.8 + sp * 0.01;                             // almost constant, so the bike keeps its size on screen
    // The camera sits exactly `dist` behind the bike, so it moves at the bike's speed and never falls behind.
    // Only the height is smoothed. The swing round corners still lags a little through camYaw above.
    const tx = b.x - Math.sin(r.camYaw) * dist, tz = b.z - Math.cos(r.camYaw) * dist;
    if (snap) r.camPos.y = h;
    else r.camPos.y += (h - r.camPos.y) * (1 - Math.exp(-8 * dt));
    r.camPos.x = tx;
    r.camPos.z = tz;
    r.cam.position.copy(r.camPos);
    r.cam.fov = 64 + Math.min(sp, 60) * 0.1;                                      // only a slight widening with speed
    r.cam.lookAt(b.x + Math.sin(r.camYaw) * 11, 2.6, b.z + Math.cos(r.camYaw) * 11);
  }

  function render(timeSec) {
    renderer.setScissorTest(false);
    renderer.setViewport(0, 0, W, H);
    renderer.setClearColor(0x0a1620, 1);
    renderer.clear();
    renderer.setScissorTest(true);

    const rects = layout(order.length);
    order.forEach((slot, i) => {
      const r = racers.get(slot);
      const [fx, fy, fw, fh] = rects[i];
      const x = Math.round(fx * W), w = Math.round((fx + fw) * W) - x;
      const yTop = Math.round(fy * H), h = Math.round((fy + fh) * H) - yTop;
      const y = H - yTop - h;                                          // GL origin is bottom-left
      renderer.setViewport(x, y, w, h);
      renderer.setScissor(x, y, w, h);
      if (phase === "select" || !r.bike) {
        showBikes.forEach((s, i) => { s.root.visible = i === r.bikeIdx; });
        showBikes[r.bikeIdx].root.rotation.y = timeSec * 0.9;
        showCam.aspect = w / h;
        showCam.updateProjectionMatrix();
        renderer.render(show, showCam);
      } else {
        r.cam.aspect = w / h;
        r.cam.updateProjectionMatrix();
        renderer.render(scene, r.cam);
      }
    });
  }

  /* ---------------- HUD (HTML laid over each viewport) ---------------- */

  function place(node, [x, y, w, h]) {
    Object.assign(node.style, { left: `${x * 100}%`, top: `${y * 100}%`, width: `${w * 100}%`, height: `${h * 100}%` });
  }

  function layoutHuds() {
    hudLayer.replaceChildren();
    lb = null;
    const rects = layout(order.length);
    order.forEach((slot, i) => {
      const r = racers.get(slot);
      const box = el("div", "mv");
      place(box, rects[i]);
      const h = {
        tag: el("div", "tag"), lap: el("div", "lap"), pos: el("div", "pos"), time: el("div", "time"),
        speed: el("div", "speed"), msg: el("div", "msg"),
        pick: el("div", "pick"), pt: el("div", "pt", "PICK YOUR BIKE"),
        sw: BIKES.map((b) => { const s = el("span"); s.style.background = b.color; return s; }),
        bn: el("div", "bn"), ph: el("div", "ph"),
      };
      const sw = el("div", "sw");
      sw.append(...h.sw);
      h.pick.append(h.pt, sw, h.bn, h.ph);
      box.append(h.tag, h.lap, h.pos, h.time, h.speed, h.msg, h.pick);
      r.hud = h;
      hudLayer.append(box);
    });
    if (order.length === 3) {                                          // use the spare quadrant for standings
      const panel = el("div", "mv panel");
      place(panel, rects[3]);
      lb = el("div");
      panel.append(lb);
      hudLayer.append(panel);
    }
  }

  function updateHud() {
    const n = order.length, inSelect = phase === "select";
    for (const slot of order) {
      const r = racers.get(slot), h = r.hud;
      if (!h) continue;
      const info = who(r), bike = BIKES[r.bikeIdx];
      set(h.tag, `${info.animal || "🏍️"} ${info.name}`);
      if (h.tag.dataset.c !== bike.color) { h.tag.dataset.c = bike.color; h.tag.style.background = bike.color; }

      h.pick.style.display = inSelect ? "" : "none";
      for (const k of ["lap", "pos", "time", "speed"]) h[k].style.display = inSelect ? "none" : "";

      let msg = "";
      if (inSelect) {
        set(h.bn, bike.name + (r.locked ? "  ✓ READY" : ""));
        set(h.ph, r.locked ? "Press B to change your mind" : "Stick ◀ ▶ to browse · A to lock in");
        h.sw.forEach((s, k) => {
          const cls = (k === r.bikeIdx ? "cur " : "") + (takenByOther(r, k) ? "taken" : "");
          if (s.className !== cls) s.className = cls;
        });
        if (r.msgT > 0) msg = r.msg;
      } else {
        set(h.lap, `LAP ${clamp(r.lap + 1, 1, LAPS)}/${LAPS}`);
        set(h.pos, `${ordinal(rankOf(r))}/${n}`);
        set(h.time, phase === "countdown" ? "" : fmt(r.finished ? r.finishTime : raceTime));
        set(h.speed, r.bike ? `${Math.round(r.bike.speed * 3.6)} km/h` : "");

        if (phase === "countdown") msg = String(Math.max(1, Math.ceil(cd)));
        else if (r.finished || phase === "results") msg = `🏁 ${ordinal(r.place || rankOf(r))}\n${r.dnf ? "DNF" : fmt(r.finishTime)}`;
        else if (goT > 0) msg = "GO!";
        else if (r.msgT > 0) msg = r.msg;
        else if (r.wrongT > 1) msg = "WRONG WAY";
        else if (r.sandT > 0.05) msg = "OFF ROAD!";
      }
      set(h.msg, msg);
    }

    if (lb) {
      const rows = [...racers.values()].map((r) => ({ r, rank: inSelect ? 0 : rankOf(r) })).sort((a, b) => a.rank - b.rank);
      set(lb, [inSelect ? "CHOOSING BIKES" : "STANDINGS", ...rows.map(({ r, rank }) =>
        inSelect ? `${who(r).name} ${r.locked ? "✓" : "…"}` : `${rank}. ${who(r).name}`)].join("\n"));
    }
  }

  /* ---------------- Input ---------------- */

  const axis = (v) => clamp(+v || 0, -1, 1);

  on(window, "player-join", (e) => {
    addRacer(e.detail.slot);                                           // only works during bike select
    ctx.send(e.detail.slot, { type: "race-mode", mode: "select" });
  });
  on(window, "player-leave", (e) => removeRacer(e.detail.slot));

  on(window, "controller-input", (e) => {
    const { slot, data } = e.detail;
    const r = racers.get(slot);
    if (!r) return;
    if (data.type === "race") {
      r.input = { steer: axis(data.steer), gas: !!data.gas, brake: !!data.brake };
    } else if (data.type === "move") {
      navigate(r, axis(data.x));
    } else if (data.type === "button" && data.pressed) {
      if (data.id === "A") lock(r);
      else if (data.id === "B") unlock(r);
    }
  });

  // Keyboard test player
  const keys = {};
  const KEYSET = new Set(["w", "a", "s", "d", "arrowup", "arrowdown", "arrowleft", "arrowright", " ", "enter"]);
  const applyKeys = (r) => {
    r.input = {
      steer: (keys.d || keys.arrowright ? 1 : 0) - (keys.a || keys.arrowleft ? 1 : 0),
      gas: !!(keys.w || keys.arrowup),
      brake: !!(keys.s || keys.arrowdown),
    };
  };
  on(window, "keydown", (e) => {
    const k = e.key.toLowerCase();
    if (!KEYSET.has(k)) return;
    e.preventDefault();
    if (!racers.has(KEYBOARD)) addRacer(KEYBOARD);
    const r = racers.get(KEYBOARD);
    if (!r) return;
    keys[k] = true;
    if (phase === "select" && !e.repeat) {
      if (k === "arrowleft" || k === "a") { if (!r.locked) cycle(r, -1); }
      else if (k === "arrowright" || k === "d") { if (!r.locked) cycle(r, 1); }
      else if (k === "enter" || k === " ") lock(r);
      else if (k === "s" || k === "arrowdown") unlock(r);
    }
    applyKeys(r);
  });
  on(window, "keyup", (e) => {
    delete keys[e.key.toLowerCase()];
    const r = racers.get(KEYBOARD);
    if (r) applyKeys(r);
  });

  /* ---------------- Start ---------------- */

  ctx.players().forEach((p) => addRacer(p.slot));      // everyone already connected (first four)

  let last = performance.now(), acc = 0, raf = 0;
  function frame(now) {
    const dtf = Math.min(0.05, (now - last) / 1000);
    last = now;
    acc += dtf;
    while (acc >= STEP) { step(STEP); acc -= STEP; }
    for (const r of racers.values()) if (r.bike) { syncMesh(r); updateCamera(r, dtf); }
    render(now / 1000);
    updateHud();
    raf = requestAnimationFrame(frame);
  }
  raf = requestAnimationFrame(frame);

  return {
    destroy() {
      cancelAnimationFrame(raf);
      ro.disconnect();
      renderer.dispose();
      style.remove();
    },
  };
}