// Loads everything from disk: map texture + map.glb, the character models and the gun models.
// Returns an early result for start() when loading fails or the game was closed while loading.

import { CHAR_COUNT, GUNS, MAP_FILES, TEXTURES } from "../config.js";
import { assetUrls } from "../utils.js";

export async function setupAssets(G) {
  const { signal, style, status, bail, THREE, GLTFLoader, renderer, ro } = G;

  /* ---------------- load map + texture ---------------- */
  let tex = null;
  for (const f of TEXTURES) { try { tex = await new THREE.TextureLoader().loadAsync(f); break; } catch {} }
  let gltf = null;
  for (const f of MAP_FILES) { try { gltf = await new GLTFLoader().loadAsync(f); break; } catch {} }
  if (signal.aborted) { renderer.dispose(); style.remove(); return { destroy() {} }; }
  if (!gltf) {
    ro?.disconnect();
    return bail("Could not load the map.\nExpected one of:\n" + MAP_FILES.join("\n") + "\n\nPut map.glb at public/js/game/ctf/assets/map.glb (or change MAP_FILES in js/game/ctf/config.js).");
  }

  /* ---------------- characters + guns ---------------- */
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
  if (!charTpl[0]) console.warn("[ctf] characters/char1.glb not found: using simple block soldiers");
  const gunTpl = {};
  for (const id of Object.keys(GUNS)) {
    const g = await loadAny(assetUrls(`guns/${id}.glb`));
    if (!g) { console.warn(`[ctf] guns/${id}.glb not found: using a simple block gun`); continue; }
    const box = new THREE.Box3().setFromObject(g.scene);
    gunTpl[id] = { scene: g.scene, center: box.getCenter(new THREE.Vector3()), size: box.getSize(new THREE.Vector3()) };
    g.scene.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  }
  if (signal.aborted) { renderer.dispose(); style.remove(); return { destroy() {} }; }
  status.textContent = "Loading map…";

  // shared with the modules set up after this one
  Object.assign(G, { tex, gltf, charTpl, gunTpl });
}
