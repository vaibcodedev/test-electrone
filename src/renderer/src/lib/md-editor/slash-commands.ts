import { EditorSelection, type EditorState, type TransactionSpec } from '@codemirror/state'

/**
 * The «/» menu of a Markdown field (Notion): a `/` at the start of a line opens a list of blocks, what follows it
 * filters the list, the chosen block replaces `/запит` with its Markdown.
 */
export type SlashCommandId =
  'h1' | 'h2' | 'list' | 'ordered' | 'todo' | 'quote' | 'code' | 'table' | 'divider' | 'link'

export interface SlashCommand {
  id: SlashCommandId
  label: string
  /** The Markdown it writes, shown at the right of the row. */
  markup: string
  /** Other words that find it: English names, Markdown habits (h1, todo, quote). */
  aliases: string[]
}

export const SLASH_COMMANDS: readonly SlashCommand[] = [
  { id: 'h1', label: 'Заголовок', markup: '#', aliases: ['h1', 'heading', 'title', '#'] },
  {
    id: 'h2',
    label: 'Підзаголовок',
    markup: '##',
    aliases: ['h2', 'subheading', 'subtitle', '##']
  },
  {
    id: 'list',
    label: 'Список',
    markup: '-',
    aliases: ['ul', 'list', 'bullet', 'маркований', '-']
  },
  {
    id: 'ordered',
    label: 'Нумерований',
    markup: '1.',
    aliases: ['ol', 'numbered', 'ordered', 'номер', 'нумерований список', '1.']
  },
  {
    id: 'todo',
    label: 'Чек-лист',
    markup: '- [ ]',
    aliases: ['todo', 'task', 'checklist', 'checkbox', 'задача', 'завдання', 'галочка']
  },
  { id: 'quote', label: 'Цитата', markup: '>', aliases: ['quote', 'blockquote', '>'] },
  {
    id: 'code',
    label: 'Код',
    markup: '```',
    aliases: ['code', 'pre', 'snippet', 'блок коду', '`']
  },
  { id: 'table', label: 'Таблиця', markup: '| |', aliases: ['table', 'grid', '|'] },
  {
    id: 'divider',
    label: 'Розділювач',
    markup: '---',
    aliases: ['hr', 'divider', 'line', 'separator', 'лінія', 'риска', '---']
  },
  {
    id: 'link',
    label: 'Посилання на запис',
    markup: '[[',
    aliases: ['link', 'wiki', 'mention', 'запис', 'згадка', '[[']
  }
]

/** Lower case, no apostrophes (’ ' ʼ), single spaces: «Об’єкт» and «обєкт» are the same query. */
const norm = (s: string): string =>
  s
    .toLocaleLowerCase('uk')
    .replace(/[’'ʼ`]/g, '')
    .replace(/\s+/g, ' ')
    .trim()

/**
 * Commands for what was typed after `/`: the name starting with it first, then a word of the name, an alias,
 * then the name containing it. An empty query gives all of them in their own order.
 */
export function filterSlashCommands(query: string): SlashCommand[] {
  const q = norm(query)
  if (!q) return [...SLASH_COMMANDS]
  const rank = (c: SlashCommand): number => {
    const label = norm(c.label)
    if (label.startsWith(q)) return 0
    if (label.split(' ').some((w) => w.startsWith(q))) return 1
    if (c.aliases.some((a) => norm(a).startsWith(q))) return 2
    if (label.includes(q)) return 3
    return -1
  }
  return SLASH_COMMANDS.map((c, i) => ({ c, i, r: rank(c) }))
    .filter((x) => x.r >= 0)
    .sort((a, b) => a.r - b.r || a.i - b.i)
    .map((x) => x.c)
}

/**
 * The `/запит` being typed at the start of a line (only spaces before it), from the line's text up to the caret;
 * `start` is where the `/` is. A path (`/usr/bin`), a second space in a row or a long run of text is not a query.
 */
export function findSlashTrigger(lineBefore: string): { start: number; query: string } | null {
  if (lineBefore.length > 64) return null
  // Words joined by single spaces (a word can't contain one, so the match can't backtrack between splits).
  const m = /^([ \t]*)\/((?:[^\s/\\[\]`|]+(?: [^\s/\\[\]`|]+){0,3} ?)?)$/u.exec(lineBefore)
  if (!m || m[2].length > 30) return null
  return { start: m[1].length, query: m[2] }
}

const TABLE_HEAD = 'Колонка 1'
const TABLE = `| ${TABLE_HEAD} | Колонка 2 |\n| --- | --- |\n|  |  |`

/**
 * The edit that runs a command on `/запит` at `from`…`to` (the caret): line blocks put their marker where the `/`
 * was, the rest of the line stays after it. A table and a divider get an empty line before and after them when the
 * neighbouring line has text (`---` under a paragraph would turn it into a heading); the table opens with its first
 * header selected, so typing renames it. «Посилання на запис» leaves `[[`, which opens the record menu.
 */
export function slashCommandEdit(
  state: EditorState,
  id: SlashCommandId,
  from: number,
  to: number
): TransactionSpec {
  const line = state.doc.lineAt(from)
  const rest = state.sliceDoc(to, line.to)
  const prefix = (insert: string): TransactionSpec => ({
    changes: { from, to, insert },
    selection: EditorSelection.cursor(from + insert.length)
  })
  const textAbove = line.number > 1 && /\S/.test(state.doc.line(line.number - 1).text)
  const textBelow = line.number < state.doc.lines && /\S/.test(state.doc.line(line.number + 1).text)
  switch (id) {
    case 'h1':
      return prefix('# ')
    case 'h2':
      return prefix('## ')
    case 'list':
      return prefix('- ')
    case 'ordered':
      return prefix('1. ')
    case 'todo':
      return prefix('- [ ] ')
    case 'quote':
      return prefix('> ')
    case 'link':
      return prefix('[[')
    case 'code': {
      // The rest of the line goes into the block: it is what the person meant to put there.
      const insert = '```\n' + rest + '\n```'
      return {
        changes: { from, to: line.to, insert },
        selection: EditorSelection.cursor(from + 4 + rest.length)
      }
    }
    case 'table':
    case 'divider': {
      const block = id === 'table' ? TABLE : '---'
      const before = textAbove ? '\n' : ''
      const after = rest.trim() ? `\n\n${rest.trimStart()}` : textBelow ? '\n' : ''
      // After a divider the caret goes on to a line of its own; in a table it selects the first header.
      const tail = id === 'divider' && !after ? '\n' : ''
      const insert = before + block + after + tail
      const at = from + before.length
      return {
        changes: { from, to: line.to, insert },
        selection:
          id === 'table'
            ? EditorSelection.range(at + 2, at + 2 + TABLE_HEAD.length)
            : EditorSelection.cursor(at + block.length + 1)
      }
    }
  }
}
