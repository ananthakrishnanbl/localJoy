// TEAM DEATHMATCH  -  /js/game/tdm/ui.js
// Everything drawn on top of the 3D view during a match: the CSS, split-screen cells + HUD, the score bar, the kill feed,
// the big banner, and the render() that draws every player's view. (The team / solo select screen is in lobby.js.)
import { START_HP, GUNS, SIDES, RESPAWN_TIME, MATCH_TIME, clampN, h, fmtClock } from "./config.js";

export const CSS = `
.tdm-wrap{position:relative;width:100%;aspect-ratio:16/9;max-width:100%;max-height:100%;margin:auto;background:#2b1d1a;overflow:hidden;
  color:#f6dcc2;font-family:Fredoka,Georgia,system-ui,sans-serif;font-size:16px;line-height:1.2;user-select:none;-webkit-user-select:none}
.tdm-wrap canvas{position:absolute;left:0;top:0;width:100%;height:100%;display:block}
.tdm-ui{position:absolute;inset:0;pointer-events:none}
.tdm-status{position:absolute;inset:0;z-index:30;display:flex;align-items:center;justify-content:center;text-align:center;
  white-space:pre-line;background:#2b1d1a;padding:2em;font-size:1.3em}
.tdm-panel{background:rgba(43,29,26,.78);border-radius:.5em;padding:.35em .8em}

.tdm-vp{position:absolute;overflow:hidden;box-shadow:inset 0 0 0 2px #2b1d1a}
.tdm-vp.prot{box-shadow:inset 0 0 0 2px #2b1d1a,inset 0 0 3em rgba(140,210,255,.55)}
.tdm-xh{position:absolute;left:50%;top:50%;width:1.5em;height:1.5em;margin:-.75em 0 0 -.75em}
.tdm-xh::before,.tdm-xh::after{content:'';position:absolute;background:#fff;box-shadow:0 0 2px #000}
.tdm-xh::before{left:calc(50% - 1px);top:0;width:2px;height:100%;-webkit-mask:linear-gradient(#000 0 30%,transparent 30% 70%,#000 70%);mask:linear-gradient(#000 0 30%,transparent 30% 70%,#000 70%)}
.tdm-xh::after{top:calc(50% - 1px);left:0;height:2px;width:100%;-webkit-mask:linear-gradient(90deg,#000 0 30%,transparent 30% 70%,#000 70%);mask:linear-gradient(90deg,#000 0 30%,transparent 30% 70%,#000 70%)}
.tdm-hm{position:absolute;left:50%;top:50%;width:2.2em;height:2.2em;margin:-1.1em 0 0 -1.1em;opacity:0}
.tdm-hm::before,.tdm-hm::after{content:'';position:absolute;left:calc(50% - 1px);top:0;width:3px;height:100%;background:#ff5a5f;box-shadow:0 0 3px #000;transform:rotate(45deg)}
.tdm-hm::after{transform:rotate(-45deg)}
.tdm-dmg{position:absolute;inset:0;opacity:0;box-shadow:inset 0 0 6em 1.5em rgba(229,72,77,.85)}
.tdm-hdir{position:absolute;left:50%;top:50%;width:0;height:0;opacity:0}
.tdm-hdir::before{content:'';position:absolute;left:-3em;top:-9em;width:6em;height:1.6em;border-radius:50%;background:radial-gradient(ellipse at 50% 100%,rgba(255,70,75,.95),rgba(255,70,75,0) 70%)}
.tdm-ammo{position:relative;margin-top:.4em;height:1.05em;border-radius:.6em;background:rgba(0,0,0,.45);overflow:hidden}
.tdm-ammo i{position:absolute;left:0;top:0;bottom:0;border-radius:.6em;background:#ffd060}
.tdm-ammo b{position:absolute;inset:0;text-align:center;font-size:.8em;line-height:1.3em;text-shadow:0 1px 2px #000;color:#fff;letter-spacing:.06em}
.tdm-me{position:absolute;left:.6em;top:.6em;min-width:13em}
.tdm-who{display:flex;align-items:center;gap:.45em;font-weight:700;font-size:1.05em}
.tdm-dot{width:.9em;height:.9em;border-radius:50%;border:2px solid rgba(255,255,255,.8);flex:0 0 auto}
.tdm-tag{margin-left:auto;font-size:.8em;padding:.1em .5em;border-radius:1em;color:#fff;letter-spacing:.06em}
.tdm-hp{position:relative;height:1.05em;margin-top:.4em;border-radius:.6em;background:rgba(0,0,0,.45);overflow:hidden}
.tdm-hp i{position:absolute;left:0;top:0;bottom:0;border-radius:.6em}
.tdm-hp .trail{background:rgba(255,255,255,.55);transition:none}
.tdm-hp .fill{transition:width .12s linear,background .3s}
.tdm-hp b{position:absolute;inset:0;text-align:center;font-size:.8em;line-height:1.3em;text-shadow:0 1px 2px #000;color:#fff}
.tdm-kd{margin-top:.3em;font-size:.8em;opacity:.85}
.tdm-obj{position:absolute;left:50%;top:.6em;transform:translateX(-50%);display:flex;align-items:center;gap:.5em;font-size:.85em;white-space:nowrap}
.tdm-arrow{display:inline-block;font-size:1.5em;line-height:1;color:#ffd060;text-shadow:0 1px 2px #000}
.tdm-msg{position:absolute;left:0;right:0;bottom:5em;text-align:center;font-size:1.05em;font-weight:700;text-shadow:0 2px 4px #000,0 0 8px #000}
.tdm-dead{position:absolute;inset:0;display:none;align-items:center;justify-content:center;flex-direction:column;
  background:rgba(40,8,8,.6);font-size:1.6em;font-weight:700;text-shadow:0 2px 4px #000}
.tdm-dead small{font-size:.55em;opacity:.8;margin-top:.3em}
.tdm-vp.dead .tdm-dead{display:flex}
.tdm-stats{position:absolute;display:flex;flex-direction:column;justify-content:center;gap:.5em;padding:1.2em;background:#2b1d1a;box-sizing:border-box}
.tdm-stats h3{margin:0 0 .3em;font-size:1.1em;letter-spacing:.08em;opacity:.8}
.tdm-row{display:flex;align-items:center;gap:.5em;font-size:.95em}
.tdm-row span{margin-left:auto;opacity:.85;font-size:.85em}

.tdm-score{position:absolute;left:50%;bottom:0;transform:translateX(-50%);display:flex;align-items:stretch;gap:.3em;
  padding:.3em .4em;background:rgba(43,29,26,.85);border-radius:.7em .7em 0 0}
.tdm-team{min-width:6.2em;text-align:center;padding:.15em .5em;border-radius:.45em;color:#fff}
.tdm-team b{display:block;font-size:.8em;letter-spacing:.1em}
.tdm-team em{display:block;font-style:normal;font-size:1.5em;font-weight:700;line-height:1.05}
.tdm-team small{display:block;font-size:.65em;opacity:.9;letter-spacing:.05em;white-space:nowrap}
.tdm-first{align-self:center;font-size:1.05em;font-weight:700;opacity:.95;text-align:center;padding:0 .4em;min-width:3.6em;font-variant-numeric:tabular-nums;line-height:1.1}
.tdm-first.low{color:#ff6b6b;opacity:1}
.tdm-first small{display:block;font-size:.55em;letter-spacing:.1em;opacity:.8;font-weight:600}
.tdm-feed{position:absolute;right:.6em;top:.6em;display:flex;flex-direction:column;gap:.25em;align-items:flex-end;font-size:.8em}
.tdm-feed div{padding:.2em .6em;border-radius:.4em;background:rgba(43,29,26,.8)}
.tdm-banner{position:absolute;left:0;right:0;top:34%;text-align:center;display:none;font-weight:700;font-size:4.2em;
  text-shadow:0 4px 0 rgba(0,0,0,.35),0 0 14px rgba(0,0,0,.6);color:#fff3e0}
.tdm-banner small{display:block;font-size:.3em;margin-top:.3em;letter-spacing:.06em}

.tdm-lobby{position:absolute;inset:0}
.tdm-head{position:absolute;left:0;right:0;top:0;height:13%;display:flex;flex-direction:column;align-items:center;justify-content:center;background:#2b1d1a}
.tdm-head h1{margin:0;font-size:2.2em;letter-spacing:.08em;text-shadow:0 3px 0 rgba(0,0,0,.35)}
.tdm-head p{margin:.25em 0 0;opacity:.85;font-size:.95em}
.tdm-foot{position:absolute;left:0;right:0;bottom:0;height:7%;display:flex;align-items:center;justify-content:center;background:#2b1d1a}
.tdm-hint{font-size:1.2em;font-weight:700;color:#ffd060}
.tdm-cell{position:absolute;box-sizing:border-box;border:.2em solid rgba(255,255,255,.16);display:flex;flex-direction:column;justify-content:space-between;padding:.45em .6em;overflow:hidden}
.tdm-cell.t0{border-color:#e5484d}.tdm-cell.t1{border-color:#3b8bff}
.tdm-cell.ready{box-shadow:inset 0 0 2.5em rgba(70,211,107,.6)}
.tdm-cell.empty{align-items:center;justify-content:center;border-style:dashed;background:rgba(43,29,26,.9);opacity:.7;font-size:1.1em}
.tdm-ctop{display:flex;align-items:center;gap:.5em;font-weight:700;font-size:1.15em;text-shadow:0 2px 4px #000}
.tdm-ctop i{width:.9em;height:.9em;border-radius:50%;border:2px solid #fff;flex:0 0 auto}
.tdm-ctop b{margin-left:auto;font-size:.7em;padding:.1em .6em;border-radius:1em;color:#fff;letter-spacing:.08em}
.tdm-cbot{display:flex;flex-direction:column;align-items:center;gap:.15em;text-align:center;text-shadow:0 2px 4px #000;font-weight:700}
.tdm-cbot small{font-size:.75em;opacity:.9;font-weight:600}
.tdm-pick{display:flex;align-items:center;gap:.5em;font-size:1.15em}
.tdm-pill{padding:.05em .8em;border-radius:1em;background:rgba(0,0,0,.5);opacity:.55;color:#fff}
.tdm-pill.on{opacity:1;box-shadow:0 0 0 2px #fff}
.tdm-badge{font-size:1.2em;padding:.05em .9em;border-radius:1em;background:#2fbf71;color:#fff;letter-spacing:.06em}
.tdm-guns{display:flex;gap:.3em;margin-top:.35em;font-size:.72em;font-weight:700;letter-spacing:.05em}
.tdm-guns span{flex:1;text-align:center;padding:.15em .3em;border-radius:.4em;background:rgba(0,0,0,.35);opacity:.55}
.tdm-guns span.on{background:#ffd060;color:#2b1d1a;opacity:1}
.tdm-cell.ts{border-color:#46c37b}
.tdm-score{max-width:96%;flex-wrap:nowrap}
.tdm-team.solo{min-width:5.2em}
.tdm-obj.hide{display:none}
`;

export function createUI(S) {
  const { THREE, wrap, status, ctx, dim, renderer, scene, chars, st, floorTop, models } = S;
  const { viewScene, viewCam, viewGunPos } = models;
  const fac = S.fac;

  /* ---------------- layers ---------------- */
  const ui = h("div", "tdm-ui");
  const scoreEl = h("div", "tdm-score");
  const feedEl = h("div", "tdm-feed");
  const bannerEl = h("div", "tdm-banner");
  const lobbyEl = h("div", "tdm-lobby");
  const vpLayer = h("div", "tdm-ui");
  ui.append(vpLayer, scoreEl, feedEl, bannerEl, lobbyEl);
  wrap.insertBefore(ui, status);
  status.style.display = "none";
  let views = [];                           // [{ ch, el, ... }]  one per split-screen cell
  let statsEl = null;

  /* ---------------- banner + kill feed ---------------- */
  function banner(text, sub = "", secs = 2) {
    bannerEl.replaceChildren(document.createTextNode(text));
    if (sub) bannerEl.append(h("small", "", sub));
    bannerEl.style.display = "block";
    st.bannerT = secs;
  }
  const feedItems = [];
  function feed(parts) {          // parts: [text, color?] pairs
    const row = h("div");
    for (const [t, c] of parts) { const s = h("span", "", t); if (c) { s.style.color = c; s.style.fontWeight = "700"; } row.append(s); }
    feedEl.append(row); feedItems.push({ row, t: 5 });
    while (feedItems.length > 5) feedItems.shift().row.remove();
  }
  function clearFeed() { feedEl.replaceChildren(); feedItems.length = 0; }
  function tickFeed(dt) {
    for (let i = feedItems.length - 1; i >= 0; i--) {
      feedItems[i].t -= dt;
      if (feedItems[i].t <= 0) { feedItems[i].row.remove(); feedItems.splice(i, 1); }
    }
  }

  /* ---------------- score bar: one box per side (RED, BLUE, every solo player) with the clock in the middle ---------------- */
  const clockEl = h("div", "tdm-first");
  let scoreBoxes = [];
  function buildScore() {
    scoreEl.replaceChildren(); scoreBoxes = [];
    for (const f of S.factions.filter((x) => x.members > 0)) {
      const box = h("div", "tdm-team" + (f.solo ? " solo" : "")), nm = h("b"), n = h("em", "0"), sm = h("small");
      box.append(nm, n, sm);
      scoreBoxes.push({ f, box, nm, n, sm, last: "" });
    }
    const half = Math.ceil(scoreBoxes.length / 2);
    scoreBoxes.slice(0, half).forEach((b) => scoreEl.append(b.box));
    scoreEl.append(clockEl); clockEl.dataset.t = "";
    scoreBoxes.slice(half).forEach((b) => scoreEl.append(b.box));
  }
  function updateScore() {
    const clock = st.overtime ? "OVERTIME" : fmtClock(Math.ceil(st.matchT));
    if (clockEl.dataset.t !== clock) {
      clockEl.dataset.t = clock;
      clockEl.replaceChildren(document.createTextNode(clock), h("small", "", st.overtime ? "NEXT KILL WINS" : "TIME LEFT"));
      clockEl.classList.toggle("low", st.overtime || st.matchT <= 30);
    }
    for (const b of scoreBoxes) {
      const name = fac.name(b.f).slice(0, 10).toUpperCase(), color = fac.color(b.f);
      const sub = b.f.solo ? "SOLO" : `${b.f.members} PLAYER${b.f.members === 1 ? "" : "S"}`;
      const key = name + color + sub;
      if (b.last !== key) { b.last = key; b.nm.textContent = name; b.sm.textContent = sub; b.box.style.background = color; }
      if (b.n.textContent !== String(b.f.kills)) b.n.textContent = b.f.kills;
    }
  }
  const showScore = (on) => { scoreEl.style.display = on ? "flex" : "none"; };

  /* ---------------- split-screen cells ---------------- */
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
      const el = h("div", "tdm-vp");
      const [x, y, w, hh] = ch.rect;
      Object.assign(el.style, { left: x * 100 + "%", top: y * 100 + "%", width: w * 100 + "%", height: hh * 100 + "%" });
      const dmg = h("div", "tdm-dmg"), hdir = h("div", "tdm-hdir"), xh = h("div", "tdm-xh"), hm = h("div", "tdm-hm");
      const me = h("div", "tdm-me tdm-panel");
      const who = h("div", "tdm-who"), dot = h("span", "tdm-dot"), nm = h("span"), tag = h("span", "tdm-tag", ch.fac.solo ? "SOLO" : ch.fac.name);
      tag.style.background = ch.fac.solo ? SIDES[1].color : ch.fac.color;
      who.append(dot, nm, tag);
      const hp = h("div", "tdm-hp"), trail = h("i", "trail"), fill = h("i", "fill"), hpTxt = h("b");
      hp.append(trail, fill, hpTxt);
      const ammoBar = h("div", "tdm-ammo"), ammoFill = h("i"), ammoTxt = h("b");
      ammoBar.append(ammoFill, ammoTxt);
      const kd = h("div", "tdm-kd");
      const gunsEl = h("div", "tdm-guns"), gunA = h("span"), gunB = h("span");
      gunsEl.append(gunA, gunB);
      me.append(who, hp, ammoBar, gunsEl, kd);
      const obj = h("div", "tdm-obj tdm-panel hide"), arrow = h("span", "tdm-arrow", "▲"), objTxt = h("span");
      obj.append(arrow, objTxt);
      const msg = h("div", "tdm-msg"), dead = h("div", "tdm-dead");
      el.append(dmg, hdir, xh, hm, me, obj, msg, dead);
      vpLayer.append(el);
      views.push({ ch, el, dmg, hdir, ammoFill, ammoTxt, gunA, gunB, hm, dot, nm, hp, trail, fill, hpTxt, kd, obj, arrow, objTxt, msg, dead, cache: {} });
      ch.view = views[views.length - 1];                      // so scope.js can reach this soldier's cell
    });
    if (n === 3) {                                            // the 4th cell shows the scoreboard
      statsEl = h("div", "tdm-stats");
      Object.assign(statsEl.style, { left: "50%", top: "50%", width: "50%", height: "50%" });
      vpLayer.append(statsEl);
    }
  }
  function clearViews() { for (const v of views) v.el.remove(); views = []; statsEl?.remove(); statsEl = null; }
  function updateStats() {
    if (!statsEl) return;
    statsEl.replaceChildren(h("h3", "", "SCOREBOARD"));
    const order = (c) => S.factions.indexOf(c.fac);
    for (const ch of [...chars.values()].sort((a, b) => order(a) - order(b) || a.slot - b.slot)) {
      const row = h("div", "tdm-row"), dot = h("span", "tdm-dot");
      dot.style.background = fac.color(ch.fac);
      const t = h("span", "", `${ch.kills} K · ${ch.deaths} D`);
      const nm = h("b", "", S.game.nameOf(ch)); nm.style.color = fac.color(ch.fac);
      row.append(dot, nm, t); statsEl.append(row);
    }
  }

  function updateHud(v) {
    const ch = v.ch, c = v.cache, g = S.game;
    const set = (key, val, fn) => { if (c[key] !== val) { c[key] = val; fn(val); } };
    set("name", g.nameOf(ch), (t) => { v.nm.textContent = t; });
    set("col", ch.color, (t) => { v.dot.style.background = t; });
    set("kd", `${ch.kills} kills · ${ch.deaths} deaths`, (t) => { v.kd.textContent = t; });
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
    const gun = g.gunOf(ch);
    if (ch.reloadT > 0) {
      v.ammoFill.style.width = (1 - ch.reloadT / gun.reload) * 100 + "%"; v.ammoFill.style.background = "#ff9f43";
      set("ammoTxt", "reloading", () => { v.ammoTxt.textContent = "RELOADING…"; });
    } else {
      v.ammoFill.style.width = (ch.ammo / gun.mag) * 100 + "%"; v.ammoFill.style.background = ch.ammo <= gun.mag * 0.2 ? "#e5484d" : "#ffd060";
      set("ammoTxt", "a" + ch.ammo + "r" + ch.reserve + gun.id, () => { v.ammoTxt.textContent = ch.ammo <= 0 && ch.reserve <= 0 ? `${gun.name} · NO AMMO` : `${gun.name} · ${ch.ammo} / ${ch.reserve}`; });
    }
    set("guns", ch.guns.map((x) => x.id).join() + ch.cur, () => {
      [v.gunA, v.gunB].forEach((s, i) => { const x = ch.guns[i]; s.textContent = x ? `${i === ch.cur ? "▶ " : ""}${x.id.toUpperCase()} ${GUNS[x.id].name}` : ""; s.classList.toggle("on", i === ch.cur); });
    });
    v.el.classList.toggle("prot", ch.prot > 0 && ch.alive);
    v.el.classList.toggle("dead", !ch.alive);
    if (!ch.alive) set("dead", Math.ceil(ch.respawn), (t) => { v.dead.replaceChildren(document.createTextNode("YOU WERE TAKEN DOWN"), h("small", "", `respawning in ${t}`)); });

    // arrow to the nearest med-kit, shown while you are hurt
    let kit = null, kd = Infinity;
    for (const k of S.medkits) if (k.active) { const d = Math.hypot(k.x - ch.x, k.z - ch.z); if (d < kd) { kd = d; kit = k; } }
    const showArrow = ch.alive && kit && ch.hp < START_HP * 0.7;
    v.obj.classList.toggle("hide", !showArrow);
    if (showArrow) {
      const dx = kit.x - ch.x, dz = kit.z - ch.z;
      const fwd = dx * -Math.sin(ch.yaw) + dz * -Math.cos(ch.yaw), right = dx * Math.cos(ch.yaw) + dz * -Math.sin(ch.yaw);
      v.arrow.style.transform = `rotate(${Math.atan2(right, fwd)}rad)`;
      const dist = Math.round(kd);
      set("obj", "kit" + dist, () => { v.objTxt.textContent = `MED-KIT · ${dist} m`; });
    }
    // message
    let m = "";
    if (ch.alive) {
      if (ch.near) m = `Press PICK: swap your ${gun.name} for the ${GUNS[ch.near.gunId].name}`;
      else if (ch.hp < 35) m = "Low health: med-kits are in the middle and in two of the corners";
    }
    set("msg", m, (t) => { v.msg.textContent = t; });
  }
  function tickHud() { for (const v of views) updateHud(v); }

  /* ---------------- drawing ---------------- */
  function drawViewGun(ch, aspect) {                              // first-person gun, on top of the world, with its own camera
    if (!ch.alive || ch._gunHid) return;                          // (no gun while scoped: the scope picture replaces it)
    ch.vmAspect = aspect;
    viewGunPos(ch, ch.gun.group.position);
    ch.gun.group.rotation.x = ch.kick * 0.08;
    viewCam.aspect = aspect; viewCam.updateProjectionMatrix();
    for (const o of chars.values()) o.gun.group.visible = o === ch;
    renderer.autoClear = false;
    renderer.clearDepth();                                          // (scissor is still on: only this cell's depth is cleared)
    renderer.render(viewScene, viewCam);
    renderer.autoClear = true;
  }
  function render() {
    renderer.setScissorTest(true);
    if (st.phase === "teams") { S.lobby.renderPreviews(); return; }
    const { W, HH } = dim;
    const bodyVis = (ch) => ch.alive || (!!ch.av.mixer && ch.deadT < RESPAWN_TIME - 1);
    for (const ch of chars.values()) ch.av.group.visible = bodyVis(ch);
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
      ch.av.group.visible = bodyVis(ch);
      drawViewGun(ch, aspect);
    }
  }

  return { lobbyEl, bannerEl, banner, feed, clearFeed, tickFeed, buildScore, updateScore, showScore, layoutViews, clearViews, updateStats, tickHud, render };
}