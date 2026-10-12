/** Native Range owns selection. This empty, non-interactive layer is never masked with glyphs. */
export function createSelectionIndicator(owner, readRects, onError) {
  let layer = null;
  let frame = 0;
  let previous = "";
  const scrollOptions = { capture: true, passive: true };

  function clear() {
    if (frame) cancelAnimationFrame(frame);
    frame = 0;
    layer?.remove();
    layer = null;
    previous = "";
    window.removeEventListener("scroll", schedule, scrollOptions);
    window.removeEventListener("resize", schedule);
  }

  function schedule() {
    if (frame) return;
    frame = requestAnimationFrame(() => {
      frame = 0;
      try { update(readRects()); }
      catch (error) { clear(); onError(error); }
    });
  }

  function update(rects) {
    const clip = { left: 0, top: 0, right: window.innerWidth, bottom: window.innerHeight };
    let level = 1;
    for (let parent = owner.parentElement; parent; parent = parent.parentElement) {
      const computed = getComputedStyle(parent);
      const z = Number.parseInt(computed.zIndex, 10);
      if (Number.isFinite(z)) level = Math.max(level, z + 1);
      if (![computed.overflowX, computed.overflowY].some(value => /^(hidden|clip|auto|scroll)$/.test(value))) continue;
      const bounds = parent.getBoundingClientRect();
      if (/^(hidden|clip|auto|scroll)$/.test(computed.overflowX)) {
        clip.left = Math.max(clip.left, bounds.left);
        clip.right = Math.min(clip.right, bounds.right);
      }
      if (/^(hidden|clip|auto|scroll)$/.test(computed.overflowY)) {
        clip.top = Math.max(clip.top, bounds.top);
        clip.bottom = Math.min(clip.bottom, bounds.bottom);
      }
    }
    const visible = (rects ?? []).flatMap(rect => {
      if (![rect.left, rect.top, rect.right, rect.bottom].every(Number.isFinite)) return [];
      const left = Math.max(clip.left, rect.left), top = Math.max(clip.top, rect.top);
      const right = Math.min(clip.right, rect.right), bottom = Math.min(clip.bottom, rect.bottom);
      return right > left && bottom > top ? [{ left, top, width: right - left, height: bottom - top }] : [];
    });
    if (visible.length === 0) { clear(); return; }
    const signature = JSON.stringify({ visible, level });
    if (signature === previous) return;
    previous = signature;
    if (!layer) {
      layer = document.createElement("div");
      layer.className = "shaderfont-selection-indicator";
      layer.setAttribute("aria-hidden", "true");
      document.body.append(layer);
      window.addEventListener("scroll", schedule, scrollOptions);
      window.addEventListener("resize", schedule, { passive: true });
    }
    layer.style.zIndex = String(level);
    layer.replaceChildren(...visible.map(rect => {
      const fragment = document.createElement("span");
      fragment.dataset.selectionRect = "true";
      for (const [name, value] of Object.entries(rect)) fragment.style[name] = `${value}px`;
      return fragment;
    }));
  }

  return { update, clear };
}
