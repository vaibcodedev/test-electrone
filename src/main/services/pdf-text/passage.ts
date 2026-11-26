/**
 * The passage of a file's text around the first searched word, with matches wrapped in \u0001…\u0002 like an
 * FTS5 snippet. Cut in JS on purpose: FTS5 snippet() re-tokenizes the whole document (~60 ms for 200 000
 * characters), this looks only near the match. Matching mirrors the index: word prefixes, case- and
 * diacritics-insensitive (unicode61 remove_diacritics).
 */

const WORD = /[\p{L}\p{N}]+/gu
const IS_WORD_CHAR = /[\p{L}\p{N}]/u
/** Characters looked at on each side of the match: enough for the words around it. */
const REACH = 160

function fold(s: string): string {
  return s
    .normalize('NFD')
    .replace(/\p{M}+/gu, '')
    .toLocaleLowerCase('uk')
}

/** Start of the first word that begins with one of the needles, or -1. */
function firstMatch(text: string, typed: string[], needles: string[]): number {
  // Fast path: the words as typed, lower-cased, found by indexOf and kept only at a word start.
  const lower = text.toLocaleLowerCase('uk')
  let best = -1
  if (lower.length === text.length) {
    for (const n of typed) {
      for (let at = lower.indexOf(n); at >= 0; at = lower.indexOf(n, at + 1)) {
        if (best >= 0 && at >= best) break
        if (at === 0 || !IS_WORD_CHAR.test(text[at - 1])) {
          best = at
          break
        }
      }
    }
    if (best >= 0) return best
  }
  // Accents or letters that change length when lower-cased: word by word, first hit wins.
  for (const m of text.matchAll(WORD)) {
    const w = fold(m[0])
    if (needles.some((n) => w.startsWith(n))) return m.index
  }
  return -1
}

/** A few words before the match (the line is cut on the right in the palette) and more after it. */
export function passage(text: string, words: string[], before = 3, after = 10): string {
  const needles = [...new Set(words.map(fold).filter(Boolean))]
  const typed = [...new Set(words.map((w) => w.toLocaleLowerCase('uk')).filter(Boolean))]
  const at = needles.length ? firstMatch(text, typed, needles) : -1
  const from = Math.max(0, (at < 0 ? 0 : at) - REACH)
  const region = text.slice(from, (at < 0 ? 0 : at) + REACH * 2)
  const tokens = [...region.matchAll(WORD)].map((m) => ({ start: from + m.index, word: m[0] }))
  if (!tokens.length) return ''
  const hit = Math.max(
    0,
    tokens.findIndex((t) => t.start >= at)
  )
  const first = at < 0 ? 0 : Math.max(0, hit - before)
  const last = Math.min(tokens.length - 1, (at < 0 ? 0 : hit) + after)
  let out = ''
  let pos = tokens[first].start
  for (const t of tokens.slice(first, last + 1)) {
    out += text.slice(pos, t.start)
    const w = fold(t.word)
    out += needles.some((n) => w.startsWith(n)) ? `\u0001${t.word}\u0002` : t.word
    pos = t.start + t.word.length
  }
  out = out.replace(/\s+/g, ' ').trim()
  const end = tokens[last].start + tokens[last].word.length
  return `${tokens[first].start > 0 ? '…' : ''}${out}${end < text.length ? '…' : ''}`
}
