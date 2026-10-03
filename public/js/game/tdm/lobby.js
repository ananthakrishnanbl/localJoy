// TEAM DEATHMATCH  -  /js/game/tdm/lobby.js
// The select screen: every player picks RED, SOLO or BLUE with the stick (A = confirm), then a character (A = ready, B = back).
// The screen is cut into one cell per player, each with a live 3D preview of the soldier that player is choosing.
import { TEAMS, SIDES, CHAR_COUNT, MATCH_TIME, MAX_FIGHTERS, START_GUNS, ANIM, clampN, h, fmtClock } from "./config.js";

export function createLobby(S) {
  const { THREE, ctx, dim, renderer, roster, st, models } = S;
  const { makeAvatar, setHandGunId, playAnim, tintAvatar, holdPose, groundAvatar, disposeAvatar } = models;
  const lobbyEl = S.ui.lobbyEl, vibrate = (slot, ms) => ctx.send(slot, { type: "vibrate", ms });

  /* ---------------- who picked what ---------------- */
  // r.side: -1 = not chosen yet, 0 = RED team, 1 = SOLO, 2 = BLUE team   (index into SIDES)
  const factionKey = (slot, r) => (SIDES[r.side].team >= 0 ? "t" + SIDES[r.side].team : "s" + slot);
  const sideHex = (slot, r) => r.side === 0 ? TEAMS[0].hex : r.side === 2 ? TEAMS[1].hex : r.side === 1 ? new THREE.Color(ctx.player(slot)?.color || "#888888").getHex() : 0xffffff;
  const sideCss = (r) => (r.side < 0 ? "rgba(0,0,0,.55)" : SIDES[r.side].color);

  function lobbyHint() {
    const list = [...roster.values()];
    if (list.length < 2) return "Waiting for at least 2 players…";
    if (list.some((r) => r.side < 0)) return "Move your stick ◀ ▶ : RED team · SOLO · BLUE team, then press A";
    if (list.some((r) => r.stage === "char" && !r.ready)) return "Stick ◀ ▶ = choose your character · A = ready · B = back";
    const ready = list.filter((r) => r.ready).length;
    if (ready === list.length) return "Need at least two sides: two teams, or a team + a solo player, or two solo players";
    return `Press A when you are ready  (${ready}/${list.length} ready)   ·   B = cancel`;
  }
  const LOBBY_TOP = 0.13, LOBBY_BOTTOM = 0.07;                      // title strip / hint strip (fractions of the screen height)
  const lobbyList = () => [...roster.entries()].sort((a, b) => a[0] - b[0]).filter(([slot]) => ctx.player(slot));
  function lobbyRects(n) {                                          // same split as the match: 1 = full, 2 = side by side, 3-4 = 2x2, then 3x2, 3x3, 4x3
    const [cols, rows] = n <= 1 ? [1, 1] : n === 2 ? [2, 1] : n <= 4 ? [2, 2] : n <= 6 ? [3, 2] : n <= 9 ? [3, 3] : [4, 3];
    const hh = 1 - LOBBY_TOP - LOBBY_BOTTOM, out = [];
    for (let i = 0; i < cols * rows; i++) out.push([(i % cols) / cols, LOBBY_TOP + (((i / cols) | 0) * hh) / rows, 1 / cols, hh / rows]);
    return out;
  }

  /* ---------------- 3D previews ---------------- */
  const prevScene = new THREE.Scene();
  prevScene.add(new THREE.HemisphereLight(0xfff0e0, 0x8a5a44, 1.5));
  { const l = new THREE.DirectionalLight(0xfff2dd, 2.2); l.position.set(2.5, 4, 3.5); prevScene.add(l); }
  const prevCam = new THREE.PerspectiveCamera(34, 1, 0.1, 60);
  const prevBg = [new THREE.Color(0x362a2a), new THREE.Color(0x4a2528), new THREE.Color(0x23382b), new THREE.Color(0x24324f)];   // index = side + 1: none / red / solo / blue
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
      const p = ensurePreview(slot, r), av = p.av, hex = sideHex(slot, r);
      p.ringMat.color.set(r.side < 0 ? 0x8a7a70 : hex);
      av.group.rotation.y = st.tNow * 0.8 + slot * 1.7;             // slow turntable
      if (av.mixer) {
        tintAvatar(av, hex);
        av.mixer.update(dt);
        holdPose(av, 0);
        av.group.updateMatrixWorld(true);
        groundAvatar(av, 0);
      } else av.cloth?.color.set(ctx.player(slot)?.color || "#888888");
    }
  }
  function renderPreviews() {
    const { W, HH } = dim;
    renderer.setScissorTest(false);
    renderer.setViewport(0, 0, W, HH);
    renderer.setClearColor(0x2b1d1a, 1); renderer.clear();
    renderer.setScissorTest(true);
    const list = lobbyList(), rects = lobbyRects(list.length);
    list.forEach(([slot, r], i) => {
      const p = previews.get(slot); if (!p) return;
      const [rx, ry, rw, rh] = rects[i];
      const x = rx * W, w = rw * W, hh = rh * HH, y = HH - ry * HH - hh, aspect = w / hh;
      renderer.setViewport(x, y, w, hh); renderer.setScissor(x, y, w, hh);
      prevCam.aspect = aspect; prevCam.updateProjectionMatrix();
      const tanHalf = Math.tan((prevCam.fov * Math.PI) / 360), dist = Math.max(5, 2.2 / (2 * tanHalf * aspect));   // whole body AND turning gun always fit
      prevCam.position.set(0, 1.0, dist); prevCam.lookAt(0, 0.72, 0);
      prevScene.background = prevBg[r.side + 1];
      for (const q of previews.values()) q.group.visible = q === p;
      renderer.render(prevScene, prevCam);
    });
  }

  /* ---------------- the text part of the select screen ---------------- */
  function renderLobby() {
    lobbyEl.replaceChildren();
    const head = h("div", "tdm-head");
    head.append(h("h1", "", "⚔️ TEAM DEATHMATCH"), h("p", "", `Pick RED, BLUE or go SOLO · take out everyone who is not on your side · most kills in ${fmtClock(MATCH_TIME)} wins`));
    lobbyEl.append(head);
    const list = lobbyList();
    lobbyRects(list.length).forEach((rc, i) => {
      const el = h("div", "tdm-cell"), entry = list[i];
      Object.assign(el.style, { left: rc[0] * 100 + "%", top: rc[1] * 100 + "%", width: rc[2] * 100 + "%", height: rc[3] * 100 + "%" });
      lobbyEl.append(el);
      if (!entry) { el.classList.add("empty"); el.append(h("span", "", list.length ? "open slot" : "Waiting for players…")); return; }
      const [, r] = entry, info = ctx.player(entry[0]);
      if (r.side >= 0) el.classList.add(r.side === 0 ? "t0" : r.side === 2 ? "t1" : "ts");
      if (r.ready) el.classList.add("ready");
      const top = h("div", "tdm-ctop"), dot = h("i"), tag = h("b", "", r.side >= 0 ? SIDES[r.side].name : "NO SIDE");
      dot.style.background = info.color; tag.style.background = sideCss(r);
      top.append(dot, h("span", "", `${info.animal || ""} ${info.name}`), tag);
      const bot = h("div", "tdm-cbot");
      if (r.ready) bot.append(h("div", "tdm-badge", "READY ✔"), h("small", "", `character ${r.char + 1} · B = cancel`));
      else if (r.stage === "char") bot.append(h("div", "tdm-pick", `◀  CHARACTER ${r.char + 1} / ${CHAR_COUNT}  ▶`), h("small", "", "A = ready · B = back to side"));
      else {
        const row = h("div", "tdm-pick");
        row.append(h("span", "", "◀"));
        SIDES.forEach((s, k) => {
          const pill = h("span", "tdm-pill" + (r.side === k ? " on" : ""), s.name);
          if (r.side === k) pill.style.background = s.color;
          row.append(pill);
        });
        row.append(h("span", "", "▶"));
        bot.append(row, h("small", "", r.side < 0 ? "move the stick ◀ ▶ to pick RED, SOLO or BLUE" : "A = confirm"));
      }
      el.append(top, bot);
    });
    const foot = h("div", "tdm-foot"); foot.append(h("div", "tdm-hint", lobbyHint()));
    lobbyEl.append(foot);
  }

  /* ---------------- phone text + input on the select screen ---------------- */
  const lastLobbyHud = new Map();
  function lobbyHud(slot) {
    const r = roster.get(slot); if (!r) return;
    const text = r.ready ? `READY ✔ · ${SIDES[r.side].name} · character ${r.char + 1}  (B = cancel)`
      : r.side < 0 ? "Stick ◀ ▶ = RED · SOLO · BLUE"
      : r.stage === "char" ? `${SIDES[r.side].name} · ◀ ▶ character ${r.char + 1} of ${CHAR_COUNT} · A = ready · B = back`
      : `${SIDES[r.side].name} · press A`;
    if (lastLobbyHud.get(slot) === text) return;
    lastLobbyHud.set(slot, text);
    ctx.send(slot, { type: "hud", text, down: false });
  }
  function lobbyMove(slot, x) {
    const r = roster.get(slot);
    if (st.phase !== "teams" || !r || r.ready) return;
    if (Math.abs(x) < 0.55) { r.latch = false; return; }
    if (r.latch) return;
    r.latch = true;
    if (r.stage === "char") {                                         // cycle through the characters
      r.char = (r.char + Math.sign(x) + CHAR_COUNT) % CHAR_COUNT;
      vibrate(slot, 12); renderLobby(); lobbyHud(slot); return;
    }
    const next = r.side < 0 ? (x < 0 ? 0 : 2) : clampN(r.side + Math.sign(x), 0, 2);   // first move: left = RED, right = BLUE; then RED ↔ SOLO ↔ BLUE
    if (next !== r.side) { r.side = next; vibrate(slot, 12); renderLobby(); lobbyHud(slot); }
  }
  function lobbyButton(slot, id, pressed) {
    const r = roster.get(slot);
    if (st.phase !== "teams" || !r || !pressed) return;
    if (id === "A") {
      if (r.side < 0) { vibrate(slot, [30, 40, 30]); return; }            // pick a side first
      if (r.stage === "team") { r.stage = "char"; r.latch = true; vibrate(slot, 20); }   // side chosen -> choose a character
      else if (!r.ready) { r.ready = true; vibrate(slot, 25); }
    } else if (id === "B") {
      if (r.ready) r.ready = false;
      else if (r.stage === "char") r.stage = "team";
      else r.side = -1;
      vibrate(slot, 15);
    } else return;
    renderLobby(); lobbyHud(slot); S.game.checkStart();
  }
  // can the match start? everybody ready, and at least two sides (a side = RED team, BLUE team, or one solo player)
  function canStart() {
    const list = [...roster.entries()].sort((a, b) => a[0] - b[0]);
    if (list.length < 2 || !list.every(([, r]) => r.ready && r.side >= 0 && r.stage === "char")) return false;
    return new Set(list.slice(0, MAX_FIGHTERS).map(([slot, r]) => factionKey(slot, r))).size >= 2;   // only the first four fight
  }
  function show() { lastLobbyHud.clear(); lobbyEl.style.display = "flex"; renderLobby(); for (const slot of roster.keys()) lobbyHud(slot); }
  function hide() { lobbyEl.style.display = "none"; }
  function dispose() { clearPreviews(); discGeo.dispose(); ringGeo.dispose(); discMat.dispose(); }

  return { renderLobby, lobbyHud, lobbyMove, lobbyButton, canStart, factionKey, updatePreviews, renderPreviews, clearPreviews, show, hide, dispose, lastLobbyHud };
}
