// First-person gun: lives in its own little scene and is drawn on top of the world with its own camera.

import { VIEW_GUN } from "../config.js";

export function setupViewGun(G) {
  const { THREE, gunTpl, gunModel, disposeGunModel } = G;

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

  // shared with the modules set up after this one
  Object.assign(G, { viewScene, viewCam, gunMats, flashMat, viewGunPos, setViewGun, makeGun });
}
