const documents = new WeakMap();
const DRAG_THRESHOLD = 5;
const capture = { capture: true };

function selectionBounds(document) {
  const selection = document.getSelection();
  if (!selection || selection.rangeCount === 0 || selection.isCollapsed) return null;
  const range = selection.getRangeAt(0);
  return [range.startContainer, range.startOffset, range.endContainer, range.endOffset];
}

/** One capture-phase tracker per document, not one global listener per font. */
export function observeSelectionDrag(document, onFinished) {
  let tracker = documents.get(document);
  if (!tracker) {
    const listeners = new Set();
    let pointer = null;
    function getDrag() {
      if (!pointer?.moved) return null;
      const current = selectionBounds(document);
      if (!current || pointer.selection?.every((value, index) => value === current[index])) return null;
      return Object.freeze({ pointerId: pointer.id, startX: pointer.x, startY: pointer.y });
    }
    function down(event) {
      if (event.button !== 0 || event.isPrimary === false) return;
      pointer = { id: event.pointerId, x: event.clientX, y: event.clientY, moved: false, selection: selectionBounds(document) };
    }
    function move(event) {
      if (pointer?.id !== event.pointerId) return;
      pointer.moved ||= Math.hypot(event.clientX - pointer.x, event.clientY - pointer.y) >= DRAG_THRESHOLD;
    }
    function end(event) {
      if (pointer?.id !== event.pointerId) return;
      const drag = event.type === "pointerup" ? getDrag() : null;
      pointer = null;
      if (drag) for (const listener of listeners) listener(drag);
    }
    function blur() { pointer = null; }
    const events = [["pointerdown", down], ["pointermove", move], ["pointerup", end], ["pointercancel", end]];
    for (const [name, listener] of events) document.addEventListener(name, listener, capture);
    document.defaultView?.addEventListener("blur", blur);
    tracker = {
      listeners, getDrag,
      dispose() {
        pointer = null;
        for (const [name, listener] of events) document.removeEventListener(name, listener, capture);
        document.defaultView?.removeEventListener("blur", blur);
        documents.delete(document);
      }
    };
    documents.set(document, tracker);
  }
  tracker.listeners.add(onFinished);
  let disposed = false;
  return {
    getDrag: tracker.getDrag,
    dispose() {
      if (disposed) return;
      disposed = true;
      tracker.listeners.delete(onFinished);
      if (tracker.listeners.size === 0) tracker.dispose();
    }
  };
}
