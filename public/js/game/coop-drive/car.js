import * as THREE from "./three.js";
import { GLTFLoader } from "./three.js";

export const CAR_COLORS = [
  { name: "red",    hex: 0xff3b3b, css: "#ff3b3b", scale: [1.156, 1.201, 1.201], pos: [0, 0, 0], rot: [0, 0, 0] },
  { name: "blue",   hex: 0x3b8bff, css: "#3b8bff", scale: [0.520, 0.482, 0.482], pos: [0, 0, 0], rot: [0, 0, 0] },
  { name: "yellow", hex: 0xffc233, css: "#ffc233", scale: [0.01, 0.01, 0.01], pos: [0, 0, 0], rot: [0, 0, 0] },
  { name: "green",  hex: 0x35d07f, css: "#35d07f", scale: [1.172, 1.072, 1.072], pos: [0, 1, 0], rot: [0, 0, 0] },
];

export const WRECK_COLOR = 0x2b2b2b;

const loader = new GLTFLoader();
const gltfCache = new Map();

// Shared assets for the classic cube traffic cars
let shared = null;
function assets() {
  if (shared) return shared;
  const m = (color) => new THREE.MeshLambertMaterial({ color, side: THREE.DoubleSide });
  const b = (color) => new THREE.MeshBasicMaterial({ color });
  shared = {
    body: new THREE.BoxGeometry(2, 0.7, 4.2),
    cabin: new THREE.BoxGeometry(1.6, 0.6, 2),
    wheel: new THREE.BoxGeometry(0.4, 0.7, 0.9),
    light: new THREE.BoxGeometry(0.45, 0.25, 0.1),
    glass: m(0x1b2a3a),
    tire: m(0x111111),
    head: b(0xfff2b0),
    tail: b(0xff2020),
  };
  return shared;
}

export function createCarMesh(colorHex = 0xff3b3b) {
  const root = new THREE.Group();
  root.rotation.order = "YXZ";

  const shadowGeo = new THREE.CircleGeometry(1.6, 32).rotateX(-Math.PI / 2);
  const shadowMat = new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.4, depthWrite: false });
  const shadow = new THREE.Mesh(shadowGeo, shadowMat);
  shadow.position.y = 0.05;
  root.add(shadow);

  const colorInfo = CAR_COLORS.find(c => c.hex === colorHex);
  let disposeFn = () => { shadowGeo.dispose(); shadowMat.dispose(); };

  // --- PLAYER CARS (3D Models) ---
  if (colorInfo) {
    const modelContainer = new THREE.Group();
    root.add(modelContainer);
    let currentModel = null;
    let loadToken = 0; 

    const setModel = (hex) => {
      // Wreck fallback: Tint the existing geometry dark without reloading
      if (hex === WRECK_COLOR) {
        if (currentModel) {
          currentModel.traverse((child) => {
            if (child.isMesh && child.material) {
              child.material = child.material.clone();
              child.material.color.setHex(WRECK_COLOR);
            }
          });
        }
        return;
      }

      const info = CAR_COLORS.find(c => c.hex === hex) || CAR_COLORS[0];
      const filename = `/js/game/coop-drive/car_${info.name}.glb`;
      const myToken = ++loadToken;

      const applyModel = (sceneToClone) => {
        if (myToken !== loadToken) return;
        if (currentModel) modelContainer.remove(currentModel);
        
        currentModel = sceneToClone.clone(true);
        currentModel.scale.set(...info.scale); 
        currentModel.position.set(...info.pos);
        currentModel.rotation.set(...info.rot);

        // Ensure materials are unique so tinting works on independent cars
        currentModel.traverse((child) => {
          if (child.isMesh && child.material) child.material = child.material.clone();
        });
        
        modelContainer.add(currentModel);
      };

      if (gltfCache.has(info.hex)) {
        applyModel(gltfCache.get(info.hex));
      } else {
        loader.load(filename, (gltf) => {
          gltfCache.set(info.hex, gltf.scene);
          applyModel(gltf.scene);
        }, undefined, (error) => {
          console.error(`Failed to load ${filename}`, error);
        });
      }
    };

    setModel(colorHex);

    disposeFn = () => {
      shadowGeo.dispose();
      shadowMat.dispose();
      if (currentModel) {
        currentModel.traverse((child) => {
          if (child.isMesh) {
            if (child.geometry) child.geometry.dispose();
            if (child.material) child.material.dispose();
          }
        });
      }
    };

    return { root, setColor: setModel, dispose: disposeFn };
  } 
  // --- TRAFFIC CARS (Classic Cubes) ---
  else {
    const a = assets();
    const bodyMat = new THREE.MeshLambertMaterial({ color: colorHex, side: THREE.DoubleSide });
    
    const add = (geo, mat, x, y, z) => {
      const o = new THREE.Mesh(geo, mat);
      o.position.set(x, y, z);
      root.add(o);
    };

    add(a.body, bodyMat, 0, 0.65, 0);
    add(a.cabin, a.glass, 0, 1.2, -0.25);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) add(a.wheel, a.tire, sx * 1.0, 0.35, sz * 1.3);
    for (const sx of [-0.6, 0.6]) {
      add(a.light, a.head, sx, 0.7, 2.12);
      add(a.light, a.tail, sx, 0.7, -2.12);
    }

    disposeFn = () => {
      shadowGeo.dispose();
      shadowMat.dispose();
      bodyMat.dispose();
    };

    return { root, setColor: (c) => bodyMat.color.set(c), dispose: disposeFn };
  }
}

export function disposeCarAssets() {
  if (!shared) return;
  for (const v of Object.values(shared)) v.dispose();
  shared = null;
  gltfCache.clear();
}