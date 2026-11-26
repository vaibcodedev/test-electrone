/**
 * Word lists from files: CSV, TSV and Anki «Notes in Plain Text» (tab-separated, `#separator:` / `#html:` /
 * `#columns:` header lines, HTML in fields). Pure: the renderer previews and maps columns, main dedupes and saves.
 */

export interface WordTable {
  /** Column names: from `#columns:` or a recognised first row; null — columns are shown by number. */
  header: string[] | null
  rows: string[][]
  columns: number
  /** Anki service columns (guid, note type, deck, tags): never offered as the word by default. */
  meta: number[]
}

export interface ColumnMap {
  term: number
  translation: number | null
  example: number | null
}

const SEPARATORS: Record<string, string> = {
  tab: '\t',
  comma: ',',
  semicolon: ';',
  pipe: '|',
  colon: ':',
  space: ' '
}

const TERM_NAMES = [
  'word',
  'term',
  'english',
  'en',
  'front',
  'expression',
  'слово',
  'термін',
  'англійською'
]
const TRANSLATION_NAMES = [
  'translation',
  'meaning',
  'back',
  'ukrainian',
  'uk',
  'переклад',
  'значення',
  'українською'
]
const EXAMPLE_NAMES = ['example', 'sentence', 'context', 'приклад', 'речення']

const ENTITIES: Record<string, string> = {
  nbsp: ' ',
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  '#39': "'"
}

/** Anki fields keep HTML and sound tags: plain text is what a dictionary entry wants. */
export function stripHtml(value: string): string {
  return value
    .replace(/\[sound:[^\]]*\]/g, '')
    .replace(/<br\s*\/?>|<\/(div|p|li)>/gi, ' ')
    .replace(/<[^>]+>/g, '')
    .replace(/&(#\d+|#x[\da-f]+|[a-z]+|#39);/gi, (m, e: string) => {
      const k = e.toLowerCase()
      if (k in ENTITIES) return ENTITIES[k]
      if (k.startsWith('#x')) return String.fromCodePoint(parseInt(k.slice(2), 16))
      if (k.startsWith('#')) return String.fromCodePoint(Number(k.slice(1)))
      return m
    })
    .replace(/\s+/g, ' ')
    .trim()
}

/** RFC 4180 fields: quotes around a field, `""` inside one, separators and line breaks inside quotes. */
function splitRecords(text: string, sep: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let field = ''
  let quoted = false
  let start = true
  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (quoted) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"'
          i++
        } else quoted = false
      } else field += c
      continue
    }
    if (c === '"' && start) {
      quoted = true
      start = false
    } else if (c === sep) {
      row.push(field)
      field = ''
      start = true
    } else if (c === '\n') {
      row.push(field)
      rows.push(row)
      row = []
      field = ''
      start = true
    } else {
      field += c
      start = false
    }
  }
  if (field || row.length) {
    row.push(field)
    rows.push(row)
  }
  return rows
}

/** Tab wins if any line has one (TSV, Anki); otherwise whichever of `;` and `,` the lines agree on. */
function guessSeparator(lines: string[]): string {
  const sample = lines.slice(0, 20)
  if (sample.some((l) => l.includes('\t'))) return '\t'
  const score = (c: string): number => sample.filter((l) => l.includes(c)).length
  return score(';') > score(',') ? ';' : ','
}

const isName = (cell: string, names: string[]): boolean => names.includes(cell.trim().toLowerCase())

export function parseWordTable(input: string): WordTable {
  const text = input.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n')
  const lines = text.split('\n')
  let sep: string | null = null
  let html = false
  let header: string[] | null = null
  const meta = new Set<number>()
  let skip = 0
  // Anki's header block: `#key:value` lines at the very top.
  for (const line of lines) {
    const m = line.match(/^#([a-z ]+):(.*)$/i)
    if (!m) break
    skip++
    const key = m[1].trim().toLowerCase()
    const value = m[2].trim()
    if (key === 'separator')
      sep = SEPARATORS[value.toLowerCase()] ?? (value.length === 1 ? value : null)
    else if (key === 'html') html = value === 'true'
    else if (key === 'columns') header = value.split(sep ?? '\t').map((c) => c.trim())
    else if (/column$/.test(key) && Number(value) > 0) meta.add(Number(value) - 1)
  }
  const body = lines.slice(skip)
  const separator = sep ?? guessSeparator(body.filter((l) => l.trim()))
  if (header && !sep && header.length === 1) header = header[0].split(/[,;]/).map((c) => c.trim())
  const clean = (cell: string): string =>
    html || /<[a-z/][^>]*>|&nbsp;|\[sound:/i.test(cell) ? stripHtml(cell) : cell.trim()
  let rows = splitRecords(body.join('\n'), separator)
    .map((r) => r.map(clean))
    .filter((r) => r.some(Boolean))
  if (!header && rows.length > 1) {
    const first = rows[0]
    const all = [...TERM_NAMES, ...TRANSLATION_NAMES, ...EXAMPLE_NAMES]
    if (first.some((c) => isName(c, all))) {
      header = first
      rows = rows.slice(1)
    }
  }
  const columns = Math.max(header?.length ?? 0, ...rows.map((r) => r.length), 0)
  return { header, rows, columns, meta: [...meta].filter((i) => i < columns).sort((a, b) => a - b) }
}

/** Columns by name when the file has names, else the usual order: word, translation, example. */
export function guessColumns(table: WordTable): ColumnMap {
  const free = Array.from({ length: table.columns }, (_, i) => i).filter(
    (i) => !table.meta.includes(i)
  )
  const byName = (names: string[]): number | null => {
    const i = table.header?.findIndex((h) => isName(h, names)) ?? -1
    return i >= 0 ? i : null
  }
  const term = byName(TERM_NAMES) ?? free[0] ?? 0
  const rest = free.filter((i) => i !== term)
  const translation = byName(TRANSLATION_NAMES) ?? rest[0] ?? null
  const example = byName(EXAMPLE_NAMES) ?? rest.filter((i) => i !== translation)[0] ?? null
  return { term, translation, example }
}

export interface ImportRow {
  term: string
  translation: string
  example: string
}

export function mapRows(table: WordTable, map: ColumnMap): ImportRow[] {
  const cell = (r: string[], i: number | null): string => (i === null ? '' : (r[i] ?? '').trim())
  return table.rows
    .map((r) => ({
      term: cell(r, map.term),
      translation: cell(r, map.translation),
      example: cell(r, map.example)
    }))
    .filter((r) => r.term)
}

/** The key two entries are «the same word» by: case and inner spacing don't matter. */
export function termKey(term: string): string {
  return term.trim().replace(/\s+/g, ' ').toLocaleLowerCase('en')
}
