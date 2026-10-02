// The bike's look: four .glb models (B1..B4), one per bike in the select screen.
// Keep returning { root, lean, setColor } from createBikeMesh(modelIdx).
//   root  gets position + yaw + pitch from the game (rotation order is YXZ)
//   lean  child group that rolls around the forward axis in corners; the visible model lives in here
//
// Models are normalised automatically after loading, so you can drop in any glb:
//   - the longest horizontal side is turned to face along the bike's length (+Z)
//   - it is scaled to BIKE_LENGTH metres, centred, and sat on the ground (wheels on y = 0)
// If a model drives BACKWARDS, set flip: true for it below.
// While the files are still loading (or if one fails to load) a plain box stands in, and it is swapped
// for the real model automatically as soon as it is ready.
import * as THREE from "./three.js";
import { GLTFLoader } from "./three.js";

// B1.glb ... B4.glb live in the "assets" folder next to this file (public/js/game/moto-race/assets/).
// Resolved from this file's own URL, so it works wherever the game folder is served from.
export const ASSET_DIR = new URL("./assets/", import.meta.url).href;
export const BIKE_LENGTH = 4.6;          // metres, nose to tail (the old cube was 1.9, the first glb version 3.4)

const MODELS = [
  { file: "B1.glb", flip: false },   // white scooter
  { file: "B2.glb", flip: false },   // yellow chopper
  { file: "B3.glb", flip: true },   // blue cruiser
  { file: "B4.glb", flip: true },   // red sport bike
];

const templates = [];                    // prepared models, filled in when loaded
const pending = new Set();               // meshes created before their model was ready
let loading = null;

// Turn a loaded glTF into a group that is BIKE_LENGTH long, centred, facing +Z, wheels on y = 0
function prepare(gltf, flip) {
  const model = gltf.scene;
  model.traverse((o) => {
    if (!o.isMesh) return;
    o.frustumCulled = false;
    const mats = Array.isArray(o.material) ? o.material : [o.material];
    // No environment map in this scene, so very metallic materials would render near black
    mats.forEach((m) => { if (m && m.metalness > 0.4) m.metalness = 0.4; });
  });

  const orient = new THREE.Group();
  orient.add(model);
  const box = new THREE.Box3().setFromObject(model);
  const size = box.getSize(new THREE.Vector3());
  if (size.x > size.z * 1.05) orient.rotation.y = Math.PI / 2;      // long side was along X: turn it to Z
  if (flip) orient.rotation.y += Math.PI;
  orient.updateMatrixWorld(true);

  box.setFromObject(orient);
  box.getSize(size);
  const center = box.getCenter(new THREE.Vector3());
  orient.position.set(-center.x, -box.min.y, -center.z);            // centre it, wheels on the ground

  const k = BIKE_LENGTH / Math.max(size.z, 1e-6);
  const holder = new THREE.Group();
  holder.add(orient);
  holder.scale.setScalar(k);
  return { holder, width: size.x * k, length: size.z * k };
}

export function loadBikeModels() {
  if (loading) return loading;
  const loader = new GLTFLoader();
  loading = Promise.all(MODELS.map(async (m, i) => {
    try {
      const gltf = await loader.loadAsync(ASSET_DIR + m.file);
      templates[i] = prepare(gltf, m.flip);
    } catch (err) {
      console.warn(`Could not load ${ASSET_DIR + m.file}, using the placeholder box.`, err);
    }
  })).then(() => {
    pending.forEach((fill) => fill());
    pending.clear();
  });
  return loading;
}
loadBikeModels();                        // start downloading as soon as this file is imported

export function createBikeMesh(modelIdx = 0) {
  const idx = ((modelIdx % MODELS.length) + MODELS.length) % MODELS.length;

  const root = new THREE.Group();
  root.rotation.order = "YXZ";

  const lean = new THREE.Group();
  root.add(lean);

  const holder = new THREE.Group();
  lean.add(holder);

  // Blob shadow, stays flat on the ground while the bike leans
  const shadow = new THREE.Mesh(
    new THREE.CircleGeometry(1, 24).rotateX(-Math.PI / 2),
    new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.3, depthWrite: false })
  );
  shadow.position.y = 0.1;
  root.add(shadow);

  function fill() {
    holder.clear();
    const t = templates[idx];
    if (t) {
      holder.add(t.holder.clone(true));
      shadow.scale.set(Math.max(t.width, 1.2) * 0.8, 1, t.length * 0.62);
    } else {
      const box = new THREE.Mesh(
        new THREE.BoxGeometry(1.5, 2.0, BIKE_LENGTH),
        new THREE.MeshLambertMaterial({ color: 0xcccccc })
      );
      box.position.y = 1.2;
      const nose = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.6, 0.6), new THREE.MeshLambertMaterial({ color: 0xffffff }));
      nose.position.set(0, 1.6, BIKE_LENGTH / 2 + 0.1);
      holder.add(box, nose);
      shadow.scale.set(1.3, 1, 2.1);
    }
  }
  fill();
  if (!templates[idx]) pending.add(fill);

  return { root, lean, setColor: () => {} };   // models keep their own colours
}