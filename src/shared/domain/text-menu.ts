import { z } from 'zod'

/**
 * Vault's own right-click menu for text (fields, the Markdown and code editors, selected text, links, code
 * blocks). Chromium decides that a menu is wanted and knows the spelling; main passes on only what the menu
 * shows (never the selected text or the clipboard) and performs the editing itself, so undo, spelling and
 * the clipboard behave exactly as with the keyboard.
 */
export interface TextMenuRequest {
  /** Binds a command to this very menu: main refuses a command for any other one. */
  id: number
  /** Where Chromium put the menu, in CSS pixels of the page (used when the DOM event was missed). */
  x: number
  y: number
  /** Opened from the keyboard (Shift+F10, the Menu key). */
  keyboard: boolean
  editable: boolean
  /** Some text is selected; its content is never sent. */
  hasSelection: boolean
  /** The http(s) / mailto link under the pointer, or null. */
  link: string | null
  can: { cut: boolean; copy: boolean; paste: boolean; selectAll: boolean }
  /** Over a misspelled word: the replacements (may be empty); null otherwise. */
  spelling: { suggestions: string[] } | null
}

export const TEXT_EDIT_COMMANDS = ['cut', 'copy', 'paste', 'pasteAndMatchStyle', 'selectAll'] as const
export type TextEditCommand = (typeof TEXT_EDIT_COMMANDS)[number]

/** At most this many replacements are offered for a misspelled word. */
export const MAX_SUGGESTIONS = 6

const menuId = z.number().int().nonnegative()

export const textMenuEditSchema = z.object({ id: menuId, command: z.enum(TEXT_EDIT_COMMANDS) })
export const textMenuReplaceSchema = z.object({ id: menuId, word: z.string().min(1).max(100) })
export const textMenuIdSchema = z.object({ id: menuId })
