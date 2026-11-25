/** «[[» record links: the stored text, the trigger while typing, fragments and snippets (shared/wikilinks.ts). */
import { describe, expect, it } from 'vitest'
import {
  findWikiLinks,
  findWikiTrigger,
  mentionFragment,
  parseVaultHref,
  readableSnippet,
  replaceWikiLinks,
  wikiLink,
  wikiRefs
} from '@shared/wikilinks'

const ID = '1b9d6bcd-bbfd-4b2d-9b5d-ab8dfbbd4bed'
const OTHER = '6ec0bd7f-11c0-43da-975e-2a8ad9ebae0b'

describe('stored link', () => {
  it('is a plain Markdown link to vault:type/id and parses back', () => {
    const link = wikiLink({ type: 'note', id: ID }, 'Хуки React')
    expect(link).toBe(`[Хуки React](vault:note/${ID})`)
    expect(findWikiLinks(`Див. ${link}.`)).toEqual([
      { ref: { type: 'note', id: ID }, label: 'Хуки React', start: 5, end: 5 + link.length }
    ])
  })

  it('escapes what would end the label or start Markdown in it; a | stays (no table split)', () => {
    const link = wikiLink({ type: 'snippet', id: ID }, 'a] *b* `c` | d\nдругий рядок')
    expect(link).toBe(`[a\\] \\*b\\* \\\`c\\\` | d другий рядок](vault:snippet/${ID})`)
    expect(findWikiLinks(link)[0].label).toBe('a] *b* `c` | d другий рядок')
  })

  it('an empty title still gives a readable label', () => {
    expect(wikiLink({ type: 'idea', id: ID }, '  ')).toBe(`[Запис](vault:idea/${ID})`)
  })

  it('ignores web links, unknown types and broken syntax', () => {
    const text = `[web](https://x.dev) [bad](vault:nope/${ID}) [half](vault:note/${ID} [ok](vault:board/${OTHER})`
    expect(findWikiLinks(text).map((m) => m.ref)).toEqual([{ type: 'board', id: OTHER }])
    expect(parseVaultHref(`vault:note/${ID}`)).toEqual({ type: 'note', id: ID })
    expect(parseVaultHref('https://x.dev')).toBeNull()
    expect(parseVaultHref(`vault:nope/${ID}`)).toBeNull()
    expect(parseVaultHref(undefined)).toBeNull()
  })

  it('wikiRefs lists each record once, in order', () => {
    const a = wikiLink({ type: 'note', id: ID }, 'A')
    const b = wikiLink({ type: 'card', id: OTHER }, 'B')
    expect(wikiRefs(`${a} ${b} ${a}`)).toEqual([
      { type: 'note', id: ID },
      { type: 'card', id: OTHER }
    ])
  })

  it('replaceWikiLinks swaps every link and keeps the rest', () => {
    const text = `x ${wikiLink({ type: 'note', id: ID }, 'A')} y ${wikiLink({ type: 'card', id: OTHER }, 'B')} z`
    expect(replaceWikiLinks(text, (m) => `<${m.label}>`)).toBe('x <A> y <B> z')
    expect(replaceWikiLinks('без посилань', () => '!')).toBe('без посилань')
  })
})

describe('«[[» while typing', () => {
  const at = (text: string): ReturnType<typeof findWikiTrigger> =>
    findWikiTrigger(text, text.length)

  it('opens on [[ and carries what follows as the query', () => {
    expect(at('Див. [[')).toEqual({ start: 5, query: '' })
    expect(at('Див. [[хук')).toEqual({ start: 5, query: 'хук' })
    expect(at('перший\nдругий [[re')).toEqual({ start: 14, query: 're' })
  })

  it('closes once the link is finished, on a new line or when the query gets too long', () => {
    expect(at('[[хук]]')).toBeNull()
    expect(at('[[хук\n')).toBeNull()
    expect(at(`[[${'а'.repeat(61)}`)).toBeNull()
    expect(at('просто текст')).toBeNull()
  })

  it('stays quiet in code: a fenced block and inline code', () => {
    expect(at('```py\nm = [[')).toBeNull()
    expect(at('```py\nm = [[1]]\n```\nа тепер [[')).toEqual({ start: 28, query: '' })
    expect(at('масив `[[')).toBeNull()
    expect(at('масив `x` і [[')).toEqual({ start: 12, query: '' })
  })

  it('looks only before the caret', () => {
    expect(findWikiTrigger('[[ab]] далі', 4)).toEqual({ start: 0, query: 'ab' })
  })
})

describe('fragment around a mention', () => {
  it('is the link’s own line without Markdown syntax', () => {
    const link = wikiLink({ type: 'note', id: ID }, 'Хуки')
    const text = `# Заголовок\n- [ ] Перечитати **${link}** до п’ятниці\nінший рядок`
    const m = findWikiLinks(text)[0]
    expect(mentionFragment(text, m)).toEqual({ before: 'Перечитати ', after: ' до п’ятниці' })
  })

  it('other links read as their labels; snake_case survives', () => {
    const text = `${wikiLink({ type: 'card', id: OTHER }, 'Картка')} і my_var: ${wikiLink({ type: 'note', id: ID }, 'N')}`
    const m = findWikiLinks(text)[1]
    expect(mentionFragment(text, m).before).toBe('Картка і my_var: ')
  })

  it('a long line is cut at word boundaries with «…»', () => {
    const words = Array.from({ length: 40 }, (_, i) => `слово${i}`).join(' ')
    const text = `${words} ${wikiLink({ type: 'note', id: ID }, 'N')} ${words}`
    const f = mentionFragment(text, findWikiLinks(text)[0], { before: 40, after: 40 })
    // Whole words on both cut ends.
    expect(f.before).toMatch(/^…слово\d+ /)
    expect(f.after).toMatch(/ слово\d+…$/)
    expect(f.before.length).toBeLessThanOrEqual(42)
    expect(f.after.length).toBeLessThanOrEqual(42)
  })
})

describe('search snippet', () => {
  it('shows labels instead of link syntax, also when the snippet cut a link', () => {
    expect(readableSnippet(`див. [Хуки](vault:note/${ID}) далі`)).toBe('див. Хуки далі')
    expect(readableSnippet(`ки](vault:\u0001note\u0002/${ID}) далі`)).toBe('ки далі')
    expect(readableSnippet('звичайний текст')).toBe('звичайний текст')
  })
})
