/**
 * The Markdown editor's logic on plain CodeMirror states (no DOM): the «/» menu (list, filter, edits), when a menu
 * opens, list continuation and the other typing keys, link chips (lib/md-editor).
 */
import { describe, expect, it } from 'vitest'
import { EditorSelection, EditorState, type StateCommand } from '@codemirror/state'
import { markdown, markdownLanguage } from '@codemirror/lang-markdown'
import {
  SLASH_COMMANDS,
  filterSlashCommands,
  findSlashTrigger,
  slashCommandEdit,
  type SlashCommandId
} from '@/lib/md-editor/slash-commands'
import { closeMenu, dismissMenu, menuField, openMenu } from '@/lib/md-editor/menu'
import {
  deleteMarkup,
  enterMarkup,
  indentListItem,
  makeLink,
  outdentListItem,
  toggleWrap
} from '@/lib/md-editor/smart-keys'
import { linkChips, linkTargets, setLinkTargets } from '@/lib/md-editor/link-chips'
import { diffText } from '@/lib/md-editor/setup'

const ID = '1b9d6bcd-bbfd-4b2d-9b5d-ab8dfbbd4bed'

/** A state from text with `|` for the caret or `‹…›` for a selection. */
function stateOf(marked: string): EditorState {
  const caret = marked.indexOf('|')
  const doc = marked.replace(/[|‹›]/g, '')
  const selection =
    caret >= 0
      ? EditorSelection.cursor(caret)
      : EditorSelection.range(marked.indexOf('‹'), marked.indexOf('›') - 1)
  return EditorState.create({
    doc,
    selection,
    extensions: [
      markdown({ base: markdownLanguage, addKeymap: false, completeHTMLTags: false }),
      menuField,
      linkTargets
    ]
  })
}

/** The text after a command, with `|` / `‹…›` where the selection ended up; null when the command passed. */
function run(cmd: StateCommand, marked: string): string | null {
  let state = stateOf(marked)
  const handled = cmd({ state, dispatch: (tr) => (state = tr.state) })
  if (!handled) return null
  return show(state)
}

function show(state: EditorState): string {
  const { from, to, empty } = state.selection.main
  const doc = state.doc.toString()
  return empty
    ? doc.slice(0, from) + '|' + doc.slice(from)
    : doc.slice(0, from) + '‹' + doc.slice(from, to) + '›' + doc.slice(to)
}

/** Types `text` at the caret like a person: one input transaction per character. */
function type(state: EditorState, text: string): EditorState {
  for (const ch of text) {
    const at = state.selection.main.head
    state = state.update({
      changes: { from: at, insert: ch },
      selection: EditorSelection.cursor(at + 1),
      userEvent: 'input.type'
    }).state
  }
  return state
}

describe('«/» commands', () => {
  it('lists every block in order for an empty query', () => {
    expect(filterSlashCommands('').map((c) => c.id)).toEqual(SLASH_COMMANDS.map((c) => c.id))
    expect(SLASH_COMMANDS.map((c) => c.label)).toEqual([
      'Заголовок',
      'Підзаголовок',
      'Список',
      'Нумерований',
      'Чек-лист',
      'Цитата',
      'Код',
      'Таблиця',
      'Розділювач',
      'Посилання на запис'
    ])
  })

  it('filters by the Ukrainian name, a word of it and English or Markdown aliases', () => {
    const ids = (q: string): SlashCommandId[] => filterSlashCommands(q).map((c) => c.id)
    expect(ids('чек')).toEqual(['todo'])
    expect(ids('ЗАГ')).toEqual(['h1', 'h2'])
    expect(ids('під')).toEqual(['h2'])
    expect(ids('h1')).toEqual(['h1'])
    expect(ids('todo')).toEqual(['todo'])
    expect(ids('quote')).toEqual(['quote'])
    expect(ids('запис')[0]).toBe('link')
    expect(ids('table')).toEqual(['table'])
    expect(ids('щось інше')).toEqual([])
  })

  it('opens only on a / at the start of a line, before a short query', () => {
    expect(findSlashTrigger('/')).toEqual({ start: 0, query: '' })
    expect(findSlashTrigger('  /чек')).toEqual({ start: 2, query: 'чек' })
    expect(findSlashTrigger('/посилання на')).toEqual({ start: 0, query: 'посилання на' })
    expect(findSlashTrigger('текст /')).toBeNull()
    expect(findSlashTrigger('/usr/bin')).toBeNull()
    expect(findSlashTrigger('/a  b')).toBeNull()
    expect(findSlashTrigger('/' + 'a'.repeat(40))).toBeNull()
  })

  const apply = (marked: string, id: SlashCommandId): string => {
    const state = stateOf(marked)
    const caret = state.selection.main.head
    const line = state.doc.lineAt(caret)
    const from = line.from + findSlashTrigger(line.text.slice(0, caret - line.from))!.start
    return show(state.update(slashCommandEdit(state, id, from, caret)).state)
  }

  it('replaces /запит with the block’s Markdown and leaves the rest of the line after it', () => {
    expect(apply('/заг|', 'h1')).toBe('# |')
    expect(apply('/під|', 'h2')).toBe('## |')
    expect(apply('/|', 'list')).toBe('- |')
    expect(apply('/|', 'ordered')).toBe('1. |')
    expect(apply('/чек|', 'todo')).toBe('- [ ] |')
    expect(apply('  /ц|ей рядок', 'quote')).toBe('  > |ей рядок')
    expect(apply('/зап|', 'link')).toBe('[[|')
  })

  it('code: a fenced block with the caret inside', () => {
    expect(apply('Текст\n/код|', 'code')).toBe('Текст\n```\n|\n```')
  })

  it('table: a 2×2 skeleton with the first header selected, apart from the paragraph above', () => {
    expect(apply('Абзац\n/таб|', 'table')).toBe(
      'Абзац\n\n| ‹Колонка 1› | Колонка 2 |\n| --- | --- |\n|  |  |'
    )
  })

  it('divider: --- on its own (never a heading underline), the caret on the next line', () => {
    expect(apply('Абзац\n/|', 'divider')).toBe('Абзац\n\n---\n|')
    expect(apply('/|\nдалі', 'divider')).toBe('---\n|\nдалі')
  })
})

describe('menu state', () => {
  it('typing / at the start of a line opens the block menu, the query follows the caret', () => {
    let state = type(stateOf('Перший рядок\n|'), '/чек')
    expect(openMenu(state)).toEqual({ kind: 'slash', from: 13, query: 'чек' })
    state = type(state, ' лист')
    expect(openMenu(state)?.query).toBe('чек лист')
  })

  it('[[ opens the record menu; Esc keeps it closed for that [[ until it is gone', () => {
    let state = type(stateOf('Див. |'), '[[Ціль')
    expect(openMenu(state)).toEqual({ kind: 'wiki', from: 5, query: 'Ціль' })
    state = state.update({ effects: dismissMenu.of(null) }).state
    expect(openMenu(state)).toBeNull()
    state = type(state, 'x')
    expect(openMenu(state)).toBeNull()
  })

  it('a caret moved into an old /текст line does not open it; a close effect closes it', () => {
    let state = stateOf('/код|\n')
    state = state.update({ selection: EditorSelection.cursor(3) }).state
    expect(openMenu(state)).toBeNull()
    state = type(state, 'и')
    expect(openMenu(state)?.kind).toBe('slash')
    state = state.update({ effects: closeMenu.of(null) }).state
    expect(openMenu(state)).toBeNull()
  })

  it('never in code: a ``` block or `inline code`', () => {
    expect(openMenu(type(stateOf('```\n|'), '/'))).toBeNull()
    expect(openMenu(type(stateOf('`a |'), '[['))).toBeNull()
    expect(openMenu(type(stateOf('```\nx\n```\n|'), '/'))?.kind).toBe('slash')
  })
})

describe('smart input', () => {
  it('Enter continues a list, a numbered list and a task list', () => {
    expect(run(enterMarkup, '- один|')).toBe('- один\n- |')
    expect(run(enterMarkup, '1. один|')).toBe('1. один\n2. |')
    expect(run(enterMarkup, '- [x] зроблено|')).toBe('- [x] зроблено\n- [ ] |')
    expect(run(enterMarkup, '> цитата|')).toBe('> цитата\n> |')
  })

  it('Enter on an empty item ends the list (a nested one steps out); outside a list it is not ours', () => {
    // An empty line after the list: text right under an item would still belong to it.
    expect(run(enterMarkup, '- один\n- |')).toBe('- один\n\n|')
    expect(run(enterMarkup, '- |')).toBe('|')
    expect(run(enterMarkup, '- один\n  - |')).toBe('- один\n- |')
    expect(run(enterMarkup, 'просто текст|')).toBeNull()
  })

  it('Backspace right after a marker removes the whole marker', () => {
    expect(run(deleteMarkup, '- |')).toBe('|')
    expect(run(deleteMarkup, '- [ ] |')).toBe('|')
    expect(run(deleteMarkup, '1. |текст')).toBe('|текст')
    expect(run(deleteMarkup, '  - |')).toBe('  |')
    expect(run(deleteMarkup, '> |')).toBe('|')
    expect(run(deleteMarkup, 'текст|')).toBeNull()
    expect(run(deleteMarkup, '```\n- |')).toBeNull()
  })

  it('Tab nests an item under the one above, Shift+Tab takes it back', () => {
    expect(run(indentListItem, '- один\n- два|')).toBe('- один\n  - два|')
    expect(run(outdentListItem, '- один\n  - два|')).toBe('- один\n- два|')
    // An ordered item nests at the text column and starts its own list at 1.
    expect(run(indentListItem, '1. один\n2. два|')).toBe('1. один\n   1. два|')
    // Its children move with it.
    expect(run(indentListItem, '- а\n- б|\n  - в')).toBe('- а\n  - б|\n    - в')
    // The first item has nothing to nest under: nothing changes, but Tab is taken.
    expect(run(indentListItem, '- один|')).toBe('- один|')
    // Outside a list Tab moves the focus; Shift+Tab on a top-level item too.
    expect(run(indentListItem, 'текст|')).toBeNull()
    expect(run(outdentListItem, '- один|')).toBeNull()
  })

  it('Ctrl+B / Ctrl+I wrap and unwrap; italic inside bold stays bold', () => {
    expect(run(toggleWrap('**'), '‹слово›')).toBe('**‹слово›**')
    expect(run(toggleWrap('**'), '**‹слово›**')).toBe('‹слово›')
    expect(run(toggleWrap('**'), '‹**слово**›')).toBe('‹слово›')
    expect(run(toggleWrap('*'), '‹слово›')).toBe('*‹слово›*')
    expect(run(toggleWrap('*'), '**‹слово›**')).toBe('***‹слово›***')
    expect(run(toggleWrap('*'), '***‹слово›***')).toBe('**‹слово›**')
    expect(run(toggleWrap('**'), 'a|')).toBe('a**|**')
  })

  it('Ctrl+K makes a link of the selection; without one it is the app search', () => {
    expect(run(makeLink, '‹документація›')).toBe('[документація](|)')
    expect(run(makeLink, '‹https://vault.dev›')).toBe('[|](https://vault.dev)')
    expect(run(makeLink, 'текст|')).toBeNull()
  })
})

describe('link chips', () => {
  const link = `[Хуки React](vault:note/${ID})`

  it('one chip per record link, with the label until the record is resolved', () => {
    const state = stateOf(`Див. ${link} і [сайт](https://x.dev)|`)
    expect(linkChips(state)).toEqual([
      {
        from: 5,
        to: 5 + link.length,
        key: `note:${ID}`,
        type: 'note',
        title: 'Хуки React',
        state: 'live'
      }
    ])
  })

  it('the current title and state once resolved; a record gone for good keeps the label', () => {
    let state = stateOf(`${link}|`)
    const resolved = (s: 'live' | 'trashed' | 'missing'): EditorState =>
      state.update({
        effects: setLinkTargets.of(
          new Map([[`note:${ID}`, { type: 'note', id: ID, title: 'Нова назва', state: s }]])
        )
      }).state
    expect(linkChips(resolved('live'))[0]).toMatchObject({ title: 'Нова назва', state: 'live' })
    expect(linkChips(resolved('trashed'))[0]).toMatchObject({
      title: 'Нова назва',
      state: 'trashed'
    })
    state = resolved('missing')
    expect(linkChips(state)[0]).toMatchObject({ title: 'Хуки React', state: 'missing' })
  })

  it('no chip inside code: there it is text', () => {
    expect(linkChips(stateOf(`\`${link}\`|`))).toEqual([])
    expect(linkChips(stateOf('```\n' + link + '\n```|'))).toEqual([])
  })
})

describe('outside value', () => {
  it('becomes the smallest edit', () => {
    expect(diffText('Привіт, світ', 'Привіт, новий світ')).toEqual({
      from: 8,
      to: 8,
      insert: 'новий '
    })
    expect(diffText('abc', 'abc')).toEqual({ from: 3, to: 3, insert: '' })
    expect(diffText('aaa', 'aa')).toEqual({ from: 2, to: 3, insert: '' })
  })
})
