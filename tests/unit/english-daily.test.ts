/** English trainer: the daily session, the streak, file import and grammar gap cards. */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { chartDays, pickSession, sessionLimits, streakOf } from '@main/modules/english-session'
import { addDays, dayKey } from '@main/core/util'
import { fillGaps, gapCards, isGapAnswer, pickGapCard } from '@shared/english-gaps'
import { guessColumns, mapRows, parseWordTable, stripHtml } from '@shared/english-import'
import { eq } from 'drizzle-orm'
import { wordReviews, words } from '@main/db/schema'
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

  it('Excel `;` CSV with commas inside translations keeps its columns; a tie goes to `;`', () => {
    const t = parseWordTable(
      'deploy;розгорнути, викатити;\nmerge;злити, об’єднати;Merge it\nship;випустити;'
    )
    expect(t.rows[0]).toEqual(['deploy', 'розгорнути, викатити', ''])
    expect(parseWordTable('a;b,c\nd;e,f').rows[0]).toEqual(['a', 'b,c'])
  })

  it('a first word is not taken for a header; the translation is never the word’s column', () => {
    const t = parseWordTable('term,термін\nrollout,викатка')
    expect(t.header).toBeNull()
    expect(t.rows).toHaveLength(2)
    const named = parseWordTable('word,example\nrun,Run it')
    expect(named.header).toEqual(['word', 'example'])
    expect(guessColumns(named)).toEqual({ term: 0, translation: 1, example: null })
    const same = parseWordTable('#columns:word,word\nrun,бігти')
    const map = guessColumns(same)
    expect(map.translation).not.toBe(map.term)
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
    expect(pickGapCard([], 1)).toBeUndefined()
    // Every sentence takes its turn, whatever their number (dueAt as a seed showed only the first one).
    for (const n of [2, 3, 4, 5, 6, 8, 9, 10, 12]) {
      const many = gapCards(Array.from({ length: n }, (_, i) => `s${i} [x${i}]`).join('\n'))
      const shown = new Set(
        Array.from({ length: n }, (_, turn) => pickGapCard(many, turn)?.answers[0])
      )
      expect(shown.size).toBe(n)
    }
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

  it('an entry forgotten today comes back behind an older backlog and a reached cap', async () => {
    const yesterday = addDays(Date.now(), -1)
    const make = async (term: string, dueAt: number): Promise<string> => {
      const w = await v.api.english.create({ term, translation: 't' })
      v.db.orm
        .update(words)
        .set({ lastReviewedAt: yesterday, intervalDays: 1, repetitions: 1, dueAt })
        .where(eq(words.id, w.id))
        .run()
      v.db.orm
        .insert(wordReviews)
        .values({ id: `r-${term}`, wordId: w.id, grade: 2, reviewedAt: yesterday })
        .run()
      return w.id
    }
    for (let i = 0; i < 101; i++) await make(`old${i}`, yesterday - 1000 * (101 - i))
    const again = await make('again', yesterday)
    await v.api.english.review({ id: again, grade: 0 })
    // Ten minutes later it is due again — the newest of all due entries.
    v.db.orm
      .update(words)
      .set({ dueAt: Date.now() - 1 })
      .where(eq(words.id, again))
      .run()
    const q = await v.api.english.queue()
    expect(q).toHaveLength(100)
    expect(q.map((w) => w.term)).toContain('again')
    const stats = await v.api.english.stats()
    expect(stats.today).toMatchObject({ reviewsDone: 1, reviewsLeft: 99, reviewsWaiting: true })
  })

  it('answers of an entry in the trash don’t count toward today', async () => {
    const w = await v.api.english.create({ term: 'gone' })
    await v.api.english.review({ id: w.id, grade: 2 })
    expect((await v.api.english.stats()).today.newDone).toBe(1)
    await v.api.english.remove(w.id)
    expect((await v.api.english.stats()).today.newDone).toBe(0)
  })

  it('a rule with only empty brackets is not trainable anywhere', async () => {
    await v.api.english.create({
      term: 'Empty',
      kind: 'rule',
      example: 'I [ ] it.\nShe [|hint] it.\nA [line\nbreak]'
    })
    const ok = await v.api.english.create({ term: 'Ok', kind: 'rule', example: 'I [went] home.' })
    expect((await v.api.english.queue()).map((w) => w.id)).toEqual([ok.id])
    expect((await v.api.english.moreNew(10)).map((w) => w.id)).toEqual([ok.id])
    expect((await v.api.english.stats()).today.newMore).toBe(0)
  })
})
