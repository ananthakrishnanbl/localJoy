// Drawing: the split-screen world render, the first-person gun pass and the lobby camera.

import { RESPAWN_TIME } from "../config.js";
import { clampN } from "../utils.js";

export function setupRender(G) {
  const S = G.S;
  const { THREE, scene, renderer, viewScene, viewCam, viewGunPos, chars, renderPreviews } = G;

  const lobbyCam = new THREE.PerspectiveCamera(60, 16 / 9, 0.1, 500);

  function drawViewGun(ch, aspect) {                              // first-person gun, on top of the world, with its own camera
    if (!ch.alive) return;
    ch.vmAspect = aspect;
    viewGunPos(ch, ch.gun.group.position);
    ch.gun.group.rotation.x = ch.kick * 0.08;
    viewCam.aspect = aspect; viewCam.updateProjectionMatrix();
    for (const o of chars.values()) o.gun.group.visible = o === ch;
    renderer.autoClear = false;
    renderer.clearDepth();                                          // (scissor is still on: only this cell's depth is cleared)
    renderer.render(viewScene, viewCam);
    renderer.autoClear = true;
  }
  function render() {
    renderer.setScissorTest(true);
    if (S.phase === "teams") { renderPreviews(); return; }
    const bodyVis = (ch) => ch.alive || (!!ch.av.mixer && ch.deadT < RESPAWN_TIME - 1);
    for (const ch of chars.values()) ch.av.group.visible = bodyVis(ch);
    for (const v of S.views) {
      const ch = v.ch, [rx, ry, rw, rh] = ch.rect;
      const x = rx * S.W, w = rw * S.W, hh = rh * S.HH, y = S.HH - ry * S.HH - hh;
      const aspect = w / hh;
      ch.cam.aspect = aspect;
      ch.cam.fov = clampN(2 * Math.atan(Math.tan((85 / 2) * Math.PI / 180) / aspect) * 180 / Math.PI, 50, 85);   // keeps a wide view in narrow cells
      ch.cam.updateProjectionMatrix();
      renderer.setViewport(x, y, w, hh); renderer.setScissor(x, y, w, hh);
      ch.av.group.visible = false;                                    // first person: you never see your own body
      renderer.render(scene, ch.cam);
      ch.av.group.visible = bodyVis(ch);
      drawViewGun(ch, aspect);
    }
  }

  // shared with the modules set up after this one
  Object.assign(G, { lobbyCam, render });
}
