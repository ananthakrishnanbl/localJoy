// SPIN CLASH - sound. Everything is synthesized with the Web Audio API (no audio files).
// Listens to the same bus the effects/phone-link use, so physics stays sound-free.
// Put this file in core/sound.js. Press M on the big screen to mute / unmute.

import { CANVAS, MATCH, SOUND } from "../config.js";

export function createSound({ bus, match, on }) {
  let ac = null, master = null, noiseBuf = null;
  let muted = false;
  const lastPlayed = new Map();

  // ---- audio context (browsers only allow sound after a click / key / touch) ----
  function ensure() {
    if (ac) return ac;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    ac = new AC();
    const comp = ac.createDynamicsCompressor(); // keeps many simultaneous hits from clipping
    master = ac.createGain();
    master.gain.value = SOUND.volume;
    master.connect(comp);
    comp.connect(ac.destination);
    noiseBuf = ac.createBuffer(1, ac.sampleRate, ac.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    return ac;
  }
  const unlock = () => { if (ensure() && ac.state === "suspended") ac.resume(); };
  ensure();
  for (const type of ["pointerdown", "keydown", "touchstart", "click"]) on(window, type, unlock);
  on(window, "keydown", (e) => { if (e.code === "KeyM" && !e.repeat) muted = !muted; });

  const ready = () => ac && !muted && ac.state === "running";
  // stop the same sound from firing more than once every `ms`
  const gate = (key, ms) => {
    const now = performance.now();
    if (now - (lastPlayed.get(key) || 0) < ms) return false;
    lastPlayed.set(key, now);
    return true;
  };
  const panOf = (x) => Math.max(-1, Math.min(1, ((x ?? CANVAS.w / 2) - CANVAS.w / 2) / (CANVAS.w / 2))) * 0.8;

  function dest(pan) {
    if (!pan || !ac.createStereoPanner) return master;
    const p = ac.createStereoPanner();
    p.pan.value = pan;
    p.connect(master);
    return p;
  }

  // ---- building blocks -------------------------------------------------------
  function tone({ f, f2 = f, dur = 0.15, type = "sine", vol = 0.3, delay = 0, pan = 0 }) {
    const t0 = ac.currentTime + delay;
    const o = ac.createOscillator(), g = ac.createGain();
    o.type = type;
    o.frequency.setValueAtTime(f, t0);
    o.frequency.exponentialRampToValueAtTime(Math.max(1, f2), t0 + dur);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(vol, t0 + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g); g.connect(dest(pan));
    o.start(t0); o.stop(t0 + dur + 0.03);
  }

  function noise({ dur = 0.2, f = 1000, f2 = f, q = 1, vol = 0.3, delay = 0, pan = 0, type = "bandpass", attack = 0.008 }) {
    const t0 = ac.currentTime + delay;
    const s = ac.createBufferSource();
    s.buffer = noiseBuf; s.loop = true;
    const fl = ac.createBiquadFilter();
    fl.type = type; fl.Q.value = q;
    fl.frequency.setValueAtTime(f, t0);
    fl.frequency.exponentialRampToValueAtTime(Math.max(20, f2), t0 + dur);
    const g = ac.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(vol, t0 + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    s.connect(fl); fl.connect(g); g.connect(dest(pan));
    s.start(t0, Math.random()); s.stop(t0 + dur + 0.03);
  }

  // ---- game sounds -----------------------------------------------------------
  const sfx = {
    // DASH: air whoosh + rising buzz
    dash(e) {
      const pan = panOf(e.x);
      noise({ dur: 0.35, f: 500, f2: 3500, q: 1.5, vol: 0.35, pan });
      tone({ f: 120, f2: 400, dur: 0.25, type: "sawtooth", vol: 0.12, pan });
    },
    // JUMP: springy upward blip
    jump(e) {
      const pan = panOf(e.x);
      tone({ f: 300, f2: 900, dur: 0.18, type: "square", vol: 0.12, pan });
      tone({ f: 600, f2: 1400, dur: 0.12, type: "sine", vol: 0.15, pan, delay: 0.04 });
    },
    // LAND: soft thud
    land(e) {
      const pan = panOf(e.x);
      tone({ f: 140, f2: 60, dur: 0.14, type: "sine", vol: 0.35, pan });
      noise({ dur: 0.08, f: 400, type: "lowpass", vol: 0.15, pan });
    },
    // normal bump: metallic "tink", louder and lower with power
    bump(e) {
      if (!gate("bump", 50)) return;
      const p = Math.min(1.5, e.power ?? 0.5), pan = panOf(e.x);
      const base = 900 - p * 250 + Math.random() * 120;
      tone({ f: base, f2: base * 0.7, dur: 0.1, type: "triangle", vol: 0.12 + p * 0.18, pan });
      tone({ f: base * 2.4, f2: base * 2, dur: 0.06, type: "sine", vol: 0.06 + p * 0.08, pan });
      noise({ dur: 0.04, f: 3000, type: "highpass", vol: 0.08 + p * 0.1, pan });
    },
    // DASH HIT / THROW: heavy crash + low boom + zing of the victim flying away
    throw(e) {
      const pan = panOf(e.x);
      tone({ f: 180, f2: 35, dur: 0.45, type: "sine", vol: 0.7, pan });
      noise({ dur: 0.3, f: 2500, f2: 300, q: 0.7, vol: 0.5, pan });
      tone({ f: 1200, f2: 300, dur: 0.12, type: "square", vol: 0.15, pan });
      tone({ f: 500, f2: 1800, dur: 0.3, type: "sine", vol: 0.1, pan, delay: 0.05 });
    },
    // wall bounce: dull thunk
    wall(e) {
      if (!gate("wall", 70)) return;
      const p = Math.min(1.5, e.power ?? 0.5), pan = panOf(e.x);
      tone({ f: 220, f2: 90, dur: 0.12, type: "sine", vol: 0.15 + p * 0.2, pan });
      noise({ dur: 0.05, f: 800, type: "lowpass", vol: 0.1 + p * 0.1, pan });
    },
    // fell out: descending wail
    out(e) {
      const pan = panOf(e.x);
      tone({ f: 600, f2: 70, dur: 0.9, type: "sawtooth", vol: 0.22, pan });
      tone({ f: 590, f2: 65, dur: 0.9, type: "square", vol: 0.1, pan });
      noise({ dur: 0.7, f: 1500, f2: 200, q: 1, vol: 0.15, pan, delay: 0.1 });
    },
    // walls lowering: grinding rumble
    wallsDown() {
      noise({ dur: 2, f: 200, f2: 60, type: "lowpass", q: 2, vol: 0.55, attack: 0.3 });
      tone({ f: 70, f2: 35, dur: 2, type: "sawtooth", vol: 0.2 });
    },
    // countdown tick (3, 2, 1) and the final higher beep
    tick() { tone({ f: 660, dur: 0.12, type: "square", vol: 0.15 }); },
    go() {
      tone({ f: 880, dur: 0.5, type: "square", vol: 0.18 });
      tone({ f: 1320, dur: 0.5, type: "sawtooth", vol: 0.1 });
      noise({ dur: 0.4, f: 800, f2: 4000, vol: 0.2 });
    },
    // shrink / walls warning
    warn() {
      tone({ f: 520, dur: 0.15, type: "square", vol: 0.14 });
      tone({ f: 520, dur: 0.15, type: "square", vol: 0.14, delay: 0.22 });
    },
    // round won
    roundEnd() {
      [523, 659, 784].forEach((f, i) => tone({ f, dur: 0.25, type: "triangle", vol: 0.25, delay: i * 0.12 }));
    },
    // overall winner fanfare
    winner() {
      [523, 659, 784, 1047].forEach((f, i) => tone({ f, dur: 0.3, type: "square", vol: 0.14, delay: i * 0.14 }));
      [523, 659, 784, 1047].forEach((f, i) => tone({ f: f / 2, dur: 0.3, type: "triangle", vol: 0.25, delay: i * 0.14 }));
      [1047, 1319, 1568].forEach((f) => tone({ f, dur: 1.2, type: "triangle", vol: 0.18, delay: 0.6 }));
    },
  };

  for (const name of ["dash", "jump", "land", "bump", "throw", "wall", "out", "wallsDown", "roundEnd", "winner"]) {
    bus.on(name, (e) => { if (ready()) sfx[name](e); });
  }
  bus.on("fight", () => { if (ready()) sfx.go(); });

  // ---- things that come from match state, not from bus events ----------------
  let lastCount = 0;
  let lastNotice = "";

  return {
    // Call once per frame.
    update() {
      if (!ready()) return;

      if (match.phase === "countdown") {
        const n = Math.ceil(MATCH.countdown - match.t);
        if (n !== lastCount && n > 0) { lastCount = n; sfx.tick(); }
      } else {
        lastCount = 0;
      }

      const notice = match.notice;
      if (notice !== lastNotice) {
        if (notice.includes("about to")) sfx.warn();
        lastNotice = notice;
      }
    },
    destroy() { if (ac) ac.close(); },
  };
}
