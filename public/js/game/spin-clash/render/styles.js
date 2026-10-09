// CSS for the big-screen canvas. Injected on start, removed in destroy().

export function installStyles() {
  const style = document.createElement("style");
  style.textContent = `
    .spinclash-wrap { width:100%; height:100%; display:grid; place-items:center; background:#04060d; overflow:hidden; }
    .spinclash-canvas { width:100%; height:100%; object-fit:contain; display:block; }
  `;
  document.head.append(style);
  return style;
}
