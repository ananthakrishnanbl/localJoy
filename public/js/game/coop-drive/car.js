// The car's look. For now it is a box car built from primitives.
// To use a real model later, change only this file: keep returning { root, setColor, dispose }.
//   root       gets position + yaw + roll from the game (rotation order is YXZ)
//   setColor   recolours the paint (accepts a hex number or any CSS colour string)
//   The model should face +Z, be about 2 m wide and 4.2 m long, and sit with its wheels on y = 0.
import * as THREE from "./three.js";

// The four paint choices offered in the team selection screen
export const CAR_COLORS = [
  { name: "Red", hex: 0xff3b3b, css: "#ff3b3b" },
  { name: "Blue", hex: 0x3b8bff, css: "#3b8bff" },
  { name: "Yellow", hex: 0xffc233, css: "#ffc233" },
  { name: "Green", hex: 0x35d07f, css: "#35d07f" },
];

// Geometry and materials shared by every car (only the paint is per car)
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

export function createCarMesh(color = 0xff3b3b) {
  const a = assets();
  const root = new THREE.Group();
  root.rotation.order = "YXZ";

  const bodyMat = new THREE.MeshLambertMaterial({ color, side: THREE.DoubleSide });
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

  return {
    root,
    setColor: (c) => bodyMat.color.set(c),
    dispose: () => bodyMat.dispose(),
  };
}

// Call once when the game shuts down
export function disposeCarAssets() {
  if (!shared) return;
  for (const v of Object.values(shared)) v.dispose();
  shared = null;
}
