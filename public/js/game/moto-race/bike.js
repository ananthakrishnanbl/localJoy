// The bike's look. For now it is a coloured cube with a white "nose" so you can see which way it faces.
// To use a real model later, change only this file: keep returning { root, lean, setColor }.
//   root  gets position + yaw + pitch from the game (rotation order is YXZ)
//   lean  child group that rolls around the forward axis in corners; put the visible model in here
//   The model should face +Z and sit with its wheels on y = 0.
import * as THREE from "./three.js";

export function createBikeMesh(color = "#ffffff") {
  const root = new THREE.Group();
  root.rotation.order = "YXZ";

  const lean = new THREE.Group();
  root.add(lean);

  const bodyMat = new THREE.MeshLambertMaterial({ color });
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.9, 1.1, 1.9), bodyMat);
  body.position.y = 0.75;
  lean.add(body);

  const nose = new THREE.Mesh(
    new THREE.BoxGeometry(0.5, 0.35, 0.35),
    new THREE.MeshLambertMaterial({ color: 0xffffff })
  );
  nose.position.set(0, 0.95, 1.05);
  lean.add(nose);

  // Blob shadow, stays flat on the ground while the bike leans
  const shadow = new THREE.Mesh(
    new THREE.CircleGeometry(1.25, 20).rotateX(-Math.PI / 2),
    new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.3, depthWrite: false })
  );
  shadow.position.y = 0.1;
  root.add(shadow);

  return { root, lean, setColor: (c) => bodyMat.color.set(c) };
}