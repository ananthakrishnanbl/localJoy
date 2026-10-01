import { PREFIX, peerOptions } from "/js/common.js";
import { getPad } from "/js/pad/index.js";

const $ = (id) => document.getElementById(id);
const joinScreen = $("joinScreen");
const padScreen = $("padScreen");
const roomInput = $("roomInput");
const nameInput = $("nameInput");
const joinBtn = $("joinBtn");
const statusEl = $("status");
const dot = $("dot");
const overlay = $("overlay");
const panel = $("panel");
const padArea = $("padArea");
const padHost = $("padHost");
const readyBtn = $("readyBtn");
const hostBadge = $("hostBadge");
const hud = $("hud");
const hpWrap = $("hpWrap");
const hpFill = $("hpFill");
const hudText = $("hudText");
const downEl = $("down");
const exitBtn = $("exitBtn");
let isHost = false;

let peer = null;
let conn = null;
let inGame = false;
let rejected = false;
let joinTimer = null;
let wakeLock = null;

/* ---------------- Join form ---------------- */
const params = new URLSearchParams(location.search);
roomInput.value = (params.get("room") || "").toUpperCase().slice(0, 5);
try { nameInput.value = localStorage.getItem("lj-name") || ""; } catch {}

roomInput.addEventListener("input", () => {
  roomInput.value = roomInput.value.toUpperCase().replace(/[^A-Z2-9]/g, "");
});
joinBtn.onclick = () => { enterFullscreen(); join(); };   // the tap is what lets the browser go fullscreen
[roomInput, nameInput].forEach((el) => el.addEventListener("keydown", (e) => e.key === "Enter" && join()));
$("retryBtn").onclick = () => location.reload();   // keeps ?room= in the URL
readyBtn.onclick = () => { send({ type: "ready" }); navigator.vibrate?.(30); };   // host only

function setStatus(msg, isError = false) {
  statusEl.textContent = msg;
  statusEl.classList.toggle("error", isError);
}

function join() {
  const room = roomInput.value.trim().toUpperCase();
  const name = nameInput.value.trim().slice(0, 12);
  if (room.length !== 5) return setStatus("Enter the 5-letter code shown on the game screen.", true);
  try { localStorage.setItem("lj-name", name); } catch {}

  joinBtn.disabled = true;
  rejected = false;
  setStatus("Connecting...");
  if (peer) peer.destroy();

  peer = new Peer(peerOptions());

  peer.on("open", () => {
    conn = peer.connect(PREFIX + room, { reliable: true });
    conn.on("open", () => conn.send({ type: "join", name }));
    conn.on("data", onData);
    conn.on("close", () => lost("Disconnected from the game."));
    conn.on("error", () => lost("Connection error."));
  });

  peer.on("error", (err) => {
    if (inGame) return lost("Connection error.");
    joinBtn.disabled = false;
    setStatus(
      err.type === "peer-unavailable"
        ? `Room ${room} not found. Check the code.`
        : "Couldn't connect. Are you on the same Wi-Fi?",
      true
    );
  });

  peer.on("disconnected", () => peer.reconnect());

  // give up if the console never answers
  clearTimeout(joinTimer);
  joinTimer = setTimeout(() => {
    if (!inGame) {
      joinBtn.disabled = false;
      setStatus("No response from the game screen. Try again.", true);
    }
  }, 10000);
}

/* ---------------- Messages from the console ---------------- */

function onData(data) {
  if (!data) return;

  if (data.type === "welcome") {
    clearTimeout(joinTimer);
    inGame = true;
    document.documentElement.style.setProperty("--player", data.color);
    $("meName").textContent = data.name;
    $("meAvatar").textContent = data.animal || data.name[0].toUpperCase();
    $("roomLabel").textContent = roomInput.value.toUpperCase();
    dot.classList.add("on");
    joinScreen.hidden = true;
    padScreen.hidden = false;
    keepScreenOn();
    lockLandscape();
  } else if (data.type === "full") {
    rejected = true;
    clearTimeout(joinTimer);
    joinBtn.disabled = false;
    setStatus("This room is full.", true);
  } else if (data.type === "state") {
    applyState(data);
  } else if (data.type === "vibrate") {
    navigator.vibrate?.(data.ms || 50);   // the game can buzz a phone
  } else if (data.type === "hud") {
    showHud(data);
  } else {
    current?.instance.onMessage?.(data);  // anything else goes to the active pad (e.g. quiz choices)
  }
}

/* ---------------- Pads (see /js/pad/) ---------------- */

// What every pad module receives
const io = { send };

let current = null;   // { type, instance } for the pad on screen

function releaseAll() {
  current?.instance.release?.();
}

// Shows the pad for `type`, or the waiting panel when type is null
function showPad(type) {
  if (current?.type !== type) {
    if (current) {
      current.instance.release?.();
      current.instance.destroy?.();
      padHost.replaceChildren();
      current = null;
    }
    if (type) current = { type, instance: getPad(type).mount(padHost, io) || {} };
  }
  padArea.hidden = !type;
  panel.hidden = !!type;
}

// The console tells us which screen it is on, whether we are the host, and which pad the game wants.
function applyState({ screen, host, controller }) {
  if (host && !isHost) navigator.vibrate?.([40, 60, 40]);   // you just became the host
  isHost = !!host;
  hostBadge.hidden = !isHost;

  const playing = screen === "game";
  showPad(playing ? controller || "pad" : screen === "select" && isHost ? "pad" : null);
  readyBtn.hidden = !(isHost && screen === "lobby");

  exitBtn.hidden = !(isHost && playing);
  resetExit();
  if (!playing) hud.hidden = true;

  const set = (icon, title, text) => {
    $("panelIcon").textContent = icon;
    $("panelTitle").textContent = title;
    $("panelText").textContent = text;
  };
  if (screen === "lobby") {
    if (isHost) set("👑", "You're the host!", "When everyone has joined, tap Ready.");
    else set("🎮", "You're in!", "Waiting for the host to get ready…");
  } else if (screen === "select" && !isHost) {
    set("🕹️", "Host is choosing", "Look at the big screen.");
  }
}

function lost(msg) {
  if (rejected) return;
  clearTimeout(joinTimer);
  if (inGame) {
    dot.classList.remove("on");
    $("overlayMsg").textContent = msg;
    overlay.hidden = false;
    releaseAll();
  } else {
    joinBtn.disabled = false;
    setStatus(msg, true);
  }
}

function send(msg) {
  if (conn && conn.open) conn.send(msg);
}

/* ---------------- Game HUD + exit ---------------- */

// { hp?: 0-100, text?: string, down?: bool } sent by the game
function showHud({ hp, text, down }) {
  hud.hidden = false;
  hpWrap.hidden = typeof hp !== "number";
  if (typeof hp === "number") {
    hpFill.style.width = `${hp}%`;
    hpFill.className = hp > 50 ? "" : hp > 25 ? "mid" : "low";
  }
  hudText.textContent = text || "";
  downEl.hidden = !down;
}

// Host only. Two taps, so a thumb can't end the game by accident.
let exitTimer = null;
function resetExit() {
  clearTimeout(exitTimer);
  exitBtn.classList.remove("sure");
  exitBtn.textContent = "Exit";
}
exitBtn.onclick = () => {
  if (exitBtn.classList.contains("sure")) {
    resetExit();
    send({ type: "exit" });
  } else {
    exitBtn.classList.add("sure");
    exitBtn.textContent = "Sure?";
    exitTimer = setTimeout(resetExit, 2500);
  }
};

/* ---------------- Fullscreen + landscape ---------------- */

const fsBtn = $("fsBtn");
const canFullscreen = !!document.documentElement.requestFullscreen;
fsBtn.hidden = !canFullscreen;

function enterFullscreen() {
  if (canFullscreen && !document.fullscreenElement) document.documentElement.requestFullscreen().catch(() => {});
}
async function lockLandscape() {
  // Only works while fullscreen on Android. Elsewhere the CSS turns the pad sideways instead.
  try { await screen.orientation.lock("landscape"); } catch {}
}
fsBtn.onclick = () => {
  if (document.fullscreenElement) document.exitFullscreen();
  else { enterFullscreen(); lockLandscape(); }
};
document.addEventListener("fullscreenchange", () => {
  fsBtn.textContent = document.fullscreenElement ? "🗗" : "⛶";
  if (document.fullscreenElement) { if (inGame) lockLandscape(); }
  else { try { screen.orientation.unlock(); } catch {} }
});

/* ---------------- Extras ---------------- */

async function keepScreenOn() {
  try { wakeLock = await navigator.wakeLock?.request("screen"); } catch {}
}
document.addEventListener("visibilitychange", () => {
  if (document.hidden) releaseAll();
  else if (inGame) keepScreenOn();
});
document.addEventListener("touchmove", (e) => { if (inGame) e.preventDefault(); }, { passive: false });
document.addEventListener("contextmenu", (e) => e.preventDefault());