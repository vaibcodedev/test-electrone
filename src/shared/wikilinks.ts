/**
 * Links between records inside Markdown text («[[» in any Markdown field).
 *
 * Stored as a plain Markdown link: `[Назва](vault:note/<id>)`.
 * - The id (with the type) is what counts: rendering resolves it, so a renamed record keeps its link and the
 *   text shows the current title; the label is only a fallback (a record gone for good, export, other apps).
 * - It is standard Markdown, so remark parses it for us: a link inside a code block stays code, a `|` in the
 *   label can't split a GFM table cell (it did with Obsidian's `[[id|Label]]`), and the text reads as a link
 *   in any other Markdown viewer.
 * `[[` is only how you type it: the menu replaces `[[запит` with the link.
 */
import { ENTITY_TYPES, type EntityType } from './entity-types'
import type { EntityRef } from './domain/common'

const SCHEME = 'vault:'
const TYPES = new Set<string>(ENTITY_TYPES)

/** `[label](vault:type/id)`; the label may hold escaped characters (`\]`). */
const LINK_RE = /\[((?:\\[^\n]|[^\\\]\n])*)\]\(vault:([a-z]+)\/([A-Za-z0-9_-]{1,64})\)/g

export interface WikiLinkMatch {
  ref: EntityRef
  /** Label as written (unescaped). */
  label: string
  start: number
  end: number
}

export const refKey = (ref: EntityRef): string => `${ref.type}:${ref.id}`

export function vaultHref(ref: EntityRef): string {
  return `${SCHEME}${ref.type}/${ref.id}`
}

/** `vault:note/<id>` → ref; anything else (a web link, an unknown type) → null. */
export function parseVaultHref(href: string | undefined | null): EntityRef | null {
  const m = /^vault:([a-z]+)\/([A-Za-z0-9_-]{1,64})$/.exec(href ?? '')
  if (!m || !TYPES.has(m[1])) return null
  return { type: m[1] as EntityType, id: m[2] }
}

/** Characters that would end the label or start other Markdown inside it. */
const escapeLabel = (s: string): string => s.replace(/[\\[\]`*<>]/g, '\\$&')
const unescapeLabel = (s: string): string => s.replace(/\\(.)/g, '$1')

/** `[label](href)` with the label on one line and escaped: a line break or `]` in a title would end it. */
export function markdownLink(label: string, href: string): string {
  return `[${escapeLabel(label.replace(/\s+/g, ' ').trim() || 'Запис')}](${href})`
}

/** The text a link to `ref` is stored as. */
export function wikiLink(ref: EntityRef, title: string): string {
  return markdownLink(title, vaultHref(ref))
}

/** Every record link in the text, in order. */
export function findWikiLinks(text: string): WikiLinkMatch[] {
  const out: WikiLinkMatch[] = []
  if (!text || !text.includes(SCHEME)) return out
  for (const m of text.matchAll(LINK_RE)) {
    if (!TYPES.has(m[2])) continue
    out.push({
      ref: { type: m[2] as EntityType, id: m[3] },
      label: unescapeLabel(m[1]),
      start: m.index,
      end: m.index + m[0].length
    })
  }
  return out
}

/** Distinct records the text links to (first mention first). */
export function wikiRefs(text: string): EntityRef[] {
  const seen = new Map<string, EntityRef>()
  for (const m of findWikiLinks(text)) if (!seen.has(refKey(m.ref))) seen.set(refKey(m.ref), m.ref)
  return [...seen.values()]
}

/** Replaces every record link with what `fn` returns (export, plain text). */
export function replaceWikiLinks(text: string, fn: (m: WikiLinkMatch) => string): string {
  const links = findWikiLinks(text)
  if (!links.length) return text
  let out = ''
  let at = 0
  for (const m of links) {
    out += text.slice(at, m.start) + fn(m)
    at = m.end
  }
  return out + text.slice(at)
}

/**
 * A search snippet is cut at arbitrary words: whole links become their labels, a cut-off `](vault:…)` tail
 * disappears (FTS match markers \u0001/\u0002 may sit inside it).
 */
export function readableSnippet(snippet: string): string {
  if (!snippet.includes(SCHEME)) return snippet
  return snippet
    .replace(/\[([^\]\n]*)\]\(vault:[^)\s]*\)/g, (_, label: string) => unescapeLabel(label))
    .replace(/\]?\(vault:[^)\s]*\)?/g, '')
}

/** Lines that open or close a fenced code block (``` or ~~~). */
const FENCE_RE = /^ {0,3}(?:`{3,}|~{3,})/gm

/**
 * The `[[запит` being typed right before the caret, or null. Not inside a code block or inline code: `[[1, 2]]`
 * in code is code, and Enter there must stay a new line.
 */
export function findWikiTrigger(
  text: string,
  caret: number
): { start: number; query: string } | null {
  const before = text.slice(0, caret)
  const lineStart = before.lastIndexOf('\n') + 1
  const line = before.slice(lineStart)
  const at = line.lastIndexOf('[[')
  if (at < 0) return null
  const query = line.slice(at + 2)
  if (/[[\]]/.test(query) || query.length > 60) return null
  if ((before.slice(0, lineStart).match(FENCE_RE)?.length ?? 0) % 2 === 1) return null
  if ((line.slice(0, at).match(/`/g)?.length ?? 0) % 2 === 1) return null
  return { start: lineStart + at, query }
}

/**
 * Markdown syntax dropped from a fragment: other links (→ their labels), emphasis, code ticks and — at the start
 * of a line — list markers, headings, quotes. `_` stays: in a developer's notes it is snake_case far more often
 * than emphasis.
 */
function plain(s: string, lineStart: boolean): string {
  const text = replaceWikiLinks(s, (m) => m.label)
    .replace(/!?\[([^\]\n]*)\]\([^)\s]*\)/g, '$1')
    .replace(/\*+|`+|~~/g, '')
  return (
    lineStart
      ? text.replace(/^[ \t]*(?:#{1,6}|>|[-+]|\d+[.)])[ \t]+(?:\[[ xX]\][ \t]+)?/, '')
      : text
  ).replace(/\s+/g, ' ')
}

/** Cuts `s` to about `max` characters at a word boundary, from its start (`keep: 'start'`) or its end. */
function clip(s: string, max: number, keep: 'start' | 'end'): string {
  if (s.length <= max) return s
  if (keep === 'start') {
    const cut = s.slice(0, max)
    const space = cut.lastIndexOf(' ')
    return `${(space > max / 2 ? cut.slice(0, space) : cut).trimEnd()}…`
  }
  const cut = s.slice(-max)
  const space = cut.indexOf(' ')
  return `…${(space >= 0 && space < max / 2 ? cut.slice(space + 1) : cut).trimStart()}`
}

export interface MentionFragment {
  /** Text before the link on its line («…» when cut). */
  before: string
  after: string
}

/**
 * The words around a link: its own line (a list item, a paragraph), cut to about `before` / `after` characters.
 * Less before than after: in a narrow column the link itself must stay in the first lines.
 */
export function mentionFragment(
  text: string,
  m: WikiLinkMatch,
  { before = 40, after = 80 }: { before?: number; after?: number } = {}
): MentionFragment {
  const lineStart = text.lastIndexOf('\n', m.start - 1) + 1
  const nl = text.indexOf('\n', m.end)
  const lineEnd = nl < 0 ? text.length : nl
  return {
    before: clip(plain(text.slice(lineStart, m.start), true).trimStart(), before, 'end'),
    after: clip(plain(text.slice(m.end, lineEnd), false).trimEnd(), after, 'start')
  }
}
