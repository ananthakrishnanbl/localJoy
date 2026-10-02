// All the CSS of the game (it is injected into <head> in start() and removed again in destroy()).

export const CSS = `
.ctf-wrap{position:relative;width:100%;aspect-ratio:16/9;max-width:100%;max-height:100%;margin:auto;background:#2b1d1a;overflow:hidden;
  color:#f6dcc2;font-family:Fredoka,Georgia,system-ui,sans-serif;font-size:16px;line-height:1.2;user-select:none;-webkit-user-select:none}
.ctf-wrap canvas{position:absolute;left:0;top:0;width:100%;height:100%;display:block}
.ctf-ui{position:absolute;inset:0;pointer-events:none}
.ctf-status{position:absolute;inset:0;z-index:30;display:flex;align-items:center;justify-content:center;text-align:center;
  white-space:pre-line;background:#2b1d1a;padding:2em;font-size:1.3em}
.ctf-panel{background:rgba(43,29,26,.78);border-radius:.5em;padding:.35em .8em}

.ctf-vp{position:absolute;overflow:hidden;box-shadow:inset 0 0 0 2px #2b1d1a}
.ctf-vp.prot{box-shadow:inset 0 0 0 2px #2b1d1a,inset 0 0 3em rgba(140,210,255,.55)}
.ctf-xh{position:absolute;left:50%;top:50%;width:1.5em;height:1.5em;margin:-.75em 0 0 -.75em}
.ctf-xh::before,.ctf-xh::after{content:'';position:absolute;background:#fff;box-shadow:0 0 2px #000}
.ctf-xh::before{left:calc(50% - 1px);top:0;width:2px;height:100%;-webkit-mask:linear-gradient(#000 0 30%,transparent 30% 70%,#000 70%);mask:linear-gradient(#000 0 30%,transparent 30% 70%,#000 70%)}
.ctf-xh::after{top:calc(50% - 1px);left:0;height:2px;width:100%;-webkit-mask:linear-gradient(90deg,#000 0 30%,transparent 30% 70%,#000 70%);mask:linear-gradient(90deg,#000 0 30%,transparent 30% 70%,#000 70%)}
.ctf-hm{position:absolute;left:50%;top:50%;width:2.2em;height:2.2em;margin:-1.1em 0 0 -1.1em;opacity:0}
.ctf-hm::before,.ctf-hm::after{content:'';position:absolute;left:calc(50% - 1px);top:0;width:3px;height:100%;background:#ff5a5f;box-shadow:0 0 3px #000;transform:rotate(45deg)}
.ctf-hm::after{transform:rotate(-45deg)}
.ctf-dmg{position:absolute;inset:0;opacity:0;box-shadow:inset 0 0 6em 1.5em rgba(229,72,77,.85)}
.ctf-hdir{position:absolute;left:50%;top:50%;width:0;height:0;opacity:0}
.ctf-hdir::before{content:'';position:absolute;left:-3em;top:-9em;width:6em;height:1.6em;border-radius:50%;background:radial-gradient(ellipse at 50% 100%,rgba(255,70,75,.95),rgba(255,70,75,0) 70%)}
.ctf-ammo{position:relative;margin-top:.4em;height:1.05em;border-radius:.6em;background:rgba(0,0,0,.45);overflow:hidden}
.ctf-ammo i{position:absolute;left:0;top:0;bottom:0;border-radius:.6em;background:#ffd060}
.ctf-ammo b{position:absolute;inset:0;text-align:center;font-size:.8em;line-height:1.3em;text-shadow:0 1px 2px #000;color:#fff;letter-spacing:.06em}
.ctf-me{position:absolute;left:.6em;top:.6em;min-width:13em}
.ctf-who{display:flex;align-items:center;gap:.45em;font-weight:700;font-size:1.05em}
.ctf-dot{width:.9em;height:.9em;border-radius:50%;border:2px solid rgba(255,255,255,.8);flex:0 0 auto}
.ctf-tag{margin-left:auto;font-size:.8em;padding:.1em .5em;border-radius:1em;color:#fff;letter-spacing:.06em}
.ctf-hp{position:relative;height:1.05em;margin-top:.4em;border-radius:.6em;background:rgba(0,0,0,.45);overflow:hidden}
.ctf-hp i{position:absolute;left:0;top:0;bottom:0;border-radius:.6em}
.ctf-hp .trail{background:rgba(255,255,255,.55);transition:none}
.ctf-hp .fill{transition:width .12s linear,background .3s}
.ctf-hp b{position:absolute;inset:0;text-align:center;font-size:.8em;line-height:1.3em;text-shadow:0 1px 2px #000;color:#fff}
.ctf-kd{margin-top:.3em;font-size:.8em;opacity:.85}
.ctf-obj{position:absolute;left:50%;top:.6em;transform:translateX(-50%);display:flex;align-items:center;gap:.5em;font-size:.85em;white-space:nowrap}
.ctf-arrow{display:inline-block;font-size:1.5em;line-height:1;color:#ffd060;text-shadow:0 1px 2px #000}
.ctf-msg{position:absolute;left:0;right:0;bottom:5em;text-align:center;font-size:1.05em;font-weight:700;text-shadow:0 2px 4px #000,0 0 8px #000}
.ctf-dead{position:absolute;inset:0;display:none;align-items:center;justify-content:center;flex-direction:column;
  background:rgba(40,8,8,.6);font-size:1.6em;font-weight:700;text-shadow:0 2px 4px #000}
.ctf-dead small{font-size:.55em;opacity:.8;margin-top:.3em}
.ctf-vp.dead .ctf-dead{display:flex}
.ctf-stats{position:absolute;display:flex;flex-direction:column;justify-content:center;gap:.5em;padding:1.2em;background:#2b1d1a;box-sizing:border-box}
.ctf-stats h3{margin:0 0 .3em;font-size:1.1em;letter-spacing:.08em;opacity:.8}
.ctf-row{display:flex;align-items:center;gap:.5em;font-size:.95em}
.ctf-row span{margin-left:auto;opacity:.85;font-size:.85em}

.ctf-score{position:absolute;left:50%;bottom:0;transform:translateX(-50%);display:flex;align-items:stretch;gap:.3em;
  padding:.3em .4em;background:rgba(43,29,26,.85);border-radius:.7em .7em 0 0}
.ctf-team{min-width:6.2em;text-align:center;padding:.15em .5em;border-radius:.45em;color:#fff}
.ctf-team b{display:block;font-size:.8em;letter-spacing:.1em}
.ctf-team em{display:block;font-style:normal;font-size:1.5em;font-weight:700;line-height:1.05}
.ctf-team small{display:block;font-size:.65em;opacity:.9;letter-spacing:.05em;white-space:nowrap}
.ctf-first{align-self:center;font-size:1.05em;font-weight:700;opacity:.95;text-align:center;padding:0 .4em;min-width:3.6em;font-variant-numeric:tabular-nums;line-height:1.1}
.ctf-first.low{color:#ff6b6b;opacity:1}
.ctf-first small{display:block;font-size:.55em;letter-spacing:.1em;opacity:.8;font-weight:600}
.ctf-feed{position:absolute;right:.6em;top:.6em;display:flex;flex-direction:column;gap:.25em;align-items:flex-end;font-size:.8em}
.ctf-feed div{padding:.2em .6em;border-radius:.4em;background:rgba(43,29,26,.8)}
.ctf-banner{position:absolute;left:0;right:0;top:34%;text-align:center;display:none;font-weight:700;font-size:4.2em;
  text-shadow:0 4px 0 rgba(0,0,0,.35),0 0 14px rgba(0,0,0,.6);color:#fff3e0}
.ctf-banner small{display:block;font-size:.3em;margin-top:.3em;letter-spacing:.06em}

.ctf-lobby{position:absolute;inset:0}
.ctf-head{position:absolute;left:0;right:0;top:0;height:13%;display:flex;flex-direction:column;align-items:center;justify-content:center;background:#2b1d1a}
.ctf-head h1{margin:0;font-size:2.2em;letter-spacing:.08em;text-shadow:0 3px 0 rgba(0,0,0,.35)}
.ctf-head p{margin:.25em 0 0;opacity:.85;font-size:.95em}
.ctf-foot{position:absolute;left:0;right:0;bottom:0;height:7%;display:flex;align-items:center;justify-content:center;background:#2b1d1a}
.ctf-hint{font-size:1.2em;font-weight:700;color:#ffd060}
.ctf-cell{position:absolute;box-sizing:border-box;border:.2em solid rgba(255,255,255,.16);display:flex;flex-direction:column;justify-content:space-between;padding:.45em .6em;overflow:hidden}
.ctf-cell.t0{border-color:#e5484d}.ctf-cell.t1{border-color:#3b8bff}
.ctf-cell.ready{box-shadow:inset 0 0 2.5em rgba(70,211,107,.6)}
.ctf-cell.empty{align-items:center;justify-content:center;border-style:dashed;background:rgba(43,29,26,.9);opacity:.7;font-size:1.1em}
.ctf-ctop{display:flex;align-items:center;gap:.5em;font-weight:700;font-size:1.15em;text-shadow:0 2px 4px #000}
.ctf-ctop i{width:.9em;height:.9em;border-radius:50%;border:2px solid #fff;flex:0 0 auto}
.ctf-ctop b{margin-left:auto;font-size:.7em;padding:.1em .6em;border-radius:1em;color:#fff;letter-spacing:.08em}
.ctf-cbot{display:flex;flex-direction:column;align-items:center;gap:.15em;text-align:center;text-shadow:0 2px 4px #000;font-weight:700}
.ctf-cbot small{font-size:.75em;opacity:.9;font-weight:600}
.ctf-pick{display:flex;align-items:center;gap:.5em;font-size:1.15em}
.ctf-pill{padding:.05em .8em;border-radius:1em;background:rgba(0,0,0,.5);opacity:.55;color:#fff}
.ctf-pill.on{opacity:1;box-shadow:0 0 0 2px #fff}
.ctf-badge{font-size:1.2em;padding:.05em .9em;border-radius:1em;background:#2fbf71;color:#fff;letter-spacing:.06em}
.ctf-guns{display:flex;gap:.3em;margin-top:.35em;font-size:.72em;font-weight:700;letter-spacing:.05em}
.ctf-guns span{flex:1;text-align:center;padding:.15em .3em;border-radius:.4em;background:rgba(0,0,0,.35);opacity:.55}
.ctf-guns span.on{background:#ffd060;color:#2b1d1a;opacity:1}
`;
