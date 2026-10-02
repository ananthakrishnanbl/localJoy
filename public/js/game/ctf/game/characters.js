// Player characters: spawn / respawn / remove, damage and kills.

import { ANIM, GUNS, HIT_FLASH, RESPAWN_TIME, SPAWN_PROTECT, START_GUNS, START_HP } from "../config.js";

export function setupCharacters(G) {
  const {
    ctx, THREE, scene, bases, disposeGunModel, makeAvatar, playAnim, setHandGun, disposeAvatar, viewScene,
    setViewGun, makeGun, chars, nameOf, colorOf, vibrate, feed, dropFlag, sendPhoneHud
  } = G;
  // functions from modules that are set up later: looked up on G at the moment they are called
  const sendAmmo = (...a) => G.sendAmmo(...a);
  const sendGun = (...a) => G.sendGun(...a);

  /* ---------------- characters ---------------- */
  function spawnChar(slot, team, charIdx) {
    const av = makeAvatar(charIdx); scene.add(av.group);
    const cam = new THREE.PerspectiveCamera(60, 1, 0.05, 500);
    const gun = makeGun();
    scene.add(cam);
    const ch = {
      slot, team, hp: START_HP, shownHp: START_HP, alive: true, respawn: 0, prot: 0,
      x: 0, z: 0, yaw: 0, pitch: 0, input: { mx: 0, my: 0, lx: 0, ly: 0, fire: false }, inputAt: 0,
      lastShot: 0, kick: 0, flashT: 0, flash3: 0, walkT: 0, bob: 0, carrying: null, kills: 0, deaths: 0, caps: 0,
      hurtT: 0, hitT: 0, deadT: 0, av, cam, gun, view: null, color: "", rect: [0, 0, 1, 1], bobY: 0, vmAspect: 1.6,
      ammo: 0, reserve: 0, reloadT: 0, ammoSync: 0, hdirT: 0, hurtAng: 0,
      sid: null, lookPX: 0, lookPY: 0, rlSeen: 0, swSeen: 0, pkSeen: 0, lookDX: 0, lookDY: 0,
      charIdx, guns: [], cur: 0, shootT: 0, pickT: 0, near: null, gunKey: "",
    };
    respawn(ch);
    ch.prot = 0;
    return ch;
  }
  function respawn(ch) {
    const b = bases[ch.team];
    const others = [...chars.values()].filter((o) => o !== ch && o.alive);
    let best = b.spawns[(Math.random() * b.spawns.length) | 0], bd = -1;
    for (let k = 0; k < 8; k++) {                                       // a spawn spot nobody is standing on
      const c = b.spawns[(Math.random() * b.spawns.length) | 0];
      const d = Math.min(99, ...others.map((o) => Math.hypot(o.x - c[0], o.z - c[1])));
      if (d > bd) { bd = d; best = c; }
    }
    ch.x = best[0]; ch.z = best[1]; ch.yaw = b.yaw; ch.pitch = 0;
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
    if (ch.carrying) dropFlag(ch.carrying, ch.x, ch.z, true);
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
    v.alive = false; v.deadT = 0; v.respawn = RESPAWN_TIME; v.deaths++; a.kills++;
    v.input.fire = false; v.reloadT = 0;
    playAnim(v.av, ANIM.die, true);
    if (v.carrying) dropFlag(v.carrying, v.x, v.z);
    feed([[nameOf(a), colorOf(a.slot)], [" ▸ "], [nameOf(v), colorOf(v.slot)]]);
    vibrate(a.slot, [40, 30, 40]); vibrate(v.slot, [150, 60, 150]);
    sendPhoneHud(v); sendPhoneHud(a);
  }

  // shared with the modules set up after this one
  Object.assign(G, { spawnChar, respawn, removeChar, hurt });
}
