import { PREFIX, peerOptions } from "/js/common.js";

const MAX_PLAYERS = 10;
const COLORS = ["#ff5a5f", "#3b8bff", "#3ecf6e", "#ffcf33", "#ff8fc2", "#ff9f43", "#a78bfa", "#2dd4bf", "#a3e635", "#38bdf8"];
const ANIMALS = ["🐻", "🐰", "🦊", "🐸", "🐼", "🦁", "🐯", "🐵", "🐙", "🦄"];
const shown = new Set();      // slots already drawn, so only newcomers pop in

const players = new Map();   // conn.peer -> { conn, slot, seq, name }
let roomCode = "";
let peer = null;
let joinSeq = 0;             // join order. The lowest seq still connected is the host.

/* Screens: lobby -> select -> game. Phones are told which one we are on. */
let screen = "lobby";
let currentGame = null;

const $ = (id) => document.getElementById(id);
const listEl = $("playerList");
const countEl = $("playerCount");
const qrEl = $("qr");
const blocksEl = $("blocks");
const copiedMsg = $("copiedMsg");
const hostHint = $("hostHint");
const screens = { lobby: $("lobbyScreen"), select: $("selectScreen"), game: $("gameScreen") };

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

function drawBlocks(code) {
  blocksEl.replaceChildren(...[...code].map((ch, i) => {
    const b = document.createElement("span");
    b.className = "blk pop";
    b.style.animationDelay = `${i * 0.08}s`;
    b.textContent = ch;
    return b;
  }));
}

function showRoom() {
  drawBlocks(roomCode);
  document.querySelectorAll(".room-code").forEach((el) => (el.textContent = roomCode));

  // The phone scans this and lands on controller.html with the room code
  const joinUrl = `${location.origin}/controller.html?room=${roomCode}`;
  const img = new Image();
  img.alt = "Scan to join";
  img.style.width = "100%";
  img.src = `/qr.svg?text=${encodeURIComponent(joinUrl)}`;
  qrEl.replaceChildren(img);
}

/* ---------------- Host + screens ---------------- */

// The host is whoever joined first and is still connected.
// When they leave, the next earliest joiner takes over automatically.
function getHost() {
  let host = null;
  for (const p of players.values()) if (!host || p.seq < host.seq) host = p;
  return host;
}

function sendState(player) {
  if (!player.conn.open) return;
  player.conn.send({
    type: "state",
    screen,
    host: player === getHost(),
    game: currentGame ? currentGame.id : null,
    controller: currentGame ? currentGame.controller : null,   // which pad the phone should show
  });
}

function broadcastState() {
  players.forEach(sendState);
}

function setScreen(name) {
  screen = name;
  for (const [id, el] of Object.entries(screens)) el.hidden = id !== name;
  window.dispatchEvent(new CustomEvent("screen-change", { detail: { screen: name } }));
  broadcastState();
}

// Pages talk to us with events, so this file does not need to know their internals.
window.addEventListener("game-selected", (e) => startGame(e.detail.game));
window.addEventListener("select-back", () => setScreen("lobby"));

/* ---------------- Game modules ---------------- */
// A game module (the `entry` in gameinfo.js) exports start(ctx) and may return { destroy() }.
//   ctx.root            element to draw into
//   ctx.signal          aborted when the game ends, pass it to addEventListener
//   ctx.players()       everyone connected: [{ slot, name, color, animal, host }]
//   ctx.player(slot)    one of them, or null
//   ctx.send(slot, msg) message to one phone     ctx.broadcast(msg)  to all phones
//   ctx.exit()          back to the select page
// Input arrives as "controller-input" events, joins and leaves as "player-join" / "player-leave".
let activeGame = null;
let gameAbort = null;

function playerInfo(p) {
  return { slot: p.slot, name: p.name, color: COLORS[p.slot], animal: ANIMALS[p.slot], host: p === getHost() };
}

function playerBySlot(slot) {
  for (const p of players.values()) if (p.slot === slot) return p;
  return null;
}

async function startGame(game) {
  currentGame = game;
  gameAbort = new AbortController();
  const { signal } = gameAbort;
  const root = $("gameRoot");
  root.replaceChildren();
  setScreen("game");

  const ctx = {
    root,
    signal,
    players: () => [...players.values()].map(playerInfo),
    player: (slot) => { const p = playerBySlot(slot); return p ? playerInfo(p) : null; },
    send: (slot, msg) => { const p = playerBySlot(slot); if (p && p.conn.open) p.conn.send(msg); },
    broadcast: (msg) => players.forEach((p) => p.conn.open && p.conn.send(msg)),
    exit: stopGame,
  };

  try {
    const mod = await import(game.entry);
    if (signal.aborted) return;                // host left before it finished loading
    const running = (await mod.start(ctx)) || {};
    if (signal.aborted) running.destroy?.();
    else activeGame = running;
  } catch (err) {
    if (signal.aborted) return;
    console.error(`Could not load ${game.title}:`, err);
    root.textContent = `Could not load ${game.title}. Host: tap Exit on your phone.`;
  }
}

function teardownGame() {
  if (gameAbort) gameAbort.abort();
  gameAbort = null;
  try { activeGame?.destroy?.(); } catch (err) { console.error(err); }
  activeGame = null;
  currentGame = null;
  $("gameRoot").replaceChildren();
}

function stopGame() {
  if (!currentGame) return;
  teardownGame();
  setScreen("select");
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
    const player = { conn, slot, seq: joinSeq++, name: `Player ${slot + 1}` };
    players.set(conn.peer, player);
    conn.send({ type: "welcome", slot, color: COLORS[slot], animal: ANIMALS[slot], name: player.name });
    renderPlayers();
    broadcastState();
    window.dispatchEvent(new CustomEvent("player-join", { detail: playerInfo(player) }));
  });

  conn.on("data", (data) => {
    const player = players.get(conn.peer);
    if (!player || !data) return;
    const isHost = player === getHost();

    if (data.type === "join") {
      if (data.name) player.name = String(data.name).slice(0, 12);
      renderPlayers();
    } else if (data.type === "ready") {
      // Only the host can leave the lobby
      if (isHost && screen === "lobby") setScreen("select");
    } else if (
      screen === "game" && isHost &&
      (data.type === "exit" ||                                            // host's Exit button on the phone
       (!activeGame && data.type === "button" && data.id === "B" && data.pressed))   // game missing or failed: B still works
    ) {
      stopGame();
    } else {
      // Button presses, joystick moves, etc. The select page and the games listen for this event.
      window.dispatchEvent(
        new CustomEvent("controller-input", { detail: { slot: player.slot, name: player.name, host: isHost, data } })
      );
    }
  });

  conn.on("close", () => removePlayer(conn));
  conn.on("error", () => removePlayer(conn));
}

function removePlayer(conn) {
  const gone = players.get(conn.peer);
  if (!gone) return;
  players.delete(conn.peer);
  renderPlayers();
  window.dispatchEvent(new CustomEvent("player-leave", { detail: { slot: gone.slot } }));
  if (players.size === 0 && screen !== "lobby") {
    teardownGame();
    setScreen("lobby");          // everyone left: start over
  } else {
    broadcastState();            // tells the new host they are the host
  }
}

function renderPlayers() {
  listEl.replaceChildren();
  const joined = [...players.values()].sort((a, b) => a.slot - b.slot);
  const host = getHost();
  const live = new Set(joined.map((p) => p.slot));
  [...shown].forEach((slot) => live.has(slot) || shown.delete(slot));

  for (const player of joined) {
    const li = document.createElement("li");
    li.className = "player";
    li.style.setProperty("--c", COLORS[player.slot]);
    if (!shown.has(player.slot)) li.classList.add("fresh");
    shown.add(player.slot);

    const avatar = document.createElement("span");
    avatar.className = "avatar";
    avatar.textContent = ANIMALS[player.slot];
    const label = document.createElement("span");
    label.className = "name";
    label.textContent = player.name;   // textContent, so names can't inject HTML

    li.append(avatar, label);
    if (player === host) {
      const crown = document.createElement("span");
      crown.className = "crown";
      crown.title = "Host";
      crown.textContent = "👑";
      li.append(crown);
    }
    listEl.appendChild(li);
  }
  countEl.textContent = `${players.size}/${MAX_PLAYERS}`;

  hostHint.textContent = host
    ? `👑 ${host.name} is the host. Tap Ready on your phone when everyone has joined.`
    : "Waiting for the first player to join…";

  window.dispatchEvent(new CustomEvent("players-change", {
    detail: { count: players.size, hostName: host ? host.name : "" },
  }));
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
$("roomCopy").onclick = copyCode;
$("navCopy").onclick = copyCode;

const fsBtn = $("fullscreenBtn");
fsBtn.onclick = () => {
  if (!document.fullscreenElement) document.documentElement.requestFullscreen();
  else document.exitFullscreen();
};
document.addEventListener("fullscreenchange", () => {
  $("fsIcon").textContent = document.fullscreenElement ? "🗗" : "⛶";
});

/* ---------------- Start ---------------- */
drawBlocks("·····");
renderPlayers();
makePeer();