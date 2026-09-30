import { GAMES, CONTROLLERS } from "/js/game/gameinfo.js";

const $ = (id) => document.getElementById(id);
const feature = $("feature");
const row = $("gameRow");
const cards = [];

let index = 0;
let active = false;       // true only while the select page is on screen
let count = 0;            // players connected
let hostName = "";
let dir = 0;              // joystick direction currently held: -1, 0, 1
let repeat = null;

const range = (g) => (g.minPlayers === g.maxPlayers ? `${g.minPlayers}` : `${g.minPlayers}-${g.maxPlayers}`);
const playable = (g) => count >= g.minPlayers && count <= g.maxPlayers;

/* Image with an emoji fallback, so a missing file still looks fine */
function art(game, src) {
  const emoji = document.createElement("span");
  emoji.className = "emoji";
  emoji.textContent = game.emoji;
  const img = document.createElement("img");
  img.src = src;
  img.alt = "";
  img.onerror = () => img.remove();
  return [emoji, img];
}

function el(tag, cls, text) {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text !== undefined) n.textContent = text;
  return n;
}

/* ---------------- Build the shelf once ---------------- */
GAMES.forEach((g) => {
  const card = el("div", "gcard");
  card.style.setProperty("--c", g.color);
  card.setAttribute("aria-label", g.title);
  card.append(...art(g, g.cover), el("span", "badge", `👤 ${range(g)}`), el("span", "label", g.title));
  row.append(card);
  cards.push(card);
});

/* ---------------- Render the focused game ---------------- */
function render(animate = false) {
  const g = GAMES[index];
  feature.style.setProperty("--c", g.color);

  $("fTitle").textContent = g.title;
  $("fTagline").textContent = g.tagline;
  $("fDesc").textContent = g.description;
  const full = Math.round(g.rating);
  $("fStars").textContent = `${"★".repeat(full)}${"☆".repeat(5 - full)} ${g.rating}`;
  $("fPlayers").textContent = `👤 ${range(g)} players`;
  $("fControls").textContent = `📱 ${CONTROLLERS[g.controller] || g.controller}`;
  $("fTags").replaceChildren(...g.tags.map((t) => el("span", "pill", t)));
  $("fArt").replaceChildren(...art(g, g.banner));
  $("fWarn").textContent = playable(g) ? "" : `Needs ${range(g)} players, ${count} connected.`;

  cards.forEach((c, i) => {
    c.classList.toggle("focus", i === index);
    c.classList.toggle("locked", !playable(GAMES[i]));
  });
  if (active) cards[index].scrollIntoView({ behavior: "smooth", inline: "center", block: "nearest" });

  $("whoHint").textContent = hostName ? `👑 ${hostName} is choosing` : "";

  if (animate) {
    feature.classList.remove("swap");
    void feature.offsetWidth;      // restart the animation
    feature.classList.add("swap");
  }
}

/* ---------------- Actions ---------------- */
function go(step) {
  index = (index + step + GAMES.length) % GAMES.length;
  render(true);
}

function stop() {
  dir = 0;
  clearInterval(repeat);
  repeat = null;
}

function steer(x) {
  const next = x > 0.6 ? 1 : x < -0.6 ? -1 : 0;
  if (next === dir) return;
  stop();
  dir = next;
  if (next) {
    go(next);
    repeat = setInterval(() => go(next), 320);   // keep scrolling while the stick is held
  }
}

function choose() {
  const g = GAMES[index];
  if (!playable(g)) {
    const c = cards[index];
    c.classList.remove("shake");
    void c.offsetWidth;
    c.classList.add("shake");
    return;
  }
  stop();
  window.dispatchEvent(new CustomEvent("game-selected", { detail: { game: g } }));
}

function back() {
  stop();
  window.dispatchEvent(new CustomEvent("select-back"));
}

/* ---------------- Input: only the host counts ---------------- */
window.addEventListener("controller-input", (e) => {
  if (!active || !e.detail.host) return;
  const d = e.detail.data;
  if (d.type === "move") steer(d.x);
  else if (d.type === "button" && d.pressed) {
    if (d.id === "A") choose();
    else if (d.id === "B") back();
  }
});

// Keyboard on the laptop, handy for testing
document.addEventListener("keydown", (e) => {
  if (!active) return;
  if (e.key === "ArrowRight") go(1);
  else if (e.key === "ArrowLeft") go(-1);
  else if (e.key === "Enter" || e.key === " ") choose();
  else if (e.key === "Escape" || e.key === "Backspace") back();
});

window.addEventListener("screen-change", (e) => {
  active = e.detail.screen === "select";
  stop();
  if (active) render();
});

window.addEventListener("players-change", (e) => {
  count = e.detail.count;
  hostName = e.detail.hostName;
  stop();                      // the host may have just changed
  render();
});

render();