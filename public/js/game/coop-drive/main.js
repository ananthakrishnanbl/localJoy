// Co-op Highway: two phones per team. One steers, one works the pedals.
// Phases: teamsel (pick a team / spectator) -> select (pick a car colour)
//         -> countdown -> race -> end (results)
import * as THREE from "./three.js";
import { createTrack, START_S } from "./track.js";
import { createCarMesh, disposeCarAssets, CAR_COLORS } from "./car.js";
import {
  createCar,
  stepCar,
  wreckCar,
  boxHit,
  carBox,
  resolveCarCollision,
  TOP,
  wrap
} from "./physics.js";
import { createTraffic } from "./traffic.js";
import { checkFall, startFall, stepFalling } from "./abyss.js";

// ---------- constants ----------
const W = 1280, H = 720;
const STEP = 1 / 120;
const TEAM_SELECT_TIMEOUT = 60;
const SELECT_TIMEOUT = 60;
const COUNTDOWN_TIME = 3, END_TIME = 30;
const FINISH_LINE = 2500;
const RACE_MAX = 240;            // 4 minutes, then unfinished teams are DNF
const RESPAWN_TIME = 5;          // seconds between crash / fall and respawn
const RESPAWN_INVULN = 3;        // seconds of crash immunity after respawn
const RESPAWN_SPEED = 12;        // m/s rolling start after respawn
const MAX_TEAMS = Math.min(4, CAR_COLORS.length);
const WRECK_COLOR = 0x2b2b2b;
const SPEEDO_MAX = 160;          // km/h at the end of the dial
const SKID_LAT = 3.0;            // sideways speed (m/s) that leaves skid marks
const SKID_MAX = 1400;           // skid segments kept on the road
const MUSIC_ON = false;
const SKID_SOUND_ON = false;


function mulberry(a) {
  return () => {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const clamp01 = (v) => Math.max(0, Math.min(1, v));
const easeOutBack = (k) => { const c1 = 1.70158, c3 = c1 + 1; return 1 + c3 * Math.pow(k - 1, 3) + c1 * Math.pow(k - 1, 2); };
const easeOutBounce = (k) => {
  const n = 7.5625, d = 2.75;
  if (k < 1 / d) return n * k * k;
  if (k < 2 / d) return n * (k -= 1.5 / d) * k + 0.75;
  if (k < 2.5 / d) return n * (k -= 2.25 / d) * k + 0.9375;
  return n * (k -= 2.625 / d) * k + 0.984375;
};
const ORD = ["1st", "2nd", "3rd", "4th", "5th"];
const ordinal = (n) => ORD[n - 1] || n + "th";
function fmtTime(s) {
  const cs = Math.max(0, Math.floor(s * 100));
  const m = Math.floor(cs / 6000), sec = Math.floor(cs / 100) % 60, c = cs % 100;
  return m + ":" + String(sec).padStart(2, "0") + "." + String(c).padStart(2, "0");
}
function fmtClock(s) {
  const t = Math.max(0, Math.floor(s));
  return Math.floor(t / 60) + ":" + String(t % 60).padStart(2, "0");
}

export function start(ctx) {
  let destroyed = false, raf = 0, last = 0, acc = 0, exited = false;
  const disposables = [];
  const own = (o) => { disposables.push(o); return o; };
  const rng = mulberry(Math.floor(Math.random() * 2147483647));

  // ---------- audio (best effort) ----------
  let ac = null;
  try { ac = new (window.AudioContext || window.webkitAudioContext)(); } catch { ac = null; }
  function beep(f, d, type = "square", v = 0.05) {
    if (!ac) return;
    try {
      const o = ac.createOscillator(), g = ac.createGain();
      o.type = type; o.frequency.value = f; g.gain.value = v;
      g.gain.exponentialRampToValueAtTime(0.0001, ac.currentTime + d);
      o.connect(g); g.connect(ac.destination); o.start(); o.stop(ac.currentTime + d);
    } catch { /* ignore */ }
  }

  // ---------- phone helpers ----------
  const sendHud = (slot, text) => { try { ctx.send(slot, { type: "hud", text }); } catch { /* ignore */ } };
  const vib = (slot, ms) => { try { ctx.send(slot, { type: "vibrate", ms }); } catch { /* ignore */ } };
  const sendRole = (slot, role) => { try { ctx.send(slot, { type: "set-role", role }); } catch { /* ignore */ } };
  const sendMode = (slot, mode) => { try { ctx.send(slot, { type: "set-mode", mode }); } catch { /* ignore */ } };
  const broadcastMode = (mode) => { try { ctx.broadcast({ type: "set-mode", mode }); } catch { /* ignore */ } };

  // ---------- renderer ----------
  const canvas = document.createElement("canvas");
  canvas.width = W; canvas.height = H;
  canvas.style.cssText = "width:100%;height:100%;object-fit:contain;display:block;background:#000;";
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(1);
  renderer.setSize(W, H, false);
  renderer.autoClear = false;
  renderer.setScissorTest(true);
  ctx.root.replaceChildren(canvas);

  // ---------- race scene ----------
  const scene = new THREE.Scene();
  scene.add(new THREE.HemisphereLight(0xffffff, 0x4a6b3a, 0.9));
  const sun = new THREE.DirectionalLight(0xffffff, 0.8);
  sun.position.set(60, 120, 40);
  scene.add(sun);

  const mat = (c, o = {}) => own(new THREE.MeshLambertMaterial({ color: c, side: THREE.DoubleSide, ...o }));
  const basic = (c) => own(new THREE.MeshBasicMaterial({ color: c }));

  // ---------- showroom scene (car selection) ----------
  const SHOW_GAP = 80;
  const showScene = new THREE.Scene();
  showScene.background = new THREE.Color(0x10131a);
  showScene.fog = new THREE.Fog(0x10131a, 22, 46);
  showScene.add(new THREE.HemisphereLight(0xffffff, 0x303848, 0.9));
  const key = new THREE.DirectionalLight(0xffffff, 1.0);
  key.position.set(30, 50, 40);
  showScene.add(key);
  const rim = new THREE.DirectionalLight(0x88aaff, 0.5);
  rim.position.set(-40, 20, -30);
  showScene.add(rim);
  const platformGeo = own(new THREE.CylinderGeometry(4.6, 4.9, 0.3, 48));
  const platformMat = mat(0x232a36);
  const ringGeo = own(new THREE.RingGeometry(3.9, 4.3, 64).rotateX(-Math.PI / 2));

  // ---------- procedural track ----------
  const track = createTrack(rng);
  own(track);
  scene.add(track.group);
  track.applyAtmosphere(scene);

  let traffic = createTraffic(scene, track, rng);
  own(traffic);

  // ---------- particles ----------
  const debrisGeo = own(new THREE.BoxGeometry(1, 1, 1));
  const sparkM = basic(0xffd24a), fireM = basic(0xff7a1a), darkM = basic(0x222222);
  const parts = [];
  function burst(x, y, z, n, mats, spd, life, size) {
    for (let k = 0; k < n && parts.length < 240; k++) {
      const m = new THREE.Mesh(debrisGeo, mats[k % mats.length]);
      m.scale.setScalar(size * (0.5 + rng())); m.position.set(x, y, z); scene.add(m);
      const a = rng() * 6.283;
      parts.push({ m, vx: Math.cos(a) * spd * rng(), vy: spd * (0.4 + rng()), vz: Math.sin(a) * spd * rng(), life, rot: rng() * 8 });
    }
  }
  function stepParts(dt) {
    for (let i = parts.length - 1; i >= 0; i--) {
      const p = parts[i];
      p.life -= dt; p.vy -= 20 * dt;
      p.m.position.x += p.vx * dt; p.m.position.y += p.vy * dt; p.m.position.z += p.vz * dt;
      if (p.m.position.y < 0.1) { p.m.position.y = 0.1; p.vy *= -0.3; p.vx *= 0.8; p.vz *= 0.8; }
      p.m.rotation.x += p.rot * dt; p.m.rotation.z += p.rot * dt;
      if (p.life <= 0) { scene.remove(p.m); parts.splice(i, 1); }
    }
  }

  // ---------- skid marks ----------
  const skidPos = new Float32Array(SKID_MAX * 18);
  const skidGeo = own(new THREE.BufferGeometry());
  const skidAttr = new THREE.BufferAttribute(skidPos, 3);
  skidAttr.setUsage(THREE.DynamicDrawUsage);
  skidGeo.setAttribute("position", skidAttr);
  skidGeo.setDrawRange(0, 0);
  const skidMat = own(new THREE.MeshBasicMaterial({
    color: 0x050505, transparent: true, opacity: 0.6, depthWrite: false, side: THREE.DoubleSide,
    polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
  }));
  const skidMesh = new THREE.Mesh(skidGeo, skidMat);
  skidMesh.frustumCulled = false;
  scene.add(skidMesh);
  let skidHead = 0, skidCount = 0;
  function addSkidSeg(x0, z0, x1, z1) {
    const dx = x1 - x0, dz = z1 - z0, len = Math.hypot(dx, dz);
    if (len < 1e-4) return;
    const hw = 0.14, nx = -dz / len * hw, nz = dx / len * hw, y = 0.05;
    skidPos.set([
      x0 - nx, y, z0 - nz, x0 + nx, y, z0 + nz, x1 + nx, y, z1 + nz,
      x0 - nx, y, z0 - nz, x1 + nx, y, z1 + nz, x1 - nx, y, z1 - nz,
    ], skidHead * 18);
    skidHead = (skidHead + 1) % SKID_MAX;
    skidCount = Math.min(SKID_MAX, skidCount + 1);
    skidGeo.setDrawRange(0, skidCount * 6);
    skidAttr.needsUpdate = true;
  }
  function clearSkids() { skidHead = 0; skidCount = 0; skidGeo.setDrawRange(0, 0); }
  // marks from the rear wheels while sliding sideways or braking hard
  function emitSkid(t) {
    const c = t.car, fx = Math.sin(c.h), fz = Math.cos(c.h), rx = -fz, rz = fx;
    const fwd = c.vx * fx + c.vz * fz, lat = c.vx * rx + c.vz * rz;
    const slide = c.speed > 6 && Math.abs(lat) > SKID_LAT;
    const braking = t.drive.brake && fwd > 12;
    const on = c.alive && !c.falling && c.y < 0.2 && (slide || braking);
    t.skidding = on;
    for (let k = 0; k < 2; k++) {
      if (!on) { t.skOn[k] = false; continue; }
      const side = k === 0 ? -0.8 : 0.8;
      const x = c.x - fx * 1.3 + rx * side, z = c.z - fz * 1.3 + rz * side;
      if (!t.skOn[k]) { t.skOn[k] = true; t.skx[k] = x; t.skz[k] = z; continue; }
      const dd = Math.hypot(x - t.skx[k], z - t.skz[k]);
      if (dd >= 0.7) {
        if (dd < 4) addSkidSeg(t.skx[k], t.skz[k], x, z);
        t.skx[k] = x; t.skz[k] = z;
      }
    }
  }

  // ---------- engine sound (pitch follows speed) ----------
  const engines = [];
  function startEngines() {
    if (!ac || engines.length) return;
    try {
      for (const t of teams) {
        const osc = ac.createOscillator(); osc.type = "sawtooth"; osc.frequency.value = 40;
        const sub = ac.createOscillator(); sub.type = "square"; sub.frequency.value = 20;
        const lp = ac.createBiquadFilter(); lp.type = "lowpass"; lp.frequency.value = 300;
        const gain = ac.createGain(); gain.gain.value = 0;
        osc.connect(lp); sub.connect(lp); lp.connect(gain);
        let out = gain;
        if (ac.createStereoPanner) {
          const pan = ac.createStereoPanner();
          pan.pan.value = nTeams > 1 ? (t.id / (nTeams - 1)) * 1.2 - 0.6 : 0;
          gain.connect(pan); out = pan;
        }
        out.connect(ac.destination);
        osc.start(); sub.start();
        engines.push({ t, osc, sub, lp, gain, skid: makeSkidLoop(t) });
      }
    } catch { /* ignore */ }
  }
  // ---------- sound helpers: one-shots, tyre screech, music ----------
  let noiseBuf = null;
  function getNoise() {
    if (noiseBuf || !ac) return noiseBuf;
    const n = ac.sampleRate;
    noiseBuf = ac.createBuffer(1, n, ac.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
    return noiseBuf;
  }
  function tone(f, when, dur, type, vol, dest) {
    if (!ac) return;
    try {
      const o = ac.createOscillator(), g = ac.createGain();
      o.type = type; o.frequency.value = f;
      g.gain.setValueAtTime(vol, when);
      g.gain.exponentialRampToValueAtTime(0.0001, when + dur);
      o.connect(g); g.connect(dest || ac.destination);
      o.start(when); o.stop(when + dur + 0.02);
    } catch { /* ignore */ }
  }
  function noiseHit(when, dur, ftype, freq, vol, dest) {
    if (!ac) return;
    try {
      const src = ac.createBufferSource(); src.buffer = getNoise();
      const fl = ac.createBiquadFilter(); fl.type = ftype; fl.frequency.value = freq;
      const g = ac.createGain();
      g.gain.setValueAtTime(vol, when);
      g.gain.exponentialRampToValueAtTime(0.0001, when + dur);
      src.connect(fl); fl.connect(g); g.connect(dest || ac.destination);
      src.start(when); src.stop(when + dur + 0.02);
    } catch { /* ignore */ }
  }
  function crashSfx() {
    if (!ac) return;
    const n = ac.currentTime;
    noiseHit(n, 0.7, "lowpass", 1100, 0.30);
    noiseHit(n, 0.25, "highpass", 2500, 0.14);
    tone(70, n, 0.5, "sawtooth", 0.12);
  }
  function fanfare() {
    if (!ac) return;
    const n = ac.currentTime;
    [523, 659, 784, 1047].forEach((f, i) => tone(f, n + i * 0.12, i === 3 ? 0.7 : 0.18, "triangle", 0.08));
    tone(784, n + 0.36, 0.7, "square", 0.025);
  }
  function sadTune() {
    if (!ac) return;
    const n = ac.currentTime;
    [392, 349, 311, 262].forEach((f, i) => tone(f, n + i * 0.22, 0.3, "triangle", 0.07));
  }

  // tyre screech: looped noise, volume follows t.skidding
  function makeSkidLoop(t) {
    try {
      const src = ac.createBufferSource(); src.buffer = getNoise(); src.loop = true;
      const bp = ac.createBiquadFilter(); bp.type = "bandpass"; bp.frequency.value = 1800; bp.Q.value = 1.6;
      const gain = ac.createGain(); gain.gain.value = 0;
      src.connect(bp); bp.connect(gain);
      let out = gain;
      if (ac.createStereoPanner) {
        const pan = ac.createStereoPanner();
        pan.pan.value = nTeams > 1 ? (t.id / (nTeams - 1)) * 1.2 - 0.6 : 0;
        gain.connect(pan); out = pan;
      }
      out.connect(ac.destination);
      src.start();
      return { src, gain };
    } catch { return null; }
  }

  // background music: small procedural loop (Am - F - C - G)
  const CHORDS = [[110, [0, 3, 7]], [87.31, [0, 4, 7]], [130.81, [0, 4, 7]], [98, [0, 4, 7]]];
  const ARP = [0, 1, 2, 1, 0, 1, 2, 1];
  let musicGain = null, musicNext = 0, musicStep = 0;
  function playMusicStep(i, when) {
    const [root, tri] = CHORDS[Math.floor(i / 8) % CHORDS.length], k = i % 8;
    if (k % 2 === 0) tone(root, when, 0.13, "sawtooth", 0.05, musicGain);
    tone(root * 4 * Math.pow(2, tri[ARP[k]] / 12), when, 0.11, "square", 0.016, musicGain);
    if (k % 2 === 1) noiseHit(when, 0.04, "highpass", 6000, 0.025, musicGain);
    if (k === 0 || k === 4) noiseHit(when, 0.09, "lowpass", 220, 0.12, musicGain);   // kick-ish thump
  }
  function updateMusic() {
    if (!ac || ac.state !== "running") return;
    const now = ac.currentTime;
    if (!musicGain) {
      musicGain = ac.createGain(); musicGain.gain.value = 0; musicGain.connect(ac.destination);
      musicNext = now + 0.1;
    }
    const want = phase === "select" || phase === "countdown" || phase === "race";
    musicGain.gain.setTargetAtTime(want ? (phase === "select" ? 0.45 : 0.75) : 0, now, 0.3);
    if (!want) { musicNext = now + 0.1; return; }
    if (musicNext < now) musicNext = now + 0.05;
    while (musicNext < now + 0.25) { playMusicStep(musicStep++, musicNext); musicNext += 0.15; }
  }

  function updateEngines() {
    if (MUSIC_ON) 
      updateMusic();
    
    if (!ac || !engines.length) return;
    const now = ac.currentTime;
    const live = phase === "countdown" || phase === "race";
    for (const e of engines) {
      const t = e.t, c = t.car, v = Math.min(c.speed, TOP) / TOP;
      const on = live && c.alive && !c.falling && !t.dropped && !t.finished;
      const g = t.drive.gas ? 1 : 0;
      const f = 38 + v * 130 + g * 12;
      e.osc.frequency.setTargetAtTime(f, now, 0.06);
      e.sub.frequency.setTargetAtTime(f / 2, now, 0.06);
      e.lp.frequency.setTargetAtTime(260 + v * 900 + g * 150, now, 0.08);
      e.gain.gain.setTargetAtTime(on ? 0.008 + v * 0.022 + g * 0.008 : 0, now, 0.1);
      if (e.skid) e.skid.gain.gain.setTargetAtTime(phase === "race" && t.skidding && SKID_SOUND_ON ? 0.05 : 0, now, 0.05);
    }
  }

  // ---------- players / names ----------
  const nameCache = new Map(ctx.players().map((p) => [p.slot, p.name]));
  const playerInfo = (slot) => { try { return ctx.player(slot); } catch { return null; } };
  const nm = (slot) => {
    const p = playerInfo(slot);
    return String((p && p.name) || nameCache.get(slot) || ("P" + (slot + 1))).slice(0, 12);
  };

  // ---------- teams (built after the team-selection screen) ----------
  const roles = new Map();
  const teams = [];
  let nTeams = 0;

  function layout(n) {
    if (n <= 1) return [[0, 0, W, H]];
    if (n === 2) return [[0, 0, W / 2, H], [W / 2, 0, W / 2, H]];
    if (n === 3) return [[0, 0, W / 2, H / 2], [W / 2, 0, W / 2, H / 2], [W / 4, H / 2, W / 2, H / 2]]; // Centered
    return [[0, 0, W / 2, H / 2], [W / 2, 0, W / 2, H / 2], [0, H / 2, W / 2, H / 2], [W / 2, H / 2, W / 2, H / 2]];
  }
  let rects = layout(0);
  const colorOf = (t) => CAR_COLORS[t.colorIdx];

  function buildTeam(t, slotA, slotB) {
    let steer, pedal;
    if (rng() < 0.5) { steer = slotA; pedal = slotB; } else { steer = slotB; pedal = slotA; }

    const p = track.sample(START_S, (t - (nTeams - 1) / 2) * 5);
    const car = createCar(p.x, p.z, p.h);

    const mesh = createCarMesh(CAR_COLORS[t].hex);
    own(mesh);
    scene.add(mesh.root);

    const sx = t * SHOW_GAP;
    const platform = new THREE.Mesh(platformGeo, platformMat);
    platform.position.set(sx, -0.15, 0);
    showScene.add(platform);

    const ringMat = basic(0xffffff);
    ringMat.side = THREE.DoubleSide;
    const ring = new THREE.Mesh(ringGeo, ringMat);
    ring.position.set(sx, 0.03, 0);
    showScene.add(ring);

    const showMesh = createCarMesh(CAR_COLORS[t].hex);
    own(showMesh);
    showMesh.root.position.set(sx, 0, 0);
    showMesh.root.rotation.y = 0.6;
    showScene.add(showMesh.root);

    const [, , rw, rh] = rects[t];
    const cam = new THREE.PerspectiveCamera(62, rw / rh, 0.5, 400);
    const showCam = new THREE.PerspectiveCamera(40, rw / rh, 0.5, 200);
    showCam.position.set(sx + 7.5, 3.4, 9.5);
    showCam.lookAt(sx, 0.9, 0);

    const team = {
      id: t, steer, pedal,
      car, mesh, showMesh, ringMat, cam, showCam, camH: p.h, camInit: false,
      look: new THREE.Vector3(), rect: rects[t], input: { steer: 0, gas: false, brake: false },
      drive: { steer: 0, gas: false, brake: false }, box: carBox(car), loc: track.makeLoc(START_S),
      colorIdx: t, locked: false, dropped: false, steerPrev: 0, gasPrev: false, dist: 0, reason: "",
      // respawn / race result state
      respawnT: -1, invuln: 0, voided: false, safeS: START_S,
      finished: false, finishTime: 0, place: 0,
      needle: 0, skx: [0, 0], skz: [0, 0], skOn: [false, false],
    };

    roles.set(steer, { team: t, role: "steer" });
    roles.set(pedal, { team: t, role: "pedal" });
    teams.push(team);
    sendRole(steer, "steer");
    sendRole(pedal, "pedal");
  }

  // ---------- HUD overlay ----------
  const hudCanvas = document.createElement("canvas");
  hudCanvas.width = W; hudCanvas.height = H;
  const g2 = hudCanvas.getContext("2d");
  const hudTex = own(new THREE.CanvasTexture(hudCanvas));
  hudTex.colorSpace = THREE.SRGBColorSpace;
  const hudScene = new THREE.Scene();
  const hudCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 10);
  hudCam.position.z = 1;
  hudScene.add(new THREE.Mesh(own(new THREE.PlaneGeometry(2, 2)),
    own(new THREE.MeshBasicMaterial({ map: hudTex, transparent: true, depthTest: false, depthWrite: false }))));

  function text(s, x, y, size, color = "#fff", align = "left") {
    g2.font = `bold ${size}px system-ui,-apple-system,Segoe UI,sans-serif`;
    g2.textAlign = align; g2.textBaseline = "middle";
    g2.lineWidth = Math.max(3, size / 8); g2.strokeStyle = "rgba(0,0,0,0.75)";
    g2.strokeText(s, x, y); g2.fillStyle = color; g2.fillText(s, x, y);
  }

  // ---------- game state ----------
  let phase = "teamsel";
  let teamT = TEAM_SELECT_TIMEOUT, selectT = SELECT_TIMEOUT, countdownT = COUNTDOWN_TIME, raceT = 0, endT = END_TIME, abortT = 4;
  let pendingEnd = -1, lastTick = 0, hudAcc = 1, showAngle = 0, modeResendT = 0.3;
  let standings = [], winner = null, banner = null, confetti = [];
  const finishOrder = [];

  // ---------- team selection ----------
  // members: slot -> { team: 0..MAX_TEAMS-1 | -1 (spectator), ready, dirPrev }
  const members = new Map();
  const teamMembers = (idx) => [...members.entries()].filter(([, m]) => m.team === idx).map(([s]) => s).sort((a, b) => a - b);
  const specMembers = () => teamMembers(-1);
  // spectators are only allowed for the players who cannot be paired (odd count, or more than 8 players)
  const specCap = () => { const n = members.size; return n - 2 * Math.min(MAX_TEAMS, Math.floor(n / 2)); };
  const canEnter = (dest) => (dest >= 0 ? teamMembers(dest).length < 2 : specMembers().length < specCap());

  function arrangementValid() {
    if (members.size < 2) return false;
    for (let i = 0; i < MAX_TEAMS; i++) if (teamMembers(i).length === 1) return false;
    return specMembers().length === specCap();
  }
  const resetAllReady = () => { for (const m of members.values()) m.ready = false; };
  const resetTeamReady = (idx) => {
    if (idx < 0) return;
    for (const m of members.values()) if (m.team === idx) m.ready = false;
  };

  // Fill teams in pairs; leftover players become spectators.
  function autoArrange(keepFull) {
    const full = new Set();
    if (keepFull) for (let i = 0; i < MAX_TEAMS; i++) if (teamMembers(i).length === 2) full.add(i);
    const pool = [...members.keys()]
      .filter((s) => !full.has(members.get(s).team))
      .sort((a, b) => ((members.get(a).team === -1) - (members.get(b).team === -1)) || (a - b));
    const free = [];
    for (let i = 0; i < MAX_TEAMS; i++) if (!full.has(i)) free.push(i);
    const pairs = Math.min(free.length, Math.floor(pool.length / 2));
    pool.forEach((s, k) => { members.get(s).team = k < pairs * 2 ? free[Math.floor(k / 2)] : -1; });
    resetAllReady();
  }

  function addMember(slot) {
    members.set(slot, { team: -1, ready: false, dirPrev: 0 });
    const single = [...Array(MAX_TEAMS).keys()].find((i) => teamMembers(i).length === 1);
    const empty = [...Array(MAX_TEAMS).keys()].find((i) => teamMembers(i).length === 0);
    if (single !== undefined) members.get(slot).team = single;
    else if (specMembers().length - 1 < specCap() - 0 && specMembers().length <= specCap()) members.get(slot).team = -1;
    else if (empty !== undefined) members.get(slot).team = empty;
    resetAllReady();
  }

  function pushTeamHud(slot) {
    const m = members.get(slot);
    if (!m) return;
    if (m.team < 0) sendHud(slot, "SPECTATOR");
    else if (teamMembers(m.team).length < 2) sendHud(slot, "TEAM " + (m.team + 1) + " - NEED PARTNER");
    else sendHud(slot, "TEAM " + (m.team + 1) + (m.ready ? " - READY" : " - A: READY"));
  }
  const pushAllTeamHud = () => { for (const s of members.keys()) pushTeamHud(s); };

  function moveMember(slot, dir) {
    const m = members.get(slot); if (!m) return;
    const order = [...Array(MAX_TEAMS).keys(), -1];
    const i = order.indexOf(m.team);
    for (let k = 1; k < order.length; k++) {
      const dest = order[(((i + dir * k) % order.length) + order.length) % order.length];
      if (dest === m.team || !canEnter(dest)) continue;
      const from = m.team;
      m.team = dest; m.ready = false;
      resetTeamReady(from); resetTeamReady(dest);
      beep(520, 0.05, "square", 0.04);
      pushAllTeamHud();
      return;
    }
    sendHud(slot, "NO FREE SPOT");
  }

  function setReady(slot, value) {
    const m = members.get(slot); if (!m) return;
    if (m.team < 0) { pushTeamHud(slot); return; }
    if (value && teamMembers(m.team).length < 2) { pushTeamHud(slot); return; }
    if (m.ready === value) return;
    m.ready = value;
    if (value) { vib(slot, 60); beep(660, 0.1, "triangle", 0.06); }
    pushTeamHud(slot);
    maybeStartCarSelect();
  }

  function maybeStartCarSelect() {
    if (phase !== "teamsel" || !arrangementValid()) return;
    for (const m of members.values()) if (m.team >= 0 && !m.ready) return;
    startCarSelect();
  }

  function teamInput(slot, data) {
    const m = members.get(slot); if (!m) return;
    if (ac && ac.state === "suspended") ac.resume();
    if (data.type === "move") {
      const x = Math.max(-1, Math.min(1, Number(data.x) || 0));
      const dir = x > 0.5 ? 1 : x < -0.5 ? -1 : 0;
      if (dir !== 0 && dir !== m.dirPrev) moveMember(slot, dir);
      m.dirPrev = dir;
    } else if (data.type === "button" && data.pressed) {
      if (data.id === "A") setReady(slot, true);
      else if (data.id === "B") setReady(slot, false);
    }
  }

  function startCarSelect() {
    if (phase !== "teamsel") return;
    const groups = [];
    const inTeam = new Set();
    for (let i = 0; i < MAX_TEAMS; i++) {
      const g = teamMembers(i);
      if (g.length === 2) { groups.push(g); g.forEach((s) => inTeam.add(s)); }
    }
    if (!groups.length) { phase = "abort"; abortT = 4; return; }
    nTeams = groups.length;
    rects = layout(nTeams);
    groups.forEach((g, t) => buildTeam(t, g[0], g[1]));
    for (const s of members.keys()) {
      if (inTeam.has(s)) continue;
      sendRole(s, "spectator");
      sendHud(s, "SPECTATING");
    }
    phase = "select";
    selectT = SELECT_TIMEOUT;
    beep(880, 0.15, "triangle", 0.06);
    for (const t of teams) pushSelectHud(t);
  }

  // ---------- car selection ----------
  const takenByOther = (idx, t) => teams.some((o) => o !== t && o.locked && o.colorIdx === idx);
  const lockedCount = () => teams.filter((t) => t.locked).length;

  function pushSelectHud(t) {
    const c = colorOf(t).name.toUpperCase();
    if (t.locked) {
      sendHud(t.steer, "LOCKED: " + c);
      sendHud(t.pedal, "LOCKED: " + c);
    } else {
      sendHud(t.steer, "< " + c + " >");
      sendHud(t.pedal, "GAS: LOCK IN " + c);
    }
  }

  function applyColor(t) {
    const c = colorOf(t);
    t.showMesh.setColor(c.hex);
    t.mesh.setColor(c.hex);
    t.ringMat.color.set(t.locked ? 0x35d07f : 0xffffff);
  }

  function cycleColor(t, dir) {
    let idx = t.colorIdx;
    for (let k = 0; k < CAR_COLORS.length; k++) {
      idx = (idx + dir + CAR_COLORS.length) % CAR_COLORS.length;
      if (!takenByOther(idx, t)) break;
    }
    t.colorIdx = idx;
    applyColor(t);
    pushSelectHud(t);
  }

  function lockIn(t) {
    if (ac && ac.state === 'suspended') ac.resume();
    if (phase !== "select" || t.locked) return;
    t.locked = true;
    applyColor(t);
    pushSelectHud(t);
    vib(t.steer, 60); vib(t.pedal, 120);
    beep(660, 0.12, "triangle", 0.07);
    for (const o of teams) {
      if (o !== t && !o.locked && o.colorIdx === t.colorIdx) {
        cycleColor(o, 1);
        sendHud(o.pedal, "COLOR TAKEN");
      }
    }
    if (teams.every((o) => o.locked)) beginCountdown();
  }

  function beginCountdown() {
    if (phase !== "select") return;
    phase = "countdown";
    startEngines();
    countdownT = COUNTDOWN_TIME;
    lastTick = 0;
    for (const t of teams) {
      t.camInit = false;
      applyColor(t);
      if (t.dropped) {
        crash(t, "Driver disconnected", true);
      } else {
        sendHud(t.steer, "STEERING ONLY");
        sendHud(t.pedal, "UP: GAS | DOWN: BRAKE");
      }
    }
    beep(880, 0.2, "triangle", 0.06);
  }

  function browse(t, value) {
    if (ac && ac.state === 'suspended') ac.resume();
    const dir = value > 0.5 ? 1 : value < -0.5 ? -1 : 0;
    if (phase === "select" && !t.locked && dir !== 0 && dir !== t.steerPrev) {
      cycleColor(t, dir);
      beep(520, 0.05, "square", 0.04);
    }
    t.steerPrev = dir;
  }

  // ---------- crash / respawn / finish / end ----------
  function crash(t, reason, silent, skipBurst = false) {
    const c = t.car;
    if (!c.alive && !c.falling) return;
    wreckCar(c, rng);
    t.reason = reason;
    t.respawnT = (t.dropped || t.finished) ? -1 : RESPAWN_TIME;
    t.mesh.setColor(WRECK_COLOR);
    if (!skipBurst) burst(c.x, 1, c.z, 36, [fireM, darkM, sparkM], 14, 1.6, 0.4);
    crashSfx();
    if (!silent) {
      vib(t.steer, [100, 50, 200]); vib(t.pedal, [100, 50, 200]);
      sendHud(t.steer, "RESPAWNING..."); sendHud(t.pedal, "RESPAWNING...");
    }
  }

  // distance from a candidate spot to the nearest obstacle (traffic or another team's car)
  function clearance(t, s, d) {
    let best = 1e9;
    for (const tc of traffic.cars) best = Math.min(best, Math.hypot(tc.s - s, (tc.d - d) * 3));
    for (const o of teams) {
      if (o === t || !o.car.alive || o.car.falling) continue;
      best = Math.min(best, Math.hypot(o.loc.progress - s, (track.lateral(o.car.x, o.car.z, o.loc) - d) * 3));
    }
    return best;
  }

  function respawn(t) {
    const c = t.car;
    const base = Math.min(track.length - 80, Math.max(START_S, t.safeS - 4));
    let bestScore = -1, bs = base, bd = 0;
    for (const off of [0, -8, 8, -16, 16, -24, 24]) {
      const s = Math.min(track.length - 80, Math.max(START_S, base + off));
      for (const d of track.lanesAt(s)) {
        const score = Math.min(clearance(t, s, d), 40) - Math.abs(off) * 0.3;
        if (score > bestScore) { bestScore = score; bs = s; bd = d; }
      }
    }
    const p = track.sample(bs, bd);
    c.x = p.x; c.z = p.z; c.h = p.h;
    c.vx = Math.sin(p.h) * RESPAWN_SPEED; c.vz = Math.cos(p.h) * RESPAWN_SPEED;
    c.ang = 0; c.y = 0; c.vy = 0; c.roll = 0; c.rollV = 0; c.pitch = 0;
    c.alive = true; c.falling = false; c.fallT = 0; c.crashT = 0; c.bump = 0;
    c.speed = RESPAWN_SPEED;
    t.loc = track.makeLoc(bs);
    track.locate(c.x, c.z, t.loc);
    t.box = carBox(c, t.box);
    t.safeS = t.loc.progress;
    t.respawnT = -1; t.reason = "";
    t.voided = false; t.camInit = false;
    t.invuln = RESPAWN_INVULN;
    t.mesh.setColor(colorOf(t).hex);
    vib(t.steer, 80); vib(t.pedal, 80);
    sendHud(t.steer, "STEERING ONLY");
    sendHud(t.pedal, "UP: GAS | DOWN: BRAKE");
    beep(560, 0.12, "triangle", 0.06);
  }

  function stepRespawn(t, dt) {
    if (t.respawnT < 0 || t.dropped || t.finished) return;
    t.respawnT -= dt;
    if (t.respawnT <= 0) respawn(t);
  }

  function finishTeam(t) {
    if (t.finished) return;
    t.finished = true;
    t.finishTime = raceT;
    t.respawnT = -1;
    finishOrder.push(t);
    t.place = finishOrder.length;
    const txt = "FINISHED " + ordinal(t.place) + " - " + fmtTime(t.finishTime);
    sendHud(t.steer, txt); sendHud(t.pedal, txt);
    vib(t.steer, [150, 80, 150, 80, 300]); vib(t.pedal, [150, 80, 150, 80, 300]);
    banner = { text: "TEAM " + (t.id + 1) + " FINISHED " + ordinal(t.place).toUpperCase() + "!", css: colorOf(t).css, t: 4 };
    fanfare();
  }

  function endRace() {
    if (phase === "end") return;
    phase = "end"; endT = END_TIME; banner = null;
    const fin = finishOrder.slice();
    const dnf = teams.filter((t) => !t.finished).sort((a, b) => b.dist - a.dist);
    standings = [
      ...fin.map((t, i) => ({ t, place: i + 1, time: t.finishTime, dnf: false })),
      ...dnf.map((t, i) => ({ t, place: fin.length + i + 1, time: 0, dnf: true })),
    ];
    winner = fin[0] || null;
    const palette = ["#ffc233", "#ff3b3b", "#3b8bff", "#35d07f", "#ffffff", "#ff4fd8"];
    confetti = winner ? Array.from({ length: 90 }, () => ({
      x: rng() * W, y: -rng() * H, vx: (rng() - 0.5) * 60, vy: 90 + rng() * 140,
      rot: rng() * 6.28, vr: (rng() - 0.5) * 8, c: palette[Math.floor(rng() * palette.length)], s: 6 + rng() * 6,
    })) : [];
    for (const s of standings) {
      const txt = s.dnf ? "DNF" : ordinal(s.place) + " - " + fmtTime(s.time);
      sendHud(s.t.steer, txt); sendHud(s.t.pedal, txt);
      if (!s.dnf && s.place === 1) { vib(s.t.steer, [150, 80, 150, 80, 500]); vib(s.t.pedal, [150, 80, 150, 80, 500]); }
    }
    const specTxt = winner ? "TEAM " + (winner.id + 1) + " WINS" : "NO WINNER";
    for (const s of members.keys()) if (!roles.has(s)) sendHud(s, specTxt);
    // give everybody the default pad again so the host can press A to go back
    broadcastMode("pad");
    if (winner) fanfare(); else sadTune();
  }

  // ---------- rematch (same teams, same colours) ----------
  function rematch() {
    if (phase !== "end") return;
    traffic.dispose();
    traffic = createTraffic(scene, track, rng);
    own(traffic);
    clearSkids();
    for (const p of parts) scene.remove(p.m);
    parts.length = 0;
    for (const t of teams) {
      const p = track.sample(START_S, (t.id - (nTeams - 1) / 2) * 5);
      Object.assign(t.car, createCar(p.x, p.z, p.h), { falling: false, fallT: 0, pitch: 0 });
      t.loc = track.makeLoc(START_S);
      t.box = carBox(t.car, t.box);
      t.camH = p.h; t.camInit = false;
      t.input.steer = 0; t.input.gas = false; t.input.brake = false;
      t.drive.steer = 0; t.drive.gas = false; t.drive.brake = false;
      t.steerPrev = 0; t.gasPrev = false;
      t.dist = 0; t.reason = ""; t.respawnT = -1; t.invuln = 0; t.voided = false; t.safeS = START_S;
      t.finished = false; t.finishTime = 0; t.place = 0; t.needle = 0;
      t.skOn[0] = t.skOn[1] = false; t.skidding = false;
      t.mesh.setColor(colorOf(t).hex);
      t.mesh.root.visible = true;
      if (!t.dropped) { sendRole(t.steer, "steer"); sendRole(t.pedal, "pedal"); }
    }
    for (const s of members.keys()) if (!roles.has(s)) { sendRole(s, "spectator"); sendHud(s, "SPECTATING"); }
    raceT = 0; pendingEnd = -1; finishOrder.length = 0;
    standings = []; winner = null; banner = null; confetti = [];
    phase = "select";
    beginCountdown();
  }

  // ---------- fixed-step simulation ----------
  function stepTeam(t, dt, racing) {
    const c = t.car, d = t.drive;
    const ctl = racing && !t.finished;
    d.steer = ctl ? t.input.steer : 0;
    d.gas = ctl && t.input.gas;
    d.brake = ctl && t.input.brake;   // finished cars do NOT brake (braking at 0 speed = reverse)
    if (t.invuln > 0) t.invuln -= dt;

    if (c.falling) {
      if (stepFalling(c, dt)) t.voided = true;
    } else {
      stepCar(c, d, dt);
      if (t.finished && c.alive) {
        // roll to a smooth stop after the finish line and stay there (never reverse)
        const k = Math.exp(-2.4 * dt);
        c.vx *= k; c.vz *= k; c.speed *= k;
        if (Math.hypot(c.vx, c.vz) < 0.5) { c.vx = 0; c.vz = 0; c.speed = 0; }
      }
      const loc = track.locate(c.x, c.z, t.loc);

      if (!racing && !(t.finished && phase === "end")) return;

      emitSkid(t);

      const side = t.finished ? 0 : checkFall(c, track, loc);
      if (side) {
        crash(t, "Fell into the void!", false, true);
        startFall(c, side);
      } else if (c.alive && !t.finished) {
        if (Math.abs(track.lateral(c.x, c.z, loc)) < loc.half - 1) t.safeS = loc.progress;
        if (!(t.invuln > 0)) {
          const box = carBox(c, t.box);
          for (const tc of traffic.cars) {
            if (Math.abs(tc.s - loc.progress) < 10 && boxHit(box, tc.box)) {
              crash(t, "Hit a car");
              break;
            }
          }
        }
      }
    }

    if (c.alive && !c.falling && !t.finished) {
      t.dist = Math.max(t.dist, t.loc.progress - START_S);
      if (t.dist >= FINISH_LINE) finishTeam(t);
    }
  }

  function checkEnd(dt) {
    if (raceT >= RACE_MAX) { endRace(); return; }
    const stillRacing = teams.some((t) => !t.finished && !t.dropped);
    if (!stillRacing && pendingEnd < 0) pendingEnd = 1.5;
    if (pendingEnd >= 0) {
      pendingEnd -= dt;
      if (pendingEnd <= 0) endRace();
    }
  }

  const leave = () => { if (!exited) { exited = true; try { ctx.exit(); } catch { /* ignore */ } } };

  function step(dt) {
    if (phase === "abort") {
      abortT -= dt;
      if (abortT <= 0) leave();
      return;
    }
    if (phase === "teamsel") {
      teamT -= dt;
      // Keep telling every phone to show the gamepad (and its HUD text) while teams are
      // being picked. Phones load the controller a moment after the game starts, so a
      // single early message gets lost. Re-sending is harmless: the controller ignores
      // a mode it is already in.
      modeResendT -= dt;
      if (modeResendT <= 0) { modeResendT = 1; broadcastMode("pad"); pushAllTeamHud(); }
      if (teamT <= 0) {
        if (members.size < 2) { phase = "abort"; abortT = 4; }
        else { autoArrange(true); startCarSelect(); }
      }
      return;
    }
    if (phase === "select") {
      selectT -= dt;
      if (selectT <= 0) for (const t of teams) lockIn(t);
      return;
    }
    if (phase === "countdown") {
      countdownT -= dt;
      const k = Math.ceil(countdownT);
      if (k !== lastTick && k > 0) { lastTick = k; beep(440, 0.15); }
      if (countdownT <= 0) { phase = "race"; beep(880, 0.4); }
    } else if (phase === "race") {
      raceT += dt; // Count elapsed time
      if (banner) { banner.t -= dt; if (banner.t <= 0) banner = null; }
    }
    if (phase === "race" || phase === "end") {
      traffic.update(dt, raceT, teams.map(t => ({
        progress: t.loc.progress,
        d: track.lateral(t.car.x, t.car.z, t.loc),
        alive: t.car.alive && !t.finished,
      })));
    }
    for (const t of teams) stepTeam(t, dt, phase === "race");

    if (phase === "race") {
      for (let i = 0; i < teams.length; i++) {
        const a = teams[i].car;
        if (!a.alive || a.falling || teams[i].finished) continue;
        for (let j = i + 1; j < teams.length; j++) {
          const b = teams[j].car;
          if (!b.alive || b.falling || teams[j].finished) continue;
          resolveCarCollision(a, b, dt);
        }
      }
      for (const t of teams) {
        if (!t.car.alive || t.car.falling) continue;
        t.box = carBox(t.car, t.box);
        track.locate(t.car.x, t.car.z, t.loc);
      }
      for (const t of teams) stepRespawn(t, dt);
    }

    stepParts(dt);
    if (phase === "race") checkEnd(dt);
    else if (phase === "end") {
      endT -= dt;
      if (endT <= 0) leave();
    }
  }

  // ---------- HUD ----------
  function drawTeamSelect() {
    const grad = g2.createLinearGradient(0, 0, 0, H);
    grad.addColorStop(0, "#0d1220"); grad.addColorStop(1, "#05070d");
    g2.fillStyle = grad; g2.fillRect(0, 0, W, H);

    const needReady = [...members.values()].filter((m) => m.team >= 0);
    const readyN = needReady.filter((m) => m.ready).length;
    text("SELECT YOUR TEAM", W / 2, 50, 52, "#fff", "center");
    text(members.size + " players  \u2022  " + readyN + "/" + needReady.length + " ready  \u2022  " + Math.max(0, Math.ceil(teamT)) + "s",
      W / 2, 100, 22, "#ddd", "center");

    const cap = specCap(), specs = specMembers();
    const showSpec = cap > 0 || specs.length > 0;
    const cols = MAX_TEAMS + (showSpec ? 1 : 0);
    const gap = 18, cw = (W - 60 - gap * (cols - 1)) / cols, cy = 135, ch = 430;

    const drawPlayer = (slot, x, y, w, h) => {
      const m = members.get(slot), info = playerInfo(slot);
      g2.fillStyle = "rgba(255,255,255,0.08)"; g2.fillRect(x, y, w, h);
      g2.fillStyle = (info && info.color) || "#888"; g2.fillRect(x, y, 8, h);
      text((info && info.animal) || "\uD83D\uDE97", x + 38, y + h / 2 - 8, 34, "#fff", "center");
      text(nm(slot), x + 66, y + h / 2 - 12, 24, "#fff");
      if (m && m.team >= 0) text(m.ready ? "\u2714 READY" : "not ready", x + 66, y + h / 2 + 18, 18, m.ready ? "#35d07f" : "#9aa");
    };

    for (let i = 0; i < cols; i++) {
      const x = 30 + i * (cw + gap);
      const isSpec = showSpec && i === cols - 1;
      const list = isSpec ? specs : teamMembers(i);
      const complete = !isSpec && list.length === 2;
      const allReady = complete && list.every((s) => members.get(s).ready);
      const border = isSpec ? "#8a93a6" : allReady ? "#35d07f" : list.length === 1 ? "#ffa000" : complete ? "#ffffff" : "#3a4254";
      g2.fillStyle = "rgba(255,255,255,0.04)"; g2.fillRect(x, cy, cw, ch);
      g2.strokeStyle = border; g2.lineWidth = 5; g2.strokeRect(x, cy, cw, ch);
      text(isSpec ? "SPECTATOR" : "TEAM " + (i + 1), x + cw / 2, cy + 34, isSpec ? 26 : 30, "#fff", "center");
      text(isSpec ? list.length + "/" + cap : list.length + "/2", x + cw / 2, cy + 66, 20, border, "center");
      if (isSpec) {
        list.slice(0, 4).forEach((s, k) => drawPlayer(s, x + 12, cy + 90 + k * 82, cw - 24, 72));
      } else {
        for (let k = 0; k < 2; k++) {
          const sy = cy + 96 + k * 150;
          if (list[k] !== undefined) drawPlayer(list[k], x + 12, sy, cw - 24, 130);
          else { g2.strokeStyle = "rgba(255,255,255,0.15)"; g2.lineWidth = 2; g2.strokeRect(x + 12, sy, cw - 24, 130); text("empty", x + cw / 2, sy + 65, 20, "#667", "center"); }
        }
      }
    }

    text("\u25C0 \u25B6  STICK: change team     A: ready     B: cancel ready", W / 2, 610, 24, "#fff", "center");
    let msg = "Everyone presses A when the teams are set";
    if (members.size < 2) msg = "Waiting for more players (need at least 2)";
    else if (!arrangementValid()) {
      msg = [...Array(MAX_TEAMS).keys()].some((i) => teamMembers(i).length === 1)
        ? "Every team needs exactly 2 players"
        : specs.length > cap ? "Too many spectators - join a team" : "Not enough players in teams";
    }
    text(msg, W / 2, 660, 22, arrangementValid() ? "#35d07f" : "#ffa000", "center");
  }

  function drawSelectTeam(t) {
    const [x, y, w, h] = t.rect, col = colorOf(t);
    g2.strokeStyle = t.locked ? "#35d07f" : col.css;
    g2.lineWidth = t.locked ? 10 : 6;
    g2.strokeRect(x + 3, y + 3, w - 6, h - 6);

    g2.fillStyle = "rgba(0,0,0,0.45)"; g2.fillRect(x + 12, y + 12, 300, 86);
    text("TEAM " + (t.id + 1), x + 22, y + 28, 24, col.css);
    text("STEER  " + nm(t.steer), x + 22, y + 54, 19);
    text("PEDALS " + nm(t.pedal), x + 22, y + 78, 19);

    const cx = x + w / 2, big = nTeams > 2 ? 44 : 60;
    g2.fillStyle = "rgba(0,0,0,0.5)"; g2.fillRect(cx - 250, y + h - 170, 500, 158);

    const sw = 34, gap = 14, total = CAR_COLORS.length * sw + (CAR_COLORS.length - 1) * gap;
    CAR_COLORS.forEach((cc, i) => {
      const sx = cx - total / 2 + i * (sw + gap), sy = y + h - 160;
      g2.globalAlpha = takenByOther(i, t) ? 0.25 : 1;
      g2.fillStyle = cc.css; g2.fillRect(sx, sy, sw, sw);
      if (i === t.colorIdx) { g2.strokeStyle = "#fff"; g2.lineWidth = 4; g2.strokeRect(sx - 3, sy - 3, sw + 6, sw + 6); }
      g2.globalAlpha = 1;
    });

    if (!t.locked) {
      text("\u25C0", cx - 190, y + h - 85, big * 0.7, "#fff", "center");
      text("\u25B6", cx + 190, y + h - 85, big * 0.7, "#fff", "center");
    }
    text(col.name.toUpperCase(), cx, y + h - 85, big, col.css, "center");
    if (t.locked) text("\u2714 LOCKED IN", cx, y + h - 36, 28, "#35d07f", "center");
    else text("STEER: \u25C0 \u25B6 pick   PEDALS: GAS to lock in", cx, y + h - 36, 19, "#fff", "center");
  }

  function drawMiniCar(cx, y, css, k) {
    g2.fillStyle = css;
    g2.fillRect(cx - 34 * k, y - 22 * k, 68 * k, 14 * k);
    g2.fillRect(cx - 20 * k, y - 34 * k, 38 * k, 13 * k);
    g2.fillStyle = "#cfe8ff";
    g2.fillRect(cx - 16 * k, y - 32 * k, 14 * k, 9 * k);
    g2.fillRect(cx + 1 * k, y - 32 * k, 14 * k, 9 * k);
    g2.fillStyle = "#111";
    for (const dx of [-20, 20]) { g2.beginPath(); g2.arc(cx + dx * k, y - 8 * k, 8 * k, 0, Math.PI * 2); g2.fill(); }
  }

  function drawResults() {
    const elapsed = Math.max(0, END_TIME - endT);
    g2.fillStyle = "rgba(6,8,16,0.92)"; g2.fillRect(0, 0, W, H);
    text("RACE RESULTS", W / 2, 46, 48, "#fff", "center");

    if (winner) {
      text("TEAM " + (winner.id + 1) + " WINS!", W / 2, 104, 54, colorOf(winner).css, "center");
      text(nm(winner.steer) + " + " + nm(winner.pedal) + "   \u2022   " + fmtTime(winner.finishTime), W / 2, 152, 26, "#fff", "center");
    } else {
      text("NO WINNER", W / 2, 104, 54, "#ff5252", "center");
      text("Nobody crossed the finish line in " + fmtClock(RACE_MAX), W / 2, 152, 24, "#ddd", "center");
    }

    // ----- podium (left) -----
    const top = standings.filter((s) => !s.dnf).slice(0, 3);
    const base = 585;
    g2.fillStyle = "rgba(255,255,255,0.14)"; g2.fillRect(40, base, 574, 6);
    const slots = [
      { idx: 1, cx: 145, h: 150, delay: 0.9 },
      { idx: 0, cx: 327, h: 210, delay: 1.5 },
      { idx: 2, cx: 509, h: 105, delay: 0.3 },
    ];
    for (const sl of slots) {
      const s = top[sl.idx]; if (!s) continue;
      const k = clamp01((elapsed - sl.delay) / 0.8);
      if (k <= 0) continue;
      const bh = sl.h * easeOutBack(k), css = colorOf(s.t).css;
      g2.fillStyle = css; g2.fillRect(sl.cx - 85, base - bh, 170, bh);
      g2.fillStyle = "rgba(255,255,255,0.35)"; g2.fillRect(sl.cx - 85, base - bh, 170, 8);
      g2.fillStyle = "rgba(0,0,0,0.25)"; g2.fillRect(sl.cx - 85, base - bh / 2, 170, bh / 2);
      if (k >= 0.7) {
        text(String(s.place), sl.cx, base - bh + 44, 46, "#fff", "center");
        text("TEAM " + (s.t.id + 1), sl.cx, base - bh + 86, 22, "#fff", "center");
      }
      const kd = clamp01((elapsed - sl.delay - 0.8) / 0.7);
      if (kd > 0) {
        const carY = base - bh - (1 - easeOutBounce(kd)) * 260;
        drawMiniCar(sl.cx, carY, css, 1.3);
        if (sl.idx === 0 && kd >= 1) text("\uD83C\uDFC6", sl.cx, carY - 62, 44, "#ffc233", "center");
      }
    }

    // ----- confetti -----
    if (elapsed > 1.4) {
      for (const f of confetti) {
        f.x += f.vx / 30; f.y += f.vy / 30; f.rot += f.vr / 30;
        if (f.y > H + 20) { f.y = -20; f.x = rng() * W; }
        g2.save(); g2.translate(f.x, f.y); g2.rotate(f.rot);
        g2.fillStyle = f.c; g2.fillRect(-f.s / 2, -f.s / 4, f.s, f.s / 2);
        g2.restore();
      }
    }

    // ----- full standings (right) -----
    const lx = 660, lw = 580, rowH = 78, y0 = 215;
    standings.forEach((s, i) => {
      const y = y0 + i * rowH, t = s.t, css = colorOf(t).css;
      g2.fillStyle = i === 0 && !s.dnf ? "rgba(255,194,51,0.16)" : "rgba(255,255,255,0.07)";
      g2.fillRect(lx, y, lw, rowH - 10);
      g2.fillStyle = css; g2.fillRect(lx, y, 10, rowH - 10);
      text(s.dnf ? "-" : ordinal(s.place), lx + 55, y + 34, 32, s.dnf ? "#888" : "#ffc233", "center");
      text("TEAM " + (t.id + 1), lx + 105, y + 24, 26, css);
      text(nm(t.steer) + " + " + nm(t.pedal), lx + 105, y + 52, 19, "#ccc");
      if (s.dnf) {
        text("DNF", lx + lw - 20, y + 22, 32, "#ff5252", "right");
        text(Math.round(t.dist) + " m", lx + lw - 20, y + 50, 18, "#aaa", "right");
      } else {
        text(fmtTime(s.time), lx + lw - 20, y + 34, 32, "#fff", "right");
      }
    });

    text("HOST:  A = PLAY AGAIN     B = BACK TO MENU", W / 2, 645, 26, "#fff", "center");
    text("Returning to menu in " + Math.max(0, Math.ceil(endT)) + "...", W / 2, 685, 20, "#aaa", "center");
  }

  // finished teams by place, then everybody else by distance covered
  const rankTeams = () => teams.slice().sort((a, b) =>
    (b.finished - a.finished) || (a.finished && b.finished ? a.place - b.place : b.dist - a.dist));

  function drawPosition(t, order, x, y, w) {
    const bw = 150, bx = x + w - bw - 12, p = order.indexOf(t);
    g2.fillStyle = "rgba(0,0,0,0.6)"; g2.fillRect(bx, y + 12, bw, 86);
    text(ordinal(p + 1), bx + bw / 2, y + 40, 40, p === 0 ? "#ffc233" : "#fff", "center");
    let sub, col;
    if (t.finished) { sub = "FINISHED"; col = "#35d07f"; }
    else if (p === 0) { sub = "+" + Math.round(t.dist - (order[1] ? order[1].dist : 0)) + " m"; col = "#35d07f"; }
    else {
      const lead = order[0], ld = lead.finished ? FINISH_LINE : lead.dist;
      sub = "-" + Math.round(Math.max(0, ld - t.dist)) + " m"; col = "#ff9a3c";
    }
    text(sub, bx + bw / 2, y + 78, 24, col, "center");
  }

  function drawSpeedo(t, cx, cy, r) {
    const kmh = t.car.speed * 3.6;
    t.needle += (kmh - t.needle) * 0.35;
    const a0 = 0.75 * Math.PI, sweep = 1.5 * Math.PI;
    const ang = (v) => a0 + clamp01(v / SPEEDO_MAX) * sweep;

    g2.beginPath(); g2.arc(cx, cy, r, 0, Math.PI * 2);
    g2.fillStyle = "rgba(8,10,18,0.78)"; g2.fill();
    g2.lineWidth = 4; g2.strokeStyle = "#9aa3b8"; g2.stroke();

    g2.beginPath(); g2.arc(cx, cy, r * 0.84, ang(130), ang(SPEEDO_MAX));     // red zone
    g2.lineWidth = r * 0.07; g2.strokeStyle = "#ff3b3b"; g2.stroke();

    for (let v = 0; v <= SPEEDO_MAX; v += 10) {
      const major = v % 20 === 0, a = ang(v), co = Math.cos(a), si = Math.sin(a);
      const r1 = r * 0.9, r2 = r * (major ? 0.74 : 0.82);
      g2.beginPath(); g2.moveTo(cx + co * r1, cy + si * r1); g2.lineTo(cx + co * r2, cy + si * r2);
      g2.lineWidth = major ? 3 : 1.5; g2.strokeStyle = "#e8ecf8"; g2.stroke();
    }
    for (let v = 0; v <= SPEEDO_MAX; v += 40) {
      const a = ang(v);
      text(String(v), cx + Math.cos(a) * r * 0.58, cy + Math.sin(a) * r * 0.58, Math.round(r * 0.17), "#fff", "center");
    }

    const na = ang(t.needle), nc = Math.cos(na), ns = Math.sin(na);
    g2.beginPath(); g2.moveTo(cx - nc * r * 0.12, cy - ns * r * 0.12); g2.lineTo(cx + nc * r * 0.8, cy + ns * r * 0.8);
    g2.lineWidth = 4; g2.lineCap = "round"; g2.strokeStyle = "#ff4d4d"; g2.stroke(); g2.lineCap = "butt";
    g2.beginPath(); g2.arc(cx, cy, r * 0.09, 0, Math.PI * 2); g2.fillStyle = "#ddd"; g2.fill();

    text(String(Math.round(kmh)), cx, cy + r * 0.42, Math.round(r * 0.26), "#fff", "center");
    text("km/h", cx, cy + r * 0.64, Math.round(r * 0.14), "#aab", "center");
  }

  function drawHud() {
    g2.clearRect(0, 0, W, H);
    const order = rankTeams();

    if (phase === "abort") {
      g2.fillStyle = "rgba(0,0,0,0.85)"; g2.fillRect(0, 0, W, H);
      text("CO-OP HIGHWAY", W / 2, H / 2 - 40, 64, "#ffc233", "center");
      text("Needs at least 2 players (1 steering + 1 pedals)", W / 2, H / 2 + 30, 30, "#fff", "center");
      return;
    }

    if (phase === "teamsel") { drawTeamSelect(); return; }

    if (phase === "select") {
      for (const t of teams) drawSelectTeam(t);
      g2.fillStyle = "rgba(0,0,0,0.6)"; g2.fillRect(W / 2 - 190, 8, 380, 76);
      text("CHOOSE YOUR CAR", W / 2, 34, 34, "#fff", "center");
      const left = Number.isFinite(selectT) ? "  \u2022  " + Math.max(0, Math.ceil(selectT)) + "s" : "";
      text(lockedCount() + "/" + nTeams + " teams locked in" + left, W / 2, 64, 19, "#ddd", "center");
      return;
    }

    for (const t of teams) {
      const [x, y, w, h] = t.rect;
      const c = t.car;
      const css = colorOf(t).css;

      if (nTeams > 1) {
        g2.strokeStyle = css;
        g2.lineWidth = 6;
        g2.strokeRect(x + 3, y + 3, w - 6, h - 6);
      }

      g2.fillStyle = "rgba(0,0,0,0.45)";
      g2.fillRect(x + 12, y + 12, 300, 86);
      text("TEAM " + (t.id + 1), x + 22, y + 28, 24, css);
      text("STEER  " + nm(t.steer), x + 22, y + 54, 19);
      text("PEDALS " + nm(t.pedal), x + 22, y + 78, 19);

      const hudW = Math.min(260, w - 24);
      const hudX = x + (w - hudW) / 2;
      g2.fillStyle = "rgba(0,0,0,0.60)";
      g2.fillRect(hudX, y + 12, hudW, 86);
      text(fmtClock(raceT) + " / " + fmtClock(RACE_MAX), x + w / 2, y + 38, 32, raceT > RACE_MAX - 30 ? "#ff5252" : "#fff", "center");
      text(Math.round(t.dist) + " m", x + w / 2, y + 76, 23, "#ffc233", "center");

      // BOTTOM-LEFT: ANALOGUE SPEEDOMETER
      const sr = nTeams > 2 ? 62 : 88;
      drawSpeedo(t, x + sr + 14, y + h - sr - 14, sr);

      // TOP-RIGHT: LIVE POSITION + GAP TO LEADER
      if (nTeams > 1 && phase === "race") drawPosition(t, order, x, y, w);

      if (t.finished) {
        text("FINISHED  " + ordinal(t.place), x + w / 2, y + h / 2 - 10, nTeams > 2 ? 44 : 64, "#35d07f", "center");
        text(fmtTime(t.finishTime), x + w / 2, y + h / 2 + 40, 30, "#fff", "center");
      } else if (!c.alive) {
        if (t.dropped) {
          text("OUT", x + w / 2, y + h / 2 - 10, nTeams > 2 ? 48 : 72, "#ff5252", "center");
          text("Partner disconnected", x + w / 2, y + h / 2 + 40, 24, "#fff", "center");
        } else {
          text("CRASHED!", x + w / 2, y + h / 2 - 10, nTeams > 2 ? 48 : 72, "#ff5252", "center");
          const sub = (t.reason ? t.reason + "  \u2022  " : "") + "Respawn in " + Math.max(1, Math.ceil(t.respawnT));
          text(sub, x + w / 2, y + h / 2 + 40, 24, "#fff", "center");
        }
      }
    }

    if (banner && phase === "race") {
      g2.fillStyle = "rgba(0,0,0,0.6)"; g2.fillRect(W / 2 - 260, H / 2 - 30, 520, 60);
      text(banner.text, W / 2, H / 2, 32, banner.css, "center");
    }

    if (phase === "countdown") {
      text("GET READY", W / 2, H / 2 - 50, 72, "#fff", "center");
      text(String(Math.max(1, Math.ceil(countdownT))), W / 2, H / 2 + 40, 110, "#ffc233", "center");
    }

    if (phase === "end") drawResults();
  }

  // ---------- rendering ----------
  const smooth = (rate, dt) => 1 - Math.exp(-rate * dt);

  function updateChaseCam(t, dt) {
    if (t.voided) return;

    const c = t.car, cam = t.cam, snap = !t.camInit;

    if (snap) t.camH = c.h;
    else if (c.alive) t.camH += wrap(c.h - t.camH) * smooth(4, dt);

    const sf = Math.sin(t.camH), cf = Math.cos(t.camH);
    const back = 9.5 + Math.min(c.speed, TOP) * 0.05;
    const tx = c.x - sf * back, ty = 4.6, tz = c.z - cf * back;
    const lx = c.alive ? c.x + sf * 7 : c.x, ly = c.y + 1, lz = c.alive ? c.z + cf * 7 : c.z;
    const fov = 60 + Math.min(c.speed, TOP) * 0.35;

    if (snap) {
      cam.position.set(tx, ty, tz);
      t.look.set(lx, ly, lz);
      cam.fov = fov;
      t.camInit = true;
    } else {
      const kp = smooth(7, dt), kl = smooth(10, dt);
      cam.position.x += (tx - cam.position.x) * kp;
      cam.position.y += (ty - cam.position.y) * kp;
      cam.position.z += (tz - cam.position.z) * kp;
      t.look.x += (lx - t.look.x) * kl;
      t.look.y += (ly - t.look.y) * kl;
      t.look.z += (lz - t.look.z) * kl;
      cam.fov += (fov - cam.fov) * smooth(3, dt);
    }
    cam.updateProjectionMatrix();
    cam.lookAt(t.look);
  }

  function render(dt) {
    updateEngines();
    renderer.setViewport(0, 0, W, H); renderer.setScissor(0, 0, W, H);
    renderer.setClearColor(0x000000, 1); renderer.clear();

    if (phase === "select") {
      showAngle += dt * 0.9;
      for (const t of teams) {
        t.showMesh.root.rotation.y = showAngle + t.id * 1.3;
        const [x, y, w, h] = t.rect, gy = H - (y + h);
        renderer.setViewport(x, gy, w, h); renderer.setScissor(x, gy, w, h);
        renderer.clear();
        renderer.render(showScene, t.showCam);
      }
    } else {
      for (const t of teams) {
        const c = t.car, r = t.mesh.root;
        r.position.set(c.x, c.y, c.z);
        r.rotation.y = c.h; r.rotation.z = c.roll; r.rotation.x = c.pitch || 0;
        r.visible = !(t.invuln > 0) || Math.floor(t.invuln * 12) % 2 === 0;   // blink while invulnerable
      }
      for (const t of teams) {
        updateChaseCam(t, dt);
        const [x, y, w, h] = t.rect, gy = H - (y + h);
        renderer.setViewport(x, gy, w, h); renderer.setScissor(x, gy, w, h);
        renderer.clear();
        renderer.render(scene, t.cam);
      }
    }

    hudAcc += dt;
    if (hudAcc >= 1 / 30) { hudAcc = 0; drawHud(); hudTex.needsUpdate = true; }
    renderer.setViewport(0, 0, W, H); renderer.setScissor(0, 0, W, H);
    renderer.clearDepth();
    renderer.render(hudScene, hudCam);
  }

  // ---------- events ----------
  window.addEventListener("controller-input", (e) => {
    const d = e.detail; if (!d || !d.data) return;
    const data = d.data;

    if (phase === "teamsel") { teamInput(d.slot, data); return; }
    if (phase === "end") {
      if (d.host && data.type === "button" && data.pressed) {
        if (data.id === "A") rematch();
        else if (data.id === "B") leave();
      }
      return;
    }

    const r = roles.get(d.slot); if (!r) return;
    const t = teams[r.team], inp = t.input;

    if (data.type === "coop-steer" && r.role === "steer") {
      const v = Number(data.value) || 0;
      inp.steer = Math.max(-1, Math.min(1, v));
      browse(t, v);
    } else if (data.type === "coop-pedal" && r.role === "pedal") {
      inp.gas = !!data.gas;
      inp.brake = !!data.brake;
      if (phase === "select" && inp.gas && !t.gasPrev) lockIn(t);
      t.gasPrev = inp.gas;
    }
  }, { signal: ctx.signal });

  window.addEventListener("player-leave", (e) => {
    const slot = e.detail && e.detail.slot;
    if (phase === "teamsel") {
      const m = members.get(slot);
      if (!m) return;
      members.delete(slot);
      resetTeamReady(m.team);
      pushAllTeamHud();
      maybeStartCarSelect();
      return;
    }
    const r = roles.get(slot);
    if (!r || phase === "end" || phase === "abort") return;
    const t = teams[r.team];
    if (t.finished || t.dropped) return;
    const other = r.role === "steer" ? t.pedal : t.steer;
    sendHud(other, "PARTNER LEFT");
    t.dropped = true;
    t.respawnT = -1;
    if (phase === "select") lockIn(t);
    else crash(t, "Driver disconnected", true);
  }, { signal: ctx.signal });

  window.addEventListener("player-join", (e) => {
    const d = e.detail; if (!d) return;
    nameCache.set(d.slot, d.name);
    if (phase === "teamsel") {
      if (!members.has(d.slot)) addMember(d.slot);
      sendMode(d.slot, "pad");
      pushAllTeamHud();
      return;
    }
    if (phase === "end" || phase === "abort") { sendMode(d.slot, "pad"); return; }
    const r = roles.get(d.slot);
    if (r) {
      const t = teams[r.team];
      if (phase === "select") pushSelectHud(t);
      else sendHud(d.slot, t.car.alive ? (r.role === "steer" ? "STEERING ONLY" : "UP: GAS | DOWN: BRAKE") : "RESPAWNING...");
      sendRole(d.slot, r.role);
    } else {
      sendRole(d.slot, "spectator");
      sendHud(d.slot, "SPECTATING");
    }
  }, { signal: ctx.signal });

  // initial team arrangement: pairs in slot order, an odd player out becomes spectator
  for (const p of ctx.players()) members.set(p.slot, { team: -1, ready: false, dirPrev: 0 });
  autoArrange(false);
  broadcastMode("pad");
  pushAllTeamHud();

  // ---------- main loop ----------
  function frame(now) {
    if (destroyed) return;
    raf = requestAnimationFrame(frame);
    const dtf = Math.min(0.1, (now - last) / 1000 || 0);
    last = now;
    acc += dtf;
    while (acc >= STEP) { step(STEP); acc -= STEP; }
    render(dtf);
  }
  raf = requestAnimationFrame((t) => { last = t; frame(t); });

  return {
    destroy() {
      if (destroyed) return;
      destroyed = true;
      cancelAnimationFrame(raf);
      for (const p of parts) scene.remove(p.m);
      parts.length = 0;
      for (const o of disposables) { try { if (o.dispose) o.dispose(); } catch { /* ignore */ } }
      disposeCarAssets();
      for (const e of engines) { try { e.osc.stop(); e.sub.stop(); if (e.skid) e.skid.src.stop(); } catch { /* ignore */ } }
      try { if (ac) ac.close(); } catch { /* ignore */ }
      renderer.dispose();
      try { renderer.forceContextLoss(); } catch { /* ignore */ }
      canvas.remove();
    },
  };
}