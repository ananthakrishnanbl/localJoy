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
  } else if (data.type === "vibrate") {
    navigator.vibrate?.(data.ms || 50);   // the game can buzz a phone
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

function setupStick() {
  const stick = $("stick");
  const knob = $("knob");
  let pointerId = null;
  let last = "";
  let lastSent = 0;

  function report(x, y, force = false) {
    const key = `${x},${y}`;
    const now = performance.now();
    if (key === last || (!force && now - lastSent < 25)) return;   // ~40 updates per second max
    last = key;
    lastSent = now;
    send({ type: "move", x, y });   // x: -1 left to 1 right, y: -1 up to 1 down
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

setupStick();
setupButtons();