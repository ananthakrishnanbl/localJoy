// Thin line icons for the two ability buttons (inline SVG, inherit the text colour).

const wrap = (d) =>
  `<svg class="spn-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;

export const ICONS = {
  dash: wrap('<path d="M5 6l6 6-6 6"/><path d="M13 6l6 6-6 6"/>'),
  jump: wrap('<path d="M12 19V6"/><path d="M6 11l6-6 6 6"/>'),
};
