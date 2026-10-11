// CSS for the Spin Clash phone controller: ivory, crimson and a touch of gold.
// Installed in mount(), removed in destroy().

export function installPadStyles() {
  const style = document.createElement("style");
  style.textContent = `
    .spn-pad { position:relative; width:100%; height:100%; display:flex; overflow:hidden;
      touch-action:none; user-select:none; -webkit-user-select:none; -webkit-touch-callout:none;
      -webkit-tap-highlight-color:transparent;
      --spn-accent: var(--player, #c8102e); --spn-btn: min(36vh, 24vw);
      --spn-serif: "Playfair Display","Cormorant Garamond",Georgia,"Times New Roman",serif; }
    .spn-zone-left  { position:relative; flex:1 1 50%; touch-action:none; }
    .spn-zone-right { position:relative; flex:1 1 50%; touch-action:none; }

    /* ---- analogue stick ---- */
    .spn-base { position:absolute; width:var(--spn-base,150px); height:var(--spn-base,150px);
      transform:translate(-50%,-50%); border-radius:50%; pointer-events:none;
      border:2px solid rgba(246,242,234,.35);
      background:radial-gradient(circle, rgba(246,242,234,.04), rgba(246,242,234,.12));
      box-shadow: inset 0 0 0 8px rgba(246,242,234,.04);
      opacity:.55; transition:opacity .12s, border-color .12s; }
    .spn-base.on { opacity:1; border-color:rgba(232,211,162,.8); }
    .spn-knob { position:absolute; width:var(--spn-knob,64px); height:var(--spn-knob,64px);
      transform:translate(-50%,-50%); border-radius:50%; pointer-events:none;
      border:3px solid var(--spn-accent);
      background:radial-gradient(circle at 35% 28%, #ffffff, #e9e3d6 72%);
      box-shadow:0 6px 16px rgba(0,0,0,.45), inset 0 0 0 2px rgba(255,255,255,.7); }

    /* ---- ability buttons ----
       .spn-slot is only positioned (never transformed or filtered) so it can't drift;
       the press effect scales the inner .spn-face instead. */
    .spn-slot { position:absolute; width:var(--spn-btn); height:var(--spn-btn); }
    .spn-slot.dash { right:6%; bottom:4%; }
    .spn-slot.jump { right: 6%; bottom: 52%; }

    .spn-btn { position:absolute; left:0; top:0; width:100%; height:100%; margin:0; padding:0; border:0;
      background:none; border-radius:50%; outline:none; cursor:pointer;
      -webkit-appearance:none; appearance:none; touch-action:none; -webkit-tap-highlight-color:transparent; }

    .spn-face { position:absolute; left:0; top:0; width:100%; height:100%; border-radius:50%;
      display:flex; flex-direction:column; align-items:center; justify-content:center; gap:.4em;
      transform:scale(1); transform-origin:50% 50%; transition:transform .08s ease-out, opacity .15s;
      box-shadow:0 10px 22px rgba(0,0,0,.45), inset 0 0 0 3px rgba(232,211,162,.9), inset 0 0 0 5px rgba(0,0,0,.12); }
    .spn-slot.dash .spn-face { background:radial-gradient(circle at 35% 28%, #e0314d, #c8102e 55%, #8f0b21); color:#f6f2ea; }
    .spn-slot.jump .spn-face { background:radial-gradient(circle at 35% 28%, #ffffff, #ece6d9 70%, #d8d0bf); color:#1d1d21; }
    .spn-btn.down .spn-face { transform:scale(.94); }
    .spn-btn.cooling .spn-face { opacity:.78; }

    .spn-icon { width:34%; height:34%; }
    .spn-label { font:700 clamp(11px,2.4vh,15px)/1 var(--spn-serif); letter-spacing:.22em; text-indent:.22em; }

    .spn-shade { position:absolute; left:0; top:0; width:100%; height:100%; border-radius:50%; pointer-events:none;
      background:conic-gradient(rgba(20,20,24,.74) calc(var(--cd,0) * 1turn), transparent 0); }
    .spn-count { position:absolute; left:0; top:0; width:100%; height:100%; display:flex; align-items:center; justify-content:center;
      font:700 clamp(26px,7vh,48px)/1 var(--spn-serif); color:#f6f2ea; text-shadow:0 2px 8px rgba(0,0,0,.7); pointer-events:none; }
  `;
  document.head.append(style);
  return style;
}
