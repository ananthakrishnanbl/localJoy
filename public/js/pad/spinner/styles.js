// CSS for the Spin Clash phone controller. Installed in mount(), removed in destroy().

export function installPadStyles() {
  const style = document.createElement("style");
  style.textContent = `
    .spn-pad { position:relative; width:100%; height:100%; display:flex; overflow:hidden;
      touch-action:none; user-select:none; -webkit-user-select:none; -webkit-tap-highlight-color:transparent;
      --spn-accent: var(--player, #ff7a3d); --spn-btn: min(36vh, 24vw); }
    .spn-zone-left  { position:relative; flex:1 1 50%; touch-action:none; }
    .spn-zone-right { position:relative; flex:1 1 50%; touch-action:none; }

    /* analogue stick (floating: appears where the thumb lands) */
    .spn-base { position:absolute; width:var(--spn-base,150px); height:var(--spn-base,150px);
      transform:translate(-50%,-50%); border-radius:50%; border:3px solid rgba(255,255,255,.3);
      background:radial-gradient(circle, rgba(255,255,255,.05), rgba(255,255,255,.14));
      opacity:.35; transition:opacity .12s; pointer-events:none; }
    .spn-base.on { opacity:1; }
    .spn-knob { position:absolute; width:var(--spn-knob,64px); height:var(--spn-knob,64px);
      transform:translate(-50%,-50%); border-radius:50%; pointer-events:none;
      background:radial-gradient(circle at 35% 30%, #fff, var(--spn-accent) 75%);
      box-shadow:0 4px 14px rgba(0,0,0,.45); }

    /* ability buttons */
    .spn-btn { position:absolute; width:var(--spn-btn); height:var(--spn-btn); border-radius:50%;
      border:4px solid var(--spn-accent); color:#fff; padding:0; overflow:hidden; cursor:pointer;
      display:flex; flex-direction:column; align-items:center; justify-content:center; gap:2px;
      font:800 clamp(13px,3.2vh,20px)/1 system-ui,sans-serif; letter-spacing:.08em;
      touch-action:none; transition:transform .06s, filter .15s; box-shadow:0 6px 18px rgba(0,0,0,.5); }
    .spn-btn.dash { right:6%; bottom:12%; background:radial-gradient(circle at 35% 30%, #ffd36b, #ff7a3d 72%); }
    .spn-btn.jump { left:6%;  top:12%;    background:radial-gradient(circle at 35% 30%, #a8ecff, #2a8cff 72%); }
    .spn-icon { font-size:1.9em; line-height:1; }
    .spn-btn::after { content:""; position:absolute; inset:0; border-radius:50%; pointer-events:none;
      background:conic-gradient(rgba(0,0,0,.72) calc(var(--cd,0) * 1turn), transparent 0); }
    .spn-count { position:absolute; inset:0; z-index:2; display:flex; align-items:center; justify-content:center;
      font:900 2.6em system-ui,sans-serif; text-shadow:0 2px 6px #000; pointer-events:none; }
    .spn-btn.cooling { filter:saturate(.45); }
    .spn-btn.down { transform:scale(.92); }
  `;
  document.head.append(style);
  return style;
}
