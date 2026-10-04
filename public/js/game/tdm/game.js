// TEAM DEATHMATCH  -  /js/game/tdm/game.js
// The rules: sides (RED / BLUE / solo), spawning, combat, ammo, gun pickups, med-kits, the match clock and the controller input.
// Everything is in "factions": the RED team, the BLUE team, and every solo player is a faction of one.
// You cannot hurt your own faction, everybody else is an enemy. A kill = 1 point for the killer's faction.
import {
  START_HP, MEDKIT_HEAL, MEDKIT_RESPAWN, MEDKIT_CORNERS, MATCH_TIME, OVERTIME, CHAR_COUNT, RESPAWN_TIME, SPAWN_PROTECT, HIT_R_BASE, MAX_FIGHTERS,
  PICKUP_COUNT, PICKUP_SEED, PICKUP_TYPES, PICKUP_RANGE, PICKUP_LIFE, PICKUP_ANIM, HIT_FLASH, LOOK_YAW, LOOK_PITCH,
  GUNS, START_GUNS, ANIM, TEAMS, SIDES, clampN, stickVal, mulberry32,
} from "./config.js";

export function createGame(S) {
  const { THREE, ctx, scene, meshes, floorTop, H, RADIUS, hits, clearAt, cells, bases, soloSpawns, medSpots, faceMid, roster, chars, st, models, ui, lobby, fac, medkits } = S;
  const { playAnim, setHandGun, holdPose, groundAvatar, tintAvatar, disposeAvatar, setLabel, setViewGun, makeGun, makeAvatar,
    makeSpawnPad, makeMedkit, gunModel, disposeGunModel, viewGunPos, viewScene } = models;

  const temps = [], decals = [];
  const nameOf = (ch) => ctx.player(ch.slot)?.name ?? `P${ch.slot}`;
  const vibrate = (slot, ms) => ctx.send(slot, { type: "vibrate", ms });
  const gunOf = (ch) => GUNS[ch.guns[ch.cur]?.id] || GUNS.g1;
  const facName = (f) => fac.name(f), facColor = (f) => fac.color(f);

  /* ---------------- sound ---------------- */
  let audio = null;
  function bang(vol = 0.25) {
    try {
      audio ||= new AudioContext();
      if (audio.state === "suspended") audio.resume();
      const n = audio.sampleRate * 0.15 | 0, b = audio.createBuffer(1, n, audio.sampleRate), d = b.getChannelData(0);
      for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / n, 3);
      const src = audio.createBufferSource(), g = audio.createGain(); g.gain.value = vol;
      src.buffer = b; src.connect(g).connect(audio.destination); src.start();
    } catch {}
  }
  function ding(freq = 660, len = 0.18) {
    try {
      audio ||= new AudioContext();
      if (audio.state === "suspended") audio.resume();
      const o = audio.createOscillator(), g = audio.createGain();
      o.type = "triangle"; o.frequency.value = freq;
      g.gain.setValueAtTime(0.18, audio.currentTime); g.gain.exponentialRampToValueAtTime(0.001, audio.currentTime + len);
      o.connect(g).connect(audio.destination); o.start(); o.stop(audio.currentTime + len);
    } catch {}
  }

  /* ---------------- team spawn pads (decoration: where each team respawns) ---------------- */
  const pads = bases.map((b, t) => {
    const pad = makeSpawnPad(TEAMS[t].hex);
    pad.position.set(b.center.x, floorTop, b.center.z);
    scene.add(pad);
    return pad;
  });

  /* ---------------- med-kits: the exact middle of the map + MEDKIT_CORNERS random corners ---------------- */
  for (let i = 0; i < 1 + Math.min(MEDKIT_CORNERS, medSpots.corners.length); i++) {
    const m = makeMedkit();
    m.group.visible = false; scene.add(m.group);
    medkits.push({ ...m, x: 0, z: 0, active: false, timer: 0, phase: Math.random() * 6 });
  }
  function placeMedkits() {                                   // called at the start of every match: new random corners each time
    const idx = medSpots.corners.map((_, i) => i);
    for (let i = idx.length - 1; i > 0; i--) { const j = (Math.random() * (i + 1)) | 0; [idx[i], idx[j]] = [idx[j], idx[i]]; }
    const spots = [medSpots.middle, ...idx.slice(0, medkits.length - 1).map((i) => medSpots.corners[i])];
    medkits.forEach((k, i) => {
      [k.x, k.z] = spots[i];
      k.group.position.set(k.x, floorTop, k.z);
      k.group.visible = true; k.active = true; k.timer = 0;
    });
  }
  function hideMedkits() { for (const k of medkits) { k.active = false; k.group.visible = false; } }

  /* ---------------- gun pickups: fixed spots (seeded), the same in every game ---------------- */
  const pickupSpots = [];
  const medAll = [medSpots.middle, ...medSpots.corners];
  const pickupPool = cells((x, z) => clearAt(x, z, 1.0)
    && bases.every((b) => Math.hypot(x - b.center.x, z - b.center.z) > 10)
    && medAll.every((m) => Math.hypot(x - m[0], z - m[1]) > 5));          // keep the floor guns off the med-kit spots
  {
    const rnd = mulberry32(PICKUP_SEED);
    for (let tries = 0; tries < 4000 && pickupSpots.length < PICKUP_COUNT && pickupPool.length; tries++) {
      const c = pickupPool[(rnd() * pickupPool.length) | 0];
      const minD = tries < 2000 ? 12 : 6;
      if (pickupSpots.some((o) => Math.hypot(o[0] - c[0], o[1] - c[1]) < minD)) continue;
      pickupSpots.push(c);
    }
  }
  const pickups = pickupSpots.map(([x, z], i) => {
    const g = new THREE.Group(); g.position.set(x, floorTop, z);
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.8, 1.1, 28).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({ color: 0xffd060, transparent: true, opacity: 0.7, side: THREE.DoubleSide }));
    ring.position.y = 0.06;
    const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.4, 5, 12, 1, true),
      new THREE.MeshBasicMaterial({ color: 0xffd060, transparent: true, opacity: 0.18, depthWrite: false, side: THREE.DoubleSide }));
    beam.position.y = 2.5;
    const spin = new THREE.Group(); spin.position.y = 1.0;
    g.add(ring, beam, spin); scene.add(g);
    return { x, z, group: g, spin, model: null, gunId: "", ammo: 0, reserve: 0, phase: i * 1.3, life: 0, pop: 1 };
  });
  const rollLife = () => PICKUP_LIFE[0] + Math.random() * (PICKUP_LIFE[1] - PICKUP_LIFE[0]);
  const GUN_IDS = Object.keys(GUNS);
  function relocatePickup(p) {                                    // the old gun vanishes, a new random gun appears somewhere else right now
    let best = null;
    for (let t = 0; t < 40 && pickupPool.length; t++) {
      const c = pickupPool[(Math.random() * pickupPool.length) | 0];
      if (pickups.some((o) => o !== p && Math.hypot(o.x - c[0], o.z - c[1]) < 6)) continue;
      if (Math.hypot(p.x - c[0], p.z - c[1]) < 8) continue;
      best = c; break;
    }
    if (best) { p.x = best[0]; p.z = best[1]; p.group.position.set(p.x, floorTop, p.z); }
    const id = GUN_IDS[(Math.random() * GUN_IDS.length) | 0];
    setPickup(p, id, GUNS[id].mag, GUNS[id].total - GUNS[id].mag);
    p.life = rollLife(); p.pop = 0;
  }
  function updatePickups(dt) {
    for (const p of pickups) {
      p.life -= dt;
      if (p.life <= 0) relocatePickup(p);
      if (p.pop < 1) { p.pop = Math.min(1, p.pop + dt * 3); p.group.scale.setScalar(p.pop); }
    }
  }
  function setPickup(p, id, ammo, reserve) {
    p.gunId = id; p.ammo = ammo; p.reserve = reserve;
    if (p.model) { p.spin.remove(p.model.group); disposeGunModel(p.model); }
    p.model = gunModel(id, 1.1);
    p.spin.add(p.model.group);
  }
  function resetPickups() { pickups.forEach((p, i) => { const id = PICKUP_TYPES[i % PICKUP_TYPES.length]; setPickup(p, id, GUNS[id].mag, GUNS[id].total - GUNS[id].mag); p.life = rollLife(); p.pop = 1; p.group.scale.setScalar(1); }); }
  resetPickups();

  /* ---------------- factions + standings ---------------- */
  function makeFactions(players) {                                // players: [[slot, rosterEntry], ...]
    const teams = [null, null], solos = [], byslot = new Map();
    for (const [slot, r] of players) {
      const side = SIDES[r.side];
      let f;
      if (side.team >= 0) f = teams[side.team] ||= { key: "t" + side.team, team: side.team, solo: false, name: TEAMS[side.team].name, color: TEAMS[side.team].color, hex: TEAMS[side.team].hex, kills: 0, members: 0 };
      else { f = { key: "s" + slot, team: -1, solo: true, slot, kills: 0, members: 0 }; solos.push(f); }
      f.members++; byslot.set(slot, f);
    }
    S.factions = [...teams.filter(Boolean), ...solos];
    return byslot;
  }
  const standings = () => S.factions.filter((f) => f.members > 0).sort((a, b) => b.kills - a.kills);
  const scoreLine = () => standings().map((f) => `${facName(f)} ${f.kills}`).join("  ·  ");

  /* ---------------- characters ---------------- */
  function spawnChar(slot, f, charIdx) {
    const av = makeAvatar(charIdx); scene.add(av.group);
    const cam = new THREE.PerspectiveCamera(60, 1, 0.05, 500);
    const gun = makeGun();
    scene.add(cam);
    const ch = {
      slot, fac: f, hp: START_HP, shownHp: START_HP, alive: true, respawn: 0, prot: 0,
      x: 0, z: 0, yaw: 0, pitch: 0, input: { mx: 0, my: 0, lx: 0, ly: 0, fire: false }, inputAt: 0,
      lastShot: 0, kick: 0, flashT: 0, flash3: 0, walkT: 0, bob: 0, kills: 0, deaths: 0,
      hurtT: 0, hitT: 0, deadT: 0, av, cam, gun, view: null, color: "", rect: [0, 0, 1, 1], bobY: 0, vmAspect: 1.6,
      ammo: 0, reserve: 0, reloadT: 0, ammoSync: 0, hdirT: 0, hurtAng: 0,
      sid: null, lookPX: 0, lookPY: 0, rlSeen: 0, swSeen: 0, pkSeen: 0, lookDX: 0, lookDY: 0,
      charIdx, guns: [], cur: 0, shootT: 0, pickT: 0, near: null, gunKey: "",
    };
    respawn(ch);
    ch.prot = 0;
    return ch;
  }
  // Team players respawn in their team's room; solo players anywhere. Either way: the spot farthest from the enemies (best of 10 random tries).
  function respawn(ch) {
    const f = ch.fac, enemies = [...chars.values()].filter((o) => o !== ch && o.alive && o.fac !== f);
    const pool = f.team >= 0 ? bases[f.team].spawns : soloSpawns;
    let best = pool[(Math.random() * pool.length) | 0], bd = -1;
    for (let k = 0; k < 10; k++) {
      const c = pool[(Math.random() * pool.length) | 0];
      const d = Math.min(99, ...enemies.map((o) => Math.hypot(o.x - c[0], o.z - c[1])));
      if (d > bd) { bd = d; best = c; }
    }
    ch.x = best[0]; ch.z = best[1]; ch.yaw = f.team >= 0 ? bases[f.team].yaw : faceMid(best[0], best[1]); ch.pitch = 0;
    ch.hp = ch.shownHp = START_HP; ch.alive = true; ch.deadT = 0; ch.prot = SPAWN_PROTECT; ch.hurtT = 0;
    ch.input = { mx: 0, my: 0, lx: 0, ly: 0, fire: false };
    ch.guns = START_GUNS.map((id) => ({ id, ammo: GUNS[id].mag, reserve: GUNS[id].total - GUNS[id].mag }));     // fresh g1 + g2 every spawn
    ch.cur = (Math.random() * ch.guns.length) | 0;                      // one of them at random in hand
    ch.ammo = ch.guns[ch.cur].ammo; ch.reserve = ch.guns[ch.cur].reserve;
    ch.reloadT = 0; ch.lookDX = ch.lookDY = 0; ch.hdirT = 0; ch.shootT = 0; ch.pickT = 0;
    setViewGun(ch); setHandGun(ch);
    if (ch.av.mixer) { ch.av.cur = ""; ch.av.mixer.stopAllAction(); playAnim(ch.av, ANIM.idle); }
    sendAmmo(ch); sendGun(ch, true);
  }
  function removeChar(ch) {
    scene.remove(ch.av.group, ch.cam);
    viewScene.remove(ch.gun.group);
    if (ch.gun.model) disposeGunModel(ch.gun.model);
    ch.gun.blocks.forEach((o) => o.geometry?.dispose());
    disposeAvatar(ch.av);
  }

  function hurt(victim, dmg, attacker) {
    if (!victim.alive || victim.prot > 0) return;
    victim.hp = Math.max(0, victim.hp - dmg);
    victim.hurtT = HIT_FLASH;
    if (attacker) {                                                  // which way did it come from? (0 = ahead, + = right)
      const ax = attacker.x - victim.x, az = attacker.z - victim.z;
      const fwd = ax * -Math.sin(victim.yaw) + az * -Math.cos(victim.yaw), right = ax * Math.cos(victim.yaw) + az * -Math.sin(victim.yaw);
      victim.hurtAng = Math.atan2(right, fwd); victim.hdirT = 1;
    }
    vibrate(victim.slot, 35);
    ctx.send(victim.slot, { type: "ctf-hit", ang: +victim.hurtAng.toFixed(2) });
    if (victim.hp <= 0) kill(victim, attacker);
  }
  function kill(v, a) {
    v.alive = false; v.deadT = 0; v.respawn = RESPAWN_TIME; v.deaths++; a.kills++; a.fac.kills++;
    v.input.fire = false; v.reloadT = 0;
    playAnim(v.av, ANIM.die, true);
    ui.feed([[nameOf(a), facColor(a.fac)], [" ▸ "], [nameOf(v), facColor(v.fac)]]);
    vibrate(a.slot, [40, 30, 40]); vibrate(v.slot, [150, 60, 150]);
    sendPhoneHud(v); sendPhoneHud(a);
    if (st.overtime) {                                                // sudden death: the first clear lead wins
      const s = standings();
      if (s.length < 2 || s[0].kills > s[1].kills) endMatch(s[0] || null);
    }
  }

  /* ---------------- ammo + reload + swap + pick ---------------- */
  function sendAmmo(ch) {
    const g = gunOf(ch);
    ctx.send(ch.slot, { type: "ctf-ammo", ammo: ch.ammo, max: g.mag, reserve: ch.reserve, total: g.total, reloading: ch.reloadT > 0, time: g.reload, left: +ch.reloadT.toFixed(2) });
  }
  function sendGun(ch, force = false) {                           // phone: gun names on SWAP / PICK
    const other = ch.guns[1 - ch.cur], near = ch.near ? GUNS[ch.near.gunId] : null;
    const msg = { type: "ctf-gun", cur: gunOf(ch).name, curId: gunOf(ch).id, other: other ? GUNS[other.id].name : "", near: near ? near.name : "", nearId: near ? near.id : "" };
    const key = JSON.stringify(msg);
    if (!force && key === ch.gunKey) return;
    ch.gunKey = key; ctx.send(ch.slot, msg);
  }
  function swapGun(ch) {                                          // SWAP: the other carried gun into your hand
    if (!ch.alive || ch.guns.length < 2) return;
    ch.guns[ch.cur].ammo = ch.ammo; ch.guns[ch.cur].reserve = ch.reserve;
    ch.cur = 1 - ch.cur;
    ch.ammo = ch.guns[ch.cur].ammo; ch.reserve = ch.guns[ch.cur].reserve; ch.reloadT = 0; ch.lastShot = performance.now() / 1000 - gunOf(ch).delay + 0.25;
    setViewGun(ch); setHandGun(ch);
    ch.kick = 1.5; ding(420, 0.06); vibrate(ch.slot, 15);
    sendAmmo(ch); sendGun(ch);
  }
  function pickGun(ch) {                                          // PICK: the gun in your hand is swapped with the one on the floor
    const p = ch.near;
    if (!ch.alive || !p) { vibrate(ch.slot, [20, 30, 20]); return; }
    const old = { id: ch.guns[ch.cur].id, ammo: ch.ammo, reserve: ch.reserve };
    ch.guns[ch.cur] = { id: p.gunId, ammo: p.ammo, reserve: p.reserve };
    ch.ammo = p.ammo; ch.reserve = p.reserve; ch.reloadT = 0;
    setPickup(p, old.id, old.ammo, old.reserve);                                 // your old gun stays on the spot
    setViewGun(ch); setHandGun(ch);
    ch.pickT = PICKUP_ANIM; playAnim(ch.av, ANIM.pick, true);
    ui.feed([[nameOf(ch), facColor(ch.fac)], [" picked up the "], [GUNS[ch.guns[ch.cur].id].name, "#ffd060"]]);
    ch.kick = 1.5; ding(620, 0.1); ding(930, 0.12); vibrate(ch.slot, [25, 30, 25]);
    sendAmmo(ch); sendGun(ch);
  }
  function startReload(ch) {
    const g = gunOf(ch);
    if (!ch.alive || ch.reloadT > 0 || ch.ammo >= g.mag || ch.reserve <= 0) return;   // nothing left to reload with
    ch.reloadT = g.reload;
    ding(300, 0.06);
    sendAmmo(ch);
  }

  /* ---------------- shooting ---------------- */
  const shotRay = new THREE.Raycaster();
  const vA = new THREE.Vector3(), vB = new THREE.Vector3(), vO = new THREE.Vector3(), vD = new THREE.Vector3(), pr = new THREE.Vector3(), ps = new THREE.Vector3();
  const sparkGeo = new THREE.SphereGeometry(0.07, 8, 6), decalGeo = new THREE.CircleGeometry(0.09, 12);
  const decalMat = new THREE.MeshBasicMaterial({ color: 0x1a0d08, polygonOffset: true, polygonOffsetFactor: -2 });
  function shoot(ch) {
    ch.cam.updateMatrixWorld(true);
    ch.cam.getWorldPosition(vO); ch.cam.getWorldDirection(vD);
    const range = gunOf(ch).range;
    shotRay.set(vO, vD); shotRay.far = range;                     // walls / players beyond the gun's range are never hit
    const wall = shotRay.intersectObjects(meshes, false)[0];
    let maxT = wall ? wall.distance : range, target = null;
    for (const o of chars.values()) {
      if (o === ch || o.fac === ch.fac || !o.alive || o.prot > 0) continue;       // no friendly fire: your own team (or yourself) is never hit
      vA.set(o.x, floorTop + 0.2, o.z); vB.set(o.x, floorTop + H * 1.0, o.z);
      if (shotRay.ray.distanceSqToSegment(vA, vB, pr, ps) < HIT_R_BASE * HIT_R_BASE) {
        const t = pr.distanceTo(vO);
        if (t < maxT) { maxT = t; target = o; }
      }
    }
    const from = viewGunPos(ch, new THREE.Vector3()).add(ch.gun.muzzle.position);   // muzzle, in view space ...
    ch.cam.localToWorld(from);                                                          // ... to world space
    const to = vO.clone().addScaledVector(vD, maxT);
    const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints([from, to]),
      new THREE.LineBasicMaterial({ color: new THREE.Color(ch.color || "#ffe08a").lerp(new THREE.Color(0xffe08a), 0.5), transparent: true }));
    scene.add(line); temps.push({ obj: line, life: 0.08, dispose: true });
    if (target) {
      hurt(target, gunOf(ch).dmg, ch);
      ch.hitT = 0.18; ding(target.alive ? 900 : 520, 0.08);
    } else if (wall) {
      const nrm = wall.face.normal.clone().transformDirection(wall.object.matrixWorld);
      const spark = new THREE.Mesh(sparkGeo, new THREE.MeshBasicMaterial({ color: 0xffa040, transparent: true }));
      spark.position.copy(wall.point); scene.add(spark); temps.push({ obj: spark, life: 0.08 });
      const dc = new THREE.Mesh(decalGeo, decalMat);
      dc.position.copy(wall.point).addScaledVector(nrm, 0.01); dc.lookAt(wall.point.clone().add(nrm));
      scene.add(dc); decals.push(dc); if (decals.length > 40) scene.remove(decals.shift());
    }
    ch.kick = gunOf(ch).kick; ch.flashT = 0.05; ch.flash3 = 0.06; ch.shootT = 0.3;
    bang(0.18 + 0.05 * gunOf(ch).kick);
  }

  /* ---------------- phone modes + HUD ---------------- */
  const modeFor = (slot) => (chars.has(slot) && st.phase !== "teams" ? "play" : "select");
  const sendModes = () => { for (const slot of roster.keys()) ctx.send(slot, { type: "ctf-mode", mode: modeFor(slot) }); };
  function phoneText(ch) {
    const f = ch.fac;
    if (f.solo) { const s = standings(); return `SOLO · ${ch.kills} kills · #${s.indexOf(f) + 1} of ${s.length}`; }
    return `${f.name} · team ${f.kills} · you ${ch.kills} kills`;
  }
  const sendPhoneHud = (ch) => ctx.send(ch.slot, { type: "hud", hp: Math.round(ch.hp), text: phoneText(ch), down: !ch.alive });

  /* ---------------- match flow ---------------- */
  function checkStart() {
    if (st.phase === "teams" && lobby.canStart()) startMatch();
  }
  function startMatch() {
    st.matchT = MATCH_TIME; st.overtime = false;
    const players = [...roster.entries()].filter(([, r]) => r.side >= 0).sort((a, b) => a[0] - b[0]).slice(0, MAX_FIGHTERS);   // four split-screen cells at most
    const byslot = makeFactions(players);
    placeMedkits();
    resetPickups();
    lobby.clearPreviews();
    for (const [slot, r] of players) chars.set(slot, spawnChar(slot, byslot.get(slot), r.char));
    ui.layoutViews(); ui.buildScore(); ui.updateStats();
    ui.clearFeed();
    lobby.hide();
    ui.showScore(true);
    st.phase = "count"; st.countT = 3;
    sendModes();
    for (const ch of chars.values()) sendPhoneHud(ch);
    for (const [slot] of roster) if (!chars.has(slot)) ctx.send(slot, { type: "hud", text: "Match running: you join next round", down: false });
  }
  function updateClock(dt) {
    if (st.overtime) return;
    const before = Math.ceil(st.matchT);
    st.matchT -= dt;
    const after = Math.ceil(Math.max(0, st.matchT));
    if (after !== before) {
      if (after === 60) ui.banner("1 MINUTE LEFT", scoreLine(), 2);
      else if (after === 30) ui.banner("30 SECONDS LEFT", scoreLine(), 2);
      else if (after <= 10 && after > 0) ding(880, 0.06);          // tick for the last ten seconds
    }
    if (st.matchT > 0) return;
    st.matchT = 0;
    const s = standings();
    if (s.length < 2 || s[0].kills > s[1].kills) endMatch(s[0] || null);   // most kills wins
    else if (OVERTIME) { st.overtime = true; ui.banner("OVERTIME!", "tied · first clear lead wins", 3); ding(600, 0.2); setTimeout(() => ding(900, 0.3), 180); }
    else endMatch(-1);
  }
  // winner: a faction, null = cancelled (not enough sides left), -1 = draw
  function endMatch(winner) {
    if (st.phase === "over") return;
    st.phase = "over";
    if (winner === null) { st.overT = 2.5; ui.banner("MATCH CANCELLED", "no opponents left", st.overT); }
    else if (winner === -1) {                                       // time up and still tied (only when OVERTIME is false)
      st.overT = 7;
      ui.banner("DRAW!", `${scoreLine()}  ·  back to select…`, st.overT);
      ding(440, 0.3); setTimeout(() => ding(440, 0.4), 250);
      for (const ch of chars.values()) vibrate(ch.slot, [150, 80, 150]);
    } else {
      st.overT = 7;
      ui.banner(winner.solo ? `${facName(winner).toUpperCase()} WINS!` : `${winner.name} TEAM WINS!`, `${scoreLine()}  ·  back to select…`, st.overT);
      ding(523, 0.3); setTimeout(() => ding(659, 0.3), 200); setTimeout(() => ding(784, 0.5), 400);
      for (const ch of chars.values()) vibrate(ch.slot, ch.fac === winner ? [100, 60, 100, 60, 300] : [300]);
    }
  }
  function toTeams() {
    for (const ch of chars.values()) removeChar(ch);
    chars.clear();
    ui.clearViews();
    hideMedkits();
    for (const r of roster.values()) { r.ready = false; r.latch = false; r.stage = r.side >= 0 ? "char" : "team"; }   // keep side + character, just ready up again
    st.phase = "teams";
    ui.showScore(false); ui.bannerEl.style.display = "none";
    ui.clearFeed();
    lobby.show();
    sendModes();
  }
  function checkAbort() {                                           // fewer than two sides left in the match
    if (st.phase !== "play" && st.phase !== "count") return;
    if (S.factions.filter((f) => f.members > 0).length < 2) endMatch(null);
  }

  /* ---------------- per-frame update ---------------- */
  function updateChar(ch, dt, active) {
    const inp = ch.input, info = ctx.player(ch.slot);
    const color = info?.color || "#888888";
    if (ch.color !== color) { ch.color = color; ch.av.cloth?.color.set(color); }
    const fHex = fac.hex(ch.fac), fCss = facColor(ch.fac);        // team colour, or the player's own colour when solo
    tintAvatar(ch.av, fHex);
    setLabel(ch.av.label, info?.name || `P${ch.slot}`, fCss);
    ch.av.marker.material.color.set(fCss);
    ch.av.marker.rotation.y += dt * 2; ch.av.marker.position.y = H * 1.38 + Math.sin(st.tNow * 3 + ch.slot) * 0.06;

    const now = performance.now();
    if (active && now - ch.inputAt > 600) { inp.mx = inp.my = inp.lx = inp.ly = 0; inp.fire = false; }   // phone went quiet: let go of everything
    let moving = false;

    if (active && ch.alive) {
      // drag-to-look: the phone sends bursts, so feed them in smoothly over the next few frames
      const kx = ch.lookDX * (1 - Math.exp(-dt * 30)), ky = ch.lookDY * (1 - Math.exp(-dt * 30));
      ch.lookDX -= kx; ch.lookDY -= ky;
      ch.yaw -= kx * LOOK_YAW;
      ch.pitch = clampN(ch.pitch + ky * LOOK_PITCH, -1.2, 1.2);
      const f = -inp.my, s = inp.mx, mag = Math.min(1, Math.hypot(f, s));
      if (mag > 0.05) {
        const fx = -Math.sin(ch.yaw), fz = -Math.cos(ch.yaw), rx = Math.cos(ch.yaw), rz = -Math.sin(ch.yaw);
        let dx = fx * f + rx * s, dz = fz * f + rz * s;
        const l = Math.hypot(dx, dz) || 1; dx /= l; dz /= l;
        const step = H * 3.5 * mag * dt, n = Math.ceil(step / (RADIUS * 0.5)), sd = step / n;
        for (let k = 0; k < n; k++) {                    // small sub-steps, per axis = slide along walls
          const nx = ch.x + dx * sd; if (!hits(nx, ch.z)) ch.x = nx;
          const nz = ch.z + dz * sd; if (!hits(ch.x, nz)) ch.z = nz;
        }
        moving = true;
        ch.walkT += dt * 9 * mag;
      }
    }
    if (active && ch.alive) {                                       // reload progress + keep the phone's ammo counter in sync
      if (ch.reloadT > 0) {
        ch.reloadT -= dt;
        if (ch.reloadT <= 0) {
          ch.reloadT = 0;
          const take = Math.min(gunOf(ch).mag - ch.ammo, ch.reserve);          // spare bullets go into the magazine
          ch.ammo += take; ch.reserve -= take;
          ding(700, 0.08); sendAmmo(ch);
        }
      }
      ch.ammoSync += dt;
      if (ch.ammoSync > 1) { ch.ammoSync = 0; sendAmmo(ch); }
    }
    if (!ch.alive) ch.lookDX = ch.lookDY = 0;
    if (active && !ch.alive) {
      ch.respawn -= dt; ch.deadT += dt;
      if (ch.respawn <= 0) { respawn(ch); sendPhoneHud(ch); }
    }
    if (ch.prot > 0) ch.prot -= dt;
    ch.hurtT = Math.max(0, ch.hurtT - dt); ch.hitT = Math.max(0, ch.hitT - dt); ch.hdirT = Math.max(0, ch.hdirT - dt);
    ch.shownHp += (ch.hp - ch.shownHp) * Math.min(1, dt * 2.2);     // the trail of the health bar fades down slowly

    // nearest gun pickup (for the PICK button)
    let near = null;
    if (ch.alive) { let bd = PICKUP_RANGE; for (const p of pickups) { const d = Math.hypot(p.x - ch.x, p.z - ch.z); if (d < bd) { bd = d; near = p; } } }
    ch.near = near;
    if (active) sendGun(ch);

    // body
    const av = ch.av;
    av.group.position.set(ch.x, floorTop, ch.z);
    av.group.rotation.y = ch.yaw + Math.PI;
    ch.shootT = Math.max(0, ch.shootT - dt); ch.pickT = Math.max(0, ch.pickT - dt);
    if (av.mixer) {                                                 // animated character
      const mag = Math.hypot(inp.mx, inp.my);
      if (!ch.alive) playAnim(av, ANIM.die, true);
      else if (ch.pickT > 0) playAnim(av, ANIM.pick, true);
      else if (ch.shootT > 0 && !moving) playAnim(av, ANIM.shoot);
      else if (moving) playAnim(av, mag > 0.85 && !ch.shootT ? ANIM.run : ANIM.walk);
      else playAnim(av, ANIM.idle);
      av.mixer.update(dt);
      if (ch.alive && ch.pickT <= 0) holdPose(av, ch.pitch);       // gun arm stays raised while walking / running
      av.group.updateMatrixWorld(true);
      groundAvatar(av, floorTop);                                  // feet on the ground, whatever the animation does
    } else {
      const sw = moving ? Math.sin(ch.walkT) * 0.7 : 0;
      av.legL.rotation.x = sw; av.legR.rotation.x = -sw; av.armL.rotation.x = -sw * 0.5;
      av.armR.rotation.x = -Math.PI / 2 + ch.pitch;                 // gun arm follows where the player looks
    }
    ch.flash3 -= dt; av.flash.visible = ch.flash3 > 0;
    if (av.backGun) av.backGun.holder.visible = ch.alive;

    // camera = the player's eyes
    const eye = floorTop + H * 0.9;
    ch.cam.position.set(ch.x, eye + (moving ? Math.sin(ch.walkT * 2) * 0.02 : 0), ch.z);
    if (ch.alive) ch.cam.rotation.set(-ch.pitch, ch.yaw, ch.hurtT > 0 ? (Math.random() - 0.5) * 0.07 * (ch.hurtT / HIT_FLASH) : 0, "YXZ");
    else {                                                          // fall over while waiting to respawn
      const k = Math.min(1, ch.deadT / 0.5);
      ch.cam.position.y = eye - (eye - 0.35) * k;
      ch.cam.rotation.set(-ch.pitch * (1 - k), ch.yaw, k * 0.8, "YXZ");
    }
    // gun in view (placed + drawn in ui.render(), here only its motion)
    ch.kick = Math.max(0, ch.kick - dt * 12);
    ch.bobY = moving ? Math.sin(ch.walkT * 2) * 0.008 : 0;
    ch.flashT -= dt; ch.gun.flash.visible = ch.flashT > 0;

    // shoot last, so the bullet leaves from this frame's camera
    if (active && ch.alive && inp.fire && ch.reloadT <= 0) {
      const t = performance.now() / 1000;
      if (ch.ammo <= 0) {                                          // tried to fire on empty: reload, or click if there is nothing left
        if (ch.reserve > 0) startReload(ch);
        else if (t - ch.lastShot > 0.4) { ch.lastShot = t; ding(150, 0.03); }
      }
      else if (t - ch.lastShot > gunOf(ch).delay) {
        ch.lastShot = t; ch.ammo--; shoot(ch); sendAmmo(ch);
        if (ch.ammo <= 0) startReload(ch);                         // last bullet gone: reload by itself
      }
    }
  }

  function updateObjectives(dt) {
    updatePickups(dt);
    for (const k of medkits) {
      if (k.active) {
        for (const ch of chars.values()) {
          if (!ch.alive || ch.hp >= START_HP || Math.hypot(ch.x - k.x, ch.z - k.z) > 1.7) continue;
          ch.hp = Math.min(START_HP, ch.hp + MEDKIT_HEAL);
          k.active = false; k.group.visible = false; k.timer = MEDKIT_RESPAWN;
          vibrate(ch.slot, 30); ding(880, 0.15); sendPhoneHud(ch);
          break;
        }
      } else {
        k.timer -= dt;
        if (k.timer <= 0) { k.active = true; k.group.visible = true; }     // back on the same spot
      }
    }
  }

  function animateWorld() {
    const t = st.tNow;
    for (const k of medkits) if (k.active) { k.body.rotation.y = t * 1.8 + k.phase; k.body.position.y = 0.9 + Math.sin(t * 2.4 + k.phase) * 0.12; }
    for (const p of pickups) { p.spin.rotation.y = t * 1.5 + p.phase; p.spin.position.y = 1.0 + Math.sin(t * 2 + p.phase) * 0.1; }
  }

  function update(dt) {
    st.tNow += dt;
    animateWorld();
    if (st.phase === "teams") lobby.updatePreviews(dt);
    else {
      if (st.phase === "count") {
        st.countT -= dt;
        if (st.countT <= 0) { st.phase = "play"; ui.banner("GO!", "", 1); }
        else ui.bannerEl.firstChild?.nodeValue !== String(Math.ceil(st.countT)) && ui.banner(String(Math.ceil(st.countT)), "get ready", 1.2);
      }
      for (const ch of chars.values()) updateChar(ch, dt, st.phase === "play");
      if (st.phase === "play") { updateClock(dt); if (st.phase === "play") updateObjectives(dt); }
      if (st.phase === "over") { st.overT -= dt; if (st.overT <= 0) toTeams(); }
      ui.tickHud();
      ui.updateScore();
    }
    if (st.bannerT > 0) { st.bannerT -= dt; if (st.bannerT <= 0) ui.bannerEl.style.display = "none"; }
    for (let i = temps.length - 1; i >= 0; i--) {
      const t = temps[i]; t.life -= dt;
      if (t.life <= 0) {
        scene.remove(t.obj); t.obj.material.dispose(); if (t.dispose) t.obj.geometry.dispose();
        temps.splice(i, 1);
      } else t.obj.material.opacity = Math.min(1, t.life / 0.08);
    }
    ui.tickFeed(dt);
  }

  /* ---------------- events from the console ---------------- */
  const newEntry = (slot) => ({ side: -1, ready: false, latch: false, stage: "team", char: slot % CHAR_COUNT });
  for (const p of ctx.players()) roster.set(p.slot, newEntry(p.slot));
  function onJoin(slot) {
    if (!roster.has(slot)) roster.set(slot, newEntry(slot));
    ctx.send(slot, { type: "ctf-mode", mode: modeFor(slot) });
    if (st.phase === "teams") { lobby.renderLobby(); lobby.lobbyHud(slot); }
    else ctx.send(slot, { type: "hud", text: "Match running: you join next round", down: false });
  }
  function onLeave(slot) {
    roster.delete(slot);
    const ch = chars.get(slot);
    if (ch) {
      ch.fac.members--;
      removeChar(ch); chars.delete(slot);
      if (st.phase !== "teams") { ui.layoutViews(); ui.buildScore(); ui.updateStats(); checkAbort(); }
    }
    if (st.phase === "teams") { lobby.renderLobby(); checkStart(); }
  }
  function onInput(slot, data) {
    if (!data) return;
    if (data.type === "ctf") {                                      // twin sticks + fire (play mode)
      const ch = chars.get(slot);
      if (!ch) return;
      ch.input.mx = stickVal(data.mx); ch.input.my = stickVal(data.my);
      ch.input.fire = !!data.fire;
      ch.inputAt = performance.now();
      // look + reload arrive as running totals: act on the change since the last message
      const lookX = +data.lookX || 0, lookY = +data.lookY || 0, rl = data.rl | 0;
      const sw = data.sw | 0, pk = data.pk | 0;
      if (ch.sid !== data.sid) { ch.sid = data.sid; ch.lookPX = lookX; ch.lookPY = lookY; ch.rlSeen = rl; ch.swSeen = sw; ch.pkSeen = pk; }   // new page load: start counting from here
      const dX = lookX - ch.lookPX, dY = lookY - ch.lookPY;
      ch.lookPX = lookX; ch.lookPY = lookY;
      if (ch.alive) { ch.lookDX += clampN(dX, -2, 2); ch.lookDY += clampN(dY, -2, 2); }
      if (rl !== ch.rlSeen) { ch.rlSeen = rl; startReload(ch); }
      if (st.phase === "play") {
        if (sw !== ch.swSeen) { ch.swSeen = sw; swapGun(ch); }
        if (pk !== ch.pkSeen) { ch.pkSeen = pk; pickGun(ch); }
      } else { ch.swSeen = sw; ch.pkSeen = pk; }
    } else if (data.type === "move") lobby.lobbyMove(slot, stickVal(data.x));
    else if (data.type === "button") lobby.lobbyButton(slot, data.id, !!data.pressed);
  }

  // phones: keep their pad mode right (a message can be missed while the pad is still loading) + refresh the health bar
  const timers = [
    setInterval(() => { sendModes(); if (st.phase === "teams") for (const slot of roster.keys()) lobby.lobbyHud(slot); }, 1500),
    setInterval(() => { if (st.phase !== "teams") for (const ch of chars.values()) sendPhoneHud(ch); }, 300),
    setInterval(() => ui.updateStats(), 700),
  ];

  function dispose() {
    timers.forEach(clearInterval);
    for (const slot of roster.keys()) {                            // phones back to the plain pad
      ctx.send(slot, { type: "ctf-mode", mode: "select" });
      ctx.send(slot, { type: "hud", text: "", down: false });
    }
    for (const ch of chars.values()) removeChar(ch);
    chars.clear();
    for (const p of pickups) if (p.model) disposeGunModel(p.model);
    for (const o of [...pads, ...medkits.map((k) => k.group), ...pickups.map((p) => p.group)])
      o.traverse((m) => { m.geometry?.dispose(); (Array.isArray(m.material) ? m.material : m.material ? [m.material] : []).forEach((x) => x.dispose()); });
    sparkGeo.dispose(); decalGeo.dispose(); decalMat.dispose();
    try { audio?.close(); } catch {}
  }

  return { nameOf, gunOf, checkStart, update, onJoin, onLeave, onInput, sendModes, dispose, medkits };
}
