import { PREFIX, peerOptions } from "/js/common.js";

const $ = (id) => document.getElementById(id);
const joinScreen = $("joinScreen");
const padScreen = $("padScreen");
const roomInput = $("roomInput");
const nameInput = $("nameInput");
const joinBtn = $("joinBtn");
const statusEl = $("status");
const dot = $("dot");
const overlay = $("overlay");
const pad = $("pad");
const panel = $("panel");
const readyBtn = $("readyBtn");
const hostBadge = $("hostBadge");
const dualPad = $("dualPad");
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
const releasers = [];   // functions that let go of every input (used when the tab is hidden)

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
  }
}

// The console tells us which screen it is on and whether we are the host.
// Which pad each game controller type uses. Types not listed here get the joystick + buttons pad.
const PADS = { dual: dualPad };
let currentPad = null;

function applyState({ screen, host, controller }) {
  if (host && !isHost) navigator.vibrate?.([40, 60, 40]);   // you just became the host
  isHost = !!host;
  hostBadge.hidden = !isHost;

  const inGame = screen === "game";
  const activePad = inGame ? PADS[controller] || pad : screen === "select" && isHost ? pad : null;
  if (activePad !== currentPad) releaseAll();
  currentPad = activePad;
  pad.hidden = activePad !== pad;
  dualPad.hidden = activePad !== dualPad;
  panel.hidden = !!activePad;
  readyBtn.hidden = !(isHost && screen === "lobby");

  exitBtn.hidden = !(isHost && inGame);
  resetExit();
  if (!inGame) hud.hidden = true;

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

/* ---------------- Joystick ---------------- */

const turned = matchMedia("(orientation: portrait)");

// Turns a .stick dish into a joystick. emit(x, y) gets -1..1 on each axis (y: -1 up, 1 down).
function makeStick(stick, emit) {
  const knob = stick.querySelector(".knob");
  let pointerId = null;
  let last = "";
  let lastSent = 0;

  function report(x, y, force = false) {
    const key = `${x},${y}`;
    const now = performance.now();
    if (key === last || (!force && now - lastSent < 25)) return;   // ~40 updates per second max
    last = key;
    lastSent = now;
    emit(x, y);
  }

  function update(e) {
    const rect = stick.getBoundingClientRect();
    const max = (rect.width - knob.offsetWidth) / 2;
    let dx = e.clientX - (rect.left + rect.width / 2);
    let dy = e.clientY - (rect.top + rect.height / 2);
    if (turned.matches) [dx, dy] = [dy, -dx];   // pad is rotated 90° when the phone is upright
    const dist = Math.hypot(dx, dy);
    if (dist > max) { dx = (dx / dist) * max; dy = (dy / dist) * max; }
    knob.style.transform = `translate(${dx}px, ${dy}px)`;

    let x = dx / max;
    let y = dy / max;
    if (Math.hypot(x, y) < 0.12) { x = 0; y = 0; }   // dead zone
    report(+x.toFixed(2), +y.toFixed(2));
  }

  function release() {
    if (pointerId === null) return;
    pointerId = null;
    knob.classList.remove("active");
    knob.style.transform = "";
    report(0, 0, true);
  }

  stick.addEventListener("pointerdown", (e) => {
    if (pointerId !== null) return;
    e.preventDefault();
    pointerId = e.pointerId;
    stick.setPointerCapture(pointerId);
    knob.classList.add("active");
    navigator.vibrate?.(8);
    update(e);
  });
  stick.addEventListener("pointermove", (e) => e.pointerId === pointerId && update(e));
  stick.addEventListener("pointerup", (e) => e.pointerId === pointerId && release());
  stick.addEventListener("pointercancel", (e) => e.pointerId === pointerId && release());
  stick.addEventListener("lostpointercapture", (e) => e.pointerId === pointerId && release());
  releasers.push(release);
}

/* ---------------- Buttons ---------------- */

function setupButtons() {
  document.querySelectorAll(".btn").forEach((btn) => {
    const id = btn.dataset.id;

    const set = (pressed) => {
      btn.classList.toggle("down", pressed);
      send({ type: "button", id, pressed });
      if (pressed) navigator.vibrate?.(12);
    };
    const up = () => btn.classList.contains("down") && set(false);

    btn.addEventListener("pointerdown", (e) => {
      e.preventDefault();
      btn.setPointerCapture(e.pointerId);
      set(true);
    });
    btn.addEventListener("pointerup", up);
    btn.addEventListener("pointercancel", up);
    releasers.push(up);
  });
}

function releaseAll() {
  releasers.forEach((fn) => fn());
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

// Menu pad: one stick, sends "move"
makeStick($("stick"), (x, y) => send({ type: "move", x, y }));

// Twin-stick pad: left moves, right aims. Both go out together as "dual".
const dual = { mx: 0, my: 0, ax: 0, ay: 0 };
makeStick($("moveStick"), (x, y) => { dual.mx = x; dual.my = y; send({ type: "dual", ...dual }); });
makeStick($("aimStick"),  (x, y) => { dual.ax = x; dual.ay = y; send({ type: "dual", ...dual }); });

setupButtons();