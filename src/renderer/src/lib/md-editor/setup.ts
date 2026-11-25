import { EditorState, Prec, type Extension, type Range } from '@codemirror/state'
import {
  Decoration,
  EditorView,
  ViewPlugin,
  keymap,
  type DecorationSet,
  type KeyBinding,
  type ViewUpdate
} from '@codemirror/view'
import { HighlightStyle, syntaxHighlighting, syntaxTree } from '@codemirror/language'
import { markdown, markdownLanguage } from '@codemirror/lang-markdown'
import { defaultKeymap, history, historyKeymap } from '@codemirror/commands'
import { tags as t } from '@lezer/highlight'
import type { EntityType } from '@shared/entity-types'
import { closeMenu, menuField } from './menu'
import { linkChipsExtension } from './link-chips'
import {
  deleteMarkup,
  enterMarkup,
  indentListItem,
  makeLink,
  outdentListItem,
  toggleWrap
} from './smart-keys'

/** Keys an open «/» or «[[» menu takes before the text does. */
export type MenuKey = 'ArrowUp' | 'ArrowDown' | 'Enter' | 'Tab' | 'Escape'
const MENU_KEYS: MenuKey[] = ['ArrowUp', 'ArrowDown', 'Enter', 'Tab', 'Escape']

/**
 * CodeMirror's defaults minus what belongs to the app or to plain text: Ctrl+/ is the shortcut help, Ctrl+I is
 * italic here (not «select the syntax node»), Ctrl+Enter and Alt+Shift+A (comments) mean nothing in prose.
 */
const DROPPED = new Set(['Mod-/', 'Mod-i', 'Mod-Enter', 'Alt-A'])

/** Typing helpers (smart-keys.ts); the field's own keys sit above them. */
export const smartKeymap: readonly KeyBinding[] = [
  { key: 'Enter', run: enterMarkup },
  { key: 'Backspace', run: deleteMarkup },
  { key: 'Tab', run: indentListItem, shift: outdentListItem },
  { key: 'Mod-b', run: toggleWrap('**') },
  { key: 'Mod-i', run: toggleWrap('*') },
  { key: 'Mod-k', run: makeLink }
]

/**
 * Markdown is shown as written, with its marks quiet: headings and bold read as such, `#` `*` `-` `>` and link
 * addresses step back to the muted colour, code switches to the mono font.
 */
const markdownHighlight = HighlightStyle.define([
  { tag: t.heading1, fontWeight: '650', fontSize: '1.2em' },
  { tag: t.heading2, fontWeight: '650', fontSize: '1.1em' },
  { tag: [t.heading3, t.heading4, t.heading5, t.heading6], fontWeight: '650' },
  { tag: t.strong, fontWeight: '700' },
  { tag: t.emphasis, fontStyle: 'italic' },
  { tag: t.strikethrough, textDecoration: 'line-through' },
  {
    tag: [t.processingInstruction, t.contentSeparator, t.url, t.meta],
    color: 'var(--muted-foreground)'
  },
  { tag: t.quote, color: 'var(--muted-foreground)' },
  {
    tag: t.link,
    textDecoration: 'underline',
    textDecorationColor: 'color-mix(in oklab, var(--foreground) 30%, transparent)'
  },
  { tag: t.monospace, fontFamily: 'var(--font-mono)', fontSize: '0.9em' }
])

/**
 * Prose looks like the rest of the app: the field's font and size (set on the frame), its padding inside the
 * editor so a click anywhere in the box puts the caret in the text. Grows with the text up to half the window
 * (`min(50vh, 26rem)`, as a Textarea), then scrolls inside; `--md-editor-min` is the field's minimum height.
 */
const editorTheme = EditorView.theme({
  '&': {
    color: 'inherit',
    backgroundColor: 'transparent',
    fontSize: 'inherit',
    maxHeight: 'min(50vh, 26rem)'
  },
  '&.cm-focused': { outline: 'none' },
  '.cm-scroller': { fontFamily: 'inherit', lineHeight: 'inherit', overflow: 'auto' },
  '.cm-content': {
    padding: '12px 0',
    minHeight: 'calc(var(--md-editor-min, 160px) - 2px)',
    caretColor: 'var(--foreground)'
  },
  '.cm-content:focus-visible': { outline: 'none' },
  '.cm-line': { padding: '0 16px' },
  '.cm-placeholder': { color: 'var(--muted-foreground)' },
  '.cm-md-code': { fontFamily: 'var(--font-mono)', fontSize: '0.86em' },
  '.cm-md-inline-code': {
    fontFamily: 'var(--font-mono)',
    fontSize: '0.86em',
    borderRadius: '6px',
    padding: '1px 3px',
    backgroundColor: 'color-mix(in oklab, var(--foreground) 6%, transparent)'
  }
})

const codeLine = Decoration.line({ class: 'cm-md-code', attributes: { spellcheck: 'false' } })
const inlineCode = Decoration.mark({
  class: 'cm-md-inline-code',
  attributes: { spellcheck: 'false' }
})

/** Code in the visible text: the mono font, and no spell-check squiggles under identifiers. */
function codeDecorations(view: EditorView): DecorationSet {
  const ranges: Range<Decoration>[] = []
  const lines = new Set<number>()
  const tree = syntaxTree(view.state)
  for (const { from, to } of view.visibleRanges) {
    tree.iterate({
      from,
      to,
      enter: (node) => {
        if (node.name === 'FencedCode' || node.name === 'CodeBlock') {
          for (let pos = Math.max(node.from, from); pos <= Math.min(node.to, to);) {
            const line = view.state.doc.lineAt(pos)
            if (!lines.has(line.from)) {
              lines.add(line.from)
              ranges.push(codeLine.range(line.from))
            }
            pos = line.to + 1
          }
          return false
        }
        if (node.name === 'InlineCode') {
          ranges.push(inlineCode.range(node.from, node.to))
          return false
        }
        return undefined
      }
    })
  }
  return Decoration.set(ranges, true)
}

const codePlugin = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet
    constructor(view: EditorView) {
      this.decorations = codeDecorations(view)
    }
    update(u: ViewUpdate): void {
      if (u.docChanged || u.viewportChanged || syntaxTree(u.state) !== syntaxTree(u.startState))
        this.decorations = codeDecorations(u.view)
    }
  },
  { decorations: (p) => p.decorations }
)

/**
 * Only typing, paste and drop stop at the limit (like an input's maxLength): deleting from a text that is already
 * too long, and the value set from outside, always go through.
 */
export function lengthLimit(max: number): Extension {
  return EditorState.changeFilter.of(
    (tr) =>
      !tr.docChanged ||
      tr.newDoc.length <= max ||
      tr.newDoc.length <= tr.startState.doc.length ||
      !(tr.isUserEvent('input') || tr.isUserEvent('paste') || tr.isUserEvent('drop'))
  )
}

/** The smallest edit that turns `a` into `b`: an outside value keeps the caret and the undo history in place. */
export function diffText(a: string, b: string): { from: number; to: number; insert: string } {
  const max = Math.min(a.length, b.length)
  let start = 0
  while (start < max && a.charCodeAt(start) === b.charCodeAt(start)) start++
  let end = 0
  while (end < max - start && a.charCodeAt(a.length - 1 - end) === b.charCodeAt(b.length - 1 - end))
    end++
  return { from: start, to: a.length - end, insert: b.slice(start, b.length - end) }
}

export interface MarkdownEditorSetup {
  /** An open menu takes the key: true — handled, the text doesn't get it. */
  onMenuKey: (key: MenuKey) => boolean
  /** The SVG of a chip's icon (link-chips.ts). */
  icons: (key: EntityType | 'missing') => Node | null
}

/** Everything a Markdown field's editor is made of, except its per-field settings (limit, labels, placeholder). */
export function markdownEditorSetup({ onMenuKey, icons }: MarkdownEditorSetup): Extension {
  return [
    history(),
    markdown({ base: markdownLanguage, addKeymap: false, completeHTMLTags: false }),
    syntaxHighlighting(markdownHighlight),
    EditorView.lineWrapping,
    menuField,
    EditorView.focusChangeEffect.of((_, focusing) => (focusing ? null : closeMenu.of(null))),
    linkChipsExtension(icons),
    codePlugin,
    Prec.highest(keymap.of(MENU_KEYS.map((key) => ({ key, run: () => onMenuKey(key) })))),
    Prec.high(keymap.of(smartKeymap)),
    keymap.of([...defaultKeymap.filter((b) => !b.key || !DROPPED.has(b.key)), ...historyKeymap]),
    editorTheme,
    EditorView.contentAttributes.of({ spellcheck: 'true', 'aria-autocomplete': 'list' })
  ]
}
