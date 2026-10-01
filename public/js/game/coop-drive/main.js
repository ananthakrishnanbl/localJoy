import * as THREE from 'https://unpkg.com/three@0.160.0/build/three.module.js';

// ---------- constants ----------
const W = 1280, H = 720;
const L = 4, N = 900;               // track segment length / count
const HALF = 10;                    // half road width (rail inner face)
const START_S = 48;
const INTRO_TIME = 3, RACE_TIME = 80, END_TIME = 6;
const TOP = 42, ACC = 24, BRAKE = 46, REV_MAX = 11, MAXTURN = 1.9;
const CAR_HW = 0.95, CAR_HL = 2.0;
const PALETTE = [0xff3b3b, 0x3b8bff, 0x35d07f, 0xffc233];
const CSS = ['#ff3b3b', '#3b8bff', '#35d07f', '#ffc233'];
const LANES = [-7.5, -2.5, 2.5, 7.5];
const LANE_SPEED = { 1: 10, 2: 13 };

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const wrap = a => Math.atan2(Math.sin(a), Math.cos(a));
function mulberry(a) {
  return () => {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// 2D oriented-box overlap (SAT). Box: {x,z,h,hw,hl}; forward = (sin h, cos h)
function ext(o, ax, az) {
  const fx = Math.sin(o.h), fz = Math.cos(o.h);
  return o.hl * Math.abs(fx * ax + fz * az) + o.hw * Math.abs(-fz * ax + fx * az);
}
function boxHit(a, b) {
  const dx = b.x - a.x, dz = b.z - a.z;
  for (const o of [a, b]) {
    const fx = Math.sin(o.h), fz = Math.cos(o.h);
    for (const [ax, az] of [[fx, fz], [-fz, fx]]) {
      if (Math.abs(dx * ax + dz * az) > ext(a, ax, az) + ext(b, ax, az)) return false;
    }
  }
  return true;
}

export function start(ctx) {
  let destroyed = false, raf = 0, last = 0, exited = false;
  const disposables = [];
  const own = o => { disposables.push(o); return o; };
  const rng = mulberry(Math.floor(Math.random() * 2147483647));

  // ---------- audio (best effort) ----------
  let ac = null;
  try { ac = new (window.AudioContext || window.webkitAudioContext)(); } catch { ac = null; }
  function beep(f, d, type = 'square', v = 0.05) {
    if (!ac) return;
    try {
      const o = ac.createOscillator(), g = ac.createGain();
      o.type = type; o.frequency.value = f; g.gain.value = v;
      g.gain.exponentialRampToValueAtTime(0.0001, ac.currentTime + d);
      o.connect(g); g.connect(ac.destination); o.start(); o.stop(ac.currentTime + d);
    } catch { /* ignore */ }
  }

  // ---------- phone helpers ----------
  const sendHud = (slot, text, hp = 100) => { try { ctx.send(slot, { type: 'hud', hp, text }); } catch { /* ignore */ } };
  const vib = (slot, ms) => { try { ctx.send(slot, { type: 'vibrate', ms }); } catch { /* ignore */ } };

  // ---------- renderer ----------
  const canvas = document.createElement('canvas');
  canvas.width = W; canvas.height = H;
  canvas.style.cssText = 'width:100%;height:100%;object-fit:contain;display:block;background:#000;';
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(1);
  renderer.setSize(W, H, false);
  renderer.autoClear = false;
  renderer.setScissorTest(true);
  ctx.root.replaceChildren(canvas);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x8ec5f0);
  scene.fog = new THREE.Fog(0x8ec5f0, 60, 300);
  scene.add(new THREE.HemisphereLight(0xffffff, 0x4a6b3a, 0.9));
  const sun = new THREE.DirectionalLight(0xffffff, 0.8);
  sun.position.set(60, 120, 40);
  scene.add(sun);

  const mat = (c, o = {}) => own(new THREE.MeshLambertMaterial({ color: c, side: THREE.DoubleSide, ...o }));
  const basic = c => own(new THREE.MeshBasicMaterial({ color: c }));

  // ---------- procedural track ----------
  const px = new Float32Array(N), pz = new Float32Array(N), hd = new Float32Array(N);
  {
    const ph = [rng() * 6.28, rng() * 6.28, rng() * 6.28];
    let x = 0, z = 0, h = 0;
    for (let i = 0; i < N; i++) {
      px[i] = x; pz[i] = z;
      const s = i * L, k = clamp((s - 120) / 200, 0, 1);
      const curv = k * (0.0065 * Math.sin(s * 0.0105 + ph[0]) + 0.0055 * Math.sin(s * 0.0271 + ph[1]) + 0.0035 * Math.sin(s * 0.0613 + ph[2]));
      h += curv * L; hd[i] = h;
      x += Math.sin(h) * L; z += Math.cos(h) * L;
    }
  }
  const P = (i, d) => [px[i] - Math.cos(hd[i]) * d, pz[i] + Math.sin(hd[i]) * d];
  function sample(s, d) {
    s = clamp(s, 0, (N - 1) * L - 0.01);
    const i = Math.floor(s / L), f = (s - i * L) / L;
    const h = hd[i] + (hd[i + 1] - hd[i]) * f;
    const x = px[i] + (px[i + 1] - px[i]) * f, z = pz[i] + (pz[i + 1] - pz[i]) * f;
    return { x: x - Math.cos(h) * d, z: z + Math.sin(h) * d, h };
  }
  function strip(d0, y0, d1, y1, m, skip) {
    const a = [];
    for (let i = 0; i < N - 1; i++) {
      if (skip && skip(i)) continue;
      const p0 = P(i, d0), p1 = P(i, d1), q0 = P(i + 1, d0), q1 = P(i + 1, d1);
      a.push(p0[0], y0, p0[1], p1[0], y1, p1[1], q0[0], y0, q0[1],
        p1[0], y1, p1[1], q1[0], y1, q1[1], q0[0], y0, q0[1]);
    }
    const g = own(new THREE.BufferGeometry());
    g.setAttribute('position', new THREE.Float32BufferAttribute(a, 3));
    g.computeVertexNormals();
    const mesh = new THREE.Mesh(g, m);
    mesh.frustumCulled = false;
    scene.add(mesh);
    return mesh;
  }

  const ground = new THREE.Mesh(own(new THREE.PlaneGeometry(9000, 9000)), mat(0x4f8a3e));
  ground.rotation.x = -Math.PI / 2; ground.position.set(0, -0.2, 1800);
  scene.add(ground);
  strip(-200, -0.05, 200, -0.05, mat(0x4f8a3e));
  strip(-HALF, 0, HALF, 0, mat(0x3a3d44));
  const white = basic(0xf2f2f2), yellow = basic(0xf5c542);
  for (const d of [-5, 0, 5]) strip(d - 0.12, 0.04, d + 0.12, 0.04, white, i => i % 2 === 1);
  for (const d of [-9.4, 9.4]) strip(d - 0.15, 0.04, d + 0.15, 0.04, yellow);
  strip(-HALF, 0.05, HALF, 0.05, white, i => i !== 11);
  const railRed = mat(0xd23b3b), railWhite = mat(0xeeeeee);
  for (const side of [-1, 1]) {
    const dIn = side * HALF, dOut = side * (HALF + 0.7);
    for (const [m, par] of [[railRed, 0], [railWhite, 1]]) {
      strip(dIn, 0, dIn, 0.9, m, i => i % 2 !== par);
      strip(dIn, 0.9, dOut, 0.9, m, i => i % 2 !== par);
    }
  }

  // roadside trees (instanced)
  {
    const trees = [];
    for (let i = 4; i < N - 1; i += 3) {
      for (const side of [-1, 1]) if (rng() < 0.7) trees.push([i, side * (14 + rng() * 30), 0.7 + rng() * 0.9]);
    }
    const tm = own(new THREE.InstancedMesh(own(new THREE.ConeGeometry(2, 6, 6)), mat(0x2f7d3b), trees.length));
    const dummy = new THREE.Object3D();
    trees.forEach(([i, d, s], k) => {
      const p = P(i, d);
      dummy.position.set(p[0], 3 * s, p[1]); dummy.scale.set(s, s, s); dummy.updateMatrix();
      tm.setMatrixAt(k, dummy.matrix);
    });
    tm.instanceMatrix.needsUpdate = true; tm.frustumCulled = false;
    scene.add(tm);
  }

  // ---------- cars & obstacles ----------
  const bGeo = own(new THREE.BoxGeometry(2, 0.7, 4.2)), cGeo = own(new THREE.BoxGeometry(1.6, 0.6, 2));
  const wGeo = own(new THREE.BoxGeometry(0.4, 0.7, 0.9)), lGeo = own(new THREE.BoxGeometry(0.45, 0.25, 0.1));
  const glassM = mat(0x1b2a3a), tireM = mat(0x111111), headM = basic(0xfff2b0), tailM = basic(0xff2020);
  function buildCar(bodyMat) {
    const g = new THREE.Group(); g.rotation.order = 'YXZ';
    const add = (geo, m, x, y, z) => { const o = new THREE.Mesh(geo, m); o.position.set(x, y, z); g.add(o); };
    add(bGeo, bodyMat, 0, 0.65, 0);
    add(cGeo, glassM, 0, 1.2, -0.25);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) add(wGeo, tireM, sx * 1.0, 0.35, sz * 1.3);
    for (const sx of [-0.6, 0.6]) { add(lGeo, headM, sx, 0.7, 2.12); add(lGeo, tailM, sx, 0.7, -2.12); }
    scene.add(g);
    return g;
  }
  const trafficMats = [0x8a8f98, 0xb5b0a0, 0x6a7fa0, 0xa87c5a, 0x7e9a7e].map(c => mat(c));
  const barrierGeo = own(new THREE.BoxGeometry(3.2, 1.1, 1)), stripeGeo = own(new THREE.BoxGeometry(3.3, 0.3, 1.05));
  const rockGeo = own(new THREE.IcosahedronGeometry(1.3, 0));
  const orangeM = mat(0xe8782a), rockM = mat(0x7a7a7a), stripeM = mat(0xffffff);

  const items = [];
  function addItem(type, s, d, speed) {
    let mesh, hw, hl;
    if (type === 'traffic') {
      mesh = buildCar(trafficMats[Math.floor(rng() * trafficMats.length)]); hw = 1; hl = 2.1;
    } else if (type === 'barrier') {
      mesh = new THREE.Group();
      const b = new THREE.Mesh(barrierGeo, orangeM); b.position.y = 0.55;
      const w = new THREE.Mesh(stripeGeo, stripeM); w.position.y = 0.7;
      mesh.add(b, w); scene.add(mesh); hw = 1.6; hl = 0.5;
    } else {
      mesh = new THREE.Mesh(rockGeo, rockM); mesh.scale.set(1, 0.8, 1); scene.add(mesh); hw = 1.1; hl = 1.1;
    }
    const it = { type, s, d, speed, hw, hl, mesh, x: 0, z: 0, h: 0, yaw: type === 'rock' ? rng() * 3 : 0 };
    placeItem(it); items.push(it);
  }
  function placeItem(it) {
    const p = sample(it.s, it.d);
    it.x = p.x; it.z = p.z; it.h = p.h + it.yaw;
    it.mesh.position.set(it.x, it.type === 'rock' ? 0.5 : 0, it.z);
    it.mesh.rotation.y = it.h;
  }
  function addTraffic(s) { const lane = rng() < 0.5 ? 1 : 2; addItem('traffic', s, LANES[lane], LANE_SPEED[lane]); }
  function addObstacle(s) {
    const side = rng() < 0.5 ? -1 : 1;
    if (rng() < 0.5) addItem('barrier', s, side * (6 + rng() * 2), 0);
    else addItem('rock', s, side * 8, 0);
  }
  for (let s = 150; s < 2300; s += 18 + rng() * 28) {
    const trafficFirst = rng() < 0.55;
    if (trafficFirst) addTraffic(s); else addObstacle(s);
    if (rng() < 0.3) { if (trafficFirst) addObstacle(s + rng() * 6); else addTraffic(s + rng() * 6); }
  }

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
  const nameCache = new Map(roster.map(p => [p.slot, p.name]));
  const nm = slot => {
    let p = null; try { p = ctx.player(slot); } catch { /* ignore */ }
    return String((p && p.name) || nameCache.get(slot) || ('P' + (slot + 1))).slice(0, 12);
  };
  const nTeams = Math.min(4, Math.floor(roster.length / 2));
  const roles = new Map();
  const teams = [];

  function layout(n) {
    if (n <= 1) return [[0, 0, W, H]];
    if (n === 2) return [[0, 0, W / 2, H], [W / 2, 0, W / 2, H]];
    if (n === 3) return [[0, 0, W / 2, H / 2], [W / 2, 0, W / 2, H / 2], [0, H / 2, W, H / 2]];
    return [[0, 0, W / 2, H / 2], [W / 2, 0, W / 2, H / 2], [0, H / 2, W / 2, H / 2], [W / 2, H / 2, W / 2, H / 2]];
  }
  const rects = layout(nTeams);

  for (let t = 0; t < nTeams; t++) {
    const steer = roster[t * 2], pedal = roster[t * 2 + 1];
    const bodyMat = mat(PALETTE[t]);
    const p = sample(START_S, (t - (nTeams - 1) / 2) * 5);
    const car = {
      x: p.x, z: p.z, h: p.h, vx: 0, vz: 0, ang: 0, y: 0, vy: 0, roll: 0, rollV: 0,
      idx: Math.floor(START_S / L), progress: START_S, alive: true, crashT: 0, bump: 0,
      mesh: buildCar(bodyMat), bodyMat
    };
    const cam = new THREE.PerspectiveCamera(62, rects[t][2] / rects[t][3], 0.5, 400);
    const team = {
      id: t, steer: steer.slot, pedal: pedal.slot, car, cam, camH: p.h, camInit: false,
      rect: rects[t], input: { steer: 0, y: 0, a: false, b: false }, dist: 0, reason: ''
    };
    roles.set(steer.slot, { team: t, role: 'steer' });
    roles.set(pedal.slot, { team: t, role: 'pedal' });
    teams.push(team);
    
    // UPDATE THESE LINES TO SEND THE NEW MESSAGE:
    sendHud(steer.slot, 'STEERING ONLY');
    ctx.send(steer.slot, { type: 'set-role', role: 'steer' }); // <-- Added
    
    sendHud(pedal.slot, 'A: GAS | B: BRAKE');
    ctx.send(pedal.slot, { type: 'set-role', role: 'pedal' }); // <-- Added
  }
  for (const p of roster) if (!roles.has(p.slot)) sendHud(p.slot, 'SPECTATING');

  // ---------- HUD overlay (drawn to a 2D canvas, shown as a texture on the same WebGL canvas) ----------
  const hudCanvas = document.createElement('canvas');
  hudCanvas.width = W; hudCanvas.height = H;
  const g2 = hudCanvas.getContext('2d');
  const hudTex = own(new THREE.CanvasTexture(hudCanvas));
  hudTex.colorSpace = THREE.SRGBColorSpace;
  const hudScene = new THREE.Scene();
  const hudCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 10);
  hudCam.position.z = 1;
  hudScene.add(new THREE.Mesh(own(new THREE.PlaneGeometry(2, 2)),
    own(new THREE.MeshBasicMaterial({ map: hudTex, transparent: true, depthTest: false, depthWrite: false }))));

  function text(s, x, y, size, color = '#fff', align = 'left') {
    g2.font = `bold ${size}px system-ui,-apple-system,Segoe UI,sans-serif`;
    g2.textAlign = align; g2.textBaseline = 'middle';
    g2.lineWidth = Math.max(3, size / 8); g2.strokeStyle = 'rgba(0,0,0,0.75)';
    g2.strokeText(s, x, y); g2.fillStyle = color; g2.fillText(s, x, y);
  }

  // ---------- game state ----------
  let phase = nTeams < 1 ? 'abort' : 'intro';
  let introT = INTRO_TIME, raceT = RACE_TIME, endT = END_TIME, abortT = 4, pendingEnd = -1, lastTick = 0;
  let result = null, hudAcc = 1;

  function drawHud() {
    g2.clearRect(0, 0, W, H);
    if (phase === 'abort') {
      g2.fillStyle = 'rgba(0,0,0,0.85)'; g2.fillRect(0, 0, W, H);
      text('CO-OP HIGHWAY', W / 2, H / 2 - 40, 64, '#ffc233', 'center');
      text('Needs at least 2 players (1 steering + 1 pedals)', W / 2, H / 2 + 30, 30, '#fff', 'center');
      return;
    }
    for (const t of teams) {
      const [x, y, w, h] = t.rect, c = t.car;
      if (nTeams > 1) { g2.strokeStyle = CSS[t.id]; g2.lineWidth = 6; g2.strokeRect(x + 3, y + 3, w - 6, h - 6); }
      g2.fillStyle = 'rgba(0,0,0,0.45)'; g2.fillRect(x + 12, y + 12, 300, 86);
      text('TEAM ' + (t.id + 1), x + 22, y + 28, 24, CSS[t.id]);
      text('STEER  ' + nm(t.steer), x + 22, y + 54, 19);
      text('PEDALS ' + nm(t.pedal), x + 22, y + 78, 19);
      const sp = Math.hypot(c.vx, c.vz);
      g2.fillStyle = 'rgba(0,0,0,0.45)'; g2.fillRect(x + w / 2 - 150, y + h - 86, 300, 74);
      text(String(Math.round(sp * 3.6)), x + w / 2 - 20, y + h - 52, 52, '#fff', 'right');
      text('km/h', x + w / 2 - 10, y + h - 44, 22, '#ddd');
      text(Math.round(t.dist) + ' m', x + w / 2, y + h - 22, 22, CSS[t.id], 'center');
      if (!c.alive) {
        text('CRASHED!', x + w / 2, y + h / 2 - 10, nTeams > 2 ? 48 : 72, '#ff5252', 'center');
        if (t.reason) text(t.reason, x + w / 2, y + h / 2 + 40, 24, '#fff', 'center');
      }
    }
    g2.fillStyle = 'rgba(0,0,0,0.6)'; g2.fillRect(W / 2 - 80, 8, 160, 54);
    text(String(Math.max(0, Math.ceil(raceT))) + 's', W / 2, 36, 40, raceT <= 10 ? '#ff6b6b' : '#fff', 'center');
    if (nTeams > 1) {
      const cw = 150, x0 = W / 2 - (nTeams * cw) / 2;
      teams.forEach((t, i) => {
        g2.fillStyle = 'rgba(0,0,0,0.55)'; g2.fillRect(x0 + i * cw + 2, 66, cw - 4, 28);
        g2.fillStyle = CSS[i]; g2.fillRect(x0 + i * cw + 2, 66, 8, 28);
        text('T' + (i + 1) + ' ' + Math.round(t.dist) + 'm' + (t.car.alive ? '' : ' X'), x0 + i * cw + 18, 81, 18);
      });
    }
    if (phase === 'intro') {
      text('GET READY', W / 2, H / 2 - 50, 72, '#fff', 'center');
      text(String(Math.max(1, Math.ceil(introT))), W / 2, H / 2 + 40, 110, '#ffc233', 'center');
    }
    if (phase === 'end' && result) {
      g2.fillStyle = 'rgba(0,0,0,0.6)'; g2.fillRect(0, H / 2 - 130, W, 260);
      if (result.winner >= 0) {
        const t = teams[result.winner];
        text(nTeams === 1 ? 'RUN OVER' : 'TEAM ' + (t.id + 1) + ' WINS!', W / 2, H / 2 - 60, 80, CSS[t.id], 'center');
        text(nm(t.steer) + ' + ' + nm(t.pedal), W / 2, H / 2 + 10, 40, '#fff', 'center');
        text(Math.round(t.dist) + ' m traveled', W / 2, H / 2 + 60, 30, '#ddd', 'center');
      }
      text('Returning to menu in ' + Math.max(0, Math.ceil(endT)) + '...', W / 2, H / 2 + 105, 22, '#aaa', 'center');
    }
  }

  // ---------- crash / end ----------
  function crash(t, reason, silent) {
    const c = t.car;
    if (!c.alive) return;
    c.alive = false; c.crashT = 0; t.reason = reason;
    c.ang = (rng() - 0.5) * 9; c.vy = 5; c.rollV = (rng() < 0.5 ? -1 : 1) * (4 + rng() * 3);
    c.vx *= 0.5; c.vz *= 0.5;
    c.bodyMat.color.setHex(0x2b2b2b);
    burst(c.x, 1, c.z, 36, [fireM, darkM, sparkM], 14, 1.6, 0.4);
    beep(90, 0.45, 'sawtooth', 0.12);
    if (!silent) {
      vib(t.steer, [100, 50, 200]); vib(t.pedal, [100, 50, 200]);
      sendHud(t.steer, 'CRASHED', 0); sendHud(t.pedal, 'CRASHED', 0);
    }
  }
  function endRace(winner) {
    if (phase === 'end') return;
    phase = 'end'; endT = END_TIME; result = { winner };
    for (const t of teams) {
      if (t.id === winner) {
        vib(t.steer, [150, 80, 150, 80, 500]); vib(t.pedal, [150, 80, 150, 80, 500]);
        const txt = nTeams === 1 ? 'DONE' : 'YOU WIN!';
        sendHud(t.steer, txt, t.car.alive ? 100 : 0); sendHud(t.pedal, txt, t.car.alive ? 100 : 0);
      } else {
        const txt = 'TEAM ' + (winner + 1) + ' WINS';
        sendHud(t.steer, txt, t.car.alive ? 100 : 0); sendHud(t.pedal, txt, t.car.alive ? 100 : 0);
      }
    }
    for (const p of roster) if (!roles.has(p.slot)) sendHud(p.slot, 'TEAM ' + (winner + 1) + ' WINS');
    beep(660, 0.5, 'triangle', 0.08);
  }
  const bestByDistance = () => teams.reduce((b, t) => (t.dist > teams[b].dist ? t.id : b), 0);

  // ---------- physics ----------
  function nearest(c) {
    let best = c.idx, bd = 1e18;
    for (let i = Math.max(0, c.idx - 8); i <= Math.min(N - 1, c.idx + 8); i++) {
      const dx = c.x - px[i], dz = c.z - pz[i], d = dx * dx + dz * dz;
      if (d < bd) { bd = d; best = i; }
    }
    c.idx = best;
    const h = hd[best];
    c.progress = best * L + (c.x - px[best]) * Math.sin(h) + (c.z - pz[best]) * Math.cos(h);
    return h;
  }

  function stepCar(t, dt, racing) {
    const c = t.car;
    if (c.alive) {
      let steer = 0, gas = false, brake = false;
      if (racing) {
        steer = t.input.steer;
        gas = t.input.a || t.input.y < -0.35;
        brake = t.input.b || t.input.y > 0.35;
      }
      let fx = Math.sin(c.h), fz = Math.cos(c.h);
      const fwd0 = c.vx * fx + c.vz * fz;
      const target = -steer * MAXTURN * Math.min(1, Math.abs(fwd0) / 6) / (1 + Math.abs(fwd0) / 45) * (fwd0 < -0.5 ? -1 : 1);
      c.ang += (target - c.ang) * Math.min(1, 5 * dt);
      c.h += c.ang * dt;
      fx = Math.sin(c.h); fz = Math.cos(c.h);
      const rx = -fz, rz = fx;
      let fwd = c.vx * fx + c.vz * fz, lat = c.vx * rx + c.vz * rz;
      if (gas && !brake) {
        if (fwd < 0) fwd += BRAKE * dt; else fwd += ACC * (1 - fwd / TOP) * dt;
      } else if (brake && !gas) {
        if (fwd > 0.5) fwd = Math.max(0, fwd - BRAKE * dt); else fwd = Math.max(-REV_MAX, fwd - ACC * 0.6 * dt);
      }
      const drag = (0.25 * Math.abs(fwd) + 1.8) * dt;
      if (!gas && !brake) { if (Math.abs(fwd) < drag) fwd = 0; else fwd -= Math.sign(fwd) * drag; }
      else fwd -= fwd * 0.12 * dt;
      lat += c.ang * fwd * 0.5 * dt;                         // centrifugal push
      const grip = Math.max(2.5, 9 - Math.abs(fwd) * 0.14 - (brake ? 2 : 0));
      lat -= lat * Math.min(1, grip * dt);                   // tire grip
      c.vx = fx * fwd + rx * lat; c.vz = fz * fwd + rz * lat;
    } else {
      const k = Math.exp(-1.8 * dt);
      c.vx *= k; c.vz *= k; c.h += c.ang * dt; c.ang *= Math.exp(-1.5 * dt);
      c.crashT += dt;
      c.y += c.vy * dt; c.vy -= 18 * dt;
      if (c.y < 0) { c.y = 0; c.vy = c.vy < -3 ? -c.vy * 0.3 : 0; }
      if (c.crashT < 0.9) c.roll += c.rollV * dt;
    }
    c.x += c.vx * dt; c.z += c.vz * dt;

    const th = nearest(c);
    t.dist = Math.max(t.dist, c.progress - START_S);
    if (!racing || !c.alive) return;

    // rails (corner test in road space)
    const fx = Math.sin(c.h), fz = Math.cos(c.h), rx = -Math.cos(th), rz = Math.sin(th);
    let dmax = -1e9, dmin = 1e9;
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      const wx = c.x + fx * sz * CAR_HL - fz * sx * CAR_HW, wz = c.z + fz * sz * CAR_HL + fx * sx * CAR_HW;
      const d = (wx - px[c.idx]) * rx + (wz - pz[c.idx]) * rz;
      if (d > dmax) dmax = d; if (d < dmin) dmin = d;
    }
    const overR = dmax - HALF, overL = -dmin - HALF;
    if (overR > 0 || overL > 0) {
      const side = overR >= overL ? 1 : -1, over = Math.max(overR, overL);
      c.x -= side * rx * over; c.z -= side * rz * over;
      const nx = side * rx, nz = side * rz, vn = c.vx * nx + c.vz * nz;
      if (vn > 0) {
        if (vn > 15) { crash(t, 'Hit the barrier'); return; }
        c.vx -= 1.3 * vn * nx; c.vz -= 1.3 * vn * nz;
        c.vx *= 0.96; c.vz *= 0.96;
        c.h += wrap(th - c.h) * 0.1;
        if (vn > 3 && c.bump <= 0) { vib(t.steer, 40); vib(t.pedal, 40); c.bump = 0.4; }
      }
      const k = Math.exp(-0.8 * dt); c.vx *= k; c.vz *= k;
      burst(c.x + nx * 1, 0.5, c.z + nz * 1, 2, [sparkM], 6, 0.35, 0.15);
    }
    c.bump -= dt;

    // obstacles & traffic
    const box = { x: c.x, z: c.z, h: c.h, hw: CAR_HW, hl: CAR_HL };
    for (const it of items) {
      const dx = it.x - c.x, dz = it.z - c.z;
      if (dx * dx + dz * dz < 64 && boxHit(box, it)) {
        crash(t, it.type === 'traffic' ? 'Hit a car' : 'Hit an obstacle');
        return;
      }
    }
  }

  function checkEnd(dt) {
    const alive = teams.filter(t => t.car.alive);
    const over = nTeams === 1 ? alive.length === 0 : alive.length <= 1;
    if (over && pendingEnd < 0) pendingEnd = 1.2;
    if (pendingEnd >= 0) {
      pendingEnd -= dt;
      if (pendingEnd <= 0) {
        if (nTeams > 1 && alive.length === 1) endRace(alive[0].id); else endRace(bestByDistance());
        return;
      }
    }
    if (raceT <= 0) { raceT = 0; endRace(bestByDistance()); }
  }

  function update(dt) {
    if (phase === 'abort') {
      abortT -= dt;
      if (abortT <= 0 && !exited) { exited = true; try { ctx.exit(); } catch { /* ignore */ } }
      return;
    }
    if (phase === 'intro') {
      introT -= dt;
      const k = Math.ceil(introT);
      if (k !== lastTick && k > 0) { lastTick = k; beep(440, 0.15); }
      if (introT <= 0) { phase = 'race'; beep(880, 0.4); }
    } else if (phase === 'race') {
      raceT -= dt;
    }
    if (phase !== 'intro') for (const it of items) if (it.speed) { it.s += it.speed * dt; placeItem(it); }
    for (const t of teams) stepCar(t, dt, phase === 'race');
    stepParts(dt);
    if (phase === 'race') checkEnd(dt);
    else if (phase === 'end') {
      endT -= dt;
      if (endT <= 0 && !exited) { exited = true; try { ctx.exit(); } catch { /* ignore */ } }
    }
  }

  // ---------- rendering ----------
  function updateCam(t, dt) {
    const c = t.car, cam = t.cam;
    if (c.alive || !t.camInit) {
      const snap = !t.camInit;
      t.camH += wrap(c.h - t.camH) * (snap ? 1 : 1 - Math.exp(-4 * dt));
    }
    const tx = c.x - Math.sin(t.camH) * 9.5, tz = c.z - Math.cos(t.camH) * 9.5;
    if (!t.camInit) { cam.position.set(tx, 4.6, tz); t.camInit = true; }
    else {
      const k = 1 - Math.exp(-7 * dt);
      cam.position.x += (tx - cam.position.x) * k; cam.position.y += (4.6 - cam.position.y) * k; cam.position.z += (tz - cam.position.z) * k;
    }
    const sp = Math.hypot(c.vx, c.vz);
    const fov = 60 + Math.min(sp, TOP) * 0.35;
    if (Math.abs(cam.fov - fov) > 0.05) { cam.fov = fov; cam.updateProjectionMatrix(); }
    if (c.alive) cam.lookAt(c.x + Math.sin(t.camH) * 7, 1.2, c.z + Math.cos(t.camH) * 7);
    else cam.lookAt(c.x, 1, c.z);
  }

  function render(dt) {
    renderer.setViewport(0, 0, W, H); renderer.setScissor(0, 0, W, H);
    renderer.setClearColor(0x000000, 1); renderer.clear();
    for (const t of teams) {
      const c = t.car;
      c.mesh.position.set(c.x, c.y, c.z);
      c.mesh.rotation.y = c.h; c.mesh.rotation.z = c.roll;
    }
    for (const t of teams) {
      updateCam(t, dt);
      const [x, y, w, h] = t.rect, gy = H - (y + h);
      renderer.setViewport(x, gy, w, h); renderer.setScissor(x, gy, w, h);
      renderer.clear();
      renderer.render(scene, t.cam);
    }
    hudAcc += dt;
    if (hudAcc >= 1 / 30) { hudAcc = 0; drawHud(); hudTex.needsUpdate = true; }
    renderer.setViewport(0, 0, W, H); renderer.setScissor(0, 0, W, H);
    renderer.clearDepth();
    renderer.render(hudScene, hudCam);
  }

  // ---------- events ----------
window.addEventListener('controller-input', e => {
    const d = e.detail; if (!d || !d.data) return;
    const r = roles.get(d.slot); if (!r) return;
    const inp = teams[r.team].input, data = d.data;
    
    // Handle the custom messages from our new controller
    if (data.type === 'coop-steer' && r.role === 'steer') {
      inp.steer = data.value;
    } else if (data.type === 'coop-pedal' && r.role === 'pedal') {
      inp.a = !!data.gas;
      inp.b = !!data.brake;
    }
  }, { signal: ctx.signal });

  window.addEventListener('player-leave', e => {
    const r = roles.get(e.detail && e.detail.slot);
    if (!r || phase === 'end' || phase === 'abort') return;
    crash(teams[r.team], 'Driver disconnected', true);
    const t = teams[r.team];
    const other = r.role === 'steer' ? t.pedal : t.steer;
    sendHud(other, 'PARTNER LEFT', 0);
  }, { signal: ctx.signal });

  window.addEventListener('player-join', e => {
    const d = e.detail; if (!d) return;
    nameCache.set(d.slot, d.name);
    const r = roles.get(d.slot);
    if (r) {
      const t = teams[r.team];
      sendHud(d.slot, t.car.alive ? (r.role === 'steer' ? 'STEERING ONLY' : 'A: GAS | B: BRAKE') : 'CRASHED', t.car.alive ? 100 : 0);
      ctx.send(d.slot, { type: 'set-role', role: r.role });
    } else sendHud(d.slot, 'SPECTATING');
  }, { signal: ctx.signal });

  // ---------- main loop ----------
  function frame(now) {
    if (destroyed) return;
    raf = requestAnimationFrame(frame);
    const dt = Math.min(0.05, (now - last) / 1000 || 0);
    last = now;
    const n = Math.max(1, Math.ceil(dt / (1 / 60)));
    for (let i = 0; i < n; i++) update(dt / n);
    render(dt);
  }
  raf = requestAnimationFrame(t => { last = t; frame(t); });

  return {
    destroy() {
      if (destroyed) return;
      destroyed = true;
      cancelAnimationFrame(raf);
      for (const p of parts) scene.remove(p.m);
      parts.length = 0;
      for (const o of disposables) { try { if (o.dispose) o.dispose(); } catch { /* ignore */ } }
      try { if (ac) ac.close(); } catch { /* ignore */ }
      renderer.dispose();
      try { renderer.forceContextLoss(); } catch { /* ignore */ }
      canvas.remove();
    }
  };
}
