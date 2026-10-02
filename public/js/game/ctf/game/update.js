// Per-frame update: player movement / animation / camera / firing, world animation, and update().

import { ANIM, HIT_FLASH, LOOK_PITCH, LOOK_YAW, PICKUP_RANGE, TEAMS } from "../config.js";
import { clampN } from "../utils.js";

export function setupUpdate(G) {
  const S = G.S;
  const {
    ctx, scene, floorTop, H, RADIUS, hits, playAnim, holdPose, groundAvatar, tintAvatar, setLabel, chars,
    temps, flags, medkits, pickups, ding, bannerEl, banner, feedItems, updatePreviews, respawn, gunOf,
    sendAmmo, sendGun, startReload, shoot, updateClock, toTeams, sendPhoneHud, updateObjectives, updateHud,
    updateScore
  } = G;

  /* ---------------- per-frame update ---------------- */
  function updateChar(ch, dt, active) {
    const inp = ch.input, info = ctx.player(ch.slot);
    const color = info?.color || "#888888";
    if (ch.color !== color) { ch.color = color; ch.av.cloth?.color.set(color); }
    tintAvatar(ch.av, TEAMS[ch.team].hex);
    setLabel(ch.av.label, info?.name || `P${ch.slot}`, TEAMS[ch.team].color);
    ch.av.marker.material.color.set(TEAMS[ch.team].color);
    ch.av.marker.rotation.y += dt * 2; ch.av.marker.position.y = H * 1.38 + Math.sin(S.tNow * 3 + ch.slot) * 0.06;

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
        const step = H * 3.5 * mag * (ch.carrying ? 0.92 : 1) * dt, n = Math.ceil(step / (RADIUS * 0.5)), sd = step / n;
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
    // gun in view (placed + drawn in render(), here only its motion)
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

  function animateWorld() {
    for (const f of flags) {                                        // cloth waves
      const p = f.geo.attributes.position, b = f.base;
      for (let i = 0; i < p.count; i++) p.setZ(i, b[i * 3 + 2] + Math.sin(b[i * 3] * 3.2 - S.tNow * 6) * 0.12 * b[i * 3]);
      p.needsUpdate = true;
      if (!f.atHome && !f.carrier) f.group.rotation.y = Math.sin(S.tNow * 2) * 0.15;
    }
    for (const k of medkits) if (k.active) { k.body.rotation.y = S.tNow * 1.8 + k.phase; k.body.position.y = 0.9 + Math.sin(S.tNow * 2.4 + k.phase) * 0.12; }
    for (const p of pickups) { p.spin.rotation.y = S.tNow * 1.5 + p.phase; p.spin.position.y = 1.0 + Math.sin(S.tNow * 2 + p.phase) * 0.1; }
  }
  function update(dt) {
    S.tNow += dt;
    animateWorld();
    if (S.phase === "teams") updatePreviews(dt);
    else {
      if (S.phase === "count") {
        S.countT -= dt;
        if (S.countT <= 0) { S.phase = "play"; banner("GO!", "", 1); }
        else bannerEl.firstChild?.nodeValue !== String(Math.ceil(S.countT)) && banner(String(Math.ceil(S.countT)), "get ready", 1.2);
      }
      for (const ch of chars.values()) updateChar(ch, dt, S.phase === "play");
      if (S.phase === "play") { updateClock(dt); if (S.phase === "play") updateObjectives(dt); }
      if (S.phase === "over") { S.overT -= dt; if (S.overT <= 0) toTeams(); }
      for (const v of S.views) updateHud(v);
      updateScore();
    }
    if (S.bannerT > 0) { S.bannerT -= dt; if (S.bannerT <= 0) bannerEl.style.display = "none"; }
    for (let i = temps.length - 1; i >= 0; i--) {
      const t = temps[i]; t.life -= dt;
      if (t.life <= 0) {
        scene.remove(t.obj); t.obj.material.dispose(); if (t.dispose) t.obj.geometry.dispose();
        temps.splice(i, 1);
      } else t.obj.material.opacity = Math.min(1, t.life / 0.08);
    }
    for (let i = feedItems.length - 1; i >= 0; i--) {
      feedItems[i].t -= dt;
      if (feedItems[i].t <= 0) { feedItems[i].row.remove(); feedItems.splice(i, 1); }
    }
  }

  // shared with the modules set up after this one
  Object.assign(G, { update });
}
