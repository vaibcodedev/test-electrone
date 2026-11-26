import type { EditorView } from '@codemirror/view'

/** The text menu's own content (also the test hook): `[data-text-menu]`. */
export const MENU_ATTR = 'data-text-menu'

export const inTextMenu = (node: unknown): boolean =>
  node instanceof Element && !!node.closest(`[${MENU_ATTR}]`)

/** A record's own right-click menu (shadcn ContextMenuTrigger: kanban card, sidebar entry). */
const RECORD_TRIGGER = '[data-context-menu-trigger]'

const EDITABLE = 'input, textarea, [contenteditable]:not([contenteditable="false"])'

function editableAt(el: Element): boolean {
  return (el instanceof HTMLElement && el.isContentEditable) || !!el.closest(EDITABLE)
}

/**
 * The pointer is on selected text (not just somewhere while a selection exists), and Chromium will see it too:
 * text a person can't select (user-select: none) gives an empty string, and the record menu stays.
 */
function onSelection(el: Element): boolean {
  const sel = window.getSelection()
  if (!sel || sel.isCollapsed || !sel.rangeCount || !sel.toString().trim()) return false
  return sel.getRangeAt(0).intersectsNode(el)
}

interface Origin {
  target: Element
  x: number
  y: number
  at: number
}

let origin: Origin | null = null

/**
 * Remembers where the last `contextmenu` happened (main's request arrives a moment later and has no DOM), and
 * lets the text menu win over a record's menu: in a field or on selected text inside a ContextMenuTrigger the
 * event never reaches Radix, so Chromium goes on to ask main and only the text menu opens. Anywhere else the
 * record menu calls preventDefault, Chromium asks nothing, and only the record menu opens.
 */
export function watchContextMenu(): () => void {
  const onContextMenu = (e: MouseEvent): void => {
    const target = e.target
    if (!(target instanceof Element)) return
    if (inTextMenu(target)) {
      // A right click on the menu itself: nothing to offer, no round trip to main.
      e.preventDefault()
      return
    }
    origin = { target, x: e.clientX, y: e.clientY, at: performance.now() }
    if (target.closest(RECORD_TRIGGER) && (editableAt(target) || onSelection(target))) e.stopPropagation()
  }
  window.addEventListener('contextmenu', onContextMenu, true)
  return () => window.removeEventListener('contextmenu', onContextMenu, true)
}

/** Where the menu main just asked for was opened, if the DOM event was seen a moment ago. */
export function takeOrigin(): Origin | null {
  const o = origin
  origin = null
  return o && o.target.isConnected && performance.now() - o.at < 2000 ? o : null
}

/** The CodeMirror editor around `el`, when its view can be found (code and Markdown editors). */
export async function editorAt(el: Element | null): Promise<EditorView | null> {
  const dom = el?.closest('.cm-editor')
  if (!(dom instanceof HTMLElement)) return null
  // Already loaded by the editor itself: resolves at once, and the menu doesn't pull CodeMirror into the app chunk.
  const { EditorView } = await import('@codemirror/view')
  return EditorView.findFromDOM(dom)
}

/**
 * The whole text of the code block under the pointer: a block of rendered Markdown (notes, the AI chat) or
 * read-only code (a snippet being read). null — not in a code block.
 */
export function codeBlockText(target: Element, view: EditorView | null): string | null {
  const pre = target.closest('pre')
  if (pre) return pre.textContent ?? ''
  if (view && !view.contentDOM.isContentEditable && view.dom.contains(target)) return view.state.doc.toString()
  return null
}

/**
 * The field the menu was asked for has focus. It always has after a right click on it — except a right click
 * outside an open menu: that press landed on the menu's overlay, Chromium still asks for the field under it, but
 * focus went nowhere. The editing commands act on the focused field, so it gets focus here.
 */
export function focusField(target: Element, view: EditorView | null): void {
  if (view && view.dom.contains(target)) {
    if (!view.hasFocus) view.focus()
    return
  }
  const field = target.closest(EDITABLE)
  if (field instanceof HTMLElement && document.activeElement !== field) field.focus({ preventScroll: true })
}

/** What has focus and what is selected when the menu opens, to give back when it closes. */
export interface FocusSnapshot {
  el: HTMLElement | null
  /** A text field's selection (it survives the blur, but is set again if anything moved it). */
  field: { start: number; end: number; dir: 'forward' | 'backward' | 'none' } | null
  /** The page's selection outside fields. */
  range: Range | null
}

export function snapshotFocus(): FocusSnapshot {
  const active = document.activeElement
  const el = active instanceof HTMLElement && active !== document.body ? active : null
  const field =
    (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) && el.selectionStart !== null
      ? { start: el.selectionStart, end: el.selectionEnd ?? el.selectionStart, dir: el.selectionDirection ?? 'none' }
      : null
  // A field (or CodeMirror, which restores its own) keeps its selection; only the page's text is saved.
  const sel = window.getSelection()
  const range =
    !(el && editableAt(el)) && sel && sel.rangeCount && !sel.isCollapsed ? sel.getRangeAt(0).cloneRange() : null
  return { el, field, range }
}

/**
 * While the menu is open, the element that had focus doesn't learn that focus went into the menu and came
 * back — as with a native menu, which takes no focus from the page. Its blur and focus events (React's onBlur,
 * a Radix focus trap, CodeMirror) are stopped before anything sees them: a quick-add field that closes when
 * left stays open, an empty required field doesn't turn red, an autosave doesn't fire, a sheet keeps focus.
 * Focus going anywhere else (a click outside that the menu let through, a closed window) is untouched.
 */
export interface FocusHold {
  /** Focus goes back to the element: its focus events are not seen either. */
  giveBack(focus: () => void): void
  release(): void
}

const FOCUS_EVENTS = ['blur', 'focusout', 'focus', 'focusin'] as const

export function holdFocus(el: HTMLElement | null): FocusHold {
  let returning = false
  const stop = (e: Event): void => {
    if (!el || e.target !== el) return
    const other = (e as FocusEvent).relatedTarget
    const leaving = e.type === 'blur' || e.type === 'focusout'
    if (leaving ? inTextMenu(other) : returning || inTextMenu(other)) e.stopImmediatePropagation()
  }
  for (const type of FOCUS_EVENTS) window.addEventListener(type, stop, true)
  return {
    giveBack(focus) {
      returning = true
      try {
        focus()
      } finally {
        returning = false
      }
    },
    release() {
      for (const type of FOCUS_EVENTS) window.removeEventListener(type, stop, true)
    }
  }
}

/** Focus and selection as they were when the menu opened (the menu has already closed). */
export function giveBackFocus(snap: FocusSnapshot, hold: FocusHold, view: EditorView | null): void {
  const el = snap.el
  if (el?.isConnected && document.activeElement !== el) {
    hold.giveBack(() => {
      // CodeMirror puts its own selection back into the page; a bare focus() could let it read a moved one.
      if (view && view.contentDOM === el) view.focus()
      else el.focus({ preventScroll: true })
    })
  }
  if (snap.field && (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement)) {
    const { start, end, dir } = snap.field
    if (el.selectionStart !== start || el.selectionEnd !== end) el.setSelectionRange(start, end, dir)
  }
  if (snap.range) {
    const sel = window.getSelection()
    if (sel && sel.isCollapsed) {
      sel.removeAllRanges()
      sel.addRange(snap.range)
    }
  }
  // CodeMirror didn't see the focus come back: if it redrew meanwhile as unfocused, one update fixes the caret.
  if (view && view.hasFocus && !view.dom.classList.contains('cm-focused')) view.dispatch({})
}

/**
 * A click outside closes the menu and does nothing else, like a native menu: the press would otherwise move
 * focus out of the field the menu has just given it back to. Only the very next press, and only for a moment.
 */
export function swallowNextPress(): void {
  const at = performance.now()
  const onDown = (e: MouseEvent): void => {
    done()
    if (performance.now() - at < 1000) e.preventDefault()
  }
  const done = (): void => {
    window.removeEventListener('mousedown', onDown, true)
    clearTimeout(timer)
  }
  const timer = setTimeout(done, 1000)
  window.addEventListener('mousedown', onDown, true)
}
