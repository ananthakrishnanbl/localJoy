// Flags (take / drop / return / capture), med-kits and the per-frame objective checks.

import {
  CARRY_FLAG, FLAG_RETURN_TIME, MEDKIT_COUNT, MEDKIT_HEAL, MEDKIT_RESPAWN, REQUIRE_OWN_FLAG, START_HP,
  TEAMS
} from "../config.js";

export function setupObjectives(G) {
  const S = G.S;
  const {
    scene, floorTop, bases, midCells, makeFlag, makeBase, makeMedkit, chars, caps, nameOf, colorOf, vibrate,
    ding, banner, feed, sendPhoneHud
  } = G;
  // functions from modules that are set up later: looked up on G at the moment they are called
  const updatePickups = (...a) => G.updatePickups(...a);
  const endMatch = (...a) => G.endMatch(...a);

  const flags = TEAMS.map((_, t) => {
    const f = makeFlag(t), stand = makeBase(t);
    stand.position.set(bases[t].home.x, floorTop, bases[t].home.z);
    scene.add(stand);
    scene.add(f.group);
    return { team: t, ...f, stand, home: bases[t].home, x: 0, z: 0, atHome: true, carrier: null, timer: 0 };
  });
  for (const f of flags) returnFlag(f);               // flags start on their stands
  const medkits = [];
  for (let i = 0; i < MEDKIT_COUNT; i++) {
    const m = makeMedkit();
    m.group.visible = false; scene.add(m.group);
    medkits.push({ ...m, x: 0, z: 0, active: false, timer: 0, lastX: 1e9, lastZ: 1e9, phase: Math.random() * 6 });
  }

  /* ---------------- flags ---------------- */
  const flagPos = (f) => (f.carrier ? { x: f.carrier.x, z: f.carrier.z } : { x: f.x, z: f.z });
  function placeFlag(f, x, z) {
    f.x = x; f.z = z;
    scene.add(f.group);                                  // (re)parent to the world
    f.group.position.set(x, floorTop, z);
    f.group.rotation.set(0, 0, 0);
    f.group.scale.setScalar(1);
  }
  function returnFlag(f) {
    if (f.carrier) { f.carrier.carrying = null; f.carrier = null; }
    f.atHome = true; f.timer = 0;
    placeFlag(f, f.home.x, f.home.z);
  }
  function dropFlag(f, x, z, silent = false) {
    const c = f.carrier;
    f.carrier = null; f.atHome = false; f.timer = FLAG_RETURN_TIME;
    if (c) c.carrying = null;
    placeFlag(f, x, z);
    if (!silent && c) feed([[nameOf(c), colorOf(c.slot)], [" dropped the "], [TEAMS[f.team].name + " flag", TEAMS[f.team].color]]);
  }
  function takeFlag(ch, f) {
    f.carrier = ch; ch.carrying = f; f.atHome = false; f.timer = 0;
    ch.av.group.add(f.group);                            // rides on the carrier's back, clear of his body
    f.group.position.set(...CARRY_FLAG.pos); f.group.scale.setScalar(CARRY_FLAG.scale); f.group.rotation.set(0, 0, 0);
    feed([[nameOf(ch), colorOf(ch.slot)], [" took the "], [TEAMS[f.team].name + " flag!", TEAMS[f.team].color]]);
    vibrate(ch.slot, [60, 40, 60]); ding(520, 0.2); ding(780, 0.25);
  }
  function capture(ch) {
    const enemy = ch.carrying;
    ch.caps++; caps[ch.team]++;
    returnFlag(enemy);
    feed([[nameOf(ch), colorOf(ch.slot)], [" CAPTURED the flag for "], [TEAMS[ch.team].name, TEAMS[ch.team].color]]);
    for (const o of chars.values()) vibrate(o.slot, o.team === ch.team ? [80, 40, 80, 40, 160] : [200]);
    ding(660, 0.2); setTimeout(() => ding(880, 0.3), 160);
    if (S.overtime) endMatch(ch.team);                                // sudden death: first capture wins
    else banner(`${TEAMS[ch.team].name} SCORES!`, `${caps[0]} – ${caps[1]}`, 2.2);
  }

  /* ---------------- med-kits ---------------- */
  function placeMedkit(k) {
    if (!midCells.length) return;
    let pick = null;
    for (let tries = 0; tries < 40 && !pick; tries++) {
      const c = midCells[(Math.random() * midCells.length) | 0];
      if (medkits.some((o) => o !== k && o.active && Math.hypot(o.x - c[0], o.z - c[1]) < 8)) continue;
      if (Math.hypot(k.lastX - c[0], k.lastZ - c[1]) < 6) continue;
      pick = c;
    }
    pick ||= midCells[(Math.random() * midCells.length) | 0];
    k.x = k.lastX = pick[0]; k.z = k.lastZ = pick[1];
    k.group.position.set(k.x, floorTop, k.z);
    k.group.visible = true; k.active = true;
  }

  function updateObjectives(dt) {
    updatePickups(dt);
    for (const f of flags) {                                        // dropped flags go home by themselves
      if (!f.atHome && !f.carrier) {
        f.timer -= dt;
        if (f.timer <= 0) { returnFlag(f); feed([["The "], [TEAMS[f.team].name + " flag", TEAMS[f.team].color], [" returned to base"]]); }
      }
    }
    for (const ch of chars.values()) {
      if (!ch.alive) continue;
      const own = flags[ch.team], enemy = flags[1 - ch.team];
      if (!enemy.carrier && !ch.carrying) {
        const p = flagPos(enemy);
        if (Math.hypot(ch.x - p.x, ch.z - p.z) < 2.3) takeFlag(ch, enemy);
      }
      if (!own.carrier && !own.atHome && Math.hypot(ch.x - own.x, ch.z - own.z) < 2.3) {
        returnFlag(own);
        feed([[nameOf(ch), colorOf(ch.slot)], [" returned the "], [TEAMS[own.team].name + " flag", TEAMS[own.team].color]]);
        ding(700, 0.15);
      }
      if (ch.carrying && Math.hypot(ch.x - own.home.x, ch.z - own.home.z) < 3 && (!REQUIRE_OWN_FLAG || own.atHome)) capture(ch);
      if (S.phase !== "play") return;                                 // a capture may have ended the match
    }
    for (const k of medkits) {
      if (k.active) {
        for (const ch of chars.values()) {
          if (!ch.alive || ch.hp >= START_HP || Math.hypot(ch.x - k.x, ch.z - k.z) > 1.7) continue;
          ch.hp = Math.min(START_HP, ch.hp + MEDKIT_HEAL);
          k.active = false; k.group.visible = false; k.timer = MEDKIT_RESPAWN;
          vibrate(ch.slot, 30); ding(880, 0.15); sendPhoneHud(ch);
          break;
        }
      } else if (midCells.length) {
        k.timer -= dt;
        if (k.timer <= 0) placeMedkit(k);                           // back at a new random spot
      }
    }
  }

  // shared with the modules set up after this one
  Object.assign(G, { flags, medkits, flagPos, returnFlag, dropFlag, placeMedkit, updateObjectives });
}
