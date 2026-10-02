# 🎮 Phone-Controller Party Console

A browser-based party game console. Open the site on a big screen (laptop or TV), and everyone joins with their **phone as the controller** by scanning a QR code or typing a 5-letter room code. No app installs, no hardware.

Phones and the big screen talk directly to each other using [PeerJS](https://peerjs.com/) (WebRTC), so games feel instant on the same Wi-Fi.

---

## Features

- 📱 **Phone as controller**: join by QR code or room code, no install needed
- 👥 **Up to 10 players**, each with a unique colour and animal avatar
- 👑 **Automatic host**: the first player in is the host and picks the game; if the host leaves, the next player takes over
- 🕹️ **Game select screen** with cover art, ratings, tags and player-count checks
- 🧩 **Pluggable games**: each game is a self-contained ES module
- 🎛️ **Pluggable controllers**: joystick, twin sticks, tilt, multiple choice, or build your own
- 📳 **Haptics and HUD**: games can buzz phones and show health/score bars on them
- 🔒 Wake lock, fullscreen and landscape lock on phones for a console-like feel

---

## How to play

1. Open the console page on the big screen. It shows a **room code** and a **QR code**.
2. On each phone, scan the QR code (or open the controller page and type the code) and enter a name.
3. The first player is the host 👑. When everyone has joined, the host taps **Ready**.
4. The host browses games with the joystick, **A** to start, **B** to go back.
5. Play! The host can tap **Exit** (twice, to avoid accidents) to return to the game list.

> Phones and the big screen need to be able to reach each other. Same Wi-Fi is the most reliable setup.

---

## Project structure

```
/
├── controller.html          Phone page (join form + controller)
├── (console page).html      Big-screen page (lobby, game select, game)
├── qr.svg                   Endpoint that renders the join QR code
├── assets/
│   └── games/               Cover + banner images for each game
└── js/
    ├── common.js            Shared PeerJS settings (PREFIX, peerOptions)
    ├── console.js           Big-screen logic: room, players, host, screens, game loader
    ├── controller.js        Phone logic: join, state, HUD, exit, fullscreen
    ├── select.js            Game-select page (browse + start a game)
    ├── pad/                 Phone controller designs
    │   ├── index.js         Registry of controller types
    │   ├── gamepad.js       "pad"    joystick + buttons
    │   ├── dual.js          "dual"   twin sticks
    │   ├── tilt.js          "tilt"   tilt your phone
    │   └── choice.js        "choice" multiple choice
    └── game/
        ├── gameinfo.js      List of games (metadata) + controller labels
        └── <game-id>/
            └── main.js      The game itself (exports start(ctx))
```

> Adjust the HTML file names above to match your project.

---

## How it works

```
 ┌──────────────┐   PeerJS / WebRTC    ┌──────────────────┐
 │  Phone(s)    │ ───────────────────► │  Big screen      │
 │ controller.js│   input messages     │  console.js      │
 │  + pad/*.js  │ ◄─────────────────── │  + select.js     │
 └──────────────┘  state, hud, vibrate │  + game/<id>/    │
                                       └──────────────────┘
```

- **Console** creates a PeerJS peer named `PREFIX + ROOMCODE` and waits for connections.
- **Controller** connects to that peer, gets a slot (0–9), a colour and an avatar.
- The console tells every phone which **screen** it is on (`lobby`, `select`, `game`), who the host is, and which **pad** to show.
- Phone input is turned into a browser event on the console, `controller-input`, which the select page and the running game listen to.
- Games send messages back through `ctx.send` / `ctx.broadcast` (vibrate, HUD, or custom messages for custom controllers).

### Screens

| Screen | What happens |
|--------|--------------|
| Lobby  | Room code + QR, player list. Host taps **Ready**. |
| Select | Host browses games with the stick. Games outside their min/max player range are locked. |
| Game   | The chosen game's `start(ctx)` runs; phones show the game's controller. |

If everyone leaves, the console resets to the lobby.

### Events on the big screen (`window`)

| Event | Detail | Meaning |
|-------|--------|---------|
| `player-join` | `{ slot, name, color, animal, host }` | Someone connected |
| `player-leave` | `{ slot }` | Someone disconnected |
| `controller-input` | `{ slot, name, host, data }` | A phone sent input |
| `players-change` | `{ count, hostName }` | Player list changed |
| `screen-change` | `{ screen }` | Lobby / select / game switched |
| `game-selected` | `{ game }` | Select page picked a game |
| `select-back` | none | Host pressed B on the select page |

---

## Running the project

The site is static files plus one small endpoint for QR codes, and it needs to be served over a web server (ES modules do not work from `file://`).

```bash
# TODO: replace with your project's real commands
npm install
npm start
```

Then:

1. Open `http://<your-computer>:<port>/` on the big screen.
2. Phones open the QR link (it points to `/controller.html?room=XXXXX`).

Notes:

- **Use the computer's LAN address** (for example `http://192.168.1.20:3000`), not `localhost`, otherwise the QR code will point phones to the wrong place.
- Fullscreen, wake lock and some sensors (tilt) generally require **HTTPS** on phones. Plain `http` on a LAN address may limit them.
- The QR image is generated by `/qr.svg?text=<url>`, which your server must provide.

---

## Adding a game

Three steps (full details in the [Developer guide](#developer-guide) at the bottom of this file):

1. **Describe it** by adding an object to `GAMES` in `js/game/gameinfo.js` (title, players, controller, entry path, etc.).
2. **Add images** to `assets/games/` (cover and banner; the emoji is shown if they are missing).
3. **Write it** in `js/game/<id>/main.js`:

```js
export function start(ctx) {
  // ctx.root, ctx.signal, ctx.players(), ctx.player(slot),
  // ctx.send(slot, msg), ctx.broadcast(msg), ctx.exit()

  // listen for: "player-join", "player-leave", "controller-input"

  return {
    destroy() {
      // stop loops, timers, remove <style> tags
    },
  };
}
```

## Adding a controller

1. Create `js/pad/<name>.js` exporting `{ id, mount(root, io) }`.
2. Register it in `js/pad/index.js`.
3. Add a label in `CONTROLLERS` in `gameinfo.js`.
4. Set `controller: "<name>"` on your game.

`mount()` may return `{ release(), destroy(), onMessage(msg) }`.

---

## Included game

**🔫 Blast Arena** (2–10 players, `dual` controller): a top-down arena shooter. Left thumb moves, right thumb aims and fires. First to 10 kills wins, then a new round starts. For testing without phones, a keyboard player is available: **WASD** to move, **arrow keys** to aim and shoot.

---

## Controllers

| id | Name | Sends |
|----|------|-------|
| `pad` | Joystick + buttons | `move` (x, y), `button` (id A/B, pressed) |
| `dual` | Twin sticks | `dual` (mx, my, ax, ay) |
| `tilt` | Tilt your phone | tilt values |
| `choice` | Multiple choice | the chosen answer |

The host always gets the `pad` controller on the game-select screen so they can browse and start games.

---

## Troubleshooting

| Problem | Try |
|---------|-----|
| "Room not found" | Check the code; make sure the console page is still open |
| "Couldn't connect" | Put phones and the big screen on the same Wi-Fi; some guest/office networks block device-to-device traffic |
| QR code opens the wrong address | Open the console via the computer's LAN address, not `localhost` |
| Room is full | Max 10 players per room |
| A game card is greyed out | The number of connected players is outside the game's min/max |
| "Could not load <game>" | Check the `entry` path in `gameinfo.js` and the browser console; the host can press B on their phone to leave |
| Phone controls stuck after switching apps | The pad releases all inputs when the tab is hidden; rejoin if the connection dropped |

---

## Contributing

- Keep each game self-contained in its own folder.
- Always clean up in `destroy()` (animation frames, timers, injected styles).
- Check `data.type` in `controller-input` and clamp numeric values.
- Prefix CSS class names added by games and pads to avoid clashes.
- Test with min players, max players, a player leaving mid-game, host exit, and restarting the game.

## License

TODO: add your license here.

---

<a id="developer-guide"></a>

# 🛠️ Developer guide

<p align="center">
  <a href="#tab-game"><kbd>&nbsp;🎮 How to add a game&nbsp;</kbd></a>
  &nbsp;
  <a href="#tab-controller"><kbd>&nbsp;🎛️ How to add a controller&nbsp;</kbd></a>
</p>

> Markdown has no real tabs, so each "tab" below is a collapsible section. Click the title to open or close it.

---

<a id="tab-game"></a>

<details open>
<summary><b>🎮 TAB 1: How to add a game</b></summary>

<br>

You only need to do three things. You do **not** need to change the rest of the site.

1. Describe the game in `gameinfo.js`
2. Add its pictures
3. Write the game in `/js/game/<your-game-id>/main.js`

### Quick background

- The **big screen** runs the console. Phones join with a 5-letter room code and become controllers.
- Every player gets a **slot** number `0` to `9`. The slot is the player's ID.
- The **host** is the first player who joined and is still connected. The host picks the game and can exit it.
- Screens go **lobby → select game → game**.
- When a game is picked, the console loads your `main.js`, calls `start(ctx)`, and shows the right controller on every phone.
- Phones send input, the console turns it into browser events, and **your game listens to those events**.
- Your game can send messages back to phones (vibrate, health bar, and so on).

You never touch networking. You only use `ctx` and browser events.

---

### Step 1: Add the game to `gameinfo.js`

Add one object to the `GAMES` array:

```js
{
  id: "my-game",
  title: "My Game",
  tagline: "One short exciting line",
  description: "Two or three sentences explaining the game and controls.",
  cover:  "/assets/games/my-game-cover.svg",
  banner: "/assets/games/my-game-banner.svg",
  emoji: "🎲",
  color: "#3b8bff",
  minPlayers: 1,
  maxPlayers: 4,
  rating: 4,
  tags: ["Party", "Fun"],
  controller: "pad",
  entry: "/js/game/my-game/main.js",
},
```

| Field | Meaning |
|-------|---------|
| `id` | Unique short name, lowercase, no spaces. Also use it as the folder name for your code. |
| `title` | Name shown on the card and detail panel. |
| `tagline` | Short line under the title. |
| `description` | Longer text on the detail panel. |
| `cover` | Square picture for the card on the shelf. |
| `banner` | Wide picture for the detail panel. |
| `emoji` | Fallback icon if the images are missing. |
| `color` | Accent colour (any CSS colour). |
| `minPlayers` | Fewest players needed. Below this the card is greyed out and cannot be started. |
| `maxPlayers` | Most players allowed (the console's hard limit is 10). |
| `rating` | Number from 0 to 5 (decimals ok). Shown as stars. |
| `tags` | Short words shown as small pills. |
| `controller` | Which phone controller the game uses. Must exist in `js/pad/index.js`. Built in: `pad`, `dual`, `tilt`, `choice`. |
| `entry` | Path to your game's `main.js`. |

`CONTROLLERS` in the same file is only the text shown as "Controls: ..." on the detail panel. If the `controller` value does not exist, phones fall back to the joystick `pad` and a warning appears in the browser console.

### Step 2: Add the pictures

Put the cover and banner in `/assets/games/` using the file names from `gameinfo.js`. SVG, PNG or JPG all work. Cover is square, banner is about 16:9. Missing images fall back to the emoji.

### Step 3: Write the game

Create `/js/game/<id>/main.js`. It is an ES module and must **export a function called `start`**.

#### `export function start(ctx)`: the essential function

```js
export function start(ctx) {
  // build your game here
  return {
    destroy() {
      // stop everything your game started
    },
  };
}
```

| | |
|---|---|
| **What it is** | The single entry point. Called once when the host picks your game. |
| **Gets** | One argument, `ctx` (see below). |
| **Returns** | An object `{ destroy() }`. May be `async` (return a Promise of that object). Returning nothing is allowed but gives you no cleanup call, so it is not recommended. |
| **Why it is needed** | Without it the console shows "Could not load <title>". The host can still press **B** on their phone to leave. |

#### `destroy()`: the essential cleanup function

| | |
|---|---|
| **What it is** | Called when the game ends (host pressed Exit, or everyone left). |
| **Returns** | Nothing. |
| **Why it is needed** | The page is **not** reloaded between games. Without cleanup your game keeps running in the background. |

Inside `destroy()`: `cancelAnimationFrame(...)`, `clearInterval` / `clearTimeout`, remove any `<style>` you added to `document.head`, stop audio. Listeners added with `ctx.signal` remove themselves.

#### What `ctx` contains

Everything is given to you, there is nothing to import.

| Item | Returns / type | Use |
|------|----------------|-----|
| `ctx.root` | HTML element | Empty box on the big screen. Draw your game inside it: `root.replaceChildren(canvas)`. Cleared for you when the game ends. |
| `ctx.signal` | `AbortSignal` | Aborted when the game ends. `addEventListener(type, fn, { signal: ctx.signal })` removes the listener automatically. |
| `ctx.players()` | `[{ slot, name, color, animal, host }]` | Everyone connected right now. Call once at start to create characters for players already in. |
| `ctx.player(slot)` | `{ slot, name, color, animal, host }` or `null` | One player's **current** info (names can change, so look it up when drawing). `null` if they left. |
| `ctx.send(slot, msg)` | nothing | Message to **one** phone. Safe even if that phone just left. |
| `ctx.broadcast(msg)` | nothing | Same message to **all** phones. |
| `ctx.exit()` | nothing | Ends your game and returns everyone to the select screen (this also calls `destroy()`). |

Player fields: `slot` is a number 0–9, `name` is text (max 12 chars), `color` is a unique hex colour, `animal` is an emoji, `host` is `true` for the host.

#### Events your game listens to (on `window`)

```js
const on = (target, type, fn) =>
  target.addEventListener(type, fn, { signal: ctx.signal });
```

| Event | `e.detail` | When / what to do |
|-------|-----------|-------------------|
| `player-join` | `{ slot, name, color, animal, host }` | Someone connected mid-game. Create a character for that slot. |
| `player-leave` | `{ slot }` | Someone disconnected. Remove their character and anything they own. |
| `controller-input` | `{ slot, name, host, data }` | A phone sent input. `data` depends on the controller (below). |

`data` shapes by controller:

| Controller | `data` |
|------------|--------|
| `pad` | `{ type: "move", x, y }` (−1 to 1) and `{ type: "button", id, pressed }` (`id` is `"A"` or `"B"`) |
| `dual` | `{ type: "dual", mx, my, ax, ay }` (left stick and right stick, each −1 to 1) |
| `tilt`, `choice` | Their own shapes. Check the `io.send(...)` calls in `js/pad/tilt.js` and `js/pad/choice.js`. |

Always check `data.type` first, ignore types you do not use, and clamp stick values to −1..1. Store the latest input on the player and read it in your game loop instead of moving things inside the event.

The console already handles: the host's **Exit** button, host **B** when a game failed to load, and everyone leaving (back to lobby). While your game **is** running, **B** is passed to your game as normal input.

#### Messages your game can send to phones

| Message | Effect |
|---------|--------|
| `{ type: "vibrate", ms: 50 }` | Buzz the phone. `ms` can be a number or a pattern array like `[100, 60, 100]`. |
| `{ type: "hud", hp: 0-100, text: "5 kills", down: false }` | Small status display. All fields optional: `hp` draws a health bar (omit to hide), `text` is any short text, `down: true` shows a "down / respawning" banner. Send when something changes, not every frame. |
| Any other object | Handed to the phone controller's `onMessage(msg)`. Only controllers that understand it react (for example `choice` for quiz answers). |

#### Typical game structure (copy this)

```js
export function start(ctx) {
  const { root, signal } = ctx;

  // 1. Build the display
  const canvas = document.createElement("canvas");
  canvas.width = 1280; canvas.height = 720;      // fixed logical size
  root.replaceChildren(canvas);
  const g = canvas.getContext("2d");

  // 2. State: one entry per player, keyed by slot
  const chars = new Map();
  const add = (slot) => {
    if (!chars.has(slot))
      chars.set(slot, { slot, x: 640, y: 360, input: { x: 0, y: 0 } });
  };
  ctx.players().forEach((p) => add(p.slot));     // already connected

  // 3. Events
  const on = (t, type, fn) => t.addEventListener(type, fn, { signal });
  on(window, "player-join",  (e) => add(e.detail.slot));
  on(window, "player-leave", (e) => chars.delete(e.detail.slot));
  on(window, "controller-input", (e) => {
    const { slot, data } = e.detail;
    const c = chars.get(slot);
    if (c && data.type === "move") c.input = { x: data.x, y: data.y };
  });

  // 4. Game loop (update + draw)
  let last = performance.now(), raf = 0;
  function frame(now) {
    const dt = Math.min(0.05, (now - last) / 1000);   // seconds
    last = now;
    for (const c of chars.values()) {
      c.x += c.input.x * 200 * dt;
      c.y += c.input.y * 200 * dt;
    }
    g.clearRect(0, 0, 1280, 720);
    for (const c of chars.values()) {
      const info = ctx.player(c.slot);               // name + colour
      g.fillStyle = info ? info.color : "#888";
      g.fillRect(c.x - 10, c.y - 10, 20, 20);
    }
    raf = requestAnimationFrame(frame);
  }
  raf = requestAnimationFrame(frame);

  // 5. Cleanup
  return { destroy() { cancelAnimationFrame(raf); } };
}
```

#### Tips

- Use a fixed canvas size (for example 1280×720) and let CSS scale it to fit (`max-width`, `max-height`, `aspect-ratio: 16 / 9`).
- If you add CSS, append a `<style>` to `document.head`, remove it in `destroy()`, and prefix class names (for example `.mygame-wrap`). Theme variables available: `var(--ink)`, `var(--shadow)`.
- Use the player's **slot** as the key for everything.
- For consistent physics use a fixed step (for example 1/60 s).
- Do not enforce min/max players inside the game, the select page already does. Do handle players joining and leaving mid-game.
- While building, let the keyboard control a fake player (slot `"kb"`) so you can test without phones.
- Your game must be startable again after `destroy()`, the page never reloads.

#### Checklist

- [ ] Game object added to `GAMES` in `gameinfo.js`
- [ ] Cover and banner in `/assets/games/` (or emoji fallback)
- [ ] `/js/game/<id>/main.js` exports `start(ctx)`
- [ ] Display built inside `ctx.root`
- [ ] Characters created for `ctx.players()` and on `player-join`, removed on `player-leave`
- [ ] `controller-input` handled, `data.type` checked
- [ ] `start()` returns `{ destroy() }` that stops loops, timers and styles
- [ ] `controller` in `gameinfo.js` is a registered controller id
- [ ] Tested with min players, max players, a player leaving, host Exit, and starting the game a second time

<p align="right"><a href="#developer-guide">⬆ back to tabs</a></p>

</details>

---

<a id="tab-controller"></a>

<details open>
<summary><b>🎛️ TAB 2: How to add a controller</b></summary>

<br>

### Which controller does my game need?

| id | Design | Sends |
|----|--------|-------|
| `pad` | Joystick + buttons (A, B) | `move`, `button` |
| `dual` | Twin sticks (move + aim/fire) | `dual` |
| `tilt` | Phone tilt sensor | tilt values |
| `choice` | Multiple-choice answer buttons | the chosen answer |

The available controllers are the keys of the `PADS` object in `js/pad/index.js`. Any name in `PADS` is a valid `controller` value.

The host **always** gets the joystick `pad` on the select-game screen (to browse and pick games), whatever controller the game uses. Your controller appears once the game starts.

If none of these fit (a single big tap button, steering wheel, card hand, drawing area, keypad...), build a new one.

---

### Step A: Create `js/pad/<name>.js`

```js
export default {
  id: "tapper",                    // the name used in gameinfo.js

  mount(root, io) {
    // root = empty element on the phone. Build your UI inside it.
    // io   = { send(msg) } sends a message to the console, which
    //        delivers it to your game as "controller-input".

    const style = document.createElement("style");
    style.textContent = `
      .tapper-btn {
        width: 60%; height: 60%;
        font-size: 3rem; border-radius: 50%;
        touch-action: none;
      }`;
    document.head.append(style);

    const btn = document.createElement("button");
    btn.className = "tapper-btn";
    btn.textContent = "TAP";
    root.append(btn);

    const down = () => io.send({ type: "tap", pressed: true });
    const up   = () => io.send({ type: "tap", pressed: false });
    btn.addEventListener("pointerdown", down);
    btn.addEventListener("pointerup", up);
    btn.addEventListener("pointercancel", up);

    return {
      release() {
        // Let go of every input. Called when the tab is hidden, the
        // connection drops, or the pad is swapped. Send a "nothing is
        // pressed" message so the game is not stuck with a held input.
        up();
      },
      destroy() {
        // Remove anything outside root: window listeners, timers,
        // sensors, <style> tags. (root itself is cleared for you.)
        style.remove();
      },
      onMessage(msg) {
        // Custom messages sent by the GAME with ctx.send / ctx.broadcast
        // (anything except "vibrate" and "hud"). Update your UI here.
      },
    };
  },
};
```

| Part | What it is and why |
|------|--------------------|
| `id` | Unique name. Must match `controller: "..."` in `gameinfo.js`. |
| `mount(root, io)` | **Required.** Called when this controller must appear. Returns an object with up to three optional functions (below). |
| `release()` | Stop all held inputs. Prevents stuck buttons and sticks. |
| `destroy()` | Remove everything you added outside `root`. Prevents leftovers when pads are swapped. |
| `onMessage(msg)` | Receive custom messages from the game (for example quiz choices). |
| `io.send(msg)` | Send any plain object. It arrives in the game as `e.detail.data`. Always include a `type` field. Do **not** use the reserved types `join`, `ready`, `exit`. Send only on change, or at most about 30 times per second for sticks. |

### Step B: Register it in `js/pad/index.js`

```js
import tapper from "./tapper.js";      // with the other imports

const PADS = {
  // ...existing pads
  [tapper.id]: tapper,                 // add inside PADS
};
```

### Step C: Give it a label in `gameinfo.js`

```js
export const CONTROLLERS = {
  // ...existing labels
  tapper: "One big tap button",
};
```

This is only the text shown on the game detail panel.

### Step D: Use it in your game

In `gameinfo.js`:

```js
controller: "tapper",
```

In your game's `main.js`:

```js
on(window, "controller-input", (e) => {
  const { slot, data } = e.detail;
  if (data.type === "tap") { /* data.pressed is true or false */ }
});
```

Optional, game to controller:

```js
// game
ctx.send(slot, { type: "prompt", text: "Go!" });

// controller
onMessage(msg) { if (msg.type === "prompt") { /* update UI */ } }
```

### Phone-screen tips

- The phone page already blocks scrolling and the long-press menu.
- Use `touch-action: none` on touch areas and pointer events (`pointerdown`, `pointermove`, `pointerup`, `pointercancel`).
- For multi-touch (two thumbs, like the twin-stick pad) track `pointerId`.
- The phone is shown in landscape, so design wide controls with large touch targets.
- The player's colour is available as the CSS variable `--player`.
- Put CSS in a `<style>` you add in `mount()` and remove in `destroy()`, and prefix class names.

<p align="right"><a href="#developer-guide">⬆ back to tabs</a></p>

</details>