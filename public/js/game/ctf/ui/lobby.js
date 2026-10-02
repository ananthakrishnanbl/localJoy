// Team + character select: 3D previews, lobby layout, and the stick / button handling.

import { ANIM, CHAR_COUNT, MATCH_TIME, START_GUNS, TEAMS } from "../config.js";
import { clampN, h } from "../utils.js";

export function setupLobby(G) {
  const S = G.S;
  const {
    ctx, THREE, renderer, makeAvatar, playAnim, setHandGunId, holdPose, groundAvatar, tintAvatar,
    disposeAvatar, roster, vibrate, lobbyEl, fmtClock
  } = G;
  // functions from modules that are set up later: looked up on G at the moment they are called
  const startMatch = (...a) => G.startMatch(...a);

  /* ---------------- team select (the normal pad) ---------------- */
  function lobbyHint() {
    const list = [...roster.values()];
    if (list.length < 2) return "Waiting for at least 2 players…";
    if (list.some((r) => r.pos === 0)) return "Move your stick ◀ ▶ to pick a team, then press A";
    if (list.some((r) => r.stage === "char" && !r.ready)) return "Stick ◀ ▶ = choose your character · A = ready · B = back";
    const ready = list.filter((r) => r.ready).length;
    if (ready === list.length) return "Both teams need at least one player";
    return `Press A when you are ready  (${ready}/${list.length} ready)   ·   B = cancel`;
  }
  // The screen is cut into one cell per player. Each cell has a live 3D preview of the soldier that player is choosing
  // (3D part: renderPreviews(), text part: renderLobby() - both use lobbyList() + lobbyRects(), so they always line up).
  const LOBBY_TOP = 0.13, LOBBY_BOTTOM = 0.07;                      // title strip / hint strip (fractions of the screen height)
  const lobbyList = () => [...roster.entries()].sort((a, b) => a[0] - b[0]).filter(([slot]) => ctx.player(slot));
  function lobbyRects(n) {                                          // same split as the match: 1 = full, 2 = side by side, 3-4 = 2x2, then 3x2, 3x3, 4x3
    const [cols, rows] = n <= 1 ? [1, 1] : n === 2 ? [2, 1] : n <= 4 ? [2, 2] : n <= 6 ? [3, 2] : n <= 9 ? [3, 3] : [4, 3];
    const hh = 1 - LOBBY_TOP - LOBBY_BOTTOM, out = [];
    for (let i = 0; i < cols * rows; i++) out.push([(i % cols) / cols, LOBBY_TOP + (((i / cols) | 0) * hh) / rows, 1 / cols, hh / rows]);
    return out;
  }
  const prevScene = new THREE.Scene();
  prevScene.add(new THREE.HemisphereLight(0xfff0e0, 0x8a5a44, 1.5));
  { const l = new THREE.DirectionalLight(0xfff2dd, 2.2); l.position.set(2.5, 4, 3.5); prevScene.add(l); }
  const prevCam = new THREE.PerspectiveCamera(34, 1, 0.1, 60);
  const prevBg = [new THREE.Color(0x4a2528), new THREE.Color(0x362a2a), new THREE.Color(0x24324f)];   // red team / undecided / blue team
  const discGeo = new THREE.CylinderGeometry(1.0, 1.05, 0.12, 40), ringGeo = new THREE.RingGeometry(1.1, 1.25, 48).rotateX(-Math.PI / 2);
  const discMat = new THREE.MeshStandardMaterial({ color: 0x4a3a34, roughness: 0.9 });
  const previews = new Map();                                       // slot -> { idx, av, group, ringMat }

  function ensurePreview(slot, r) {
    let p = previews.get(slot);
    if (p && p.idx === r.char) return p;
    if (p) disposePreview(slot);                                    // he picked another character
    const av = makeAvatar(r.char);
    av.marker.visible = false; if (av.sprite) av.sprite.visible = false;   // the name is in the cell header
    const group = new THREE.Group(), ringMat = new THREE.MeshBasicMaterial({ color: 0x8a7a70, side: THREE.DoubleSide });
    const disc = new THREE.Mesh(discGeo, discMat); disc.position.y = -0.06;
    const ring = new THREE.Mesh(ringGeo, ringMat); ring.position.y = 0.01;
    group.add(disc, ring, av.group); group.visible = false; prevScene.add(group);
    if (av.mixer) { setHandGunId(av, START_GUNS[0]); playAnim(av, ANIM.idle); }
    else av.armR.rotation.x = -Math.PI / 2;                         // block soldier: gun arm forward
    p = { idx: r.char, av, group, ringMat };
    previews.set(slot, p);
    return p;
  }
  function disposePreview(slot) {
    const p = previews.get(slot); if (!p) return;
    prevScene.remove(p.group); disposeAvatar(p.av); p.ringMat.dispose();
    previews.delete(slot);
  }
  const clearPreviews = () => { for (const slot of [...previews.keys()]) disposePreview(slot); };
  function updatePreviews(dt) {
    const list = lobbyList(), here = new Set(list.map(([slot]) => slot));
    for (const slot of [...previews.keys()]) if (!here.has(slot)) disposePreview(slot);
    for (const [slot, r] of list) {
      const p = ensurePreview(slot, r), av = p.av, team = r.pos < 0 ? 0 : r.pos > 0 ? 1 : -1;
      p.ringMat.color.set(team < 0 ? 0x8a7a70 : TEAMS[team].hex);
      av.group.rotation.y = S.tNow * 0.8 + slot * 1.7;                // slow turntable
      if (av.mixer) {
        tintAvatar(av, team < 0 ? 0xffffff : TEAMS[team].hex);
        av.mixer.update(dt);
        holdPose(av, 0);
        av.group.updateMatrixWorld(true);
        groundAvatar(av, 0);
      } else av.cloth?.color.set(ctx.player(slot)?.color || "#888888");
    }
  }
  function renderPreviews() {
    renderer.setScissorTest(false);
    renderer.setViewport(0, 0, S.W, S.HH);
    renderer.setClearColor(0x2b1d1a, 1); renderer.clear();
    renderer.setScissorTest(true);
    const list = lobbyList(), rects = lobbyRects(list.length);
    list.forEach(([slot, r], i) => {
      const p = previews.get(slot); if (!p) return;
      const [rx, ry, rw, rh] = rects[i];
      const x = rx * S.W, w = rw * S.W, hh = rh * S.HH, y = S.HH - ry * S.HH - hh, aspect = w / hh;
      renderer.setViewport(x, y, w, hh); renderer.setScissor(x, y, w, hh);
      prevCam.aspect = aspect; prevCam.updateProjectionMatrix();
      const tanHalf = Math.tan((prevCam.fov * Math.PI) / 360), dist = Math.max(5, 2.2 / (2 * tanHalf * aspect));   // whole body AND turning gun always fit
      prevCam.position.set(0, 1.0, dist); prevCam.lookAt(0, 0.72, 0);
      prevScene.background = prevBg[r.pos < 0 ? 0 : r.pos > 0 ? 2 : 1];
      for (const q of previews.values()) q.group.visible = q === p;
      renderer.render(prevScene, prevCam);
    });
  }

  function renderLobby() {
    lobbyEl.replaceChildren();
    const head = h("div", "ctf-head");
    head.append(h("h1", "", "🚩 CAPTURE THE FLAG"), h("p", "", `Steal the enemy flag from the far end room · bring it home · most captures in ${fmtClock(MATCH_TIME)} wins`));
    lobbyEl.append(head);
    const list = lobbyList();
    lobbyRects(list.length).forEach((rc, i) => {
      const el = h("div", "ctf-cell"), entry = list[i];
      Object.assign(el.style, { left: rc[0] * 100 + "%", top: rc[1] * 100 + "%", width: rc[2] * 100 + "%", height: rc[3] * 100 + "%" });
      lobbyEl.append(el);
      if (!entry) { el.classList.add("empty"); el.append(h("span", "", list.length ? "open slot" : "Waiting for players…")); return; }
      const [, r] = entry, info = ctx.player(entry[0]), team = r.pos < 0 ? 0 : r.pos > 0 ? 1 : -1;
      if (team >= 0) el.classList.add("t" + team);
      if (r.ready) el.classList.add("ready");
      const top = h("div", "ctf-ctop"), dot = h("i"), tag = h("b", "", team >= 0 ? TEAMS[team].name : "NO TEAM");
      dot.style.background = info.color; tag.style.background = team >= 0 ? TEAMS[team].color : "rgba(0,0,0,.55)";
      top.append(dot, h("span", "", `${info.animal || ""} ${info.name}`), tag);
      const bot = h("div", "ctf-cbot");
      if (r.ready) bot.append(h("div", "ctf-badge", "READY ✔"), h("small", "", `character ${r.char + 1} · B = cancel`));
      else if (r.stage === "char") bot.append(h("div", "ctf-pick", `◀  CHARACTER ${r.char + 1} / ${CHAR_COUNT}  ▶`), h("small", "", "A = ready · B = back to team"));
      else {
        const row = h("div", "ctf-pick");
        const pr = h("span", "ctf-pill" + (team === 0 ? " on" : ""), "RED"), pb = h("span", "ctf-pill" + (team === 1 ? " on" : ""), "BLUE");
        pr.style.background = team === 0 ? TEAMS[0].color : ""; pb.style.background = team === 1 ? TEAMS[1].color : "";
        row.append(h("span", "", "◀"), pr, pb, h("span", "", "▶"));
        bot.append(row, h("small", "", team < 0 ? "move the stick ◀ ▶ to pick a team" : "A = confirm team"));
      }
      el.append(top, bot);
    });
    const foot = h("div", "ctf-foot"); foot.append(h("div", "ctf-hint", lobbyHint()));
    lobbyEl.append(foot);
  }
  const lastLobbyHud = new Map();
  function lobbyHud(slot) {
    const r = roster.get(slot); if (!r) return;
    const text = r.ready ? `READY ✔ · character ${r.char + 1}  (B = cancel)`
      : r.pos === 0 ? "Stick ◀ ▶ = pick a team"
      : r.stage === "char" ? `◀ ▶ character ${r.char + 1} of ${CHAR_COUNT} · A = ready · B = back`
      : `${TEAMS[r.pos < 0 ? 0 : 1].name} team · press A`;
    if (lastLobbyHud.get(slot) === text) return;
    lastLobbyHud.set(slot, text);
    ctx.send(slot, { type: "hud", text, down: false });
  }
  function lobbyMove(slot, x) {
    const r = roster.get(slot);
    if (S.phase !== "teams" || !r || r.ready) return;
    if (Math.abs(x) < 0.55) { r.latch = false; return; }
    if (r.latch) return;
    r.latch = true;
    if (r.stage === "char") {                                         // cycle through the characters
      r.char = (r.char + Math.sign(x) + CHAR_COUNT) % CHAR_COUNT;
      vibrate(slot, 12); renderLobby(); lobbyHud(slot); return;
    }
    const next = clampN(r.pos + Math.sign(x), -1, 1);
    if (next !== r.pos) { r.pos = next; vibrate(slot, 12); renderLobby(); lobbyHud(slot); }
  }
  function lobbyButton(slot, id, pressed) {
    const r = roster.get(slot);
    if (S.phase !== "teams" || !r || !pressed) return;
    if (id === "A") {
      if (r.pos === 0) { vibrate(slot, [30, 40, 30]); return; }            // pick a team first
      if (r.stage === "team") { r.stage = "char"; r.latch = true; vibrate(slot, 20); }   // team chosen -> choose a character
      else if (!r.ready) { r.ready = true; vibrate(slot, 25); }
    } else if (id === "B") {
      if (r.ready) r.ready = false;
      else if (r.stage === "char") r.stage = "team";
      else r.pos = 0;
      vibrate(slot, 15);
    } else return;
    renderLobby(); lobbyHud(slot); checkStart();
  }
  function checkStart() {
    if (S.phase !== "teams") return;
    const list = [...roster.values()];
    if (list.length < 2 || !list.every((r) => r.ready && r.pos !== 0 && r.stage === "char")) return;
    if (!list.some((r) => r.pos < 0) || !list.some((r) => r.pos > 0)) return;
    startMatch();
  }

  // shared with the modules set up after this one
  Object.assign(G, {
    discGeo, ringGeo, discMat, clearPreviews, updatePreviews, renderPreviews, renderLobby, lastLobbyHud,
    lobbyHud, lobbyMove, lobbyButton, checkStart
  });
}
