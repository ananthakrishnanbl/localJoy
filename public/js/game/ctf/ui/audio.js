// Tiny synthesised sound effects (gunshot and ding).

export function setupAudio(G) {
  const S = G.S;

  /* ---------------- sound (same noise-burst gunshot as index.html) ---------------- */
  S.audio = null;
  function bang(vol = 0.25) {
    try {
      S.audio ||= new AudioContext();
      if (S.audio.state === "suspended") S.audio.resume();
      const n = S.audio.sampleRate * 0.15 | 0, b = S.audio.createBuffer(1, n, S.audio.sampleRate), d = b.getChannelData(0);
      for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / n, 3);
      const src = S.audio.createBufferSource(), g = S.audio.createGain(); g.gain.value = vol;
      src.buffer = b; src.connect(g).connect(S.audio.destination); src.start();
    } catch {}
  }
  function ding(freq = 660, len = 0.18) {
    try {
      S.audio ||= new AudioContext();
      if (S.audio.state === "suspended") S.audio.resume();
      const o = S.audio.createOscillator(), g = S.audio.createGain();
      o.type = "triangle"; o.frequency.value = freq;
      g.gain.setValueAtTime(0.18, S.audio.currentTime); g.gain.exponentialRampToValueAtTime(0.001, S.audio.currentTime + len);
      o.connect(g).connect(S.audio.destination); o.start(); o.stop(S.audio.currentTime + len);
    } catch {}
  }

  // shared with the modules set up after this one
  Object.assign(G, { bang, ding });
}
