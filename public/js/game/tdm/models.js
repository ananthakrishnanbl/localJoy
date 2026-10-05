// TEAM DEATHMATCH  -  /js/game/tdm/models.js
// Everything that is a 3D model: the soldiers (with animation), the guns (hand, back, first person, floor),
// the med-kit and the team spawn pads. Loads the character / gun .glb files and falls back to simple blocks.
import { GUNS, CHAR_COUNT, ANIM, HAND_GUN, BACK_GUN, HOLD_POSE, VIEW_GUN, TEAM_TINT, assetUrls, clampN } from "./config.js";

export async function createModels(S) {
  const { THREE, GLTFLoader, cloneSkinned, status, H } = S;

  /* ---------------- load characters + guns ---------------- */
  status.textContent = "Loading characters and guns…";
  async function loadAny(urls) { for (const u of urls) { try { return await new GLTFLoader().loadAsync(u); } catch {} } return null; }
  // Height + lowest point of a character in its rest pose, straight from the vertex data. (Box3.setFromObject on a skinned mesh
  // depends on bone matrices that have not been updated yet on a fresh template, which can give a wrong size / a floating model.)
  function bindBounds(root) {
    root.updateMatrixWorld(true);
    const v = new THREE.Vector3();
    let lo = Infinity, hi = -Infinity;
    root.traverse((o) => {
      const p = o.isMesh && o.geometry?.attributes.position;
      if (!p) return;
      const m = o.isSkinnedMesh ? o.bindMatrix : o.matrixWorld;
      for (let i = 0; i < p.count; i++) { v.fromBufferAttribute(p, i).applyMatrix4(m); if (v.y < lo) lo = v.y; if (v.y > hi) hi = v.y; }
    });
    return lo < hi ? { minY: lo, hgt: hi - lo } : { minY: 0, hgt: 1 };
  }
  const charTpl = [];                                   // [{ scene, anims, minY, hgt }] index 0 = char1
  for (let i = 1; i <= CHAR_COUNT; i++) {
    const g = await loadAny(assetUrls(`characters/char${i}.glb`));
    charTpl.push(g ? { scene: g.scene, anims: g.animations, ...bindBounds(g.scene) } : null);
  }
  for (let i = 1; i < CHAR_COUNT; i++) if (!charTpl[i]) charTpl[i] = charTpl[0];   // missing faces fall back to char1
  if (!charTpl[0]) console.warn("[tdm] characters/char1.glb not found: using simple block soldiers");
  const gunTpl = {};
  for (const id of Object.keys(GUNS)) {
    const g = await loadAny(assetUrls(`guns/${id}.glb`));
    if (!g) { console.warn(`[tdm] guns/${id}.glb not found: using a simple block gun`); continue; }
    const box = new THREE.Box3().setFromObject(g.scene);
    gunTpl[id] = { scene: g.scene, center: box.getCenter(new THREE.Vector3()), size: box.getSize(new THREE.Vector3()) };
    g.scene.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  }

  /* ---------------- helpers for 3D objects ---------------- */
  const mat = (c) => new THREE.MeshStandardMaterial({ color: c });
  const part = (g, m, x, y, z) => { const o = new THREE.Mesh(g, m); o.position.set(x, y, z); return o; };

  // a gun model, centred, barrel along -Z, longest side = len.
  // own = give it private copies of the materials (the first-person gun lives in a different scene than the one the template is used in)
  function gunModel(id, len, own = false) {
    const t = gunTpl[id];
    const holder = new THREE.Group();
    if (!t) {                                                         // fallback: a block gun
      const m = new THREE.MeshStandardMaterial({ color: 0x2d2f36, roughness: 0.5, metalness: 0.6 });
      holder.add(new THREE.Mesh(new THREE.BoxGeometry(0.12 * len, 0.18 * len, len), m));
      return { group: holder, front: len / 2, shared: false, own: true };
    }
    const m = t.scene.clone(true);
    const k = len / Math.max(t.size.x, t.size.y, t.size.z);
    m.scale.setScalar(k);
    m.position.copy(t.center).multiplyScalar(-k);
    holder.add(m);
    if (own) m.traverse((o) => { if (o.isMesh) o.material = Array.isArray(o.material) ? o.material.map((x) => x.clone()) : o.material.clone(); });
    return { group: holder, front: (t.size.z * k) / 2, shared: true, own };
  }
  function disposeGunModel(gm) {
    gm.group.traverse((o) => {
      if (!o.isMesh) return;
      if (!gm.shared) o.geometry?.dispose();                          // geometry + template materials are shared with the template
      if (!gm.shared || gm.own) (Array.isArray(o.material) ? o.material : [o.material]).forEach((x) => x.dispose());
    });
  }

  // a soldier: the chosen character model (with animations), or simple blocks if it is missing
  function makeAvatar(charIdx = 0) {
    const tpl = charTpl[charIdx] || charTpl[0];
    if (tpl) return makeModelAvatar(tpl);
    const g = new THREE.Group();
    const cloth = mat(0xffffff), skin = mat(0xffd9b0), dark = mat(0x34303a), steel = mat(0x2d2f36);
    g.add(part(new THREE.BoxGeometry(H * 0.45, H * 0.4, H * 0.28), cloth, 0, H * 0.6, 0),
      part(new THREE.SphereGeometry(H * 0.17, 16, 12), skin, 0, H * 0.93, 0),
      part(new THREE.BoxGeometry(H * 0.12, H * 0.06, H * 0.08), dark, 0, H * 0.93, H * 0.17));
    const limb = (x, y, w, hh, m) => { const l = new THREE.Group(); l.position.set(x, y, 0); l.add(part(new THREE.BoxGeometry(w, hh, w), m, 0, -hh / 2, 0)); g.add(l); return l; };
    const legL = limb(-H * 0.1, H * 0.4, H * 0.14, H * 0.4, dark), legR = limb(H * 0.1, H * 0.4, H * 0.14, H * 0.4, dark);
    const armL = limb(-H * 0.3, H * 0.78, H * 0.11, H * 0.34, cloth), armR = limb(H * 0.3, H * 0.78, H * 0.11, H * 0.34, cloth);
    armR.add(part(new THREE.BoxGeometry(0.08, 0.5, 0.1), steel, 0, -H * 0.34 - 0.12, 0));        // gun along the arm
    const flash = new THREE.Mesh(new THREE.SphereGeometry(0.1, 8, 6), new THREE.MeshBasicMaterial({ color: 0xffd060 }));
    flash.position.set(0, -H * 0.34 - 0.42, 0); flash.visible = false; armR.add(flash);
    const marker = new THREE.Mesh(new THREE.OctahedronGeometry(0.22), new THREE.MeshBasicMaterial({ color: 0xffffff }));   // team marker
    marker.position.y = H * 1.38; g.add(marker);
    const canvas = document.createElement("canvas"); canvas.width = 256; canvas.height = 64;
    const ltex = new THREE.CanvasTexture(canvas); ltex.colorSpace = THREE.SRGBColorSpace;
    const label = new THREE.Sprite(new THREE.SpriteMaterial({ map: ltex, transparent: true, fog: false }));
    label.scale.set(2.4, 0.6, 1); label.position.y = H * 1.62; g.add(label);
    return { group: g, backGun: null, backGunId: "", cloth, legL, legR, armL, armR, flash, marker, sprite: label, label: { canvas, tex: ltex, key: "" } };
  }
  function makeModelAvatar(tpl) {
    const g = new THREE.Group();
    const model = cloneSkinned(tpl.scene);
    const k = H / Math.max(0.01, tpl.hgt), baseY = -tpl.minY * k;     // scale to H tall, feet on the group's origin
    model.scale.setScalar(k);
    model.position.y = baseY;
    const tintMats = new Map();                                       // one private copy of each material per soldier, so the team tint never touches the template
    const own = (m) => { if (!tintMats.has(m)) tintMats.set(m, m.clone()); return tintMats.get(m); };
    model.traverse((o) => {
      if (!o.isMesh) return;
      o.castShadow = true; o.frustumCulled = false;
      if (Array.isArray(o.material)) o.material = o.material.map(own); else if (o.material) o.material = own(o.material);
    });
    g.add(model);
    const mixer = new THREE.AnimationMixer(model);
    const actions = {};
    for (const clip of tpl.anims) actions[clip.name] = mixer.clipAction(clip);
    const hand = model.getObjectByName(HAND_GUN.bone) || model;
    // the arm pose that is kept while walking / running (read from the first key of the HOLD_POSE clip)
    const arms = [], holdClip = tpl.anims.find((c) => c.name === HOLD_POSE.clip);
    if (holdClip) for (const bn of HOLD_POSE.arms) {
      const bone = model.getObjectByName(bn), tr = holdClip.tracks.find((x) => x.name === bn + ".quaternion");
      if (bone && tr && tr.values.length >= 4) arms.push({ bone, q: new THREE.Quaternion().fromArray(tr.values, 0), right: bn === HAND_GUN.bone });
    }
    // vertices used to keep the feet on the ground: bind-pose position, 4 bone indices + weights (every 2nd vertex is plenty)
    const skinned = [];
    model.traverse((o) => {
      const gm = o.isSkinnedMesh && o.geometry, pos = gm?.attributes.position, si = gm?.attributes.skinIndex, sw = gm?.attributes.skinWeight;
      if (!pos || !si || !sw) return;
      const n = Math.ceil(pos.count / 2), bp = new Float32Array(n * 3), idx = new Uint16Array(n * 4), wt = new Float32Array(n * 4), used = new Set(), v = new THREE.Vector3();
      for (let j = 0; j < n; j++) {
        const i = j * 2;
        v.fromBufferAttribute(pos, i).applyMatrix4(o.bindMatrix);
        bp[j * 3] = v.x; bp[j * 3 + 1] = v.y; bp[j * 3 + 2] = v.z;
        idx.set([si.getX(i), si.getY(i), si.getZ(i), si.getW(i)], j * 4);
        wt.set([sw.getX(i), sw.getY(i), sw.getZ(i), sw.getW(i)], j * 4);
        for (let q = 0; q < 4; q++) if (wt[j * 4 + q] > 0) used.add(idx[j * 4 + q]);
      }
      skinned.push({ mesh: o, n, bp, idx, wt, used: [...used], rows: new Float32Array(o.skeleton.bones.length * 4) });
    });
    const marker = new THREE.Mesh(new THREE.OctahedronGeometry(0.22), new THREE.MeshBasicMaterial({ color: 0xffffff }));
    marker.position.y = H * 1.38; g.add(marker);
    const canvas = document.createElement("canvas"); canvas.width = 256; canvas.height = 64;
    const ltex = new THREE.CanvasTexture(canvas); ltex.colorSpace = THREE.SRGBColorSpace;
    const label = new THREE.Sprite(new THREE.SpriteMaterial({ map: ltex, transparent: true, fog: false }));
    label.scale.set(2.4, 0.6, 1); label.position.y = H * 1.62; g.add(label);
    const flash = new THREE.Mesh(new THREE.SphereGeometry(0.1 * tpl.hgt / H, 8, 6), new THREE.MeshBasicMaterial({ color: 0xffd060 }));
    flash.visible = false;
    return { group: g, model, mixer, actions, cur: "", hand, handGun: null, handGunId: "", backGun: null, backGunId: "", flash, marker, sprite: label, label: { canvas, tex: ltex, key: "" },
      arms, skinned, baseY, corr: 0, tintMats: [...tintMats.values()], tintHex: -1 };
  }
  function playAnim(av, name, once = false) {
    if (!av.mixer) return;
    if (!av.actions[name]) name = name === ANIM.idle ? ANIM.idleAlt : ANIM.idle;
    if (!av.actions[name] || av.cur === name) return;
    const next = av.actions[name], prev = av.actions[av.cur];
    next.reset();
    next.setLoop(once ? THREE.LoopOnce : THREE.LoopRepeat, Infinity);
    next.clampWhenFinished = once;
    next.enabled = true;
    if (prev) next.crossFadeFrom(prev, 0.15, false);
    next.play();
    av.cur = name;
  }
  function setHandGunId(av, id) {                                // third-person gun in the right hand
    if (!av.mixer || av.handGunId === id) return;
    if (av.handGun) { av.hand.remove(av.handGun.group); disposeGunModel(av.handGun); }
    const gm = gunModel(id, HAND_GUN.len);
    gm.group.position.set(...HAND_GUN.pos); gm.group.rotation.set(...HAND_GUN.rot);
    av.flash.position.set(0, 0, -gm.front); gm.group.add(av.flash);
    av.hand.add(gm.group);
    av.handGun = gm; av.handGunId = id;
  }
  function setBackGunId(av, id) {                               // the spare gun, slung across the back
    if (av.backGunId === id) return;
    if (av.backGun) { av.group.remove(av.backGun.holder); disposeGunModel(av.backGun.gm); av.backGun = null; }
    av.backGunId = id;
    if (!id) return;
    const gm = gunModel(id, BACK_GUN.len), holder = new THREE.Group();
    gm.group.rotation.x = Math.PI / 2;                          // barrel up ...
    holder.add(gm.group);
    holder.rotation.z = BACK_GUN.tilt;                          // ... and leaning over the shoulder
    holder.position.set(...BACK_GUN.pos);
    av.group.add(holder);
    av.backGun = { holder, gm };
  }
  function setHandGun(ch) {
    setHandGunId(ch.av, ch.guns[ch.cur].id);
    setBackGunId(ch.av, ch.guns[1 - ch.cur]?.id || "");
  }

  // keep the arms in the "gun raised" pose (call right after mixer.update); the gun arm tilts with the look angle (pitch > 0 = looking down)
  const _qPitch = new THREE.Quaternion(), _axisX = new THREE.Vector3(1, 0, 0);
  function holdPose(av, pitch = 0) {
    for (const a of av.arms) {
      a.bone.quaternion.copy(a.q);
      if (a.right && pitch) a.bone.quaternion.premultiply(_qPitch.setFromAxisAngle(_axisX, clampN(pitch, -1.2, 1.2) * HOLD_POSE.pitchFollow));
    }
  }
  // put the lowest point of the (animated) body exactly on the ground: no more hovering in the sprint hop, no sinking in the death fall.
  // Needs the bone matrices to be current: call av.group.updateMatrixWorld(true) first.
  const _bm = new THREE.Matrix4();
  function groundAvatar(av, y) {
    if (!av.skinned) return;
    let low = Infinity;
    for (const s of av.skinned) {
      const sk = s.mesh.skeleton, rows = s.rows;
      for (const b of s.used) {                                    // y row of (boneWorld * boneInverse), per bone
        _bm.multiplyMatrices(sk.bones[b].matrixWorld, sk.boneInverses[b]);
        const e = _bm.elements, o = b * 4;
        rows[o] = e[1]; rows[o + 1] = e[5]; rows[o + 2] = e[9]; rows[o + 3] = e[13];
      }
      const { n, bp, idx, wt } = s;
      for (let i = 0; i < n; i++) {
        const px = bp[i * 3], py = bp[i * 3 + 1], pz = bp[i * 3 + 2];
        let yy = 0;
        for (let q = 0; q < 4; q++) {
          const w = wt[i * 4 + q]; if (!w) continue;
          const o = idx[i * 4 + q] * 4;
          yy += w * (rows[o] * px + rows[o + 1] * py + rows[o + 2] * pz + rows[o + 3]);
        }
        if (yy < low) low = yy;
      }
    }
    if (low === Infinity) return;
    av.corr += y - low;
    av.model.position.y = av.baseY + av.corr;
  }
  // tint the soldier with his team colour (white = untouched)
  const _tintA = new THREE.Color(), _tintB = new THREE.Color();
  function tintAvatar(av, hex) {
    if (!av.tintMats || av.tintHex === hex) return;
    av.tintHex = hex;
    _tintA.set(0xffffff).lerp(_tintB.set(hex), TEAM_TINT);
    for (const m of av.tintMats) m.color.copy(_tintA);
  }
  function disposeAvatar(av) {                                     // model geometry is shared with the template: only free our own bits
    if (av.mixer) {
      av.mixer.stopAllAction();
      if (av.handGun) disposeGunModel(av.handGun);
      if (av.backGun) disposeGunModel(av.backGun.gm);
      for (const o of [av.marker, av.flash]) { o.geometry.dispose(); o.material.dispose(); }
      av.label.tex.dispose(); av.sprite?.material.dispose();
      av.tintMats.forEach((m) => m.dispose());
    } else {
      if (av.backGun) disposeGunModel(av.backGun.gm);
      av.group.traverse((o) => { o.geometry?.dispose(); if (o.material && !Array.isArray(o.material)) { o.material.map?.dispose(); o.material.dispose(); } });
    }
  }
  function setLabel(L, text, color) {
    const key = text + color;
    if (L.key === key) return;
    L.key = key;
    const g = L.canvas.getContext("2d");
    g.clearRect(0, 0, 256, 64);
    g.font = "700 34px Fredoka, Georgia, sans-serif"; g.textAlign = "center"; g.textBaseline = "middle";
    g.lineWidth = 7; g.strokeStyle = "rgba(20,10,8,.85)"; g.strokeText(text, 128, 34);
    g.fillStyle = color; g.fillText(text, 128, 34);
    L.tex.needsUpdate = true;
  }

  // first-person gun: lives in its own little scene and is drawn AFTER the world with a cleared depth buffer, using its own camera
  // (fixed fov, normal depth testing). So it is never stretched by the wide world fov of a narrow split-screen cell and its parts sort correctly.
  const viewScene = new THREE.Scene();
  viewScene.add(new THREE.HemisphereLight(0xfff0e0, 0x8a5a44, 1.6));
  { const l = new THREE.DirectionalLight(0xfff2dd, 2.0); l.position.set(0.6, 1, 0.8); viewScene.add(l); }
  const viewCam = new THREE.PerspectiveCamera(VIEW_GUN.fov, 1, 0.02, 10);
  const gunMats = [0x2d2f36, 0x16171b, 0x3b2a20].map((c) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.5, metalness: 0.6 }));
  const flashMat = new THREE.MeshBasicMaterial({ color: 0xffd060 });
  // where the gun sits, in view-camera space (depends on the cell shape, so the gun stays in the same screen corner)
  function viewGunPos(ch, out) {
    const halfH = Math.tan((VIEW_GUN.fov * Math.PI) / 360) * VIEW_GUN.depth;
    return out.set(VIEW_GUN.ax * halfH * ch.vmAspect, VIEW_GUN.ay * halfH + ch.bobY, -VIEW_GUN.depth + ch.kick * 0.06);
  }
  function setViewGun(ch) {                                       // swap the first-person model to the gun in hand
    const id = ch.guns[ch.cur].id, gun = ch.gun;
    if (gun.id === id) return;
    if (gun.model) { gun.group.remove(gun.model.group); disposeGunModel(gun.model); }
    if (gun.blocks) gun.blocks.forEach((b) => (b.visible = !gunTpl[id]));
    if (gunTpl[id]) {
      const t = gunTpl[id], len = Math.min(VIEW_GUN.maxLen, Math.max(t.size.x, t.size.y, t.size.z) * VIEW_GUN.scale);
      gun.model = gunModel(id, len, true);
      gun.group.add(gun.model.group);
      gun.muzzle.position.set(0, 0.02, -gun.model.front);
      gun.flash.position.copy(gun.muzzle.position);
    } else gun.model = null;
    gun.id = id;
  }
  function makeGun() {
    const gun = new THREE.Group(), muzzle = new THREE.Object3D();
    muzzle.position.set(0, 0.02, -0.5); gun.add(muzzle);
    const add = (g, m, x, y, z) => { const o = new THREE.Mesh(g, m); o.position.set(x, y, z); gun.add(o); return o; };
    add(new THREE.BoxGeometry(0.07, 0.1, 0.42), gunMats[0], 0, 0, 0);
    add(new THREE.CylinderGeometry(0.018, 0.018, 0.3, 12).rotateX(Math.PI / 2), gunMats[1], 0, 0.02, -0.33);
    add(new THREE.BoxGeometry(0.06, 0.16, 0.08), gunMats[2], 0, -0.12, 0.1).rotation.x = 0.25;
    add(new THREE.BoxGeometry(0.05, 0.11, 0.1), gunMats[1], 0, -0.1, -0.08);
    const flash = new THREE.Mesh(new THREE.SphereGeometry(0.05, 10, 8), flashMat);
    flash.position.copy(muzzle.position); flash.visible = false; gun.add(flash);
    const blocks = gun.children.filter((o) => o.isMesh && o !== flash);
    gun.visible = false; viewScene.add(gun);
    return { group: gun, muzzle, flash, blocks, model: null, id: "" };
  }


  // a team spawn pad: a coloured disc + ring on the floor, with a faint light beam
  function makeSpawnPad(hex) {
    const g = new THREE.Group();
    g.add(part(new THREE.CylinderGeometry(1.8, 2.0, 0.25, 24), mat(hex), 0, 0.12, 0));
    const ringM = new THREE.MeshBasicMaterial({ color: hex, transparent: true, opacity: 0.55, side: THREE.DoubleSide });
    const ring = new THREE.Mesh(new THREE.RingGeometry(2.6, 3.0, 40).rotateX(-Math.PI / 2), ringM);
    ring.position.y = 0.06; g.add(ring);
    const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.7, 0.7, 14, 16, 1, true),
      new THREE.MeshBasicMaterial({ color: hex, transparent: true, opacity: 0.18, depthWrite: false, side: THREE.DoubleSide }));
    beam.position.y = 7; g.add(beam);
    return g;
  }
  function makeMedkit() {
    const g = new THREE.Group(), body = new THREE.Group();
    const white = mat(0xf4f4ee), red = new THREE.MeshStandardMaterial({ color: 0xe5303a, emissive: 0xe5303a, emissiveIntensity: 0.3 });
    body.add(part(new THREE.BoxGeometry(0.95, 0.6, 0.7), white, 0, 0, 0));
    for (const [y, z, ry] of [[0.31, 0, true], [0, 0.36, false], [0, -0.36, false]]) {
      const a = ry ? [0.55, 0.03, 0.15] : [0.55, 0.15, 0.03], b = ry ? [0.15, 0.03, 0.55] : [0.15, 0.55, 0.03];
      body.add(part(new THREE.BoxGeometry(...a), red, 0, y, z), part(new THREE.BoxGeometry(...b), red, 0, y, z));
    }
    body.add(part(new THREE.BoxGeometry(0.4, 0.12, 0.08), mat(0x555555), 0, 0.36, 0));   // handle
    body.position.y = 0.9;
    const glow = new THREE.Mesh(new THREE.RingGeometry(0.9, 1.25, 28).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({ color: 0x46d36b, transparent: true, opacity: 0.7, side: THREE.DoubleSide }));
    glow.position.y = 0.06;
    const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.45, 7, 12, 1, true),
      new THREE.MeshBasicMaterial({ color: 0x46d36b, transparent: true, opacity: 0.22, depthWrite: false, side: THREE.DoubleSide }));
    beam.position.y = 3.5;
    g.add(body, glow, beam);
    return { group: g, body };
  }

  function dispose() {
    gunMats.forEach((m) => m.dispose()); flashMat.dispose();
    for (const t of Object.values(gunTpl)) t.scene.traverse((o) => { o.geometry?.dispose(); });
    for (const t of new Set(charTpl)) t?.scene.traverse((o) => { o.geometry?.dispose(); });
  }

  return {
    charTpl, gunTpl, gunModel, disposeGunModel, makeAvatar, playAnim, setHandGunId, setHandGun, holdPose, groundAvatar, tintAvatar,
    disposeAvatar, setLabel, viewScene, viewCam, viewGunPos, setViewGun, makeGun, makeSpawnPad, makeMedkit, dispose,
  };
}
