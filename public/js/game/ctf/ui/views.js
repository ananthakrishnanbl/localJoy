// Split-screen cells: build each player's HUD, update it every frame, scoreboard and score bar.

import { GUNS, TEAMS } from "../config.js";
import { h } from "../utils.js";

export function setupViews(G) {
  const S = G.S;
  const { chars, caps, flags, nameOf, colorOf, vpLayer, scoreTeams, firstTo, fmtClock, flagPos } = G;
  // functions from modules that are set up later: looked up on G at the moment they are called
  const gunOf = (...a) => G.gunOf(...a);

  function layoutViews() {
    for (const v of S.views) v.el.remove();
    S.statsEl?.remove(); S.statsEl = null;
    S.views = [];
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
      const gunsEl = h("div", "ctf-guns"), gunA = h("span"), gunB = h("span");
      gunsEl.append(gunA, gunB);
      me.append(who, hp, ammoBar, gunsEl, kd);
      const obj = h("div", "ctf-obj ctf-panel"), arrow = h("span", "ctf-arrow", "▲"), objTxt = h("span");
      obj.append(arrow, objTxt);
      const msg = h("div", "ctf-msg"), dead = h("div", "ctf-dead");
      el.append(dmg, hdir, xh, hm, me, obj, msg, dead);
      vpLayer.append(el);
      S.views.push({ ch, el, dmg, hdir, ammoFill, ammoTxt, gunA, gunB, hm, dot, nm, hp, trail, fill, hpTxt, kd, arrow, objTxt, msg, dead, cache: {} });
    });
    if (n === 3) {
      S.statsEl = h("div", "ctf-stats");
      Object.assign(S.statsEl.style, { left: "50%", top: "50%", width: "50%", height: "50%" });
      vpLayer.append(S.statsEl);
    }
  }
  function updateStats() {
    if (!S.statsEl) return;
    S.statsEl.replaceChildren(h("h3", "", "SCOREBOARD"));
    for (const ch of [...chars.values()].sort((a, b) => a.team - b.team || a.slot - b.slot)) {
      const row = h("div", "ctf-row"), dot = h("span", "ctf-dot");
      dot.style.background = colorOf(ch.slot);
      const t = h("span", "", `${ch.kills} K · ${ch.deaths} D · ${ch.caps} 🚩`);
      const nm = h("b", "", nameOf(ch)); nm.style.color = TEAMS[ch.team].color;
      row.append(dot, nm, t); S.statsEl.append(row);
    }
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
    const gun = gunOf(ch);
    if (ch.reloadT > 0) {
      v.ammoFill.style.width = (1 - ch.reloadT / gun.reload) * 100 + "%"; v.ammoFill.style.background = "#ff9f43";
      set("ammoTxt", "reloading", (t) => { v.ammoTxt.textContent = "RELOADING…"; });
    } else {
      v.ammoFill.style.width = (ch.ammo / gun.mag) * 100 + "%"; v.ammoFill.style.background = ch.ammo <= gun.mag * 0.2 ? "#e5484d" : "#ffd060";
      set("ammoTxt", "a" + ch.ammo + "r" + ch.reserve + gun.id, () => { v.ammoTxt.textContent = ch.ammo <= 0 && ch.reserve <= 0 ? `${gun.name} · NO AMMO` : `${gun.name} · ${ch.ammo} / ${ch.reserve}`; });
    }
    set("guns", ch.guns.map((g) => g.id).join() + ch.cur, () => {
      [v.gunA, v.gunB].forEach((s, i) => { const g = ch.guns[i]; s.textContent = g ? `${i === ch.cur ? "▶ " : ""}${g.id.toUpperCase()} ${GUNS[g.id].name}` : ""; s.classList.toggle("on", i === ch.cur); });
    });
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
      else if (ch.near) m = `Press PICK: swap your ${gun.name} for the ${GUNS[ch.near.gunId].name}`;
      else if (ch.hp < 35) m = "Low health: find a med-kit in the middle room";
      if (ch.carrying && ch.near) m += ` · PICK = ${GUNS[ch.near.gunId].name}`;
    }
    set("msg", m, (t) => { v.msg.textContent = t; });
  }
  function updateScore() {
    const clock = S.overtime ? "OVERTIME" : fmtClock(Math.ceil(S.matchT));
    if (firstTo.dataset.t !== clock) {
      firstTo.dataset.t = clock;
      firstTo.replaceChildren(document.createTextNode(clock), h("small", "", S.overtime ? "NEXT CAPTURE WINS" : "TIME LEFT"));
      firstTo.classList.toggle("low", S.overtime || S.matchT <= 30);
    }
    for (let t = 0; t < 2; t++) {
      const f = flags[t], s = scoreTeams[t];
      const txt = f.carrier ? `TAKEN by ${nameOf(f.carrier)}` : f.atHome ? "FLAG HOME" : "FLAG DROPPED";
      if (s.n.textContent !== String(caps[t])) s.n.textContent = caps[t];
      if (s.last !== txt) { s.last = txt; s.sm.textContent = txt; }
    }
  }

  // shared with the modules set up after this one
  Object.assign(G, { layoutViews, updateStats, updateHud, updateScore });
}
