// Guns: ammo + reload, swap / pick up, and shooting (ray cast + hit effects).

import { ANIM, GUNS, HIT_R_BASE, PICKUP_ANIM } from "../config.js";

export function setupWeapons(G) {
  const {
    ctx, THREE, scene, meshes, floorTop, H, playAnim, setHandGun, viewGunPos, setViewGun, chars, temps,
    decals, setPickup, nameOf, colorOf, vibrate, bang, ding, feed, hurt
  } = G;
  const S = G.S;

  /* ---------------- ammo + reload ---------------- */
  const gunOf = (ch) => GUNS[ch.guns[ch.cur]?.id] || GUNS.g1;

  /* ---------------- scope (zoom) ---------------- */
  // The phone sends a running count "sc" of SCOPE taps. It is read here (a second listener on the same event as input.js),
  // so a dropped message can never lose a tap. An odd number of new taps toggles the scope.
  const scSeen = new Map();                                       // slot -> { sid, sc }
  function sendScope(ch) { ctx.send(ch.slot, { type: "ctf-scope", on: !!ch.scoped, gun: gunOf(ch).name }); }
  function setScope(ch, on) {
    on = !!on;
    if (!!ch.scoped === on) return;
    ch.scoped = on;
    if (on) ch.scopeId = gunOf(ch).id;                            // the zoom of the gun you scoped with, even while it eases out
    ding(on ? 760 : 520, 0.04);
    sendScope(ch);
  }
  function toggleScope(ch) {
    if (!ch.alive || S.phase !== "play") return;
    if (!ch.scoped && ch.reloadT > 0) { vibrate(ch.slot, [10, 20, 10]); return; }   // no scoping while reloading
    setScope(ch, !ch.scoped);
  }
  G.on(window, "controller-input", (e) => {
    const { slot, data } = e.detail || {};
    if (!data || data.type !== "ctf") return;
    const sc = data.sc | 0, rec = scSeen.get(slot);
    if (!rec || rec.sid !== data.sid) { scSeen.set(slot, { sid: data.sid, sc }); return; }   // first message of this page load: just remember the count
    const d = sc - rec.sc;
    rec.sc = sc;
    const ch = chars.get(slot);
    if (ch && d > 0 && (d & 1)) toggleScope(ch);
  });
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
    setScope(ch, false);
    ch.cur = 1 - ch.cur;
    ch.ammo = ch.guns[ch.cur].ammo; ch.reserve = ch.guns[ch.cur].reserve; ch.reloadT = 0; ch.lastShot = performance.now() / 1000 - gunOf(ch).delay + 0.25;
    setViewGun(ch); setHandGun(ch);
    ch.kick = 1.5; ding(420, 0.06); vibrate(ch.slot, 15);
    sendAmmo(ch); sendGun(ch);
  }
  function pickGun(ch) {                                          // PICK: the gun in your hand is swapped with the one on the floor
    const p = ch.near;
    if (!ch.alive || !p) { vibrate(ch.slot, [20, 30, 20]); return; }
    setScope(ch, false);
    const old = { id: ch.guns[ch.cur].id, ammo: ch.ammo, reserve: ch.reserve };
    ch.guns[ch.cur] = { id: p.gunId, ammo: p.ammo, reserve: p.reserve };
    ch.ammo = p.ammo; ch.reserve = p.reserve; ch.reloadT = 0;
    setPickup(p, old.id, old.ammo, old.reserve);                                 // your old gun stays on the spot
    setViewGun(ch); setHandGun(ch);
    ch.pickT = PICKUP_ANIM; playAnim(ch.av, ANIM.pick, true);
    feed([[nameOf(ch), colorOf(ch.slot)], [" picked up the "], [GUNS[ch.guns[ch.cur].id].name, "#ffd060"]]);
    ch.kick = 1.5; ding(620, 0.1); ding(930, 0.12); vibrate(ch.slot, [25, 30, 25]);
    sendAmmo(ch); sendGun(ch);
  }
  function startReload(ch) {
    const g = gunOf(ch);
    if (!ch.alive || ch.reloadT > 0 || ch.ammo >= g.mag || ch.reserve <= 0) return;   // nothing left to reload with
    setScope(ch, false);
    ch.reloadT = g.reload;
    ding(300, 0.06);
    sendAmmo(ch);
  }

  /* ---------------- shooting ---------------- */
  const shotRay = new THREE.Raycaster();
  const vA = new THREE.Vector3(), vB = new THREE.Vector3(), vO = new THREE.Vector3(), vD = new THREE.Vector3(), pr = new THREE.Vector3(), ps = new THREE.Vector3();
  const sparkGeo = new THREE.SphereGeometry(0.07, 8, 6), decalGeo = new THREE.CircleGeometry(0.09, 12);
  const decalMat = new THREE.MeshBasicMaterial({ color: 0x1a0d08, polygonOffset: true, polygonOffsetFactor: -2 });
  const HIT_R = HIT_R_BASE;
  function shoot(ch) {
    ch.cam.updateMatrixWorld(true);
    ch.cam.getWorldPosition(vO); ch.cam.getWorldDirection(vD);
    const range = gunOf(ch).range;
    shotRay.set(vO, vD); shotRay.far = range;                     // walls / players beyond the gun's range are never hit
    const wall = shotRay.intersectObjects(meshes, false)[0];
    let maxT = wall ? wall.distance : range, target = null;
    for (const o of chars.values()) {
      if (o === ch || o.team === ch.team || !o.alive || o.prot > 0) continue;
      vA.set(o.x, floorTop + 0.2, o.z); vB.set(o.x, floorTop + H * 1.0, o.z);
      if (shotRay.ray.distanceSqToSegment(vA, vB, pr, ps) < HIT_R * HIT_R) {
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

  // shared with the modules set up after this one
  Object.assign(G, { gunOf, sendAmmo, sendGun, swapGun, pickGun, startReload, shoot, setScope, toggleScope, sendScope });
}