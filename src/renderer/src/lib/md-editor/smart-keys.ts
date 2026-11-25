import {
  EditorSelection,
  type ChangeSpec,
  type EditorState,
  type Line,
  type StateCommand
} from '@codemirror/state'
import { deleteMarkupBackward, insertNewlineContinueMarkupCommand } from '@codemirror/lang-markdown'
import { inCode } from './syntax'

/**
 * Typing helpers of a Markdown field: lists continue themselves, Tab nests a list item, Backspace takes an empty
 * marker away, Ctrl+B / Ctrl+I / Ctrl+K wrap the selection. Plain state commands — the keymap is in setup.ts.
 */

/**
 * Enter: a list, task list or quote continues on the new line (`1.` → `2.`, `- [x]` → `- [ ]`); Enter on an
 * empty nested item steps out a level. `nonTightLists: false` — without it CodeMirror turns the second Enter into
 * a blank line between items instead of leaving the list.
 */
export const continueMarkup: StateCommand = insertNewlineContinueMarkupCommand({
  nonTightLists: false
})

/** A list item or quote marker: indentation, then `-` `*` `+` `1.` `1)` (with a task box) or `>`. */
const ITEM_RE = /^([ \t]*)((?:[-+*]|(\d{1,9})[.)])[ \t]+(?:\[[ xX]\][ \t]+)?)/
const MARKER_ONLY_RE = /^([ \t]*)(?:(?:[-+*]|\d{1,9}[.)])(?:[ \t]+\[[ xX]\])?|>)[ \t]+$/

/**
 * Backspace right after a list or quote marker (`- |`, `1. |текст`, `- [ ] |`, `> |`) removes the whole marker —
 * the item becomes plain text — instead of one character of it. Anywhere else it does nothing (returns false).
 */
export const deleteListMarker: StateCommand = ({ state, dispatch }) => {
  const { main } = state.selection
  if (!main.empty || state.selection.ranges.length > 1) return false
  const line = state.doc.lineAt(main.head)
  const m = MARKER_ONLY_RE.exec(line.text.slice(0, main.head - line.from))
  if (!m || inCode(state, line.from)) return false
  const from = line.from + m[1].length
  dispatch(
    state.update({
      changes: { from, to: main.head },
      selection: EditorSelection.cursor(from),
      scrollIntoView: true,
      userEvent: 'delete.backward'
    })
  )
  return true
}

/** Backspace after Markdown block markup: ours first, then CodeMirror's (nested quotes, extra spaces). */
export const deleteMarkup: StateCommand = (target) =>
  deleteListMarker(target) || deleteMarkupBackward(target)

/**
 * Enter on an empty top-level item (`- |`, `- [ ] |`, `> |`) ends the list with an empty line after it: text
 * right under a list item, with no empty line between, would still belong to that item («lazy continuation»), so
 * what is typed next would be glued to the last point. A nested item is CodeMirror's: it steps out a level.
 */
export const endList: StateCommand = ({ state, dispatch }) => {
  const { main } = state.selection
  if (!main.empty || state.selection.ranges.length > 1) return false
  const line = state.doc.lineAt(main.head)
  const m = MARKER_ONLY_RE.exec(line.text)
  if (!m || m[1] || main.head !== line.to || inCode(state, line.from)) return false
  const above = line.number > 1 && /\S/.test(state.doc.line(line.number - 1).text)
  const insert = above ? '\n' : ''
  dispatch(
    state.update({
      changes: { from: line.from, to: line.to, insert },
      selection: EditorSelection.cursor(line.from + insert.length),
      scrollIntoView: true,
      userEvent: 'input'
    })
  )
  return true
}

/** Enter in Markdown: an empty item ends its list, any other item or quote continues. */
export const enterMarkup: StateCommand = (target) => endList(target) || continueMarkup(target)

interface Item {
  line: Line
  indent: number
  /** The marker with its spaces (`- `, `12. `, `- [ ] `): a child is indented by its width. */
  width: number
  number: number | null
}

const tabWidth = (s: string): number => s.replace(/\t/g, '    ').length

function itemAt(line: Line): Item | null {
  const m = ITEM_RE.exec(line.text)
  if (!m) return null
  // A child sits under the item's text, not under its task box: `- [ ] a` nests at 2, like `- a`.
  const marker = /^(?:[-+*]|\d{1,9}[.)])[ \t]+/.exec(m[2])![0]
  return { line, indent: tabWidth(m[1]), width: marker.length, number: m[3] ? Number(m[3]) : null }
}

/** The nearest list item above `line` that is indented less than `below` (its parent), skipping blank lines. */
function itemAbove(state: EditorState, line: Line, below: number): Item | null {
  for (let n = line.number - 1; n >= 1; n--) {
    const prev = state.doc.line(n)
    if (!prev.text.trim()) continue
    const item = itemAt(prev)
    const indent = tabWidth(/^[ \t]*/.exec(prev.text)![0])
    if (item && item.indent < below) return item
    // Text of a less indented paragraph ends the search: the list is over above it.
    if (!item && indent < below && indent === 0) return null
  }
  return null
}

/** The previous item at exactly `indent` within the same parent, or null when `line` would be the first one. */
function siblingAbove(state: EditorState, line: Line, indent: number): Item | null {
  for (let n = line.number - 1; n >= 1; n--) {
    const prev = state.doc.line(n)
    if (!prev.text.trim()) continue
    const item = itemAt(prev)
    const own = tabWidth(/^[ \t]*/.exec(prev.text)![0])
    if (item && item.indent === indent) return item
    if (own < indent) return null
  }
  return null
}

/** The lines under an item that belong to it (nested items, continuation text): they move with it. */
function subtree(state: EditorState, item: Item): Line[] {
  const out: Line[] = []
  for (let n = item.line.number + 1; n <= state.doc.lines; n++) {
    const line = state.doc.line(n)
    if (!line.text.trim()) {
      out.push(line)
      continue
    }
    if (tabWidth(/^[ \t]*/.exec(line.text)![0]) <= item.indent) break
    out.push(line)
  }
  // Blank lines after the last child are not part of it.
  while (out.length && !out[out.length - 1].text.trim()) out.pop()
  return out
}

/** Re-indents `line` from its current indentation to `indent` columns (spaces). */
function reindent(line: Line, indent: number): ChangeSpec {
  const current = /^[ \t]*/.exec(line.text)![0]
  return {
    from: line.from,
    to: line.from + current.length,
    insert: ' '.repeat(Math.max(0, indent))
  }
}

/** A new number for an ordered item that moved: 1 as the first of its list, the next one after a sibling. */
function renumber(state: EditorState, item: Item, indent: number): ChangeSpec | null {
  if (item.number === null) return null
  const prev = siblingAbove(state, item.line, indent)
  const next = prev?.number !== null && prev?.number !== undefined ? prev.number + 1 : 1
  if (next === item.number) return null
  const at = item.line.from + /^[ \t]*/.exec(item.line.text)![0].length
  return { from: at, to: at + String(item.number).length, insert: String(next) }
}

function shiftItem(state: EditorState, item: Item, indent: number): ChangeSpec[] {
  const delta = indent - item.indent
  const changes: ChangeSpec[] = [reindent(item.line, indent)]
  const number = renumber(state, item, indent)
  if (number) changes.push(number)
  for (const line of subtree(state, item)) {
    if (!line.text.trim()) continue
    changes.push(reindent(line, tabWidth(/^[ \t]*/.exec(line.text)![0]) + delta))
  }
  return changes
}

/** The list items the selection touches (the caret's line or every selected line), in order. */
function selectedItems(state: EditorState): Item[] | null {
  const { main } = state.selection
  const first = state.doc.lineAt(main.from)
  const last = state.doc.lineAt(main.to)
  const head = itemAt(first)
  if (!head || inCode(state, first.from)) return null
  const items: Item[] = []
  for (let n = first.number; n <= last.number; n++) {
    const item = itemAt(state.doc.line(n))
    if (item) items.push(item)
  }
  return items
}

/**
 * Tab in a list item nests it under the item above (its text column: 2 for `- `, 3 for `1. `), with everything
 * nested under it; an ordered item starts its new list at 1. The first item of a list has nothing to nest under —
 * Tab is still taken, so the focus doesn't jump out of the text mid-list. Outside a list: false (Tab moves focus).
 */
export const indentListItem: StateCommand = ({ state, dispatch }) => {
  const items = selectedItems(state)
  if (!items) return false
  const top = items[0]
  const parent = siblingAbove(state, top.line, top.indent)
  if (!parent) return true
  const delta = parent.indent + parent.width - top.indent
  const changes =
    items.length === 1
      ? shiftItem(state, top, top.indent + delta)
      : items.flatMap((item) => [
          reindent(item.line, item.indent + delta),
          ...(item === top
            ? [renumber(state, item, item.indent + delta)].filter((c): c is ChangeSpec => !!c)
            : [])
        ])
  dispatch(state.update({ changes, scrollIntoView: true, userEvent: 'input.indent' }))
  return true
}

/**
 * Shift+Tab in a nested list item moves it back under its parent's level, with its own nested lines. A top-level
 * item: false — Shift+Tab leaves the field as usual.
 */
export const outdentListItem: StateCommand = ({ state, dispatch }) => {
  const items = selectedItems(state)
  if (!items) return false
  const top = items[0]
  if (top.indent === 0) return false
  const parent = itemAbove(state, top.line, top.indent)
  const indent = parent ? parent.indent : 0
  const delta = indent - top.indent
  const changes =
    items.length === 1
      ? shiftItem(state, top, indent)
      : items.map((item) => reindent(item.line, Math.max(0, item.indent + delta)))
  dispatch(state.update({ changes, scrollIntoView: true, userEvent: 'delete.dedent' }))
  return true
}

/** How many `*` stand right before `pos` / right after it. */
function starsBefore(state: EditorState, pos: number): number {
  let n = 0
  while (pos - n > 0 && state.sliceDoc(pos - n - 1, pos - n) === '*') n++
  return n
}
function starsAfter(state: EditorState, pos: number): number {
  let n = 0
  while (pos + n < state.doc.length && state.sliceDoc(pos + n, pos + n + 1) === '*') n++
  return n
}

/** `**` (bold) or `*` (italic) around this many stars: 2–3 are bold, 1 and 3 italic (`***both***`). */
const wraps = (stars: number, mark: string): boolean =>
  mark === '**' ? stars >= 2 : stars === 1 || stars === 3

/**
 * Ctrl+B / Ctrl+I: wraps the selection in `**` / `*`, or unwraps it when it already is (also when the marks are
 * selected with it). An empty selection gets `****` with the caret in the middle.
 */
export function toggleWrap(mark: '**' | '*'): StateCommand {
  return ({ state, dispatch }) => {
    const n = mark.length
    const tr = state.changeByRange((range) => {
      const text = state.sliceDoc(range.from, range.to)
      // The marks are inside the selection: `**жирний**` selected whole.
      const inner = /^\*+/.exec(text)?.[0].length ?? 0
      if (
        !range.empty &&
        text.length > 2 * n &&
        wraps(inner, mark) &&
        wraps(/\*+$/.exec(text)?.[0].length ?? 0, mark)
      ) {
        return {
          changes: [
            { from: range.from, to: range.from + n },
            { from: range.to - n, to: range.to }
          ],
          range: EditorSelection.range(range.from, range.to - 2 * n)
        }
      }
      // The marks are just outside it: `**|жирний|**`.
      if (
        !range.empty &&
        wraps(starsBefore(state, range.from), mark) &&
        wraps(starsAfter(state, range.to), mark)
      ) {
        return {
          changes: [
            { from: range.from - n, to: range.from },
            { from: range.to, to: range.to + n }
          ],
          range: EditorSelection.range(range.from - n, range.to - n)
        }
      }
      return {
        changes: [
          { from: range.from, insert: mark },
          { from: range.to, insert: mark }
        ],
        range: EditorSelection.range(range.from + n, range.to + n)
      }
    })
    dispatch(state.update(tr, { scrollIntoView: true, userEvent: 'input.format' }))
    return true
  }
}

const URL_RE = /^(?:https?:\/\/|mailto:|www\.)\S+$/i

/**
 * Ctrl+K with text selected: `[текст](|)` with the caret where the address goes; a selected address becomes
 * `[|](адреса)`. Nothing selected: false — Ctrl+K stays the app-wide search.
 */
export const makeLink: StateCommand = ({ state, dispatch }) => {
  if (state.selection.ranges.every((r) => r.empty)) return false
  const tr = state.changeByRange((range) => {
    if (range.empty) return { range }
    const text = state.sliceDoc(range.from, range.to)
    if (URL_RE.test(text.trim())) {
      const insert = `[](${text.trim()})`
      return {
        changes: { from: range.from, to: range.to, insert },
        range: EditorSelection.cursor(range.from + 1)
      }
    }
    const insert = `[${text}]()`
    return {
      changes: { from: range.from, to: range.to, insert },
      range: EditorSelection.cursor(range.from + insert.length - 1)
    }
  })
  dispatch(state.update(tr, { scrollIntoView: true, userEvent: 'input.format' }))
  return true
}
