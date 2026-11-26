/** English trainer: the daily session, the streak, file import and grammar gap cards. */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { chartDays, pickSession, sessionLimits, streakOf } from '@main/modules/english-session'
import { addDays, dayKey } from '@main/core/util'
import { fillGaps, gapCards, isGapAnswer, pickGapCard } from '@shared/english-gaps'
import { guessColumns, mapRows, parseWordTable, stripHtml } from '@shared/english-import'
import { openVault, type Vault } from './support/vault'

vi.mock('electron', async () => (await import('./support/electron-mock')).electronMock)
vi.mock('@main/core/logger', async () => (await import('./support/electron-mock')).loggerMock)

const w = (id: string): { id: string } => ({ id })

describe('daily session', () => {
  it('reviews first, then new words up to what is left of the goal', () => {
    const limits = sessionLimits(
      { newPerDay: 10, reviewsPerDay: 100 },
      { newDone: 7, reviewsDone: 18 }
    )
    expect(limits).toEqual({ newLeft: 3, reviewsLeft: 82 })
    const s = pickSession(
      [w('r1'), w('r2')],
      [w('n1'), w('n2'), w('n3'), w('n4')],
      new Set(),
      limits
    )
    expect(s.map((x) => x.id)).toEqual(['r1', 'r2', 'n1', 'n2', 'n3'])
  })

  it('caps reviews, but an entry already answered today comes back without spending the cap', () => {
    const s = pickSession([w('a'), w('b'), w('c'), w('d')], [w('n')], new Set(['c']), {
      newLeft: 0,
      reviewsLeft: 1
    })
    expect(s.map((x) => x.id)).toEqual(['a', 'c'])
  })

  it('a goal already met leaves nothing (never negative)', () => {
    expect(
      sessionLimits({ newPerDay: 5, reviewsPerDay: 10 }, { newDone: 9, reviewsDone: 12 })
    ).toEqual({
      newLeft: 0,
      reviewsLeft: 0
    })
  })
})

describe('streak', () => {
  const today = new Date(2026, 10, 26, 15).getTime()
  const days = (...back: number[]): Set<string> =>
    new Set(back.map((n) => dayKey(addDays(today, -n))))

  it('counts days in a row ending today', () => expect(streakOf(days(0, 1, 2, 4), today)).toBe(3))
  it('keeps yesterday’s streak while today has no answers yet', () =>
    expect(streakOf(days(1, 2), today)).toBe(2))
  it('a gap breaks it', () => expect(streakOf(days(2, 3), today)).toBe(0))
  it('survives the DST switch', () => {
    const spring = new Date(2026, 2, 30, 9).getTime()
    expect(streakOf(new Set([0, 1, 2].map((n) => dayKey(addDays(spring, -n)))), spring)).toBe(3)
  })

  it('chart days: oldest first, today last, accuracy and first studies per day', () => {
    const d = chartDays(
      [
        { at: today, grade: 2 },
        { at: today, grade: 0 },
        { at: addDays(today, -1), grade: 3 }
      ],
      [today, addDays(today, -40)],
      today,
      7
    )
    expect(d).toHaveLength(7)
    expect(d.at(-1)).toEqual({ day: dayKey(today), answers: 2, correct: 1, newWords: 1 })
    expect(d.at(-2)).toMatchObject({ answers: 1, correct: 1, newWords: 0 })
  })
})

describe('import parsing', () => {
  it('CSV with a header, quotes, commas and line breaks inside quotes', () => {
    const t = parseWordTable(
      '\uFEFFword,translation,example\r\nrollout,викатка,"We\'ll do a staged rollout, ok"\r\n"say ""hi""","привітатися","line\nbreak"\r\n'
    )
    expect(t.header).toEqual(['word', 'translation', 'example'])
    expect(t.rows).toEqual([
      ['rollout', 'викатка', "We'll do a staged rollout, ok"],
      ['say "hi"', 'привітатися', 'line\nbreak']
    ])
    expect(guessColumns(t)).toEqual({ term: 0, translation: 1, example: 2 })
  })

  it('TSV without a header and semicolon CSV are told apart', () => {
    expect(parseWordTable('a\tб\nc\tд').rows).toEqual([
      ['a', 'б'],
      ['c', 'д']
    ])
    const semi = parseWordTable('deploy;розгорнути;Deploy it\nmerge;злити;')
    expect(semi.header).toBeNull()
    expect(semi.rows[0]).toEqual(['deploy', 'розгорнути', 'Deploy it'])
  })

  it('Anki «as text»: header lines, HTML, sound tags, service columns', () => {
    const t = parseWordTable(
      '#separator:tab\n#html:true\n#guid column:1\n#tags column:4\nk1\t<b>rollout</b>[sound:r.mp3]\tвикатка<br>поетапна\tlearn\nk2\tmerge&nbsp;conflict\tконфлікт\t\n'
    )
    expect(t.meta).toEqual([0, 3])
    expect(t.rows[0]).toEqual(['k1', 'rollout', 'викатка; поетапна', 'learn'])
    const map = guessColumns(t)
    expect(map).toEqual({ term: 1, translation: 2, example: null })
    expect(mapRows(t, map)[1]).toEqual({
      term: 'merge conflict',
      translation: 'конфлікт',
      example: ''
    })
  })

  it('stripHtml decodes entities', () =>
    expect(stripHtml('a&amp;b &#39;c&#x27; <i>d</i>')).toBe("a&b 'c' d"))
})

describe('grammar gaps', () => {
  const cards = gapCards('Yesterday I [went|go] home.\n\nShe [has] [been] working.\nNo gap here')

  it('one card per bracket; other brackets read as text; hints after |', () => {
    expect(cards).toHaveLength(3)
    expect(cards[0]).toMatchObject({
      before: 'Yesterday I ',
      after: ' home.',
      answers: ['went'],
      hint: 'go'
    })
    expect(cards[1]).toMatchObject({ before: 'She ', after: ' been working.', answers: ['has'] })
    expect(cards[2]).toMatchObject({
      before: 'She has ',
      after: ' working.',
      sentence: 'She has been working.'
    })
  })

  it('answers: case, spaces, curly apostrophes and alternatives', () => {
    const [c] = gapCards("I [don't/do not] know")
    expect(isGapAnswer(c, ' DON’T ')).toBe(true)
    expect(isGapAnswer(c, 'do  not')).toBe(true)
    expect(isGapAnswer(c, 'doesn’t')).toBe(false)
    expect(isGapAnswer(c, '')).toBe(false)
  })

  it('fillGaps and rotation', () => {
    expect(fillGaps('I [went|go] there')).toBe('I went there')
    expect(pickGapCard(cards, 0)).toBe(cards[0])
    expect(pickGapCard(cards, 4000)).toBe(cards[1])
    expect(pickGapCard([], 1)).toBeUndefined()
  })
})

describe('on a real database', () => {
  let v: Vault
  beforeEach(() => {
    v = openVault()
  })
  afterEach(() => v.close())

  it('the session holds the new-word goal; a rule without gaps stays out', async () => {
    for (let i = 0; i < 12; i++) await v.api.english.create({ term: `w${i}`, translation: 't' })
    await v.api.english.create({ term: 'Past Simple', kind: 'rule', example: 'No gaps' })
    const q = await v.api.english.queue()
    expect(q.map((x) => x.term)).toEqual(Array.from({ length: 10 }, (_, i) => `w${i}`))
    await v.api.english.review({ id: q[0].id, grade: 2 })
    await v.api.english.review({ id: q[1].id, grade: 0 })
    const stats = await v.api.english.stats()
    expect(stats.today).toMatchObject({ newDone: 2, newGoal: 10, newLeft: 8, reviewsDone: 0 })
    // w1 is back in 10 minutes, not now: 8 new words are left.
    expect(stats.due).toBe(8)
    expect((await v.api.english.moreNew(50)).map((x) => x.term)).toEqual(
      Array.from({ length: 10 }, (_, i) => `w${i + 2}`)
    )
  })

  it('import skips duplicates (case, spacing, the file itself) and invalid rows; dryRun writes nothing', async () => {
    await v.api.english.create({ term: 'Rollout' })
    const rows = [
      { term: 'rollout', translation: '', example: '' },
      { term: 'merge  conflict', translation: 'конфлікт', example: '' },
      { term: 'Merge conflict', translation: '', example: '' },
      { term: '   ', translation: 'x', example: '' },
      { term: 'x'.repeat(301), translation: '', example: '' }
    ]
    expect(await v.api.english.importWords({ rows, dryRun: true })).toEqual({
      added: 1,
      duplicates: 2,
      invalid: 2
    })
    expect((await v.api.english.stats()).total).toBe(1)
    expect(await v.api.english.importWords({ rows })).toEqual({
      added: 1,
      duplicates: 2,
      invalid: 2
    })
    const [added] = await v.api.english.list({ search: 'conflict' })
    expect(added).toMatchObject({ term: 'merge  conflict', translation: 'конфлікт', stage: 'new' })
  })
})
