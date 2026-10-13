/** Selection stays native; each font reads only the intersecting text Range. */
export function selectionWithin(element, document) {
  const selection = document.getSelection();
  if (!selection || selection.rangeCount === 0 || selection.isCollapsed) return null;
  if (!selection.anchorNode || !selection.focusNode) return null;
  const source = selection.getRangeAt(0);
  if (element.contains(selection.anchorNode) && element.contains(selection.focusNode)) {
    return { selection, range: source };
  }
  if (!source.intersectsNode(element)) return null;
  const local = source.cloneRange();
  local.selectNodeContents(element);
  if (source.compareBoundaryPoints(0, local) > 0) local.setStart(source.startContainer, source.startOffset);
  if (source.compareBoundaryPoints(2, local) < 0) local.setEnd(source.endContainer, source.endOffset);
  if (local.collapsed || local.toString().length === 0) return null;
  return { selection, range: local };
}
