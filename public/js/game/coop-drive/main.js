// Co-op Highway: two phones per team. One steers, one works the pedals.
// Phases: select (pick a car colour) -> countdown -> race -> end
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
const SELECT_TIMEOUT = 60;
const COUNTDOWN_TIME = 3, END_TIME = 6;
const FINISH_LINE = 2000;
const WRECK_COLOR = 0x2b2b2b;

function mulberry(a) {
  return () => {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
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

  // ---------- showroom scene (team selection) ----------
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

  const traffic = createTraffic(scene, track, rng);
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

  // ---------- teams ----------
  const roster = ctx.players().slice().sort((a, b) => a.slot - b.slot);
  const nameCache = new Map(roster.map((p) => [p.slot, p.name]));
  const nm = (slot) => {
    let p = null; try { p = ctx.player(slot); } catch { /* ignore */ }
    return String((p && p.name) || nameCache.get(slot) || ("P" + (slot + 1))).slice(0, 12);
  };
  const nTeams = Math.min(4, Math.floor(roster.length / 2));
  const roles = new Map();
  const teams = [];

  function layout(n) {
    if (n <= 1) return [[0, 0, W, H]];
    if (n === 2) return [[0, 0, W / 2, H], [W / 2, 0, W / 2, H]];
    if (n === 3) return [[0, 0, W / 2, H / 2], [W / 2, 0, W / 2, H / 2], [W / 4, H / 2, W / 2, H / 2]]; // Centered
    return [[0, 0, W / 2, H / 2], [W / 2, 0, W / 2, H / 2], [0, H / 2, W / 2, H / 2], [W / 2, H / 2, W / 2, H / 2]];
  }
  const rects = layout(nTeams);
  const colorOf = (t) => CAR_COLORS[t.colorIdx];

  const shuffledRoster = roster.slice();
  for (let i = shuffledRoster.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [shuffledRoster[i], shuffledRoster[j]] = [shuffledRoster[j], shuffledRoster[i]];
  }

  for (let t = 0; t < nTeams; t++) {
    const p1 = shuffledRoster[t * 2];
    const p2 = shuffledRoster[t * 2 + 1];

    let steer, pedal;
    if (rng() < 0.5) { steer = p1; pedal = p2; } else { steer = p2; pedal = p1; }

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
      id: t, steer: steer.slot, pedal: pedal.slot,
      car, mesh, showMesh, ringMat, cam, showCam, camH: p.h, camInit: false,
      look: new THREE.Vector3(), rect: rects[t], input: { steer: 0, gas: false, brake: false },
      drive: { steer: 0, gas: false, brake: false }, box: carBox(car), loc: track.makeLoc(START_S),
      colorIdx: t, locked: false, dropped: false, steerPrev: 0, gasPrev: false, dist: 0, reason: ""
    };

    roles.set(steer.slot, { team: t, role: "steer" });
    roles.set(pedal.slot, { team: t, role: "pedal" });
    teams.push(team);
    sendRole(steer.slot, "steer");
    sendRole(pedal.slot, "pedal");
  }

  for (const p of roster) if (!roles.has(p.slot)) sendHud(p.slot, "SPECTATING");

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
  let phase = nTeams < 1 ? "abort" : "select";
  let selectT = SELECT_TIMEOUT, countdownT = COUNTDOWN_TIME, raceT = 0, endT = END_TIME, abortT = 4;
  let pendingEnd = -1, lastTick = 0, result = null, hudAcc = 1, showAngle = 0;
  let firstCrosser = -1;

  // ---------- team selection ----------
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

  // ---------- crash / end ----------
  function crash(t, reason, silent, skipBurst = false) {
    const c = t.car;
    if (!c.alive && !c.falling) return;
    wreckCar(c, rng);
    t.reason = reason;
    t.mesh.setColor(WRECK_COLOR);
    if (!skipBurst) burst(c.x, 1, c.z, 36, [fireM, darkM, sparkM], 14, 1.6, 0.4);
    beep(90, 0.45, "sawtooth", 0.12);
    if (!silent) {
      vib(t.steer, [100, 50, 200]); vib(t.pedal, [100, 50, 200]);
      sendHud(t.steer, "CRASHED"); sendHud(t.pedal, "CRASHED");
    }
  }

  function endRace(winner) {
    if (phase === "end") return;
    phase = "end"; endT = END_TIME; result = { winner, finished: firstCrosser !== -1 };
    for (const t of teams) {
      if (t.id === winner) {
        vib(t.steer, [150, 80, 150, 80, 500]); vib(t.pedal, [150, 80, 150, 80, 500]);
        const txt = nTeams === 1 ? (result.finished ? "FINISHED!" : "RUN OVER") : "YOU WIN!";
        sendHud(t.steer, txt); sendHud(t.pedal, txt);
      } else {
        const txt = "TEAM " + (winner + 1) + " WINS";
        sendHud(t.steer, txt); sendHud(t.pedal, txt);
      }
    }
    for (const p of roster) if (!roles.has(p.slot)) sendHud(p.slot, "TEAM " + (winner + 1) + " WINS");
    beep(660, 0.5, "triangle", 0.08);
  }
  const bestByDistance = () => teams.reduce((b, t) => (t.dist > teams[b].dist ? t.id : b), 0);

  // ---------- fixed-step simulation ----------
  function stepTeam(t, dt, racing) {
    const c = t.car, d = t.drive;
    d.steer = racing ? t.input.steer : 0;
    d.gas = racing && t.input.gas;
    d.brake = racing && t.input.brake;

    if (c.falling) {
      if (stepFalling(c, dt)) t.dropped = true; 
    } else {
      stepCar(c, d, dt);
      const loc = track.locate(c.x, c.z, t.loc);
      
      if (!racing) return;

      const side = checkFall(c, track, loc);
      if (side) {
        crash(t, "Fell into the void!", false, true); 
        startFall(c, side);
      } else if (c.alive) {
        const box = carBox(c, t.box);
        for (const tc of traffic.cars) {
          if (Math.abs(tc.s - loc.progress) < 10 && boxHit(box, tc.box)) { 
            crash(t, "Hit a car"); 
            break; 
          }
        }
      }
    }

    if (c.alive && !c.falling) {
      t.dist = Math.max(t.dist, t.loc.progress - START_S);
      if (t.dist >= FINISH_LINE && firstCrosser === -1) firstCrosser = t.id;
    }
  }

  function checkEnd(dt) {
    const alive = teams.filter((t) => t.car.alive);
    const over = nTeams === 1 ? alive.length === 0 : alive.length <= 1;
    
    if ((over || firstCrosser !== -1) && pendingEnd < 0) {
      pendingEnd = 1.2;
    }

    if (pendingEnd >= 0) {
      pendingEnd -= dt;
      if (pendingEnd <= 0) {
        if (firstCrosser !== -1) {
          endRace(firstCrosser);
        } else if (nTeams > 1 && alive.length === 1) {
          endRace(alive[0].id);
        } else {
          endRace(bestByDistance());
        }
      }
    }
  }

  const leave = () => { if (!exited) { exited = true; try { ctx.exit(); } catch { /* ignore */ } } };

  function step(dt) {
    if (phase === "abort") {
      abortT -= dt;
      if (abortT <= 0) leave();
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
    }
    if (phase === "race" || phase === "end") {
      traffic.update(dt, raceT, teams.map(t => ({
        progress: t.loc.progress,
        d: track.lateral(t.car.x, t.car.z, t.loc),
        alive: t.car.alive,
      })));
    }
    for (const t of teams) stepTeam(t, dt, phase === "race");

    if (phase === "race") {
      for (let i = 0; i < teams.length; i++) {
        const a = teams[i].car;
        if (!a.alive || a.falling) continue;
        for (let j = i + 1; j < teams.length; j++) {
          const b = teams[j].car;
          if (!b.alive || b.falling) continue;
          resolveCarCollision(a, b, dt);
        }
      }
      for (const t of teams) {
        if (!t.car.alive || t.car.falling) continue;
        t.box = carBox(t.car, t.box);
        track.locate(t.car.x, t.car.z, t.loc);
      }
    }

    stepParts(dt);
    if (phase === "race") checkEnd(dt);
    else if (phase === "end") {
      endT -= dt;
      if (endT <= 0) leave();
    }
  }

  // ---------- HUD ----------
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

  function drawHud() {
    g2.clearRect(0, 0, W, H);
    
    if (phase === "abort") {
      g2.fillStyle = "rgba(0,0,0,0.85)"; g2.fillRect(0, 0, W, H);
      text("CO-OP HIGHWAY", W / 2, H / 2 - 40, 64, "#ffc233", "center");
      text("Needs at least 2 players (1 steering + 1 pedals)", W / 2, H / 2 + 30, 30, "#fff", "center");
      return;
    }

    if (phase === "select") {
      for (const t of teams) drawSelectTeam(t);
      g2.fillStyle = "rgba(0,0,0,0.6)"; g2.fillRect(W / 2 - 190, 8, 380, 76);
      text("CHOOSE YOUR CAR", W / 2, 34, 34, "#fff", "center");
      const left = Number.isFinite(selectT) ? "  \u2022  " + Math.max(0, Math.ceil(selectT)) + "s" : "";
      text(lockedCount() + "/" + nTeams + " teams locked in" + left, W / 2, 64, 19, "#ddd", "center");
      return;
    }

    const timeElapsedStr = String(Math.max(0, Math.floor(raceT)));

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
      text(timeElapsedStr + "s", x + w / 2, y + 38, 36, "#fff", "center");
      text(Math.round(t.dist) + " m", x + w / 2, y + 76, 23, "#ffc233", "center");

      // BOTTOM-CENTER: SPEEDOMETER
      g2.fillStyle = "rgba(0,0,0,0.45)";
      g2.fillRect(x + w / 2 - 150, y + h - 86, 300, 74);
      text(String(Math.round(c.speed * 3.6)), x + w / 2 - 20, y + h - 52, 52, "#fff", "right");
      text("km/h", x + w / 2 - 10, y + h - 44, 22, "#ddd");

      if (!c.alive) {
        text("CRASHED!", x + w / 2, y + h / 2 - 10, nTeams > 2 ? 48 : 72, "#ff5252", "center");
        if (t.reason) text(t.reason, x + w / 2, y + h / 2 + 40, 24, "#fff", "center");
      }
    }
    
    if (phase === "countdown") {
      text("GET READY", W / 2, H / 2 - 50, 72, "#fff", "center");
      text(String(Math.max(1, Math.ceil(countdownT))), W / 2, H / 2 + 40, 110, "#ffc233", "center");
    }
    
    if (phase === "end" && result) {
      g2.fillStyle = "rgba(0,0,0,0.6)"; g2.fillRect(0, H / 2 - 130, W, 260);
      if (result.winner >= 0) {
        const t = teams[result.winner];
        text(nTeams === 1 ? (result.finished ? "FINISHED!" : "RUN OVER") : "TEAM " + (t.id + 1) + " WINS!", W / 2, H / 2 - 60, 80, colorOf(t).css, "center");
        text(nm(t.steer) + " + " + nm(t.pedal), W / 2, H / 2 + 10, 40, "#fff", "center");
        text(Math.round(t.dist) + " m traveled", W / 2, H / 2 + 60, 30, "#ddd", "center");
      }
      text("Returning to menu in " + Math.max(0, Math.ceil(endT)) + "...", W / 2, H / 2 + 105, 22, "#aaa", "center");
    }
  }

  // ---------- rendering ----------
  const smooth = (rate, dt) => 1 - Math.exp(-rate * dt);

  function updateChaseCam(t, dt) {
    if (t.dropped) return; 

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
    const r = roles.get(d.slot); if (!r) return;
    const t = teams[r.team], inp = t.input, data = d.data;

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
    const r = roles.get(e.detail && e.detail.slot);
    if (!r || phase === "end" || phase === "abort") return;
    const t = teams[r.team];
    const other = r.role === "steer" ? t.pedal : t.steer;
    sendHud(other, "PARTNER LEFT");
    if (phase === "select") {
      t.dropped = true;
      lockIn(t);
    } else {
      crash(t, "Driver disconnected", true);
    }
  }, { signal: ctx.signal });

  window.addEventListener("player-join", (e) => {
    const d = e.detail; if (!d) return;
    nameCache.set(d.slot, d.name);
    const r = roles.get(d.slot);
    if (r) {
      const t = teams[r.team];
      if (phase === "select") pushSelectHud(t);
      else sendHud(d.slot, t.car.alive ? (r.role === "steer" ? "STEERING ONLY" : "UP: GAS | DOWN: BRAKE") : "CRASHED");
      sendRole(d.slot, r.role);
    } else sendHud(d.slot, "SPECTATING");
  }, { signal: ctx.signal });

  if (phase === "select") for (const t of teams) pushSelectHud(t);

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
      try { if (ac) ac.close(); } catch { /* ignore */ }
      renderer.dispose();
      try { renderer.forceContextLoss(); } catch { /* ignore */ }
      canvas.remove();
    },
  };
}