// Small helpers used by many files (maths, stick values, asset paths, a tiny DOM builder).

export const clampN = (v, a, b) => Math.max(a, Math.min(b, v));
export const num = (v) => (Number.isFinite(+v) ? +v : 0);
export const stickVal = (v) => clampN(num(v), -1, 1);
export const curve = (v) => 0.55 * v + 0.45 * v * Math.abs(v);       // fine aim near the centre, fast at the edge
export const assetUrls = (rel) => [new URL("./assets/" + rel, import.meta.url).href, "/js/game/ctf/assets/" + rel];
export function mulberry32(a) { return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
export const h = (tag, cls, text) => {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text !== undefined) n.textContent = text;
  return n;
};
