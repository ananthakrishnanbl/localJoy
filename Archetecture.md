# Architecture

How the phone controllers, the big-screen console, the games and the controller designs fit together.

Read it top to bottom: devices connect over PeerJS, `console.js` runs the session, games and controller designs plug in at the edges.

```text
+-----------------------------------------------------------------------------------+
|                                  PHYSICAL DEVICES                                 |
|                                                                                   |
|   +--------------------------+                 +--------------------------+       |
|   |   SMARTPHONE (Player)    |                 |   BIG SCREEN (Console)   |       |
|   |    controller.html       |                 |        index.html        |       |
|   +-------------+------------+                 +------------+-------------+       |
+-----------------|-------------------------------------------|---------------------+
                  |                                           |
                  v                                           v
+-----------------------------------------------------------------------------------+
|                               WEBRTC MESH NETWORK                                 |
|                                                                                   |
|                 +-------------------------------------------+                     |
|                 |              PeerJS Network               |                     |
|                 |    Room Code: PREFIX + 5-letter Code      |                     |
|                 +---------------------+---------------------+                     |
+---------------------------------------|-------------------------------------------+
                                        |
                                        v
+-----------------------------------------------------------------------------------+
|                            MAIN CONSOLE ARCHITECTURE                              |
|                                                                                   |
|   +---------------------------------------------------------------------------+   |
|   | console.js (Core Orchestrator)                                            |   |
|   |  - Creates Peer Server & Room ID                                          |   |
|   |  - Manages player map & slot assignment (0-9)                             |   |
|   |  - Determines session Host (lowest `seq`)                                 |   |
|   |  - Screen state manager ("lobby" | "select" | "game")                     |   |
|   |  - Broadcasts `controller` string (e.g. "dual", "pad") based on gameinfo  |   |
|   +--------------------+----------------------------+-------------------------+   |
|                        |                            |                             |
|       Incoming Data    |                            | Dynamic Loading             |
|       ("controller-    |                            | & State Sync                |
|        input")         |                            |                             |
|                        v                            v                             |
|   +--------------------+----------+     +-----------+-------------------------+   |
|   | select.js                     |     | Active Game (e.g., main.js)         |   |
|   |  - Game shelf & details view  |     |  - Renders canvas to #gameRoot      |   |
|   |  - Filters minimum players    |     |  - Runs 60 FPS update/draw loop     |   |
|   |  - Controlled by Host inputs  |     |  - Receives `ctx` toolkit           |   |
|   +-------------------------------+     +-----------+-------------------------+   |
|                                                     |                             |
+-----------------------------------------------------|-----------------------------+
                                                      |
                                                      v
+-----------------------------------------------------------------------------------+
|                          CLEANUP & LIFECYCLE MANAGEMENT                           |
|                                                                                   |
|   +---------------------------------------+ +---------------------------------+   |
|   | AbortSignal (gameAbort.signal)        | | destroy()                       |   |
|   |  - Removes window "controller-input"  | |  - Kills requestAnimationFrame  |   |
|   |  - Removes window "player-join/leave" | |  - Cleans up injected styles    |   |
|   |  - Removes window keyboard listeners  | |  - Resets canvas & game state   |   |
|   +---------------------------------------+ +---------------------------------+   |
+-----------------------------------------------------------------------------------+

        console.js ──(PeerJS)──►  `state` message { controller: "dual" }
                                  (and phone ──► "controller-input" back to console)
                                        |
                                        v
+-----------------------------------------------------------------------------------+
|                        PHONE CONTROLLER SUBSYSTEM ARCHITECTURE                    |
|                                                                                   |
|  +-----------------------------------------------------------------------------+  |
|  | controller.js (Controller Orchestrator)                                     |  |
|  |  - Receives `state` message containing `{ controller: "dual" }`             |  |
|  |  - Calls `showPad("dual")` -> queries registry `getPad("dual")`             |  |
|  |  - Unmounts old pad (`release()`, `destroy()`)                              |  |
|  +-------------------------------------+---------------------------------------+  |
|                                        |                                          |
|                                        v                                          |
|  +-----------------------------------------------------------------------------+  |
|  | pad/index.js (Controller Registry)                                          |  |
|  |  - PADS Map: { pad: gamepad, dual: dual, tilt: tilt, choice: choice }       |  |
|  |  - Exports `getPad(type)` to fetch pad implementation                       |  |
|  +-------------------------------------+---------------------------------------+  |
|                                        |                                          |
|                                        v                                          |
|  +-----------------------------------------------------------------------------+  |
|  | Controller Module Implementation (e.g., dual.js)                            |  |
|  |  - Component Builders: `makeStick()`, `makeButton()` (from widgets.js)      |  |
|  |  - `mount(root, io)`: Injects HTML controls into `#padHost`                 |  |
|  |  - `io.send(msg)`: Emits touch inputs back to WebRTC layer                  |  |
|  |  - Returns `{ release(), destroy(), onMessage() }` for cleanup              |  |
|  +-----------------------------------------------------------------------------+  |
+-----------------------------------------------------------------------------------+
```