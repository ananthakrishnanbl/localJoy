// Turns the loaded map into the world: materials, shadows, the list of map meshes, the floor height.

import { MAP_SCALE } from "../config.js";

export function setupWorld(G) {
  const { THREE, scene, renderer, tex, gltf } = G;

  let mapMat = null;
  if (tex) {
    tex.flipY = false; tex.colorSpace = THREE.SRGBColorSpace;
    tex.generateMipmaps = true; tex.minFilter = THREE.LinearMipmapLinearFilter; tex.magFilter = THREE.LinearFilter;
    tex.anisotropy = renderer.capabilities.getMaxAnisotropy();
    mapMat = new THREE.MeshStandardMaterial({ map: tex, roughness: 1 });
  }
  const plain = new THREE.MeshStandardMaterial({ color: 0xb8664a, roughness: 1 });

  const world = gltf.scene;
  world.scale.setScalar(MAP_SCALE);
  scene.add(world);
  world.updateMatrixWorld(true);
  const meshes = [];
  world.traverse((o) => {
    if (!o.isMesh) return;
    if (mapMat) o.material = o.geometry.attributes.uv ? mapMat : plain;
    else if (o.material) { o.material.roughness = 1; o.material.metalness = 0; }   // the map's own embedded texture
    o.castShadow = o.receiveShadow = true;
    meshes.push(o);
  });

  const all = new THREE.Box3().setFromObject(world);
  const size = all.getSize(new THREE.Vector3()), mid = all.getCenter(new THREE.Vector3());
  let floorTop = all.min.y;                             // refined just below: the real walking surface (the lowest vertex of the map is not always the floor)
  {
    const rc = new THREE.Raycaster(), org = new THREE.Vector3(), dwn = new THREE.Vector3(0, -1, 0), nrm = new THREE.Vector3(), votes = new Map();
    for (let i = 0; i < 7; i++) for (let j = 0; j < 7; j++) {
      org.set(all.min.x + ((i + 0.5) / 7) * size.x, all.max.y + 1, all.min.z + ((j + 0.5) / 7) * size.z);
      rc.set(org, dwn); rc.far = size.y + 2;
      for (const hit of rc.intersectObjects(meshes, false)) {          // nearest first = from the top down
        if (!hit.face || hit.point.y > all.min.y + 1.0) continue;     // roofs / wall tops are not the floor
        nrm.copy(hit.face.normal).transformDirection(hit.object.matrixWorld);
        if (nrm.y < 0.7) continue;                                    // only upward-facing surfaces
        const key = Math.round(hit.point.y * 100); votes.set(key, (votes.get(key) || 0) + 1); break;
      }
    }
    let best = null;
    for (const [k, n] of votes) if (!best || n > best[1]) best = [k, n];
    if (best && best[1] >= 3) floorTop = best[0] / 100;               // the most common surface height = the floor
    console.log(`[ctf] floor height ${floorTop.toFixed(2)} (lowest map vertex ${all.min.y.toFixed(2)})`);
  }
  const H = 4 * 0.45, RADIUS = H * 0.18;                 // character height / body radius (as in index.html)

  // shared with the modules set up after this one
  Object.assign(G, { mapMat, plain, world, meshes, all, size, mid, floorTop, H, RADIUS });
}
