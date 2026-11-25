/** Focus is in something that takes typing (field, contenteditable, CodeMirror): single-key shortcuts must not fire. */
export function isEditableTarget(el: EventTarget | null): boolean {
  if (!(el instanceof HTMLElement)) return false
  return el.isContentEditable || !!el.closest('input, textarea, select, .cm-editor')
}
