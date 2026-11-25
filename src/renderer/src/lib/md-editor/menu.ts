import { StateEffect, StateField, type EditorState } from '@codemirror/state'
import { findWikiTrigger } from '@shared/wikilinks'
import { findSlashTrigger } from './slash-commands'
import { inCode } from './syntax'

/**
 * Which menu the caret is in: «/» (blocks) or «[[» (records). `from` is where the `/` or `[[` starts, `query` is
 * what follows it up to the caret.
 */
export interface MenuTrigger {
  kind: 'slash' | 'wiki'
  from: number
  query: string
}

interface MenuState {
  open: MenuTrigger | null
  /** Where the menu was closed with Esc: it stays closed for that `/` or `[[`, so they can be typed as text. */
  dismissed: number | null
}

/** Closes the menu (a command ran, the field lost focus). */
export const closeMenu = StateEffect.define<null>()
/** Esc: closes the menu and keeps it closed until its `/` or `[[` is gone. */
export const dismissMenu = StateEffect.define<null>()

/** The `/запит` or `[[запит` right before the caret (one caret, nothing selected), or null. Never in code. */
export function findMenuTrigger(state: EditorState): MenuTrigger | null {
  const { main } = state.selection
  if (!main.empty || state.selection.ranges.length > 1) return null
  const line = state.doc.lineAt(main.head)
  const before = line.text.slice(0, main.head - line.from)
  const wiki = findWikiTrigger(before, before.length)
  const slash = wiki ? null : findSlashTrigger(before)
  const found = wiki
    ? { kind: 'wiki' as const, from: line.from + wiki.start, query: wiki.query }
    : slash
      ? { kind: 'slash' as const, from: line.from + slash.start, query: slash.query }
      : null
  return found && !inCode(state, found.from) ? found : null
}

const same = (a: MenuTrigger | null, b: MenuTrigger | null): boolean =>
  a === b || (!!a && !!b && a.kind === b.kind && a.from === b.from && a.query === b.query)

/**
 * The menu state of a Markdown field. Only typing (or deleting) opens a menu: a caret put into an old `/текст`
 * line by a click or the arrows doesn't, it only keeps an open menu up to date or closes it once the caret leaves
 * the `/запит`. Text set from outside (the record reverted) never opens one.
 */
export const menuField = StateField.define<MenuState>({
  create: () => ({ open: null, dismissed: null }),
  update(value, tr) {
    let dismissed =
      value.dismissed === null || !tr.docChanged
        ? value.dismissed
        : tr.changes.mapPos(value.dismissed, 1)
    for (const e of tr.effects) {
      if (e.is(dismissMenu)) return { open: null, dismissed: value.open?.from ?? dismissed }
      if (e.is(closeMenu)) return { open: null, dismissed }
    }
    if (!tr.docChanged && !tr.selection) return value
    const found = findMenuTrigger(tr.state)
    if (!found) return { open: null, dismissed: null }
    if (found.from !== dismissed) dismissed = null
    const typed = tr.docChanged && (tr.isUserEvent('input') || tr.isUserEvent('delete'))
    const open = found.from === dismissed || (!value.open && !typed) ? null : found
    return same(open, value.open) && dismissed === value.dismissed ? value : { open, dismissed }
  }
})

/** The open menu of a field's state, or null. */
export const openMenu = (state: EditorState): MenuTrigger | null =>
  state.field(menuField, false)?.open ?? null
