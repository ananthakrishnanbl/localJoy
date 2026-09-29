import { PREFIX, peerOptions } from "/js/common.js";

const MAX_PLAYERS = 10;
const COLORS = ["#ffd93b", "#4dd4a8", "#ff7a59", "#6ea8ff"];

const players = new Map();   // conn.peer -> { conn, slot, name }
let roomCode = "";
let peer = null;

const listEl = document.getElementById("playerList");
const countEl = document.getElementById("playerCount");
const qrEl = document.getElementById("qr");
const copiedMsg = document.getElementById("copiedMsg");

/* ---------------- Room + PeerJS ---------------- */

function makeRoomCode() {
  return Math.random().toString(36).slice(2, 7).padEnd(5, "x").toUpperCase().replace(/[O0I1]/g, "X");
}

function makePeer() {
  roomCode = makeRoomCode();
  peer = new Peer(PREFIX + roomCode, peerOptions());

  peer.on("open", showRoom);
  peer.on("connection", handleConnection);
  peer.on("disconnected", () => peer.reconnect());   // lost the signaling server
  peer.on("error", (err) => {
    if (err.type === "unavailable-id") {             // code already taken, try another
      peer.destroy();
      makePeer();
    } else {
      console.error("PeerJS error:", err);
    }
  });
}

/* ---------------- Room code + QR ---------------- */

function showRoom() {
  document.querySelectorAll(".room-code").forEach((el) => (el.textContent = roomCode));

  // The phone scans this and lands on controller.html with the room code
  const joinUrl = `${location.origin}/controller.html?room=${roomCode}`;
  const img = new Image();
  img.alt = "Scan to join";
  img.style.width = "100%";
  img.src = `/qr.svg?text=${encodeURIComponent(joinUrl)}`;
  qrEl.replaceChildren(img);
}

/* ---------------- Players ---------------- */

function freeSlot() {
  const used = new Set([...players.values()].map((p) => p.slot));
  for (let i = 0; i < MAX_PLAYERS; i++) if (!used.has(i)) return i;
  return -1;
}

function handleConnection(conn) {
  conn.on("open", () => {
    const slot = freeSlot();
    if (slot === -1) {
      conn.send({ type: "full" });
      setTimeout(() => conn.close(), 300);
      return;
    }
    const player = { conn, slot, name: `Player ${slot + 1}` };
    players.set(conn.peer, player);
    conn.send({ type: "welcome", slot, color: COLORS[slot], name: player.name });
    renderPlayers();
  });

  conn.on("data", (data) => {
    const player = players.get(conn.peer);
    if (!player || !data) return;

    if (data.type === "join") {
      if (data.name) player.name = String(data.name).slice(0, 12);
      renderPlayers();
    } else {
      // Button presses, joystick moves, etc. Your game listens for this event.
      window.dispatchEvent(
        new CustomEvent("controller-input", { detail: { slot: player.slot, name: player.name, data } })
      );
    }
  });

  conn.on("close", () => removePlayer(conn));
  conn.on("error", () => removePlayer(conn));
}

function removePlayer(conn) {
  if (players.delete(conn.peer)) renderPlayers();
}

function renderPlayers() {
  listEl.replaceChildren();
  for (let i = 0; i < MAX_PLAYERS; i++) {
    const player = [...players.values()].find((p) => p.slot === i);

    const li = document.createElement("li");
    li.className = player ? "player" : "player empty";

    const avatar = document.createElement("span");
    avatar.className = "avatar";
    const label = document.createElement("span");

    if (player) {
      avatar.style.background = COLORS[i];
      avatar.textContent = player.name[0].toUpperCase();
      label.textContent = player.name;   // textContent, so names can't inject HTML
    } else {
      avatar.textContent = "?";
      label.textContent = "Waiting...";
    }
    li.append(avatar, label);
    listEl.appendChild(li);
  }
  countEl.textContent = `${players.size}/${MAX_PLAYERS}`;
}

/* ---------------- Copy + fullscreen ---------------- */

function copyCode() {
  if (navigator.clipboard) {
    navigator.clipboard.writeText(roomCode);
  } else {                                   // plain http on a LAN address has no clipboard API
    const t = document.createElement("textarea");
    t.value = roomCode;
    document.body.appendChild(t);
    t.select();
    document.execCommand("copy");
    t.remove();
  }
  copiedMsg.classList.add("show");
  setTimeout(() => copiedMsg.classList.remove("show"), 1500);
}
document.getElementById("roomCopy").onclick = copyCode;
document.getElementById("navCopy").onclick = copyCode;

const fsBtn = document.getElementById("fullscreenBtn");
fsBtn.onclick = () => {
  if (!document.fullscreenElement) document.documentElement.requestFullscreen();
  else document.exitFullscreen();
};
document.addEventListener("fullscreenchange", () => {
  fsBtn.querySelector("i").className = document.fullscreenElement
    ? "fa-solid fa-compress"
    : "fa-solid fa-expand";
});

/* ---------------- Start ---------------- */
renderPlayers();
makePeer();