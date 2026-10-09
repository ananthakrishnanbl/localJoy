// Big-screen HUD: player cards (points + round status), centre banners,
// the round-results panel and the final leaderboard.

import { CANVAS, MATCH, SCORING } from "../config.js";
import { TAU } from "../core/vec.js";
import { rgba } from "./color.js";

const CARD = { w: 260, h: 50, gap: 8, top: 60, margin: 16 };
const GOLD = "#ffd36b";

function pill(g, x, y, w, h, r) {
  g.beginPath();
  g.moveTo(x + r, y);
  g.arcTo(x + w, y, x + w, y + h, r);
  g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r);
  g.arcTo(x, y, x + w, y, r);
  g.closePath();
}

function panel(g, x, y, w, h, border) {
  pill(g, x, y, w, h, 22);
  g.fillStyle = "rgba(6,9,20,0.9)";
  g.fill();
  g.lineWidth = 3;
  g.strokeStyle = border;
  g.stroke();
}

const bySlot = (a, b) => String(a.slot).localeCompare(String(b.slot), undefined, { numeric: true });

export function drawHud(g, { roster, match, getInfo }) {
  const list = roster.list().sort(bySlot);
  const left = list.slice(0, 5);
  const right = list.slice(5);
  const gained = new Map(match.roundResult.map((r) => [r.slot, r]));

  g.save();
  g.textBaseline = "alphabetic";

  g.font = "800 18px system-ui, sans-serif";
  g.fillStyle = "rgba(255,255,255,0.85)";
  g.textAlign = "left";
  g.fillText(match.round ? `ROUND ${match.round} / ${SCORING.rounds}` : "SPIN CLASH", CARD.margin, 40);
  g.textAlign = "right";
  if (match.phase === "fight") g.fillText(`ALIVE ${roster.alive().length}`, CANVAS.w - CARD.margin, 40);

  left.forEach((t, i) => card(g, t, CARD.margin, CARD.top + i * (CARD.h + CARD.gap), getInfo(t.slot), match, gained));
  right.forEach((t, i) => card(g, t, CANVAS.w - CARD.margin - CARD.w, CARD.top + i * (CARD.h + CARD.gap), getInfo(t.slot), match, gained));

  overlay(g, match, roster, getInfo);
  g.restore();
}

function statusLine(t, match, gained) {
  if (t.spectator) return { text: "JOINS NEXT ROUND", color: "rgba(255,255,255,0.7)" };
  if (match.phase === "fight") {
    return t.status === "alive" ? { text: "IN", color: "#6dff9a" } : { text: `OUT · #${t.place}`, color: "#ff8a8a" };
  }
  if (match.phase === "roundEnd") {
    const r = gained.get(t.slot);
    return r ? { text: `#${r.place}  +${r.points}`, color: GOLD } : { text: "", color: "#fff" };
  }
  return { text: "", color: "#fff" };
}

function card(g, t, x, y, info, match, gained) {
  const color = info?.color ?? "#ffffff";
  const out = match.phase === "fight" && !t.spectator && t.status !== "alive";

  g.save();
  g.globalAlpha = t.spectator ? 0.45 : out ? 0.55 : 1;

  pill(g, x, y, CARD.w, CARD.h, 12);
  g.fillStyle = "rgba(8,12,26,0.74)";
  g.fill();
  pill(g, x, y, 6, CARD.h, 3);
  g.fillStyle = color;
  g.fill();

  g.beginPath(); g.arc(x + 30, y + 25, 15, 0, TAU);
  g.fillStyle = rgba(color, 0.25); g.fill();
  g.lineWidth = 2; g.strokeStyle = color; g.stroke();
  g.font = "19px system-ui, 'Apple Color Emoji', 'Segoe UI Emoji', sans-serif";
  g.textAlign = "center"; g.textBaseline = "middle";
  g.fillStyle = "#fff";
  g.fillText(info?.animal ?? "🌀", x + 30, y + 26);
  g.textBaseline = "alphabetic";

  g.textAlign = "left";
  g.font = "700 15px system-ui, sans-serif";
  g.fillText(info?.name ?? "Player", x + 54, y + 21);

  g.textAlign = "right";
  g.fillStyle = GOLD;
  g.font = "800 17px system-ui, sans-serif";
  g.fillText(`${match.totalOf(t.slot)} pts`, x + CARD.w - 12, y + 21);

  const st = statusLine(t, match, gained);
  if (st.text) {
    g.textAlign = "left";
    g.font = "700 12px system-ui, sans-serif";
    g.fillStyle = st.color;
    g.fillText(st.text, x + 54, y + 40);
  }
  g.restore();
}

function banner(g, title, sub, color, y) {
  const cx = CANVAS.w / 2;
  g.font = "900 46px system-ui, sans-serif";
  const w = Math.max(g.measureText(title).width, 320) + 80;
  const h = sub ? 108 : 78;
  panel(g, cx - w / 2, y - 52, w, h, color);
  g.textAlign = "center";
  g.fillStyle = color;
  g.fillText(title, cx, y);
  if (sub) {
    g.font = "600 20px system-ui, sans-serif";
    g.fillStyle = "rgba(255,255,255,0.85)";
    g.fillText(sub, cx, y + 36);
  }
}

function bigText(g, str, y, size, fill, alpha = 1) {
  g.save();
  g.globalAlpha = alpha;
  g.font = `900 ${size}px system-ui, sans-serif`;
  g.textAlign = "center";
  g.lineWidth = 10;
  g.strokeStyle = "rgba(0,0,0,0.6)";
  g.strokeText(str, CANVAS.w / 2, y);
  g.fillStyle = fill;
  g.fillText(str, CANVAS.w / 2, y);
  g.restore();
}

function overlay(g, match, roster, getInfo) {
  if (match.phase === "waiting") {
    banner(g, "WAITING FOR PLAYERS", `${roster.size} / ${MATCH.minPlayers} connected`, "#ffffff", 360);
  } else if (match.phase === "countdown") {
    const left = MATCH.countdown - match.t;
    const n = Math.max(1, Math.ceil(left));
    const frac = n - left; // 0 at the start of each second
    bigText(g, `ROUND ${match.round} / ${SCORING.rounds}`, 250, 54, GOLD);
    bigText(g, String(n), 450, Math.round(190 * (1.25 - 0.25 * frac)), "#ffffff", 1 - frac * 0.4);
  } else if (match.phase === "fight") {
    if (match.t < 0.9) bigText(g, "FIGHT!", 410, 120, GOLD, 1 - match.t / 0.9);
    if (match.shrinking && match.radius > 115 && Math.sin(performance.now() / 160) > -0.3) {
      g.font = "800 20px system-ui, sans-serif";
      g.textAlign = "center";
      g.fillStyle = "#ff8a7a";
      g.fillText("⚠ STADIUM SHRINKING ⚠", CANVAS.w / 2, 30);
    }
  } else if (match.phase === "roundEnd") {
    roundPanel(g, match, getInfo);
  } else if (match.phase === "final") {
    finalPanel(g, match, getInfo);
  }
}

function roundPanel(g, match, getInfo) {
  const rows = match.roundResult;
  const w = 520, rh = 34, h = 76 + rows.length * rh + 14;
  const x = (CANVAS.w - w) / 2, y = (CANVAS.h - h) / 2;
  panel(g, x, y, w, h, GOLD);

  g.textAlign = "center";
  g.font = "900 26px system-ui, sans-serif";
  g.fillStyle = GOLD;
  g.fillText(`ROUND ${match.round} RESULTS`, CANVAS.w / 2, y + 44);

  rows.forEach((r, i) => {
    const info = getInfo(r.slot);
    const ry = y + 70 + i * rh;
    if (i === 0) {
      pill(g, x + 14, ry, w - 28, rh - 4, 10);
      g.fillStyle = "rgba(255,211,107,0.16)";
      g.fill();
    }
    g.textBaseline = "middle";
    const my = ry + (rh - 4) / 2;
    g.textAlign = "left";
    g.font = "800 18px system-ui, sans-serif";
    g.fillStyle = i === 0 ? GOLD : "#fff";
    g.fillText(`#${r.place}`, x + 28, my);
    g.font = "20px system-ui, 'Apple Color Emoji', 'Segoe UI Emoji', sans-serif";
    g.fillText(info?.animal ?? "🌀", x + 82, my);
    g.font = "700 18px system-ui, sans-serif";
    g.fillStyle = info?.color ?? "#fff";
    g.fillText(info?.name ?? "Player", x + 116, my);
    g.textAlign = "right";
    g.font = "800 18px system-ui, sans-serif";
    g.fillStyle = GOLD;
    g.fillText(`+${r.points}`, x + w - 28, my);
    g.textBaseline = "alphabetic";
  });
}

function finalPanel(g, match, getInfo) {
  const rows = match.leaderboard;
  const n = SCORING.rounds;
  const w = 780, rh = 36, h = 162 + rows.length * rh + 34;
  const x = (CANVAS.w - w) / 2, y = Math.max(8, (CANVAS.h - h) / 2);
  panel(g, x, y, w, h, GOLD);

  g.textAlign = "center";
  g.font = "900 30px system-ui, sans-serif";
  g.fillStyle = "#fff";
  g.fillText("FINAL LEADERBOARD", CANVAS.w / 2, y + 44);

  const win = getInfo(match.winnerSlot);
  g.font = "900 26px system-ui, sans-serif";
  g.fillStyle = win?.color ?? GOLD;
  g.fillText(`🏆 ${(win?.name ?? "Player").toUpperCase()} WINS!`, CANVAS.w / 2, y + 84);

  const totalX = x + w - 30;
  const roundX = (r) => totalX - 100 - (n - 1 - r) * 74;
  g.font = "700 14px system-ui, sans-serif";
  g.fillStyle = "rgba(255,255,255,0.6)";
  g.textAlign = "right";
  for (let r = 0; r < n; r++) g.fillText(`R${r + 1}`, roundX(r), y + 128);
  g.fillText("TOTAL", totalX, y + 128);

  rows.forEach((row, i) => {
    const info = getInfo(row.slot);
    const ry = y + 140 + i * rh;
    if (i === 0) {
      pill(g, x + 14, ry, w - 28, rh - 4, 10);
      g.fillStyle = "rgba(255,211,107,0.18)";
      g.fill();
    }
    const my = ry + (rh - 4) / 2;
    g.textBaseline = "middle";
    g.textAlign = "left";
    g.font = "800 19px system-ui, sans-serif";
    g.fillStyle = i === 0 ? GOLD : "#fff";
    g.fillText(`#${row.rank}`, x + 28, my);
    g.font = "20px system-ui, 'Apple Color Emoji', 'Segoe UI Emoji', sans-serif";
    g.fillText(info?.animal ?? "🌀", x + 90, my);
    g.font = "700 19px system-ui, sans-serif";
    g.fillStyle = info?.color ?? "#fff";
    g.fillText(info?.name ?? "Player", x + 126, my);
    g.textAlign = "right";
    g.font = "600 18px system-ui, sans-serif";
    g.fillStyle = "rgba(255,255,255,0.8)";
    for (let r = 0; r < n; r++) g.fillText(row.rounds[r] === null ? "–" : String(row.rounds[r]), roundX(r), my);
    g.font = "900 21px system-ui, sans-serif";
    g.fillStyle = GOLD;
    g.fillText(String(row.total), totalX, my);
    g.textBaseline = "alphabetic";
  });

  g.textAlign = "center";
  g.font = "600 15px system-ui, sans-serif";
  g.fillStyle = "rgba(255,255,255,0.6)";
  g.fillText("A new game starts soon…", CANVAS.w / 2, y + h - 14);
}
