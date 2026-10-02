// Renderer, scene, lights and the resize handler (same look as index.html).

export function setupRenderer(G) {
  const S = G.S;
  const { wrap, status, THREE } = G;

  /* ---------------- renderer, scene, lights (same look as index.html) ---------------- */
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0xe8b98f);
  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.autoUpdate = false;           // the map never moves: draw its shadows once (needsUpdate below)
  wrap.insertBefore(renderer.domElement, status);
  scene.add(new THREE.HemisphereLight(0xfff0e0, 0x8a5a44, 1.4));
  const sun = new THREE.DirectionalLight(0xfff2dd, 2.2);
  sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048);
  scene.add(sun, sun.target);

  S.W = 1280; S.HH = 720;
  function resize() {
    const w = wrap.clientWidth, hh = wrap.clientHeight;
    if (!w || !hh) return;
    S.W = w; S.HH = hh;
    renderer.setSize(w, hh, false);
    wrap.style.fontSize = (w / 80) + "px";        // every HUD size is in em, so the HUD scales with the screen
  }
  const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(resize) : null;
  ro?.observe(wrap);
  resize();

  // shared with the modules set up after this one
  Object.assign(G, { scene, renderer, sun, ro });
}
