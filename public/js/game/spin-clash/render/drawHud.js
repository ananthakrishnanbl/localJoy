// Big-screen HUD: dark glass player cards (points + round status) on the sides, and
// ivory panels for banners, the round results and the final leaderboard.

import { CANVAS, MATCH, SCORING } from "../config.js";
import { TAU } from "../core/vec.js";
import { THEME } from "./theme.js";

const CARD = { w: 260, h: 50, gap: 8, top: 60, margin: 16 };

function pill(g, x, y, w, h, r) {
  g.beginPath();
  g.moveTo(x + r, y);
  g.arcTo(x + w, y, x + w, y + h, r);
  g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r);
  g.arcTo(x, y, x + w, y, r);
  g.closePath();
}

// Ivory panel with a gold double hairline.
function panel(g, x, y, w, h) {
  g.save();
  pill(g, x, y, w, h, 18);
  g.shadowColor = "rgba(0,0,0,0.55)";
  g.shadowBlur = 34;
  g.shadowOffsetY = 10;
  g.fillStyle = THEME.ivory;
  g.fill();
  g.restore();
  pill(g, x, y, w, h, 18);
  g.lineWidth = 2;
  g.strokeStyle = THEME.gold;
  g.stroke();
  pill(g, x + 6, y + 6, w - 12, h - 12, 13);
  g.lineWidth = 1;
  g.strokeStyle = "rgba(201,166,107,0.5)";
  g.stroke();
}

const rule = (g, cx, y, w = 64) => { g.fillStyle = THEME.crimson; g.fillRect(cx - w / 2, y, w, 3); };

function dot(g, x, y, r, color) {
  g.beginPath(); g.arc(x, y, r, 0, TAU);
  g.fillStyle = color; g.fill();
  g.lineWidth = 2; g.strokeStyle = "#ffffff"; g.stroke();
  g.lineWidth = 1; g.strokeStyle = "rgba(0,0,0,0.25)"; g.stroke();
}

const bySlot = (a, b) => String(a.slot).localeCompare(String(b.slot), undefined, { numeric: true });

export function drawHud(g, { roster, match, getInfo }) {
  const list = roster.list().sort(bySlot);
  const left = list.slice(0, 5);
  const right = list.slice(5);
  const gained = new Map(match.roundResult.map((r) => [r.slot, r]));

  g.save();
  g.textBaseline = "alphabetic";

  g.font = `700 20px ${THEME.serif}`;
  g.fillStyle = THEME.ivory;
  g.textAlign = "left";
  g.fillText(match.round ? `Round ${match.round} / ${SCORING.rounds}` : "Spin Clash", CARD.margin, 40);
  g.textAlign = "right";
  if (match.phase === "fight") g.fillText(`${roster.alive().length} standing`, CANVAS.w - CARD.margin, 40);

  left.forEach((t, i) => card(g, t, CARD.margin, CARD.top + i * (CARD.h + CARD.gap), getInfo(t.slot), match, gained));
  right.forEach((t, i) => card(g, t, CANVAS.w - CARD.margin - CARD.w, CARD.top + i * (CARD.h + CARD.gap), getInfo(t.slot), match, gained));

  overlay(g, match, roster, getInfo);
  g.restore();
}

function statusLine(t, match, gained) {
  if (t.spectator) return { text: "Joins next round", color: "rgba(246,242,234,0.65)" };
  if (match.phase === "fight") {
    return t.status === "alive" ? { text: "In play", color: "#9bd5a6" } : { text: `Out · #${t.place}`, color: "#e39a9a" };
  }
  if (match.phase === "roundEnd") {
    const r = gained.get(t.slot);
    return r ? { text: `#${r.place}   +${r.points}`, color: THEME.goldLight } : { text: "", color: "#fff" };
  }
  return { text: "", color: "#fff" };
}

function card(g, t, x, y, info, match, gained) {
  const color = info?.color ?? "#ffffff";
  const out = match.phase === "fight" && !t.spectator && t.status !== "alive";

  g.save();
  g.globalAlpha = t.spectator ? 0.45 : out ? 0.55 : 1;

  pill(g, x, y, CARD.w, CARD.h, 12);
  g.fillStyle = "rgba(22,22,26,0.82)";
  g.fill();
  g.lineWidth = 1;
  g.strokeStyle = "rgba(201,166,107,0.4)";
  g.stroke();
  pill(g, x, y, 5, CARD.h, 2.5);
  g.fillStyle = color;
  g.fill();

  g.beginPath(); g.arc(x + 30, y + 25, 15, 0, TAU);
  g.fillStyle = "rgba(246,242,234,0.1)"; g.fill();
  g.lineWidth = 1.5; g.strokeStyle = THEME.ivory; g.stroke();
  g.font = "19px system-ui, 'Apple Color Emoji', 'Segoe UI Emoji', sans-serif";
  g.textAlign = "center"; g.textBaseline = "middle";
  g.fillStyle = "#fff";
  g.fillText(info?.animal ?? "🌀", x + 30, y + 26);
  g.textBaseline = "alphabetic";

  g.textAlign = "left";
  g.font = `600 15px ${THEME.sans}`;
  g.fillStyle = THEME.ivory;
  g.fillText(info?.name ?? "Player", x + 54, y + 21);

  g.textAlign = "right";
  g.fillStyle = THEME.goldLight;
  g.font = `700 18px ${THEME.serif}`;
  g.fillText(`${match.totalOf(t.slot)} pts`, x + CARD.w - 12, y + 21);

  const st = statusLine(t, match, gained);
  if (st.text) {
    g.textAlign = "left";
    g.font = `600 12px ${THEME.sans}`;
    g.fillStyle = st.color;
    g.fillText(st.text, x + 54, y + 40);
  }
  g.restore();
}

function banner(g, title, sub, y) {
  const cx = CANVAS.w / 2;
  g.font = `700 42px ${THEME.serif}`;
  const w = Math.max(g.measureText(title).width, 320) + 90;
  const h = sub ? 118 : 88;
  panel(g, cx - w / 2, y - 58, w, h);
  g.textAlign = "center";
  g.fillStyle = THEME.ink;
  g.fillText(title, cx, y - 6);
  rule(g, cx, y + 6);
  if (sub) {
    g.font = `500 17px ${THEME.sans}`;
    g.fillStyle = THEME.inkSoft;
    g.fillText(sub, cx, y + 38);
  }
}

// Big numbers/words readable on both the white stadium and the dark void.
function bigText(g, str, y, size, alpha = 1) {
  g.save();
  g.globalAlpha = alpha;
  g.font = `700 ${size}px ${THEME.serif}`;
  g.textAlign = "center";
  g.lineJoin = "round";
  g.lineWidth = Math.max(8, size * 0.07);
  g.strokeStyle = "rgba(255,255,255,0.95)";
  g.strokeText(str, CANVAS.w / 2, y);
  g.fillStyle = THEME.crimson;
  g.fillText(str, CANVAS.w / 2, y);
  g.restore();
}

function overlay(g, match, roster, getInfo) {
  if (match.phase === "waiting") {
    banner(g, "Waiting for players", `${roster.size} / ${MATCH.minPlayers} connected`, 360);
  } else if (match.phase === "countdown") {
    const left = MATCH.countdown - match.t;
    const n = Math.max(1, Math.ceil(left));
    const frac = n - left; // 0 at the start of each second
    bigText(g, `Round ${match.round} / ${SCORING.rounds}`, 250, 50);
    bigText(g, String(n), 450, Math.round(190 * (1.25 - 0.25 * frac)), 1 - frac * 0.4);
  } else if (match.phase === "fight") {
    if (match.t < 0.9) bigText(g, "Fight!", 410, 120, 1 - match.t / 0.9);
    if (match.notice && Math.sin(performance.now() / 260) > -0.4) {
      g.font = `italic 600 20px ${THEME.serif}`;
      g.textAlign = "center";
      g.fillStyle = THEME.goldLight;
      g.fillText(match.notice, CANVAS.w / 2, 28);
    }
  } else if (match.phase === "roundEnd") {
    roundPanel(g, match, getInfo);
  } else if (match.phase === "final") {
    finalPanel(g, match, getInfo);
  }
}

function roundPanel(g, match, getInfo) {
  const rows = match.roundResult;
  const w = 520, rh = 36, h = 96 + rows.length * rh + 16;
  const x = (CANVAS.w - w) / 2, y = (CANVAS.h - h) / 2;
  const cx = CANVAS.w / 2;
  panel(g, x, y, w, h);

  g.textAlign = "center";
  g.font = `700 28px ${THEME.serif}`;
  g.fillStyle = THEME.ink;
  g.fillText(`Round ${match.round} Results`, cx, y + 46);
  rule(g, cx, y + 58);

  rows.forEach((r, i) => {
    const info = getInfo(r.slot);
    const ry = y + 80 + i * rh;
    if (i === 0) {
      pill(g, x + 18, ry, w - 36, rh - 4, 10);
      g.fillStyle = "rgba(200,16,46,0.08)";
      g.fill();
    } else {
      g.fillStyle = "rgba(0,0,0,0.06)";
      g.fillRect(x + 30, ry - 2, w - 60, 1);
    }
    const my = ry + (rh - 4) / 2;
    g.textBaseline = "middle";
    g.textAlign = "left";
    g.font = `700 20px ${THEME.serif}`;
    g.fillStyle = THEME.crimson;
    g.fillText(`#${r.place}`, x + 34, my);
    dot(g, x + 98, my, 8, info?.color ?? "#999");
    g.font = `600 18px ${THEME.sans}`;
    g.fillStyle = THEME.ink;
    g.fillText(info?.name ?? "Player", x + 120, my);
    g.textAlign = "right";
    g.font = `700 20px ${THEME.serif}`;
    g.fillStyle = THEME.crimson;
    g.fillText(`+${r.points}`, x + w - 34, my);
    g.textBaseline = "alphabetic";
  });
}

function finalPanel(g, match, getInfo) {
  const rows = match.leaderboard;
  const n = SCORING.rounds;
  const w = 780, rh = 36, h = 200 + rows.length * rh + 34;
  const x = (CANVAS.w - w) / 2, y = Math.max(8, (CANVAS.h - h) / 2);
  const cx = CANVAS.w / 2;
  panel(g, x, y, w, h);

  const win = getInfo(match.winnerSlot);
  g.textAlign = "center";
  g.font = `600 14px ${THEME.sans}`;
  g.fillStyle = THEME.crimson;
  g.fillText("C H A M P I O N", cx, y + 40);
  g.font = `700 40px ${THEME.serif}`;
  g.fillStyle = THEME.ink;
  g.fillText(win?.name ?? "Player", cx, y + 86);
  rule(g, cx, y + 100, 80);
  g.font = `italic 600 18px ${THEME.serif}`;
  g.fillStyle = THEME.inkSoft;
  g.fillText("Final Leaderboard", cx, y + 132);

  const totalX = x + w - 34;
  const roundX = (r) => totalX - 100 - (n - 1 - r) * 74;
  g.font = `600 13px ${THEME.sans}`;
  g.fillStyle = THEME.inkSoft;
  g.textAlign = "right";
  for (let r = 0; r < n; r++) g.fillText(`R${r + 1}`, roundX(r), y + 160);
  g.fillText("TOTAL", totalX, y + 160);

  rows.forEach((row, i) => {
    const info = getInfo(row.slot);
    const ry = y + 170 + i * rh;
    if (i === 0) {
      pill(g, x + 18, ry, w - 36, rh - 4, 10);
      g.fillStyle = "rgba(200,16,46,0.08)";
      g.fill();
    } else {
      g.fillStyle = "rgba(0,0,0,0.06)";
      g.fillRect(x + 30, ry - 2, w - 60, 1);
    }
    const my = ry + (rh - 4) / 2;
    g.textBaseline = "middle";
    g.textAlign = "left";
    g.font = `700 20px ${THEME.serif}`;
    g.fillStyle = THEME.crimson;
    g.fillText(`#${row.rank}`, x + 34, my);
    dot(g, x + 104, my, 8, info?.color ?? "#999");
    g.font = `600 18px ${THEME.sans}`;
    g.fillStyle = THEME.ink;
    g.fillText(info?.name ?? "Player", x + 128, my);
    g.textAlign = "right";
    g.font = `500 18px ${THEME.sans}`;
    g.fillStyle = THEME.inkSoft;
    for (let r = 0; r < n; r++) g.fillText(row.rounds[r] === null ? "–" : String(row.rounds[r]), roundX(r), my);
    g.font = `700 22px ${THEME.serif}`;
    g.fillStyle = THEME.crimson;
    g.fillText(String(row.total), totalX, my);
    g.textBaseline = "alphabetic";
  });

  g.textAlign = "center";
  g.font = `italic 500 14px ${THEME.serif}`;
  g.fillStyle = THEME.inkSoft;
  g.fillText("A new game begins shortly", cx, y + h - 16);
}
