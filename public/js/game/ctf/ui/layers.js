// Screen layers on top of the 3D view: score bar, match clock, kill feed and big banner.

import { TEAMS } from "../config.js";
import { h } from "../utils.js";

export function setupLayers(G) {
  const S = G.S;
  const { wrap, status } = G;

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
    S.bannerT = secs;
  }
  const feedItems = [];
  function feed(parts) {          // parts: [text, color?] pairs
    const row = h("div");
    for (const [t, c] of parts) { const s = h("span", "", t); if (c) { s.style.color = c; s.style.fontWeight = "700"; } row.append(s); }
    feedEl.append(row); feedItems.push({ row, t: 5 });
    while (feedItems.length > 5) feedItems.shift().row.remove();
  }

  // shared with the modules set up after this one
  Object.assign(G, {
    scoreEl, feedEl, bannerEl, lobbyEl, vpLayer, scoreTeams, firstTo, fmtClock, banner, feedItems, feed
  });
}
