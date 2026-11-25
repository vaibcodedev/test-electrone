/** Focus is in something that takes typing (field, contenteditable, CodeMirror): single-key shortcuts must not fire. */
export function isEditableTarget(el: EventTarget | null): boolean {
  if (!(el instanceof HTMLElement)) return false
  return el.isContentEditable || !!el.closest('input, textarea, select, .cm-editor')
}

/**
 * A closed Radix Select trigger (role="combobox") has typeahead: a letter picks a value. A single-key shortcut
 * there would change «Статус» and act at the same time. Kept apart from isEditableTarget: Esc must still close
 * the pane and paste must still reach the drop zone.
 */
export function isTypeaheadTarget(el: EventTarget | null): boolean {
  return el instanceof HTMLElement && !!el.closest('[role="combobox"]')
}

/** For scrollIntoView/scrollTo: the CSS reduce-motion rule does not reach a `behavior: 'smooth'` from JS. */
export const scrollBehavior = (): ScrollBehavior =>
  matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth'

/**
 * A menu, popover, confirmation or an open Select list owns the keyboard, even inside a sheet. Select content
 * is mounted only while its list is open (or closing). Not a bare [role="listbox"]: a cmdk list on a page is
 * one too, and it would block N forever.
 */
export const MENU_OPEN =
  '[role="alertdialog"][data-state="open"], [role="menu"][data-state="open"], [data-slot="popover-content"][data-state="open"], [data-slot="select-content"]'

/** A modal (dialog/sheet/popover/menu/select list) is open → page-level keys must not fire behind it. */
export function overlayOpen(): boolean {
  return !!document.querySelector(`[role="dialog"][data-state="open"], ${MENU_OPEN}`)
}
