// CAPTURE THE FLAG  -  /js/game/ctf/main.js
// 2 to 4 players, first-person, split screen, on the same map.glb as the "Map Walk" demo (index.html).
//
//   1. team select   the normal pad: stick left / right picks RED or BLUE, A = ready, B = cancel
//   2. 3-2-1         everybody ready -> the match starts, phones switch to twin sticks + FIRE
//   3. play          steal the enemy flag from the far end room, run it back to your own flag stand.
//                    Med-kits appear at random spots in the middle room and refill health.
//                    The match lasts MATCH_TIME seconds: the team with the most captures when the clock runs out wins.
//                    (A tie goes to sudden-death overtime: next capture wins.) Then everybody goes back to team select.
//
// Phone controller: js/pad/ctf.js  (messages: "ctf-mode" game -> phone, "ctf" phone -> game)

/* ================= SETTINGS ================= */
const THREE_CDN = "https://cdn.jsdelivr.net/npm/three@0.160.0";                       // used when the page has no import map for "three"
const MAP_FILES = [new URL("./assets/map.glb", import.meta.url).href, "/js/game/ctf/assets/map.glb"];  // public/js/game/ctf/assets/map.glb (relative to this file first, absolute path as fallback)
const TEXTURES = [new URL("./assets/colormap.png", import.meta.url).href];  // optional; the map's own embedded texture is used if none is found
const MAP_SCALE = 2;                       // same as index.html: map twice as big, characters keep their size
const NO_COLLISION = [];                   // map pieces to walk through, by name, e.g. ["gate-metal-bars"]
const MID_HALF = { x: 14, z: 10 };         // half size of the middle room (before MAP_SCALE): med-kits only appear inside it

const START_HP = 100;                      // everybody starts with full health
const BULLET_DAMAGE = 9;                   // health lost per bullet
const FIRE_DELAY = 0.16;                   // seconds between shots (hold FIRE for auto fire)
const MEDKIT_COUNT = 3;                    // med-kits in the middle room at the same time
const MEDKIT_HEAL = 40;                    // health a med-kit gives back
const MEDKIT_RESPAWN = 8;                  // seconds until a used med-kit shows up again, somewhere else
const MATCH_TIME = 300;                    // match length in seconds (5 minutes): most captures when time runs out wins
const OVERTIME = true;                     // tied when time is up? true = sudden death, next capture wins; false = it's a draw
const RESPAWN_TIME = 7;                    // seconds down after dying
const SPAWN_PROTECT = 1.5;                 // seconds nobody can hurt you after respawning
const FLAG_RETURN_TIME = 20;               // a dropped flag goes home by itself after this many seconds
const REQUIRE_OWN_FLAG = false;            // true = you can only score while your own flag is at home
const YAW_RATE = 2.6, PITCH_RATE = 1.8;    // (old stick look speed, no longer used: the phone drags to look now)
const LOOK_YAW = 2.4, LOOK_PITCH = 1.7;    // drag-to-look: radians turned per full phone-height of dragging (raise = more sensitive)
const MAG_SIZE = 50;                       // bullets you start with (and after every respawn)
const RELOAD_TIME = 1.8;                   // seconds a reload takes; it starts by itself when you run dry
const HIT_FLASH = 0.6;                     // seconds the red damage flash lasts
/* ============================================ */

const TEAMS = [
  { name: "RED", color: "#e5484d", hex: 0xe5484d },    // defends the WEST end room
  { name: "BLUE", color: "#3b8bff", hex: 0x3b8bff },   // defends the EAST end room
];

const clampN = (v, a, b) => Math.max(a, Math.min(b, v));
const num = (v) => (Number.isFinite(+v) ? +v : 0);
const stickVal = (v) => clampN(num(v), -1, 1);
const curve = (v) => 0.55 * v + 0.45 * v * Math.abs(v);       // fine aim near the centre, fast at the edge
const h = (tag, cls, text) => {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text !== undefined) n.textContent = text;
  return n;
};

const CSS = `
.ctf-wrap{position:relative;width:100%;aspect-ratio:16/9;max-width:100%;max-height:100%;margin:auto;background:#2b1d1a;overflow:hidden;
  color:#f6dcc2;font-family:Fredoka,Georgia,system-ui,sans-serif;font-size:16px;line-height:1.2;user-select:none;-webkit-user-select:none}
.ctf-wrap canvas{position:absolute;left:0;top:0;width:100%;height:100%;display:block}
.ctf-ui{position:absolute;inset:0;pointer-events:none}
.ctf-status{position:absolute;inset:0;z-index:30;display:flex;align-items:center;justify-content:center;text-align:center;
  white-space:pre-line;background:#2b1d1a;padding:2em;font-size:1.3em}
.ctf-panel{background:rgba(43,29,26,.78);border-radius:.5em;padding:.35em .8em}

.ctf-vp{position:absolute;overflow:hidden;box-shadow:inset 0 0 0 2px #2b1d1a}
.ctf-vp.prot{box-shadow:inset 0 0 0 2px #2b1d1a,inset 0 0 3em rgba(140,210,255,.55)}
.ctf-xh{position:absolute;left:50%;top:50%;width:1.5em;height:1.5em;margin:-.75em 0 0 -.75em}
.ctf-xh::before,.ctf-xh::after{content:'';position:absolute;background:#fff;box-shadow:0 0 2px #000}
.ctf-xh::before{left:calc(50% - 1px);top:0;width:2px;height:100%;-webkit-mask:linear-gradient(#000 0 30%,transparent 30% 70%,#000 70%);mask:linear-gradient(#000 0 30%,transparent 30% 70%,#000 70%)}
.ctf-xh::after{top:calc(50% - 1px);left:0;height:2px;width:100%;-webkit-mask:linear-gradient(90deg,#000 0 30%,transparent 30% 70%,#000 70%);mask:linear-gradient(90deg,#000 0 30%,transparent 30% 70%,#000 70%)}
.ctf-hm{position:absolute;left:50%;top:50%;width:2.2em;height:2.2em;margin:-1.1em 0 0 -1.1em;opacity:0}
.ctf-hm::before,.ctf-hm::after{content:'';position:absolute;left:calc(50% - 1px);top:0;width:3px;height:100%;background:#ff5a5f;box-shadow:0 0 3px #000;transform:rotate(45deg)}
.ctf-hm::after{transform:rotate(-45deg)}
.ctf-dmg{position:absolute;inset:0;opacity:0;box-shadow:inset 0 0 6em 1.5em rgba(229,72,77,.85)}
.ctf-hdir{position:absolute;left:50%;top:50%;width:0;height:0;opacity:0}
.ctf-hdir::before{content:'';position:absolute;left:-3em;top:-9em;width:6em;height:1.6em;border-radius:50%;background:radial-gradient(ellipse at 50% 100%,rgba(255,70,75,.95),rgba(255,70,75,0) 70%)}
.ctf-ammo{position:relative;margin-top:.4em;height:1.05em;border-radius:.6em;background:rgba(0,0,0,.45);overflow:hidden}
.ctf-ammo i{position:absolute;left:0;top:0;bottom:0;border-radius:.6em;background:#ffd060}
.ctf-ammo b{position:absolute;inset:0;text-align:center;font-size:.8em;line-height:1.3em;text-shadow:0 1px 2px #000;color:#fff;letter-spacing:.06em}
.ctf-me{position:absolute;left:.6em;top:.6em;min-width:13em}
.ctf-who{display:flex;align-items:center;gap:.45em;font-weight:700;font-size:1.05em}
.ctf-dot{width:.9em;height:.9em;border-radius:50%;border:2px solid rgba(255,255,255,.8);flex:0 0 auto}
.ctf-tag{margin-left:auto;font-size:.8em;padding:.1em .5em;border-radius:1em;color:#fff;letter-spacing:.06em}
.ctf-hp{position:relative;height:1.05em;margin-top:.4em;border-radius:.6em;background:rgba(0,0,0,.45);overflow:hidden}
.ctf-hp i{position:absolute;left:0;top:0;bottom:0;border-radius:.6em}
.ctf-hp .trail{background:rgba(255,255,255,.55);transition:none}
.ctf-hp .fill{transition:width .12s linear,background .3s}
.ctf-hp b{position:absolute;inset:0;text-align:center;font-size:.8em;line-height:1.3em;text-shadow:0 1px 2px #000;color:#fff}
.ctf-kd{margin-top:.3em;font-size:.8em;opacity:.85}
.ctf-obj{position:absolute;left:50%;top:.6em;transform:translateX(-50%);display:flex;align-items:center;gap:.5em;font-size:.85em;white-space:nowrap}
.ctf-arrow{display:inline-block;font-size:1.5em;line-height:1;color:#ffd060;text-shadow:0 1px 2px #000}
.ctf-msg{position:absolute;left:0;right:0;bottom:5em;text-align:center;font-size:1.05em;font-weight:700;text-shadow:0 2px 4px #000,0 0 8px #000}
.ctf-dead{position:absolute;inset:0;display:none;align-items:center;justify-content:center;flex-direction:column;
  background:rgba(40,8,8,.6);font-size:1.6em;font-weight:700;text-shadow:0 2px 4px #000}
.ctf-dead small{font-size:.55em;opacity:.8;margin-top:.3em}
.ctf-vp.dead .ctf-dead{display:flex}
.ctf-stats{position:absolute;display:flex;flex-direction:column;justify-content:center;gap:.5em;padding:1.2em;background:#2b1d1a;box-sizing:border-box}
.ctf-stats h3{margin:0 0 .3em;font-size:1.1em;letter-spacing:.08em;opacity:.8}
.ctf-row{display:flex;align-items:center;gap:.5em;font-size:.95em}
.ctf-row span{margin-left:auto;opacity:.85;font-size:.85em}

.ctf-score{position:absolute;left:50%;bottom:0;transform:translateX(-50%);display:flex;align-items:stretch;gap:.3em;
  padding:.3em .4em;background:rgba(43,29,26,.85);border-radius:.7em .7em 0 0}
.ctf-team{min-width:6.2em;text-align:center;padding:.15em .5em;border-radius:.45em;color:#fff}
.ctf-team b{display:block;font-size:.8em;letter-spacing:.1em}
.ctf-team em{display:block;font-style:normal;font-size:1.5em;font-weight:700;line-height:1.05}
.ctf-team small{display:block;font-size:.65em;opacity:.9;letter-spacing:.05em;white-space:nowrap}
.ctf-first{align-self:center;font-size:1.05em;font-weight:700;opacity:.95;text-align:center;padding:0 .4em;min-width:3.6em;font-variant-numeric:tabular-nums;line-height:1.1}
.ctf-first.low{color:#ff6b6b;opacity:1}
.ctf-first small{display:block;font-size:.55em;letter-spacing:.1em;opacity:.8;font-weight:600}
.ctf-feed{position:absolute;right:.6em;top:.6em;display:flex;flex-direction:column;gap:.25em;align-items:flex-end;font-size:.8em}
.ctf-feed div{padding:.2em .6em;border-radius:.4em;background:rgba(43,29,26,.8)}
.ctf-banner{position:absolute;left:0;right:0;top:34%;text-align:center;display:none;font-weight:700;font-size:4.2em;
  text-shadow:0 4px 0 rgba(0,0,0,.35),0 0 14px rgba(0,0,0,.6);color:#fff3e0}
.ctf-banner small{display:block;font-size:.3em;margin-top:.3em;letter-spacing:.06em}

.ctf-lobby{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;padding:3% 4% 3%;box-sizing:border-box;
  background:linear-gradient(rgba(43,29,26,.72),rgba(43,29,26,.88))}
.ctf-lobby h1{margin:0;font-size:3em;letter-spacing:.08em;text-shadow:0 4px 0 rgba(0,0,0,.35)}
.ctf-lobby p{margin:.3em 0 0;opacity:.85;font-size:1.05em}
.ctf-cols{display:grid;grid-template-columns:1fr .7fr 1fr;gap:1.2em;width:100%;flex:1;margin:1.4em 0 1em;min-height:0}
.ctf-col{border-radius:.9em;padding:.8em;display:flex;flex-direction:column;gap:.55em;background:rgba(0,0,0,.28);border:3px solid rgba(255,255,255,.15)}
.ctf-col h2{margin:0 0 .2em;text-align:center;font-size:1.5em;letter-spacing:.12em}
.ctf-col.t0{border-color:#e5484d}.ctf-col.t0 h2{color:#ff7b80}
.ctf-col.t1{border-color:#3b8bff}.ctf-col.t1 h2{color:#7db2ff}
.ctf-col.mid h2{font-size:1.1em;opacity:.8}
.ctf-chip{display:flex;align-items:center;gap:.6em;padding:.5em .8em;border-radius:.7em;background:rgba(255,255,255,.1);font-size:1.15em;font-weight:700}
.ctf-chip i{width:1.1em;height:1.1em;border-radius:50%;border:3px solid #fff;flex:0 0 auto}
.ctf-chip b{margin-left:auto;font-size:.7em;padding:.15em .6em;border-radius:1em;background:rgba(0,0,0,.35);opacity:.5;letter-spacing:.06em}
.ctf-chip.ready{background:rgba(70,211,107,.28)}
.ctf-chip.ready b{background:#2fbf71;color:#fff;opacity:1}
.ctf-hint{font-size:1.25em;font-weight:700;color:#ffd060}
`;

async function loadThree() {
  try {
    const THREE = await import("three");                                   // the site's import map, if it has one
    const { GLTFLoader } = await import("three/addons/loaders/GLTFLoader.js");
    return { THREE, GLTFLoader };
  } catch {
    const THREE = await import(`${THREE_CDN}/+esm`);                        // otherwise straight from the CDN
    const { GLTFLoader } = await import(`${THREE_CDN}/examples/jsm/loaders/GLTFLoader.js/+esm`);
    return { THREE, GLTFLoader };
  }
}

export async function start(ctx) {
  const { root, signal } = ctx;
  const on = (t, type, fn) => t.addEventListener(type, fn, { signal });

  const style = h("style");
  style.textContent = CSS;
  document.head.append(style);
  const wrap = h("div", "ctf-wrap");
  const status = h("div", "ctf-status", "Loading map…");
  wrap.append(status);
  root.replaceChildren(wrap);
  const bail = (msg) => { status.textContent = msg; return { destroy() { style.remove(); } }; };

  let lib;
  try { lib = await loadThree(); } catch (e) { return bail("Could not load three.js\n" + (e?.message || e)); }
  if (signal.aborted) { style.remove(); return { destroy() {} }; }
  const { THREE, GLTFLoader } = lib;

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

  let W = 1280, HH = 720;
  function resize() {
    const w = wrap.clientWidth, hh = wrap.clientHeight;
    if (!w || !hh) return;
    W = w; HH = hh;
    renderer.setSize(w, hh, false);
    wrap.style.fontSize = (w / 80) + "px";        // every HUD size is in em, so the HUD scales with the screen
  }
  const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(resize) : null;
  ro?.observe(wrap);
  resize();

  /* ---------------- load map + texture ---------------- */
  let tex = null;
  for (const f of TEXTURES) { try { tex = await new THREE.TextureLoader().loadAsync(f); break; } catch {} }
  let gltf = null;
  for (const f of MAP_FILES) { try { gltf = await new GLTFLoader().loadAsync(f); break; } catch {} }
  if (signal.aborted) { renderer.dispose(); style.remove(); return { destroy() {} }; }
  if (!gltf) {
    ro?.disconnect();
    return bail("Could not load the map.\nExpected one of:\n" + MAP_FILES.join("\n") + "\n\nPut map.glb at public/js/game/ctf/assets/map.glb (or change MAP_FILES in js/game/ctf/main.js).");
  }

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
  const floorTop = all.min.y;
  const H = 4 * 0.45, RADIUS = H * 0.18;                 // character height / body radius (as in index.html)

  /* ---------------- collision from the REAL wall geometry (as in index.html) ---------------- */
  const LO = floorTop + 0.4, HI = floorTop + H;
  const CELL = 2, grid = new Map(), segs = [];
  const gkey = (ix, iz) => (ix + 5000) * 10000 + (iz + 5000);
  function addSeg(ax, az, bx, bz) {
    if ((ax - bx) ** 2 + (az - bz) ** 2 < 1e-8) return;
    const id = segs.length / 4; segs.push(ax, az, bx, bz);
    for (let ix = Math.floor(Math.min(ax, bx) / CELL); ix <= Math.floor(Math.max(ax, bx) / CELL); ix++)
      for (let iz = Math.floor(Math.min(az, bz) / CELL); iz <= Math.floor(Math.max(az, bz) / CELL); iz++) {
        const k = gkey(ix, iz); (grid.get(k) || grid.set(k, []).get(k)).push(id);
      }
  }
  {
    const V = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()], e1 = new THREE.Vector3(), e2 = new THREE.Vector3();
    for (const m of meshes) {
      if (NO_COLLISION.some((s) => m.name.includes(s))) continue;
      const pos = m.geometry.attributes.position, idx = m.geometry.index, n = idx ? idx.count : pos.count;
      for (let i = 0; i < n; i += 3) {
        for (let k = 0; k < 3; k++) V[k].fromBufferAttribute(pos, idx ? idx.getX(i + k) : i + k).applyMatrix4(m.matrixWorld);
        if (Math.max(V[0].y, V[1].y, V[2].y) < LO || Math.min(V[0].y, V[1].y, V[2].y) > HI) continue;
        e1.subVectors(V[1], V[0]); e2.subVectors(V[2], V[0]); e1.cross(e2);
        if (Math.abs(e1.y) > 0.6 * e1.length()) continue;         // floors / tops are not walls
        for (let k = 0; k < 3; k++) { const a = V[k], b = V[(k + 1) % 3]; addSeg(a.x, a.z, b.x, b.z); }
      }
    }
  }
  function hits(x, z) {
    const r2 = RADIUS * RADIUS;
    for (let ix = Math.floor((x - RADIUS) / CELL); ix <= Math.floor((x + RADIUS) / CELL); ix++)
      for (let iz = Math.floor((z - RADIUS) / CELL); iz <= Math.floor((z + RADIUS) / CELL); iz++) {
        const ids = grid.get(gkey(ix, iz)); if (!ids) continue;
        for (const id of ids) {
          const ax = segs[id * 4], az = segs[id * 4 + 1], dx = segs[id * 4 + 2] - ax, dz = segs[id * 4 + 3] - az;
          const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz)));
          if ((x - ax - t * dx) ** 2 + (z - az - t * dz) ** 2 < r2) return true;
        }
      }
    return false;
  }
  const clearAt = (x, z, r = 1.0) => !hits(x, z) && !hits(x + r, z) && !hits(x - r, z) && !hits(x, z + r) && !hits(x, z - r);

  // lighting fit
  const R = Math.max(size.x, size.z);
  sun.position.set(mid.x + R, mid.y + R * 1.5, mid.z + R * 0.5); sun.target.position.copy(mid);
  Object.assign(sun.shadow.camera, { left: -R, right: R, top: R, bottom: -R, far: R * 6 });
  scene.fog = new THREE.Fog(0xe8b98f, R * 1.2, R * 3);

  /* ---------------- walkable cells: flood-fill from an end room, so flags / spawns / med-kits are never unreachable ---------------- */
  const CS = 0.5, gx0 = all.min.x - 1, gz0 = all.min.z - 1;
  const GW = Math.ceil((size.x + 2) / CS), GD = Math.ceil((size.z + 2) / CS);
  const reach = new Uint8Array(GW * GD);
  const cellOf = (x, z) => {
    const i = Math.floor((x - gx0) / CS), j = Math.floor((z - gz0) / CS);
    return i < 0 || j < 0 || i >= GW || j >= GD ? -1 : j * GW + i;
  };
  const cellX = (idx) => gx0 + ((idx % GW) + 0.5) * CS, cellZ = (idx) => gz0 + (((idx / GW) | 0) + 0.5) * CS;

  const roomBoxes = meshes.filter((m) => /^room-small/.test(m.name))
    .map((m) => new THREE.Box3().setFromObject(m)).sort((a, b) => a.min.x - b.min.x);
  const fallbackBox = (west) => new THREE.Box3(
    new THREE.Vector3(west ? all.min.x + 2 : all.max.x - 26, floorTop, mid.z - 12),
    new THREE.Vector3(west ? all.min.x + 26 : all.max.x - 2, floorTop + H, mid.z + 12));
  const roomBox = [roomBoxes.length > 1 ? roomBoxes[0] : fallbackBox(true), roomBoxes.length > 1 ? roomBoxes[roomBoxes.length - 1] : fallbackBox(false)];

  {
    const east = roomBox[1], cx = (east.min.x + east.max.x) / 2, cz = (east.min.z + east.max.z) / 2;
    let sx = cx, sz = cz, found = !hits(cx, cz);
    for (let r = 0.5; r < 20 && !found; r += 0.5)
      for (let a = 0; a < 6.28 && !found; a += 0.3) {
        const x = cx + Math.cos(a) * r, z = cz + Math.sin(a) * r;
        if (!hits(x, z)) { sx = x; sz = z; found = true; }
      }
    const q = new Int32Array(GW * GD);
    let qh = 0, qt = 0;
    const s0 = cellOf(sx, sz);
    if (s0 >= 0) { reach[s0] = 1; q[qt++] = s0; }
    while (qh < qt) {
      const c = q[qh++], i = c % GW, j = (c / GW) | 0;
      for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const ni = i + di, nj = j + dj;
        if (ni < 0 || nj < 0 || ni >= GW || nj >= GD) continue;
        const n = nj * GW + ni;
        if (reach[n] || hits(cellX(n), cellZ(n))) continue;
        reach[n] = 1; q[qt++] = n;
      }
    }
  }
  function cells(pred) {
    const out = [];
    for (let c = 0; c < reach.length; c++) {
      if (!reach[c]) continue;
      const x = cellX(c), z = cellZ(c);
      if (pred(x, z)) out.push([x, z]);
    }
    return out;
  }

  /* ---------------- bases (flag stand + spawn points) and med-kit spots ---------------- */
  const bases = TEAMS.map((_, t) => {
    const box = roomBox[t];
    const cx = (box.min.x + box.max.x) / 2, cz = (box.min.z + box.max.z) / 2;
    const inRoom = cells((x, z) => x > box.min.x + 1 && x < box.max.x - 1 && z > box.min.z + 1 && z < box.max.z - 1 && clearAt(x, z, 1.2));
    let home = [cx, cz], bd = Infinity;
    for (const c of inRoom) { const d = (c[0] - cx) ** 2 + (c[1] - cz) ** 2; if (d < bd) { bd = d; home = c; } }
    let spawns = inRoom.filter((c) => { const d = Math.hypot(c[0] - home[0], c[1] - home[1]); return d > 4 && d < 11; });
    if (spawns.length < 4) spawns = inRoom.filter((c) => Math.hypot(c[0] - home[0], c[1] - home[1]) > 2.5);
    if (!spawns.length) spawns = [home];
    return { home: { x: home[0], z: home[1] }, spawns, yaw: t === 0 ? -Math.PI / 2 : Math.PI / 2 };   // face the middle
  });
  const midCells = cells((x, z) => Math.abs(x - mid.x) <= MID_HALF.x * MAP_SCALE && Math.abs(z - mid.z) <= MID_HALF.z * MAP_SCALE && clearAt(x, z, 1.0));
  if (!midCells.length) console.warn("[ctf] no free spot found in the middle room for med-kits");
  if (!reach[cellOf(bases[0].home.x, bases[0].home.z)]) console.warn("[ctf] the two end rooms are not connected on foot; check NO_COLLISION in main.js");

  /* ---------------- helpers for 3D objects ---------------- */
  const mat = (c) => new THREE.MeshStandardMaterial({ color: c });
  const part = (g, m, x, y, z) => { const o = new THREE.Mesh(g, m); o.position.set(x, y, z); return o; };

  // a soldier, painted in the player's colour
  function makeAvatar() {
    const g = new THREE.Group();
    const cloth = mat(0xffffff), skin = mat(0xffd9b0), dark = mat(0x34303a), steel = mat(0x2d2f36);
    g.add(part(new THREE.BoxGeometry(H * 0.45, H * 0.4, H * 0.28), cloth, 0, H * 0.6, 0),
      part(new THREE.SphereGeometry(H * 0.17, 16, 12), skin, 0, H * 0.93, 0),
      part(new THREE.BoxGeometry(H * 0.12, H * 0.06, H * 0.08), dark, 0, H * 0.93, H * 0.17));
    const limb = (x, y, w, hh, m) => { const l = new THREE.Group(); l.position.set(x, y, 0); l.add(part(new THREE.BoxGeometry(w, hh, w), m, 0, -hh / 2, 0)); g.add(l); return l; };
    const legL = limb(-H * 0.1, H * 0.4, H * 0.14, H * 0.4, dark), legR = limb(H * 0.1, H * 0.4, H * 0.14, H * 0.4, dark);
    const armL = limb(-H * 0.3, H * 0.78, H * 0.11, H * 0.34, cloth), armR = limb(H * 0.3, H * 0.78, H * 0.11, H * 0.34, cloth);
    armR.add(part(new THREE.BoxGeometry(0.08, 0.5, 0.1), steel, 0, -H * 0.34 - 0.12, 0));        // gun along the arm
    const flash = new THREE.Mesh(new THREE.SphereGeometry(0.1, 8, 6), new THREE.MeshBasicMaterial({ color: 0xffd060 }));
    flash.position.set(0, -H * 0.34 - 0.42, 0); flash.visible = false; armR.add(flash);
    const marker = new THREE.Mesh(new THREE.OctahedronGeometry(0.22), new THREE.MeshBasicMaterial({ color: 0xffffff }));   // team marker
    marker.position.y = H * 1.38; g.add(marker);
    const canvas = document.createElement("canvas"); canvas.width = 256; canvas.height = 64;
    const ltex = new THREE.CanvasTexture(canvas); ltex.colorSpace = THREE.SRGBColorSpace;
    const label = new THREE.Sprite(new THREE.SpriteMaterial({ map: ltex, transparent: true, fog: false }));
    label.scale.set(2.4, 0.6, 1); label.position.y = H * 1.62; g.add(label);
    return { group: g, cloth, legL, legR, armL, armR, flash, marker, label: { canvas, tex: ltex, key: "" } };
  }
  function setLabel(L, text, color) {
    const key = text + color;
    if (L.key === key) return;
    L.key = key;
    const g = L.canvas.getContext("2d");
    g.clearRect(0, 0, 256, 64);
    g.font = "700 34px Fredoka, Georgia, sans-serif"; g.textAlign = "center"; g.textBaseline = "middle";
    g.lineWidth = 7; g.strokeStyle = "rgba(20,10,8,.85)"; g.strokeText(text, 128, 34);
    g.fillStyle = color; g.fillText(text, 128, 34);
    L.tex.needsUpdate = true;
  }

  // first-person gun, only visible to the camera that owns it (own layer)
  const gunMats = [0x2d2f36, 0x16171b, 0x3b2a20].map((c) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.5, metalness: 0.6, depthTest: false }));
  const flashMat = new THREE.MeshBasicMaterial({ color: 0xffd060, depthTest: false });
  const GUN_BASE = new THREE.Vector3(0.22, -0.2, -0.45);
  function makeGun(layer) {
    const gun = new THREE.Group(), muzzle = new THREE.Object3D();
    muzzle.position.set(0, 0.02, -0.5); gun.add(muzzle);
    const add = (g, m, x, y, z) => { const o = new THREE.Mesh(g, m); o.position.set(x, y, z); o.renderOrder = 10; gun.add(o); return o; };
    add(new THREE.BoxGeometry(0.07, 0.1, 0.42), gunMats[0], 0, 0, 0);
    add(new THREE.CylinderGeometry(0.018, 0.018, 0.3, 12).rotateX(Math.PI / 2), gunMats[1], 0, 0.02, -0.33);
    add(new THREE.BoxGeometry(0.06, 0.16, 0.08), gunMats[2], 0, -0.12, 0.1).rotation.x = 0.25;
    add(new THREE.BoxGeometry(0.05, 0.11, 0.1), gunMats[1], 0, -0.1, -0.08);
    const flash = new THREE.Mesh(new THREE.SphereGeometry(0.05, 10, 8), flashMat);
    flash.position.copy(muzzle.position); flash.renderOrder = 11; flash.visible = false; gun.add(flash);
    gun.position.copy(GUN_BASE);
    gun.traverse((o) => o.layers.set(layer));
    return { group: gun, muzzle, flash };
  }

  // flag: pole + waving cloth in the team colour
  function makeFlag(team) {
    const g = new THREE.Group();
    g.add(part(new THREE.CylinderGeometry(0.07, 0.07, 3.4, 8), mat(0xe8e4dc), 0, 1.7, 0));
    g.add(part(new THREE.SphereGeometry(0.13, 10, 8), mat(0xffd060), 0, 3.45, 0));
    const geo = new THREE.PlaneGeometry(1.7, 1.0, 12, 1).translate(0.85, 0, 0);
    const cloth = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color: TEAMS[team].hex, side: THREE.DoubleSide, emissive: TEAMS[team].hex, emissiveIntensity: 0.25 }));
    cloth.position.set(0.05, 2.85, 0); g.add(cloth);
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

  /* ---------------- game state ---------------- */
  let phase = "teams";                      // teams -> count -> play -> over -> teams
  let countT = 0, overT = 0, bannerT = 0, tNow = 0;
  let matchT = MATCH_TIME, overtime = false;   // match clock (seconds left) and sudden-death flag
  const roster = new Map();                 // everybody connected: slot -> { pos: -1 red | 0 undecided | 1 blue, ready, latch }
  const chars = new Map();                  // players in the match: slot -> character
  const caps = [0, 0];
  const temps = [], decals = [];
  let views = [];                           // [{ ch, el, ... }]  one per split-screen cell
  let statsEl = null;

  const flags = TEAMS.map((_, t) => {
    const f = makeFlag(t), stand = makeBase(t);
    stand.position.set(bases[t].home.x, floorTop, bases[t].home.z);
    scene.add(stand);
    scene.add(f.group);
    return { team: t, ...f, stand, home: bases[t].home, x: 0, z: 0, atHome: true, carrier: null, timer: 0 };
  });
  for (const f of flags) returnFlag(f);               // flags start on their stands
  const medkits = [];
  for (let i = 0; i < MEDKIT_COUNT; i++) {
    const m = makeMedkit();
    m.group.visible = false; scene.add(m.group);
    medkits.push({ ...m, x: 0, z: 0, active: false, timer: 0, lastX: 1e9, lastZ: 1e9, phase: Math.random() * 6 });
  }

  const nameOf = (ch) => ctx.player(ch.slot)?.name ?? `P${ch.slot}`;
  const colorOf = (slot) => ctx.player(slot)?.color || "#888888";
  const vibrate = (slot, ms) => ctx.send(slot, { type: "vibrate", ms });

  /* ---------------- sound (same noise-burst gunshot as index.html) ---------------- */
  let audio = null;
  function bang(vol = 0.25) {
    try {
      audio ||= new AudioContext();
      if (audio.state === "suspended") audio.resume();
      const n = audio.sampleRate * 0.15 | 0, b = audio.createBuffer(1, n, audio.sampleRate), d = b.getChannelData(0);
      for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / n, 3);
      const src = audio.createBufferSource(), g = audio.createGain(); g.gain.value = vol;
      src.buffer = b; src.connect(g).connect(audio.destination); src.start();
    } catch {}
  }
  function ding(freq = 660, len = 0.18) {
    try {
      audio ||= new AudioContext();
      if (audio.state === "suspended") audio.resume();
      const o = audio.createOscillator(), g = audio.createGain();
      o.type = "triangle"; o.frequency.value = freq;
      g.gain.setValueAtTime(0.18, audio.currentTime); g.gain.exponentialRampToValueAtTime(0.001, audio.currentTime + len);
      o.connect(g).connect(audio.destination); o.start(); o.stop(audio.currentTime + len);
    } catch {}
  }

  /* ---------------- UI layers ---------------- */
  const ui = h("div", "ctf-ui");
  const scoreEl = h("div", "ctf-score");
  const feedEl = h("div", "ctf-feed");
  const bannerEl = h("div", "ctf-banner");
  const lobbyEl = h("div", "ctf-lobby");
  const vpLayer = h("div", "ctf-ui");
  ui.append(vpLayer, scoreEl, feedEl, bannerEl, lobbyEl);
  wrap.insertBefore(ui, status);
  status.style.display = "none";

  const scoreTeams = TEAMS.map((t) => {
    const box = h("div", "ctf-team"); box.style.background = t.color;
    const nm = h("b", "", t.name), n = h("em", "", "0"), sm = h("small", "", "FLAG HOME");
    box.append(nm, n, sm);
    return { box, n, sm, last: "" };
  });
  const firstTo = h("div", "ctf-first");                           // the match clock
  const fmtClock = (t) => `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, "0")}`;
  scoreEl.append(scoreTeams[0].box, firstTo, scoreTeams[1].box);
  scoreEl.style.display = "none";

  function banner(text, sub = "", secs = 2) {
    bannerEl.replaceChildren(document.createTextNode(text));
    if (sub) bannerEl.append(h("small", "", sub));
    bannerEl.style.display = "block";
    bannerT = secs;
  }
  const feedItems = [];
  function feed(parts) {          // parts: [text, color?] pairs
    const row = h("div");
    for (const [t, c] of parts) { const s = h("span", "", t); if (c) { s.style.color = c; s.style.fontWeight = "700"; } row.append(s); }
    feedEl.append(row); feedItems.push({ row, t: 5 });
    while (feedItems.length > 5) feedItems.shift().row.remove();
  }

  /* ---------------- team select (the normal pad) ---------------- */
  function lobbyHint() {
    const list = [...roster.values()];
    if (list.length < 2) return "Waiting for at least 2 players…";
    if (list.some((r) => r.pos === 0)) return "Move your stick ◀ ▶ to pick a team";
    const ready = list.filter((r) => r.ready).length;
    if (ready === list.length) return "Both teams need at least one player";
    return `Press A when you are ready  (${ready}/${list.length} ready)   ·   B = cancel`;
  }
  function renderLobby() {
    lobbyEl.replaceChildren();
    lobbyEl.append(h("h1", "", "🚩 CAPTURE THE FLAG"), h("p", "", `Steal the enemy flag from the far end room · bring it home · most captures in ${fmtClock(MATCH_TIME)} wins`));
    const cols = [h("div", "ctf-col t0"), h("div", "ctf-col mid"), h("div", "ctf-col t1")];
    cols[0].append(h("h2", "", "RED TEAM")); cols[1].append(h("h2", "", "CHOOSING…")); cols[2].append(h("h2", "", "BLUE TEAM"));
    for (const [slot, r] of [...roster.entries()].sort((a, b) => a[0] - b[0])) {
      const info = ctx.player(slot); if (!info) continue;
      const chip = h("div", "ctf-chip" + (r.ready ? " ready" : ""));
      const dot = h("i"); dot.style.background = info.color;
      chip.append(dot, h("span", "", `${info.animal || ""} ${info.name}`), h("b", "", r.ready ? "READY ✔" : r.pos ? "PRESS A" : "◀ ▶"));
      cols[r.pos + 1].append(chip);
    }
    const grid = h("div", "ctf-cols"); grid.append(...cols);
    lobbyEl.append(grid, h("div", "ctf-hint", lobbyHint()));
  }
  const lastLobbyHud = new Map();
  function lobbyHud(slot) {
    const r = roster.get(slot); if (!r) return;
    const text = r.ready ? "READY ✔  (B = cancel)" : r.pos === 0 ? "Stick ◀ ▶ = pick a team" : `${TEAMS[r.pos < 0 ? 0 : 1].name} team · press A`;
    if (lastLobbyHud.get(slot) === text) return;
    lastLobbyHud.set(slot, text);
    ctx.send(slot, { type: "hud", text, down: false });
  }
  function lobbyMove(slot, x) {
    const r = roster.get(slot);
    if (phase !== "teams" || !r || r.ready) return;
    if (Math.abs(x) < 0.55) { r.latch = false; return; }
    if (r.latch) return;
    r.latch = true;
    const next = clampN(r.pos + Math.sign(x), -1, 1);
    if (next !== r.pos) { r.pos = next; vibrate(slot, 12); renderLobby(); lobbyHud(slot); }
  }
  function lobbyButton(slot, id, pressed) {
    const r = roster.get(slot);
    if (phase !== "teams" || !r || !pressed) return;
    if (id === "A") {
      if (r.pos === 0) { vibrate(slot, [30, 40, 30]); return; }            // pick a team first
      if (!r.ready) { r.ready = true; vibrate(slot, 25); }
    } else if (id === "B") {
      if (r.ready) r.ready = false; else r.pos = 0;
      vibrate(slot, 15);
    } else return;
    renderLobby(); lobbyHud(slot); checkStart();
  }
  function checkStart() {
    if (phase !== "teams") return;
    const list = [...roster.values()];
    if (list.length < 2 || !list.every((r) => r.ready && r.pos !== 0)) return;
    if (!list.some((r) => r.pos < 0) || !list.some((r) => r.pos > 0)) return;
    startMatch();
  }

  /* ---------------- characters ---------------- */
  function spawnChar(slot, team) {
    const av = makeAvatar(); scene.add(av.group);
    const layer = 1 + (slot % 30);
    const cam = new THREE.PerspectiveCamera(60, 1, 0.05, 500);
    cam.layers.enable(layer);
    const gun = makeGun(layer);
    cam.add(gun.group); scene.add(cam);
    const ch = {
      slot, team, hp: START_HP, shownHp: START_HP, alive: true, respawn: 0, prot: 0,
      x: 0, z: 0, yaw: 0, pitch: 0, input: { mx: 0, my: 0, lx: 0, ly: 0, fire: false }, inputAt: 0,
      lastShot: 0, kick: 0, flashT: 0, flash3: 0, walkT: 0, bob: 0, carrying: null, kills: 0, deaths: 0, caps: 0,
      hurtT: 0, hitT: 0, deadT: 0, av, cam, gun, view: null, color: "", rect: [0, 0, 1, 1],
      ammo: MAG_SIZE, reloadT: 0, ammoSync: 0, hdirT: 0, hurtAng: 0,
      sid: null, lookPX: 0, lookPY: 0, rlSeen: 0, lookDX: 0, lookDY: 0,
    };
    respawn(ch);
    ch.prot = 0;
    return ch;
  }
  function respawn(ch) {
    const b = bases[ch.team];
    const others = [...chars.values()].filter((o) => o !== ch && o.alive);
    let best = b.spawns[(Math.random() * b.spawns.length) | 0], bd = -1;
    for (let k = 0; k < 8; k++) {                                       // a spawn spot nobody is standing on
      const c = b.spawns[(Math.random() * b.spawns.length) | 0];
      const d = Math.min(99, ...others.map((o) => Math.hypot(o.x - c[0], o.z - c[1])));
      if (d > bd) { bd = d; best = c; }
    }
    ch.x = best[0]; ch.z = best[1]; ch.yaw = b.yaw; ch.pitch = 0;
    ch.hp = ch.shownHp = START_HP; ch.alive = true; ch.deadT = 0; ch.prot = SPAWN_PROTECT; ch.hurtT = 0;
    ch.input = { mx: 0, my: 0, lx: 0, ly: 0, fire: false };
    ch.ammo = MAG_SIZE; ch.reloadT = 0; ch.lookDX = ch.lookDY = 0; ch.hdirT = 0;
    sendAmmo(ch);
  }
  function removeChar(ch) {
    if (ch.carrying) dropFlag(ch.carrying, ch.x, ch.z, true);
    scene.remove(ch.av.group, ch.cam);
    ch.gun.group.traverse((o) => o.geometry?.dispose());
    ch.av.group.traverse((o) => { o.geometry?.dispose(); if (o.material && !Array.isArray(o.material)) { o.material.map?.dispose(); o.material.dispose(); } });
  }

  function hurt(victim, dmg, attacker) {
    if (!victim.alive || victim.prot > 0) return;
    victim.hp = Math.max(0, victim.hp - dmg);
    victim.hurtT = HIT_FLASH;
    if (attacker) {                                                  // which way did it come from? (0 = ahead, + = right)
      const ax = attacker.x - victim.x, az = attacker.z - victim.z;
      const fwd = ax * -Math.sin(victim.yaw) + az * -Math.cos(victim.yaw), right = ax * Math.cos(victim.yaw) + az * -Math.sin(victim.yaw);
      victim.hurtAng = Math.atan2(right, fwd); victim.hdirT = 1;
    }
    vibrate(victim.slot, 35);
    ctx.send(victim.slot, { type: "ctf-hit", ang: +victim.hurtAng.toFixed(2) });
    if (victim.hp <= 0) kill(victim, attacker);
  }
  function kill(v, a) {
    v.alive = false; v.deadT = 0; v.respawn = RESPAWN_TIME; v.deaths++; a.kills++;
    v.input.fire = false; v.reloadT = 0;
    if (v.carrying) dropFlag(v.carrying, v.x, v.z);
    feed([[nameOf(a), colorOf(a.slot)], [" ▸ "], [nameOf(v), colorOf(v.slot)]]);
    vibrate(a.slot, [40, 30, 40]); vibrate(v.slot, [150, 60, 150]);
    sendPhoneHud(v); sendPhoneHud(a);
  }

  /* ---------------- ammo + reload ---------------- */
  function sendAmmo(ch) {
    ctx.send(ch.slot, { type: "ctf-ammo", ammo: ch.ammo, max: MAG_SIZE, reloading: ch.reloadT > 0, time: RELOAD_TIME, left: +ch.reloadT.toFixed(2) });
  }
  function startReload(ch) {
    if (!ch.alive || ch.reloadT > 0 || ch.ammo >= MAG_SIZE) return;
    ch.reloadT = RELOAD_TIME;
    ding(300, 0.06);
    sendAmmo(ch);
  }

  /* ---------------- shooting ---------------- */
  const shotRay = new THREE.Raycaster();
  const vA = new THREE.Vector3(), vB = new THREE.Vector3(), vO = new THREE.Vector3(), vD = new THREE.Vector3(), pr = new THREE.Vector3(), ps = new THREE.Vector3();
  const sparkGeo = new THREE.SphereGeometry(0.07, 8, 6), decalGeo = new THREE.CircleGeometry(0.09, 12);
  const decalMat = new THREE.MeshBasicMaterial({ color: 0x1a0d08, polygonOffset: true, polygonOffsetFactor: -2 });
  const HIT_R = 0.5;
  function shoot(ch) {
    ch.cam.updateMatrixWorld(true);
    ch.cam.getWorldPosition(vO); ch.cam.getWorldDirection(vD);
    shotRay.set(vO, vD); shotRay.far = 300;
    const wall = shotRay.intersectObjects(meshes, false)[0];
    let maxT = wall ? wall.distance : 300, target = null;
    for (const o of chars.values()) {
      if (o === ch || o.team === ch.team || !o.alive || o.prot > 0) continue;
      vA.set(o.x, floorTop + 0.2, o.z); vB.set(o.x, floorTop + H * 1.0, o.z);
      if (shotRay.ray.distanceSqToSegment(vA, vB, pr, ps) < HIT_R * HIT_R) {
        const t = pr.distanceTo(vO);
        if (t < maxT) { maxT = t; target = o; }
      }
    }
    const from = ch.gun.muzzle.getWorldPosition(new THREE.Vector3());
    const to = vO.clone().addScaledVector(vD, maxT);
    const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints([from, to]),
      new THREE.LineBasicMaterial({ color: new THREE.Color(ch.color || "#ffe08a").lerp(new THREE.Color(0xffe08a), 0.5), transparent: true }));
    scene.add(line); temps.push({ obj: line, life: 0.08, dispose: true });
    if (target) {
      hurt(target, BULLET_DAMAGE, ch);
      ch.hitT = 0.18; ding(target.alive ? 900 : 520, 0.08);
    } else if (wall) {
      const nrm = wall.face.normal.clone().transformDirection(wall.object.matrixWorld);
      const spark = new THREE.Mesh(sparkGeo, new THREE.MeshBasicMaterial({ color: 0xffa040, transparent: true }));
      spark.position.copy(wall.point); scene.add(spark); temps.push({ obj: spark, life: 0.08 });
      const dc = new THREE.Mesh(decalGeo, decalMat);
      dc.position.copy(wall.point).addScaledVector(nrm, 0.01); dc.lookAt(wall.point.clone().add(nrm));
      scene.add(dc); decals.push(dc); if (decals.length > 40) scene.remove(decals.shift());
    }
    ch.kick = 1; ch.flashT = 0.05; ch.flash3 = 0.06;
    bang();
  }

  /* ---------------- flags ---------------- */
  const flagPos = (f) => (f.carrier ? { x: f.carrier.x, z: f.carrier.z } : { x: f.x, z: f.z });
  function placeFlag(f, x, z) {
    f.x = x; f.z = z;
    scene.add(f.group);                                  // (re)parent to the world
    f.group.position.set(x, floorTop, z);
    f.group.rotation.set(0, 0, 0);
    f.group.scale.setScalar(1);
  }
  function returnFlag(f) {
    if (f.carrier) { f.carrier.carrying = null; f.carrier = null; }
    f.atHome = true; f.timer = 0;
    placeFlag(f, f.home.x, f.home.z);
  }
  function dropFlag(f, x, z, silent = false) {
    const c = f.carrier;
    f.carrier = null; f.atHome = false; f.timer = FLAG_RETURN_TIME;
    if (c) c.carrying = null;
    placeFlag(f, x, z);
    if (!silent && c) feed([[nameOf(c), colorOf(c.slot)], [" dropped the "], [TEAMS[f.team].name + " flag", TEAMS[f.team].color]]);
  }
  function takeFlag(ch, f) {
    f.carrier = ch; ch.carrying = f; f.atHome = false; f.timer = 0;
    ch.av.group.add(f.group);                            // rides on the carrier's back
    f.group.position.set(0, H * 0.3, -0.3); f.group.scale.setScalar(0.45); f.group.rotation.set(0, 0, 0);
    feed([[nameOf(ch), colorOf(ch.slot)], [" took the "], [TEAMS[f.team].name + " flag!", TEAMS[f.team].color]]);
    vibrate(ch.slot, [60, 40, 60]); ding(520, 0.2); ding(780, 0.25);
  }
  function capture(ch) {
    const enemy = ch.carrying;
    ch.caps++; caps[ch.team]++;
    returnFlag(enemy);
    feed([[nameOf(ch), colorOf(ch.slot)], [" CAPTURED the flag for "], [TEAMS[ch.team].name, TEAMS[ch.team].color]]);
    for (const o of chars.values()) vibrate(o.slot, o.team === ch.team ? [80, 40, 80, 40, 160] : [200]);
    ding(660, 0.2); setTimeout(() => ding(880, 0.3), 160);
    if (overtime) endMatch(ch.team);                                // sudden death: first capture wins
    else banner(`${TEAMS[ch.team].name} SCORES!`, `${caps[0]} – ${caps[1]}`, 2.2);
  }

  /* ---------------- med-kits ---------------- */
  function placeMedkit(k) {
    if (!midCells.length) return;
    let pick = null;
    for (let tries = 0; tries < 40 && !pick; tries++) {
      const c = midCells[(Math.random() * midCells.length) | 0];
      if (medkits.some((o) => o !== k && o.active && Math.hypot(o.x - c[0], o.z - c[1]) < 8)) continue;
      if (Math.hypot(k.lastX - c[0], k.lastZ - c[1]) < 6) continue;
      pick = c;
    }
    pick ||= midCells[(Math.random() * midCells.length) | 0];
    k.x = k.lastX = pick[0]; k.z = k.lastZ = pick[1];
    k.group.position.set(k.x, floorTop, k.z);
    k.group.visible = true; k.active = true;
  }

  /* ---------------- match flow ---------------- */
  function modeFor(slot) { return chars.has(slot) && phase !== "teams" ? "play" : "select"; }
  function sendModes() { for (const slot of roster.keys()) ctx.send(slot, { type: "ctf-mode", mode: modeFor(slot) }); }

  function layoutViews() {
    for (const v of views) v.el.remove();
    statsEl?.remove(); statsEl = null;
    views = [];
    const list = [...chars.values()].sort((a, b) => a.slot - b.slot);
    const n = list.length;
    const rects = n <= 1 ? [[0, 0, 1, 1]]
      : n === 2 ? [[0, 0, 0.5, 1], [0.5, 0, 0.5, 1]]
        : [[0, 0, 0.5, 0.5], [0.5, 0, 0.5, 0.5], [0, 0.5, 0.5, 0.5], [0.5, 0.5, 0.5, 0.5]];
    list.forEach((ch, i) => {
      ch.rect = rects[i];
      const el = h("div", "ctf-vp");
      const [x, y, w, hh] = ch.rect;
      Object.assign(el.style, { left: x * 100 + "%", top: y * 100 + "%", width: w * 100 + "%", height: hh * 100 + "%" });
      const dmg = h("div", "ctf-dmg"), hdir = h("div", "ctf-hdir"), xh = h("div", "ctf-xh"), hm = h("div", "ctf-hm");
      const me = h("div", "ctf-me ctf-panel");
      const who = h("div", "ctf-who"), dot = h("span", "ctf-dot"), nm = h("span"), tag = h("span", "ctf-tag", TEAMS[ch.team].name);
      tag.style.background = TEAMS[ch.team].color;
      who.append(dot, nm, tag);
      const hp = h("div", "ctf-hp"), trail = h("i", "trail"), fill = h("i", "fill"), hpTxt = h("b");
      hp.append(trail, fill, hpTxt);
      const ammoBar = h("div", "ctf-ammo"), ammoFill = h("i"), ammoTxt = h("b");
      ammoBar.append(ammoFill, ammoTxt);
      const kd = h("div", "ctf-kd");
      me.append(who, hp, ammoBar, kd);
      const obj = h("div", "ctf-obj ctf-panel"), arrow = h("span", "ctf-arrow", "▲"), objTxt = h("span");
      obj.append(arrow, objTxt);
      const msg = h("div", "ctf-msg"), dead = h("div", "ctf-dead");
      el.append(dmg, hdir, xh, hm, me, obj, msg, dead);
      vpLayer.append(el);
      views.push({ ch, el, dmg, hdir, ammoFill, ammoTxt, hm, dot, nm, hp, trail, fill, hpTxt, kd, arrow, objTxt, msg, dead, cache: {} });
    });
    if (n === 3) {
      statsEl = h("div", "ctf-stats");
      Object.assign(statsEl.style, { left: "50%", top: "50%", width: "50%", height: "50%" });
      vpLayer.append(statsEl);
    }
  }
  function updateStats() {
    if (!statsEl) return;
    statsEl.replaceChildren(h("h3", "", "SCOREBOARD"));
    for (const ch of [...chars.values()].sort((a, b) => a.team - b.team || a.slot - b.slot)) {
      const row = h("div", "ctf-row"), dot = h("span", "ctf-dot");
      dot.style.background = colorOf(ch.slot);
      const t = h("span", "", `${ch.kills} K · ${ch.deaths} D · ${ch.caps} 🚩`);
      const nm = h("b", "", nameOf(ch)); nm.style.color = TEAMS[ch.team].color;
      row.append(dot, nm, t); statsEl.append(row);
    }
  }

  function startMatch() {
    caps[0] = caps[1] = 0; matchT = MATCH_TIME; overtime = false;
    for (const f of flags) returnFlag(f);
    for (const k of medkits) { k.active = false; k.group.visible = false; k.lastX = k.lastZ = 1e9; }
    for (const k of medkits) placeMedkit(k);
    const players = [...roster.entries()].filter(([, r]) => r.pos !== 0).sort((a, b) => a[0] - b[0]).slice(0, 4);   // four split-screen cells at most
    for (const [slot, r] of players) chars.set(slot, spawnChar(slot, r.pos < 0 ? 0 : 1));
    layoutViews(); updateStats();
    feedEl.replaceChildren(); feedItems.length = 0;
    lobbyEl.style.display = "none";
    scoreEl.style.display = "flex";
    phase = "count"; countT = 3;
    sendModes();
    for (const ch of chars.values()) sendPhoneHud(ch);
    for (const [slot] of roster) if (!chars.has(slot)) ctx.send(slot, { type: "hud", text: "Match running: you join next round", down: false });
  }
  function updateClock(dt) {
    if (overtime) return;
    const before = Math.ceil(matchT);
    matchT -= dt;
    const after = Math.ceil(Math.max(0, matchT));
    if (after !== before) {
      if (after === 60) banner("1 MINUTE LEFT", `${caps[0]} – ${caps[1]}`, 2);
      else if (after === 30) banner("30 SECONDS LEFT", `${caps[0]} – ${caps[1]}`, 2);
      else if (after <= 10 && after > 0) ding(880, 0.06);          // tick for the last ten seconds
    }
    if (matchT > 0) return;
    matchT = 0;
    if (caps[0] !== caps[1]) endMatch(caps[0] > caps[1] ? 0 : 1);   // most captures wins
    else if (OVERTIME) { overtime = true; banner("OVERTIME!", "tied · next capture wins", 3); ding(600, 0.2); setTimeout(() => ding(900, 0.3), 180); }
    else endMatch(-1);
  }
  function endMatch(winner) {
    if (phase === "over") return;
    phase = "over";
    if (winner === null) { overT = 2.5; banner("MATCH CANCELLED", "a team has no players left", overT); }
    else if (winner === -1) {                                       // time up and still tied (only when OVERTIME is false)
      overT = 7;
      banner("DRAW!", `${caps[0]} – ${caps[1]}  ·  back to team select…`, overT);
      ding(440, 0.3); setTimeout(() => ding(440, 0.4), 250);
      for (const ch of chars.values()) vibrate(ch.slot, [150, 80, 150]);
    }
    else {
      overT = 7;
      banner(`${TEAMS[winner].name} TEAM WINS!`, `${caps[0]} – ${caps[1]}  ·  back to team select…`, overT);
      ding(523, 0.3); setTimeout(() => ding(659, 0.3), 200); setTimeout(() => ding(784, 0.5), 400);
      for (const ch of chars.values()) vibrate(ch.slot, ch.team === winner ? [100, 60, 100, 60, 300] : [300]);
    }
  }
  function toTeams() {
    for (const ch of chars.values()) removeChar(ch);
    chars.clear();
    for (const v of views) v.el.remove();
    views = []; statsEl?.remove(); statsEl = null;
    for (const f of flags) returnFlag(f);
    for (const k of medkits) { k.active = false; k.group.visible = false; }
    for (const r of roster.values()) { r.ready = false; r.latch = false; }
    lastLobbyHud.clear();
    phase = "teams";
    scoreEl.style.display = "none"; bannerEl.style.display = "none";
    feedEl.replaceChildren(); feedItems.length = 0;
    lobbyEl.style.display = "flex";
    renderLobby();
    sendModes();
    for (const slot of roster.keys()) lobbyHud(slot);
  }
  function checkAbort() {
    if (phase !== "play" && phase !== "count") return;
    const n = [0, 0]; for (const c of chars.values()) n[c.team]++;
    if (!n[0] || !n[1]) endMatch(null);
  }

  /* ---------------- phone HUD (health bar etc.) ---------------- */
  function phoneText(ch) {
    if (ch.carrying) return "🚩 YOU HAVE THE FLAG!";
    return `${TEAMS[ch.team].name} · ${caps[ch.team]}–${caps[1 - ch.team]} · ${ch.kills} kills`;
  }
  function sendPhoneHud(ch) {
    ctx.send(ch.slot, { type: "hud", hp: Math.round(ch.hp), text: phoneText(ch), down: !ch.alive });
  }

  /* ---------------- per-frame update ---------------- */
  function updateChar(ch, dt, active) {
    const inp = ch.input, info = ctx.player(ch.slot);
    const color = info?.color || "#888888";
    if (ch.color !== color) { ch.color = color; ch.av.cloth.color.set(color); }
    setLabel(ch.av.label, info?.name || `P${ch.slot}`, TEAMS[ch.team].color);
    ch.av.marker.material.color.set(TEAMS[ch.team].color);
    ch.av.marker.rotation.y += dt * 2; ch.av.marker.position.y = H * 1.38 + Math.sin(tNow * 3 + ch.slot) * 0.06;

    const now = performance.now();
    if (active && now - ch.inputAt > 600) { inp.mx = inp.my = inp.lx = inp.ly = 0; inp.fire = false; }   // phone went quiet: let go of everything
    let moving = false;

    if (active && ch.alive) {
      // drag-to-look: the phone sends bursts, so feed them in smoothly over the next few frames
      const kx = ch.lookDX * (1 - Math.exp(-dt * 30)), ky = ch.lookDY * (1 - Math.exp(-dt * 30));
      ch.lookDX -= kx; ch.lookDY -= ky;
      ch.yaw -= kx * LOOK_YAW;
      ch.pitch = clampN(ch.pitch + ky * LOOK_PITCH, -1.2, 1.2);
      const f = -inp.my, s = inp.mx, mag = Math.min(1, Math.hypot(f, s));
      if (mag > 0.05) {
        const fx = -Math.sin(ch.yaw), fz = -Math.cos(ch.yaw), rx = Math.cos(ch.yaw), rz = -Math.sin(ch.yaw);
        let dx = fx * f + rx * s, dz = fz * f + rz * s;
        const l = Math.hypot(dx, dz) || 1; dx /= l; dz /= l;
        const step = H * 3.5 * mag * (ch.carrying ? 0.92 : 1) * dt, n = Math.ceil(step / (RADIUS * 0.5)), sd = step / n;
        for (let k = 0; k < n; k++) {                    // small sub-steps, per axis = slide along walls
          const nx = ch.x + dx * sd; if (!hits(nx, ch.z)) ch.x = nx;
          const nz = ch.z + dz * sd; if (!hits(ch.x, nz)) ch.z = nz;
        }
        moving = true;
        ch.walkT += dt * 9 * mag;
      }
    }
    if (active && ch.alive) {                                       // reload progress + keep the phone's ammo counter in sync
      if (ch.reloadT > 0) {
        ch.reloadT -= dt;
        if (ch.reloadT <= 0) { ch.reloadT = 0; ch.ammo = MAG_SIZE; ding(700, 0.08); sendAmmo(ch); }
      }
      ch.ammoSync += dt;
      if (ch.ammoSync > 1) { ch.ammoSync = 0; sendAmmo(ch); }
    }
    if (!ch.alive) ch.lookDX = ch.lookDY = 0;
    if (active && !ch.alive) {
      ch.respawn -= dt; ch.deadT += dt;
      if (ch.respawn <= 0) { respawn(ch); sendPhoneHud(ch); }
    }
    if (ch.prot > 0) ch.prot -= dt;
    ch.hurtT = Math.max(0, ch.hurtT - dt); ch.hitT = Math.max(0, ch.hitT - dt); ch.hdirT = Math.max(0, ch.hdirT - dt);
    ch.shownHp += (ch.hp - ch.shownHp) * Math.min(1, dt * 2.2);     // the trail of the health bar fades down slowly

    // body
    const av = ch.av, sw = moving ? Math.sin(ch.walkT) * 0.7 : 0;
    av.group.position.set(ch.x, floorTop, ch.z);
    av.group.rotation.y = ch.yaw + Math.PI;
    av.legL.rotation.x = sw; av.legR.rotation.x = -sw; av.armL.rotation.x = -sw * 0.5;
    av.armR.rotation.x = -Math.PI / 2 + ch.pitch;                   // gun arm follows where the player looks
    ch.flash3 -= dt; av.flash.visible = ch.flash3 > 0;

    // camera = the player's eyes
    const eye = floorTop + H * 0.9;
    ch.cam.position.set(ch.x, eye + (moving ? Math.sin(ch.walkT * 2) * 0.02 : 0), ch.z);
    if (ch.alive) ch.cam.rotation.set(-ch.pitch, ch.yaw, ch.hurtT > 0 ? (Math.random() - 0.5) * 0.07 * (ch.hurtT / HIT_FLASH) : 0, "YXZ");
    else {                                                          // fall over while waiting to respawn
      const k = Math.min(1, ch.deadT / 0.5);
      ch.cam.position.y = eye - (eye - 0.35) * k;
      ch.cam.rotation.set(-ch.pitch * (1 - k), ch.yaw, k * 0.8, "YXZ");
    }
    // gun in view
    ch.kick = Math.max(0, ch.kick - dt * 12);
    ch.gun.group.position.set(GUN_BASE.x, GUN_BASE.y + (moving ? Math.sin(ch.walkT * 2) * 0.008 : 0), GUN_BASE.z + ch.kick * 0.06);
    ch.gun.group.rotation.x = ch.kick * 0.08;
    ch.flashT -= dt; ch.gun.flash.visible = ch.flashT > 0;

    // shoot last, so the bullet leaves from this frame's camera
    if (active && ch.alive && inp.fire && ch.reloadT <= 0) {
      const t = performance.now() / 1000;
      if (ch.ammo <= 0) startReload(ch);                           // tried to fire on empty: reload
      else if (t - ch.lastShot > FIRE_DELAY) {
        ch.lastShot = t; ch.ammo--; shoot(ch); sendAmmo(ch);
        if (ch.ammo <= 0) startReload(ch);                         // last bullet gone: reload by itself
      }
    }
  }

  function updateObjectives(dt) {
    for (const f of flags) {                                        // dropped flags go home by themselves
      if (!f.atHome && !f.carrier) {
        f.timer -= dt;
        if (f.timer <= 0) { returnFlag(f); feed([["The "], [TEAMS[f.team].name + " flag", TEAMS[f.team].color], [" returned to base"]]); }
      }
    }
    for (const ch of chars.values()) {
      if (!ch.alive) continue;
      const own = flags[ch.team], enemy = flags[1 - ch.team];
      if (!enemy.carrier && !ch.carrying) {
        const p = flagPos(enemy);
        if (Math.hypot(ch.x - p.x, ch.z - p.z) < 2.3) takeFlag(ch, enemy);
      }
      if (!own.carrier && !own.atHome && Math.hypot(ch.x - own.x, ch.z - own.z) < 2.3) {
        returnFlag(own);
        feed([[nameOf(ch), colorOf(ch.slot)], [" returned the "], [TEAMS[own.team].name + " flag", TEAMS[own.team].color]]);
        ding(700, 0.15);
      }
      if (ch.carrying && Math.hypot(ch.x - own.home.x, ch.z - own.home.z) < 3 && (!REQUIRE_OWN_FLAG || own.atHome)) capture(ch);
      if (phase !== "play") return;                                 // a capture may have ended the match
    }
    for (const k of medkits) {
      if (k.active) {
        for (const ch of chars.values()) {
          if (!ch.alive || ch.hp >= START_HP || Math.hypot(ch.x - k.x, ch.z - k.z) > 1.7) continue;
          ch.hp = Math.min(START_HP, ch.hp + MEDKIT_HEAL);
          k.active = false; k.group.visible = false; k.timer = MEDKIT_RESPAWN;
          vibrate(ch.slot, 30); ding(880, 0.15); sendPhoneHud(ch);
          break;
        }
      } else if (midCells.length) {
        k.timer -= dt;
        if (k.timer <= 0) placeMedkit(k);                           // back at a new random spot
      }
    }
  }

  function animateWorld() {
    for (const f of flags) {                                        // cloth waves
      const p = f.geo.attributes.position, b = f.base;
      for (let i = 0; i < p.count; i++) p.setZ(i, b[i * 3 + 2] + Math.sin(b[i * 3] * 3.2 - tNow * 6) * 0.12 * b[i * 3]);
      p.needsUpdate = true;
      if (!f.atHome && !f.carrier) f.group.rotation.y = Math.sin(tNow * 2) * 0.15;
    }
    for (const k of medkits) if (k.active) { k.body.rotation.y = tNow * 1.8 + k.phase; k.body.position.y = 0.9 + Math.sin(tNow * 2.4 + k.phase) * 0.12; }
  }

  function updateHud(v) {
    const ch = v.ch, c = v.cache;
    const set = (key, val, fn) => { if (c[key] !== val) { c[key] = val; fn(val); } };
    set("name", nameOf(ch), (t) => { v.nm.textContent = t; });
    set("col", ch.color, (t) => { v.dot.style.background = t; });
    set("kd", `${ch.kills} kills · ${ch.deaths} deaths · ${ch.caps} flags`, (t) => { v.kd.textContent = t; });
    const hp = Math.round(ch.hp);
    set("hp", hp, (t) => {
      v.fill.style.width = t + "%"; v.hpTxt.textContent = t;
      v.fill.style.background = t > 60 ? "#46d36b" : t > 30 ? "#f0c43c" : "#e5484d";
    });
    v.trail.style.width = Math.max(ch.shownHp, ch.hp) + "%";
    v.dmg.style.opacity = ch.hurtT > 0 ? Math.min(1, ch.hurtT * 2.2) : 0;
    v.hm.style.opacity = ch.hitT > 0 ? 1 : 0;
    v.hdir.style.opacity = ch.hdirT > 0 ? Math.min(1, ch.hdirT * 2) : 0;
    v.hdir.style.transform = `rotate(${ch.hurtAng}rad)`;
    if (ch.reloadT > 0) {
      v.ammoFill.style.width = (1 - ch.reloadT / RELOAD_TIME) * 100 + "%"; v.ammoFill.style.background = "#ff9f43";
      set("ammoTxt", "reloading", (t) => { v.ammoTxt.textContent = "RELOADING…"; });
    } else {
      v.ammoFill.style.width = (ch.ammo / MAG_SIZE) * 100 + "%"; v.ammoFill.style.background = ch.ammo <= MAG_SIZE * 0.2 ? "#e5484d" : "#ffd060";
      set("ammoTxt", "a" + ch.ammo, () => { v.ammoTxt.textContent = `AMMO ${ch.ammo} / ${MAG_SIZE}`; });
    }
    v.el.classList.toggle("prot", ch.prot > 0 && ch.alive);
    v.el.classList.toggle("dead", !ch.alive);
    if (!ch.alive) set("dead", Math.ceil(ch.respawn), (t) => { v.dead.replaceChildren(document.createTextNode("YOU WERE TAKEN DOWN"), h("small", "", `respawning in ${t}`)); });

    // objective arrow: enemy flag, or your own base when you carry the flag
    const own = flags[ch.team], enemy = flags[1 - ch.team];
    let tx, tz, label;
    if (ch.carrying) { tx = own.home.x; tz = own.home.z; label = "RETURN TO BASE"; }
    else {
      const p = flagPos(enemy); tx = p.x; tz = p.z;
      label = enemy.carrier ? (enemy.carrier.team === ch.team ? "ESCORT YOUR CARRIER" : "ENEMY FLAG") : "ENEMY FLAG";
    }
    const dx = tx - ch.x, dz = tz - ch.z;
    const fwd = dx * -Math.sin(ch.yaw) + dz * -Math.cos(ch.yaw), right = dx * Math.cos(ch.yaw) + dz * -Math.sin(ch.yaw);
    v.arrow.style.transform = `rotate(${Math.atan2(right, fwd)}rad)`;
    const dist = Math.round(Math.hypot(dx, dz));
    set("obj", label + dist, () => { v.objTxt.textContent = `${label} · ${dist} m`; });
    // message
    let m = "";
    if (ch.alive) {
      if (ch.carrying) m = "🚩 YOU HAVE THE FLAG! Run to your base!";
      else if (own.carrier) m = `⚠ ${nameOf(own.carrier)} has YOUR flag: stop them!`;
      else if (!own.atHome) m = "Your flag is on the ground: touch it to send it home";
      else if (ch.hp < 35) m = "Low health: find a med-kit in the middle room";
    }
    set("msg", m, (t) => { v.msg.textContent = t; });
  }
  function updateScore() {
    const clock = overtime ? "OVERTIME" : fmtClock(Math.ceil(matchT));
    if (firstTo.dataset.t !== clock) {
      firstTo.dataset.t = clock;
      firstTo.replaceChildren(document.createTextNode(clock), h("small", "", overtime ? "NEXT CAPTURE WINS" : "TIME LEFT"));
      firstTo.classList.toggle("low", overtime || matchT <= 30);
    }
    for (let t = 0; t < 2; t++) {
      const f = flags[t], s = scoreTeams[t];
      const txt = f.carrier ? `TAKEN by ${nameOf(f.carrier)}` : f.atHome ? "FLAG HOME" : "FLAG DROPPED";
      if (s.n.textContent !== String(caps[t])) s.n.textContent = caps[t];
      if (s.last !== txt) { s.last = txt; s.sm.textContent = txt; }
    }
  }

  const lobbyCam = new THREE.PerspectiveCamera(60, 16 / 9, 0.1, 500);
  function update(dt) {
    tNow += dt;
    animateWorld();
    if (phase === "teams") {
      const a = tNow * 0.15;                                         // slow fly-around above the middle room while choosing teams
      lobbyCam.position.set(mid.x + Math.cos(a) * 16, floorTop + 17, mid.z + Math.sin(a) * 14);
      lobbyCam.lookAt(mid.x, floorTop + 1, mid.z);
    } else {
      if (phase === "count") {
        countT -= dt;
        if (countT <= 0) { phase = "play"; banner("GO!", "", 1); }
        else bannerEl.firstChild?.nodeValue !== String(Math.ceil(countT)) && banner(String(Math.ceil(countT)), "get ready", 1.2);
      }
      for (const ch of chars.values()) updateChar(ch, dt, phase === "play");
      if (phase === "play") { updateClock(dt); if (phase === "play") updateObjectives(dt); }
      if (phase === "over") { overT -= dt; if (overT <= 0) toTeams(); }
      for (const v of views) updateHud(v);
      updateScore();
    }
    if (bannerT > 0) { bannerT -= dt; if (bannerT <= 0) bannerEl.style.display = "none"; }
    for (let i = temps.length - 1; i >= 0; i--) {
      const t = temps[i]; t.life -= dt;
      if (t.life <= 0) {
        scene.remove(t.obj); t.obj.material.dispose(); if (t.dispose) t.obj.geometry.dispose();
        temps.splice(i, 1);
      } else t.obj.material.opacity = Math.min(1, t.life / 0.08);
    }
    for (let i = feedItems.length - 1; i >= 0; i--) {
      feedItems[i].t -= dt;
      if (feedItems[i].t <= 0) { feedItems[i].row.remove(); feedItems.splice(i, 1); }
    }
  }

  function render() {
    renderer.setScissorTest(true);
    if (phase === "teams") {
      lobbyCam.aspect = W / HH; lobbyCam.updateProjectionMatrix();
      renderer.setViewport(0, 0, W, HH); renderer.setScissor(0, 0, W, HH);
      renderer.render(scene, lobbyCam);
      return;
    }
    for (const ch of chars.values()) ch.av.group.visible = ch.alive;
    for (const v of views) {
      const ch = v.ch, [rx, ry, rw, rh] = ch.rect;
      const x = rx * W, w = rw * W, hh = rh * HH, y = HH - ry * HH - hh;
      const aspect = w / hh;
      ch.cam.aspect = aspect;
      ch.cam.fov = clampN(2 * Math.atan(Math.tan((85 / 2) * Math.PI / 180) / aspect) * 180 / Math.PI, 50, 85);   // keeps a wide view in narrow cells
      ch.cam.updateProjectionMatrix();
      renderer.setViewport(x, y, w, hh); renderer.setScissor(x, y, w, hh);
      ch.av.group.visible = false;                                    // first person: you never see your own body
      renderer.render(scene, ch.cam);
      ch.av.group.visible = ch.alive;
    }
  }

  /* ---------------- events from the console ---------------- */
  for (const p of ctx.players()) roster.set(p.slot, { pos: 0, ready: false, latch: false });
  on(window, "player-join", (e) => {
    const { slot } = e.detail;
    if (!roster.has(slot)) roster.set(slot, { pos: 0, ready: false, latch: false });
    ctx.send(slot, { type: "ctf-mode", mode: modeFor(slot) });
    if (phase === "teams") { renderLobby(); lobbyHud(slot); }
    else ctx.send(slot, { type: "hud", text: "Match running: you join next round", down: false });
  });
  on(window, "player-leave", (e) => {
    const { slot } = e.detail;
    roster.delete(slot);
    const ch = chars.get(slot);
    if (ch) {
      removeChar(ch); chars.delete(slot);
      if (phase !== "teams") { layoutViews(); updateStats(); checkAbort(); }
    }
    if (phase === "teams") { renderLobby(); checkStart(); }
  });
  on(window, "controller-input", (e) => {
    const { slot, data } = e.detail || {};
    if (!data) return;
    if (data.type === "ctf") {                                      // twin sticks + fire (play mode)
      const ch = chars.get(slot);
      if (!ch) return;
      ch.input.mx = stickVal(data.mx); ch.input.my = stickVal(data.my);
      ch.input.fire = !!data.fire;
      ch.inputAt = performance.now();
      // look + reload arrive as running totals: act on the change since the last message
      const lookX = +data.lookX || 0, lookY = +data.lookY || 0, rl = data.rl | 0;
      if (ch.sid !== data.sid) { ch.sid = data.sid; ch.lookPX = lookX; ch.lookPY = lookY; ch.rlSeen = rl; }   // new page load: start counting from here
      const dX = lookX - ch.lookPX, dY = lookY - ch.lookPY;
      ch.lookPX = lookX; ch.lookPY = lookY;
      if (ch.alive) { ch.lookDX += clampN(dX, -2, 2); ch.lookDY += clampN(dY, -2, 2); }
      if (rl !== ch.rlSeen) { ch.rlSeen = rl; startReload(ch); }
    } else if (data.type === "move") lobbyMove(slot, stickVal(data.x));
    else if (data.type === "button") lobbyButton(slot, data.id, !!data.pressed);
  });

  /* ---------------- go ---------------- */
  renderLobby();
  for (const slot of roster.keys()) lobbyHud(slot);
  renderer.shadowMap.needsUpdate = true;
  let last = performance.now(), raf = 0;
  function frame(now) {
    raf = requestAnimationFrame(frame);
    const dt = Math.min(0.05, (now - last) / 1000); last = now;
    update(dt); render();
  }
  raf = requestAnimationFrame(frame);

  // phones: keep their pad mode right (a message can be missed while the pad is still loading) + refresh the health bar
  const phoneTimer = setInterval(() => {
    sendModes();
    if (phase === "teams") for (const slot of roster.keys()) lobbyHud(slot);
  }, 1500);
  const hudTimer = setInterval(() => { if (phase !== "teams") for (const ch of chars.values()) sendPhoneHud(ch); }, 300);
  const statsTimer = setInterval(updateStats, 700);

  return {
    destroy() {
      cancelAnimationFrame(raf);
      clearInterval(phoneTimer); clearInterval(hudTimer); clearInterval(statsTimer);
      ro?.disconnect();
      for (const slot of roster.keys()) {                            // phones back to the plain pad
        ctx.send(slot, { type: "ctf-mode", mode: "select" });
        ctx.send(slot, { type: "hud", text: "", down: false });
      }
      for (const ch of chars.values()) removeChar(ch);
      chars.clear();
      world.traverse((o) => { o.geometry?.dispose(); });
      tex?.dispose(); mapMat?.dispose(); plain.dispose();
      try { audio?.close(); } catch {}
      renderer.dispose();
      renderer.forceContextLoss?.();
      style.remove();
    },
  };
}