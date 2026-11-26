/** What the text menu offers (pure: covered by unit tests). */
import type { TextEditCommand, TextMenuRequest } from '@shared/domain/text-menu'

export type TextMenuAction =
  | { kind: 'edit'; command: TextEditCommand }
  | { kind: 'replace'; word: string }
  | { kind: 'addWord' }
  | { kind: 'openLink' }
  | { kind: 'copyLink' }
  | { kind: 'copyBlock' }
  /** A row that only says something («Варіантів немає»). */
  | { kind: 'none' }

export interface TextMenuEntry {
  key: string
  label: string
  action: TextMenuAction
  disabled?: boolean
  /** Shown on the right, as the keys are on this system: «Ctrl+X» / «⌘X». */
  shortcut?: string
  /** A spelling replacement: emphasised and without an icon, like in Chromium's own menu. */
  suggestion?: boolean
}

/** Where the menu was opened, as the page sees it (main doesn't know the DOM). */
export interface TextMenuPlace {
  /** Inside a code block (rendered Markdown, the AI chat, read-only code) whose whole text can be copied. */
  codeBlock: boolean
  /** macOS shows ⌘ instead of Ctrl. */
  mac: boolean
}

const KEYS: Record<TextEditCommand, string> = {
  cut: 'X',
  copy: 'C',
  paste: 'V',
  pasteAndMatchStyle: 'Shift+V',
  selectAll: 'A'
}

export function shortcutLabel(command: TextEditCommand, mac: boolean): string {
  const keys = KEYS[command]
  return mac ? `⌘${keys.replace('Shift+', '⇧')}` : `Ctrl+${keys}`
}

/**
 * Groups of rows (a separator between groups); empty — nothing to offer, no menu. In a field the editing rows
 * are always there and an unavailable one is disabled, so they never jump; outside a field only what applies.
 */
export function textMenuGroups(req: TextMenuRequest, place: TextMenuPlace): TextMenuEntry[][] {
  const edit = (command: TextEditCommand, label: string, enabled: boolean): TextMenuEntry => ({
    key: command,
    label,
    action: { kind: 'edit', command },
    disabled: !enabled,
    shortcut: shortcutLabel(command, place.mac)
  })
  const groups: TextMenuEntry[][] = []

  if (req.editable && req.spelling) {
    const words: TextMenuEntry[] = req.spelling.suggestions.map((word) => ({
      key: `word:${word}`,
      label: word,
      action: { kind: 'replace', word },
      suggestion: true
    }))
    if (!words.length)
      words.push({ key: 'no-words', label: 'Варіантів немає', action: { kind: 'none' }, disabled: true })
    words.push({ key: 'add-word', label: 'Додати в словник', action: { kind: 'addWord' } })
    groups.push(words)
  }

  if (req.link) {
    groups.push([
      { key: 'open-link', label: 'Відкрити в браузері', action: { kind: 'openLink' } },
      { key: 'copy-link', label: 'Копіювати адресу', action: { kind: 'copyLink' } }
    ])
  }

  if (req.editable) {
    groups.push([
      edit('cut', 'Вирізати', req.can.cut),
      edit('copy', 'Копіювати', req.can.copy),
      edit('paste', 'Вставити', req.can.paste),
      edit('pasteAndMatchStyle', 'Вставити без форматування', req.can.paste)
    ])
    groups.push([edit('selectAll', 'Виділити все', req.can.selectAll)])
  } else if (place.codeBlock) {
    groups.push([
      edit('copy', 'Копіювати', req.hasSelection && req.can.copy),
      { key: 'copy-block', label: 'Копіювати весь блок', action: { kind: 'copyBlock' } }
    ])
  } else if (req.hasSelection && req.can.copy) {
    groups.push([edit('copy', 'Копіювати', true)])
  }
  return groups
}
