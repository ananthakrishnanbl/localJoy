// Blast Arena: top-down arena shooter for 2-10 phones.
// Controller type "dual": left stick moves, right stick aims and fires.
// Loaded by console.js, which calls start(ctx) and later destroy().
//
// ctx.root            element to draw into
// ctx.signal          aborted when the game ends (pass it to addEventListener)
// ctx.player(slot)    { slot, name, color, animal, host } or null
// ctx.send(slot, msg) message to one phone
// ctx.broadcast(msg)  message to every phone

const W = 1280, H = 720;
const R = 16;                 // player radius
const SPEED = 240, ACCEL = 2400;
const BULLET_SPEED = 640, BULLET_LIFE = 1.3;
const DAMAGE = 25, FIRE_RATE = 0.2;
const WIN_KILLS = 10;
const RESPAWN_TIME = 2.5, ROUND_END_TIME = 6, SPAWN_SHIELD = 1.5;

const KEYBOARD = "kb";        // test player, no phone needed
const KB_INFO = { name: "Keyboard", color: "#ffffff" };

const WALLS = [
  [560, 310, 160, 100], [200, 140, 40, 140], [1040, 140, 40, 140], [200, 440, 40, 140], [1040, 440, 40, 140],
  [380, 60, 180, 30], [720, 630, 180, 30], [380, 630, 180, 30], [720, 60, 180, 30], [90, 330, 80, 60], [1110, 330, 80, 60],
].map(([x, y, w, h]) => ({ x, y, w, h }));

const SPAWNS = [
  [80, 80], [1200, 80], [80, 640], [1200, 640], [640, 120], [640, 600], [120, 360], [1160, 360],
  [380, 250], [900, 470],
];

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const rnd = (a, b) => a + Math.random() * (b - a);

const CSS = `
.shooter-wrap { width: 100%; height: 100%; display: grid; place-items: center; min-height: 0; }
.shooter-wrap canvas {
  display: block;
  max-width: 100%;
  max-height: 100%;
  aspect-ratio: 16 / 9;
  background: #16303d;
  border: 6px solid var(--ink);
  border-radius: 28px;
  box-shadow: 0 10px 0 var(--shadow);
}`;

export function start(ctx) {
  const { root, signal } = ctx;

  const style = document.createElement("style");
  style.textContent = CSS;
  document.head.append(style);

  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const wrap = document.createElement("div");
  wrap.className = "shooter-wrap";
  wrap.append(canvas);
  root.replaceChildren(wrap);
  const c = canvas.getContext("2d");

  const fighters = new Map();   // slot -> fighter
  let bullets = [];
  let parts = [];
  let state = "play";           // "play" | "over"
  let overTimer = 0;
  let winner = null;            // { name, color }
  let tick = 0;

  // Name and colour come from the console so they match the sidebar (and follow renames).
  const who = (f) => (f.slot === KEYBOARD ? KB_INFO : ctx.player(f.slot) || { name: "?", color: "#888" });

  /* ---------------- Fighters ---------------- */

  function addFighter(slot) {
    if (fighters.has(slot)) return;
    const f = {
      slot, x: 0, y: 0, vx: 0, vy: 0, aim: 0,
      hp: 100, alive: true, respawn: 0, kills: 0, cooldown: 0, shield: 0,
      input: { mx: 0, my: 0, ax: 0, ay: 0 },
    };
    fighters.set(slot, f);
    spawn(f);
    sendHud(f);
  }

  function removeFighter(slot) {
    const f = fighters.get(slot);
    if (!f) return;
    fighters.delete(slot);
    bullets = bullets.filter((b) => b.owner !== f);
  }

  // Spawn at the point that is furthest from everybody else
  function spawn(f) {
    let best = SPAWNS[0], bestDist = -1;
    for (const s of SPAWNS) {
      let d = 1e9;
      for (const o of fighters.values()) if (o !== f && o.alive) d = Math.min(d, Math.hypot(o.x - s[0], o.y - s[1]));
      d += Math.random() * 80;
      if (d > bestDist) { bestDist = d; best = s; }
    }
    f.x = best[0]; f.y = best[1];
    f.vx = f.vy = 0;
    f.hp = 100; f.alive = true; f.shield = SPAWN_SHIELD;
  }

  function pushOut(f) {
    for (const r of WALLS) {
      const cx = clamp(f.x, r.x, r.x + r.w), cy = clamp(f.y, r.y, r.y + r.h);
      const dx = f.x - cx, dy = f.y - cy, d2 = dx * dx + dy * dy;
      if (d2 >= R * R) continue;
      if (d2 > 1e-4) {
        const d = Math.sqrt(d2);
        f.x += (dx / d) * (R - d);
        f.y += (dy / d) * (R - d);
      } else {
        f.y = r.y - R;
      }
    }
    f.x = clamp(f.x, R, W - R);
    f.y = clamp(f.y, R, H - R);
  }

  const inWall = (x, y) =>
    x < 0 || y < 0 || x > W || y > H || WALLS.some((r) => x > r.x && x < r.x + r.w && y > r.y && y < r.y + r.h);

  function burst(x, y, color, n, speed = 260) {
    for (let i = 0; i < n; i++) {
      const a = rnd(0, Math.PI * 2), s = rnd(40, speed);
      parts.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: rnd(0.3, 0.8), color });
    }
  }

  // The phone shows the health bar, kill count and "Respawning..." from this
  function sendHud(f) {
    ctx.send(f.slot, { type: "hud", hp: Math.max(0, f.hp), text: `${f.kills} kills`, down: !f.alive });
  }

  function hit(f, by) {
    if (!f.alive || f.shield > 0 || state !== "play") return;
    const info = who(f);
    f.hp -= DAMAGE;
    burst(f.x, f.y, info.color, 6, 180);
    ctx.send(f.slot, { type: "vibrate", ms: 40 });
    if (f.hp > 0) return;

    f.alive = false;
    f.respawn = RESPAWN_TIME;
    burst(f.x, f.y, info.color, 30);
    ctx.send(f.slot, { type: "vibrate", ms: 250 });
    sendHud(f);

    if (by && by !== f) {
      by.kills++;
      if (by.kills >= WIN_KILLS) {
        state = "over";
        overTimer = ROUND_END_TIME;
        winner = { ...who(by) };
        fighters.forEach((q) => ctx.send(q.slot, { type: "vibrate", ms: [100, 60, 100, 60, 200] }));
      }
    }
  }

  /* ---------------- Simulation ---------------- */

  function step(dt) {
    tick++;
    for (const q of parts) { q.x += q.vx * dt; q.y += q.vy * dt; q.life -= dt; }
    parts = parts.filter((q) => q.life > 0);

    if (state === "over") {
      overTimer -= dt;
      if (overTimer <= 0) {                       // new round
        state = "play";
        winner = null;
        bullets = [];
        fighters.forEach((f) => { f.kills = 0; spawn(f); sendHud(f); });
      }
    }

    for (const f of fighters.values()) {
      f.cooldown -= dt;
      f.shield -= dt;
      if (!f.alive) {
        f.respawn -= dt;
        if (f.respawn <= 0) { spawn(f); sendHud(f); }
        continue;
      }

      const i = f.input;
      const len = Math.hypot(i.mx, i.my), k = len > 1 ? 1 / len : 1;
      const tx = i.mx * k * SPEED, ty = i.my * k * SPEED, a = ACCEL * dt;
      f.vx += clamp(tx - f.vx, -a, a);
      f.vy += clamp(ty - f.vy, -a, a);
      f.x += f.vx * dt;
      f.y += f.vy * dt;
      pushOut(f);

      if (Math.hypot(i.ax, i.ay) > 0.25) {          // aim stick pushed = aim and fire
        f.aim = Math.atan2(i.ay, i.ax);
        if (f.cooldown <= 0 && state === "play") {
          const angle = f.aim + rnd(-0.03, 0.03);
          bullets.push({
            x: f.x + Math.cos(f.aim) * (R + 6),
            y: f.y + Math.sin(f.aim) * (R + 6),
            vx: Math.cos(angle) * BULLET_SPEED,
            vy: Math.sin(angle) * BULLET_SPEED,
            life: BULLET_LIFE,
            owner: f,
            color: who(f).color,
          });
          f.cooldown = FIRE_RATE;
        }
      }
    }

    for (const b of bullets) {
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      b.life -= dt;
      if (inWall(b.x, b.y)) { b.life = 0; burst(b.x, b.y, "#ffe9a8", 4, 120); continue; }
      for (const f of fighters.values()) {
        if (f === b.owner || !f.alive) continue;
        if (Math.hypot(f.x - b.x, f.y - b.y) < R + 3) { b.life = 0; hit(f, b.owner); break; }
      }
    }
    bullets = bullets.filter((b) => b.life > 0);

    if (tick % 6 === 0) fighters.forEach(sendHud);
  }

  /* ---------------- Drawing ---------------- */

  function draw() {
    c.fillStyle = "#16303d";
    c.fillRect(0, 0, W, H);

    c.strokeStyle = "rgba(255,255,255,.05)";
    c.lineWidth = 1;
    c.beginPath();
    for (let x = 0; x <= W; x += 64) { c.moveTo(x, 0); c.lineTo(x, H); }
    for (let y = 0; y <= H; y += 64) { c.moveTo(0, y); c.lineTo(W, y); }
    c.stroke();

    for (const r of WALLS) {
      c.fillStyle = "#3b5a68"; c.fillRect(r.x, r.y, r.w, r.h);
      c.fillStyle = "#5c8496"; c.fillRect(r.x, r.y, r.w, 5);
      c.strokeStyle = "#0a1620"; c.lineWidth = 3; c.strokeRect(r.x, r.y, r.w, r.h);
    }

    for (const b of bullets) {
      c.fillStyle = b.color;
      c.shadowColor = b.color;
      c.shadowBlur = 12;
      c.beginPath();
      c.arc(b.x, b.y, 4.5, 0, Math.PI * 2);
      c.fill();
    }
    c.shadowBlur = 0;

    for (const f of fighters.values()) {
      if (!f.alive) continue;
      const info = who(f);
      c.save();
      c.translate(f.x, f.y);
      if (f.shield > 0 && Math.floor(f.shield * 10) % 2) c.globalAlpha = 0.4;
      c.rotate(f.aim);
      c.fillStyle = "#22313a";
      c.fillRect(4, -5, R + 10, 10);                // gun barrel
      c.rotate(-f.aim);
      c.fillStyle = info.color;
      c.beginPath();
      c.arc(0, 0, R, 0, Math.PI * 2);
      c.fill();
      c.strokeStyle = "rgba(0,0,0,.35)";
      c.lineWidth = 3;
      c.stroke();
      c.restore();

      c.fillStyle = "rgba(0,0,0,.5)";
      c.fillRect(f.x - 20, f.y - R - 14, 40, 6);
      c.fillStyle = f.hp > 50 ? "#5fd38d" : f.hp > 25 ? "#ffc857" : "#ff5a5a";
      c.fillRect(f.x - 20, f.y - R - 14, (40 * f.hp) / 100, 6);
    }

    for (const q of parts) {
      c.globalAlpha = clamp(q.life * 2, 0, 1);
      c.fillStyle = q.color;
      c.fillRect(q.x - 2.5, q.y - 2.5, 5, 5);
    }
    c.globalAlpha = 1;

    // Scoreboard
    const list = [...fighters.values()].sort((a, b) => b.kills - a.kills);
    c.font = "bold 20px Fredoka, sans-serif";
    c.textAlign = "left";
    list.forEach((f, i) => {
      const info = who(f), y = 34 + i * 28;
      c.fillStyle = "rgba(10,22,32,.65)";
      c.fillRect(16, y - 20, 150, 26);
      c.fillStyle = info.color;
      c.beginPath();
      c.arc(30, y - 7, 7, 0, Math.PI * 2);
      c.fill();
      c.fillStyle = "#fff";
      c.fillText(info.name, 44, y, 90);
      c.textAlign = "right";
      c.fillText(f.kills, 158, y);
      c.textAlign = "left";
    });

    c.textAlign = "center";
    if (state === "over" && winner) {
      c.fillStyle = "rgba(10,22,32,.75)";
      c.fillRect(0, H / 2 - 90, W, 180);
      c.fillStyle = winner.color;
      c.font = "bold 64px Fredoka, sans-serif";
      c.fillText(`${winner.name} wins!`, W / 2, H / 2 + 10);
      c.fillStyle = "#fff";
      c.font = "24px Fredoka, sans-serif";
      c.fillText(`New round in ${Math.ceil(overTimer)}…`, W / 2, H / 2 + 55);
    } else if (fighters.size === 0) {
      c.fillStyle = "rgba(10,22,32,.8)";
      c.fillRect(W / 2 - 320, H / 2 - 45, 640, 90);
      c.fillStyle = "#fff";
      c.font = "bold 30px Fredoka, sans-serif";
      c.fillText("Waiting for players…", W / 2, H / 2 + 10);
    }
    c.fillStyle = "rgba(255,255,255,.35)";
    c.font = "16px Fredoka, sans-serif";
    c.fillText("Host: tap Exit on your phone to go back", W / 2, H - 12);
  }

  /* ---------------- Input ---------------- */

  const on = (target, type, fn) => target.addEventListener(type, fn, { signal });
  const axis = (v) => clamp(+v || 0, -1, 1);

  on(window, "player-join", (e) => addFighter(e.detail.slot));
  on(window, "player-leave", (e) => removeFighter(e.detail.slot));
  on(window, "controller-input", (e) => {
    const { slot, data } = e.detail;
    if (data.type !== "dual") return;
    const f = fighters.get(slot);
    if (f) f.input = { mx: axis(data.mx), my: axis(data.my), ax: axis(data.ax), ay: axis(data.ay) };
  });

  // Keyboard test player: WASD moves, arrow keys aim and shoot
  const keys = {};
  function keyboardInput() {
    const f = fighters.get(KEYBOARD);
    if (!f) return;
    f.input = {
      mx: (keys.d ? 1 : 0) - (keys.a ? 1 : 0),
      my: (keys.s ? 1 : 0) - (keys.w ? 1 : 0),
      ax: (keys.arrowright ? 1 : 0) - (keys.arrowleft ? 1 : 0),
      ay: (keys.arrowdown ? 1 : 0) - (keys.arrowup ? 1 : 0),
    };
  }
  on(window, "keydown", (e) => {
    const k = e.key.toLowerCase();
    if (!("wasd".includes(k) && k.length === 1) && !k.startsWith("arrow")) return;
    e.preventDefault();
    addFighter(KEYBOARD);
    keys[k] = 1;
    keyboardInput();
  });
  on(window, "keyup", (e) => { delete keys[e.key.toLowerCase()]; keyboardInput(); });

  /* ---------------- Start ---------------- */

  ctx.players().forEach((p) => addFighter(p.slot));   // everyone already connected

  let last = performance.now(), acc = 0, raf = 0;
  function frame(now) {
    acc += Math.min(0.05, (now - last) / 1000);
    last = now;
    while (acc >= 1 / 60) { step(1 / 60); acc -= 1 / 60; }
    draw();
    raf = requestAnimationFrame(frame);
  }
  raf = requestAnimationFrame(frame);

  return {
    destroy() {
      cancelAnimationFrame(raf);
      style.remove();
    },
  };
}