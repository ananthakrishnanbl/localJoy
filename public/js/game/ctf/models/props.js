// Flag, flag base and med-kit 3D models.

import { TEAMS } from "../config.js";

export function setupProps(G) {
  const { THREE, mat, part } = G;

  // flag: pole + waving cloth in the team colour
  function makeFlag(team) {
    const g = new THREE.Group();
    g.add(part(new THREE.CylinderGeometry(0.07, 0.07, 3.4, 8), mat(0xe8e4dc), 0, 1.7, 0));
    g.add(part(new THREE.SphereGeometry(0.13, 10, 8), mat(0xffd060), 0, 3.45, 0));
    const geo = new THREE.PlaneGeometry(1.7, 1.0, 12, 1).translate(0.85, 0, 0);
    const cloth = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color: TEAMS[team].hex, side: THREE.DoubleSide, emissive: TEAMS[team].hex, emissiveIntensity: 0.25 }));
    cloth.position.set(0.05, 2.85, 0); cloth.frustumCulled = false; g.add(cloth);
    return { group: g, geo, base: geo.attributes.position.array.slice() };
  }
  function makeBase(team) {
    const g = new THREE.Group(), c = TEAMS[team].hex;
    g.add(part(new THREE.CylinderGeometry(1.8, 2.0, 0.25, 24), mat(c), 0, 0.12, 0));
    const ringM = new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: 0.55, side: THREE.DoubleSide });
    const ring = new THREE.Mesh(new THREE.RingGeometry(2.6, 3.0, 40).rotateX(-Math.PI / 2), ringM);
    ring.position.y = 0.06; g.add(ring);
    const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.7, 0.7, 26, 16, 1, true),
      new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: 0.2, depthWrite: false, side: THREE.DoubleSide }));
    beam.position.y = 13; g.add(beam);
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

  // shared with the modules set up after this one
  Object.assign(G, { makeFlag, makeBase, makeMedkit });
}
