/** CSS slices one unbroken decoration strip across native inline fragments. */
export function createPaintLayout(bounds, fragments, inline, direction = "ltr") {
  const boxes = (inline ? fragments : [bounds]).filter(rect => rect.width > 0 && rect.height > 0);
  const width = inline ? boxes.reduce((sum, rect) => sum + rect.width, 0) : bounds.width;
  const height = inline ? boxes.reduce((maximum, rect) => Math.max(maximum, rect.height), 0) : bounds.height;
  let offset = 0;
  return { width, height, fragments: boxes.map(rect => {
    const x = inline && direction === "rtl" ? width - offset - rect.width : offset;
    if (inline) offset += rect.width;
    return { left: rect.left, top: rect.top, width: rect.width, height: rect.height, x };
  }) };
}

/** Preserve only intersections with actual selection rectangles, never a whole-host guess. */
export function projectSelectionRects(layout, rects) {
  return rects.flatMap(rect => layout.fragments.map(fragment => {
    const left = Math.max(rect.left, fragment.left);
    const top = Math.max(rect.top, fragment.top);
    const right = Math.min(rect.right, fragment.left + fragment.width);
    const bottom = Math.min(rect.bottom, fragment.top + fragment.height);
    return { x: fragment.x + left - fragment.left, y: top - fragment.top,
      width: right - left, height: bottom - top };
  }).filter(region => region.width > 0.25 && region.height > 0.25));
}
