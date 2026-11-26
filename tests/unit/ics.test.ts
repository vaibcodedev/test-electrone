process.env.TZ = 'Europe/Kyiv'

/** The .ics export: the pure RFC 5545 writer and what the calendar puts into the file. */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'
import { buildIcs, escapeText, foldLine, rruleFor, triggerFor } from '@main/core/ics'
import { occurrences } from '@main/modules/calendar'
import { openVault, type Vault } from './support/vault'

vi.mock('electron', async () => (await import('./support/electron-mock')).electronMock)
vi.mock('@main/core/logger', async () => (await import('./support/electron-mock')).loggerMock)

const at = (y: number, m: number, d: number, h = 0, min = 0): number =>
  new Date(y, m - 1, d, h, min).getTime()
const octets = (s: string): number => new TextEncoder().encode(s).length
const NOW = Date.UTC(2026, 10, 26, 10, 0, 0)

/** Unfolds the file back into logical lines (RFC 5545 §3.1). */
const unfold = (text: string): string[] => text.replace(/\r\n /g, '').split('\r\n').filter(Boolean)

describe('text and lines', () => {
  it('escapes backslash, semicolon, comma and line breaks', () => {
    expect(escapeText('a\\b; c, d\nе\r\nє')).toBe('a\\\\b\\; c\\, d\\nе\\nє')
  })

  it('folds at 75 octets without splitting a Cyrillic letter or an emoji', () => {
    const line = `SUMMARY:${'Дедлайн 🚀 '.repeat(20)}`
    const folded = foldLine(line)
    const parts = folded.split('\r\n')
    expect(parts.length).toBeGreaterThan(1)
    for (const p of parts) expect(octets(p)).toBeLessThanOrEqual(75)
    for (const p of parts.slice(1)) expect(p.startsWith(' ')).toBe(true)
    // No U+FFFD: every chunk is whole UTF-8 on its own.
    for (const p of parts)
      expect(new TextDecoder().decode(new TextEncoder().encode(p))).not.toContain('�')
    expect(parts.map((p, i) => (i ? p.slice(1) : p)).join('')).toBe(line)
  })

  it('a short line stays as it is', () => {
    expect(foldLine('VERSION:2.0')).toBe('VERSION:2.0')
  })

  it('reminders become triggers before the start', () => {
    expect([0, 15, 60, 180, 1440, 2880].map(triggerFor)).toEqual([
      'PT0S',
      '-PT15M',
      '-PT1H',
      '-PT3H',
      '-P1D',
      '-P2D'
    ])
  })
})

describe('RRULE matches Vault’s own recurrence', () => {
  it('simple frequencies', () => {
    expect(rruleFor('none', at(2026, 1, 5))).toBeNull()
    expect(rruleFor('daily', at(2026, 1, 5))).toBe('FREQ=DAILY')
    expect(rruleFor('weekly', at(2026, 1, 5))).toBe('FREQ=WEEKLY')
    expect(rruleFor('monthly', at(2026, 1, 15))).toBe('FREQ=MONTHLY')
    expect(rruleFor('yearly', at(2026, 7, 14))).toBe('FREQ=YEARLY')
  })

  it('month ends clamp like Vault does (29–31, 29 лютого)', () => {
    expect(rruleFor('monthly', at(2026, 1, 31))).toBe('FREQ=MONTHLY;BYMONTHDAY=-1')
    expect(rruleFor('monthly', at(2026, 1, 30))).toBe(
      'FREQ=MONTHLY;BYMONTHDAY=28,29,30;BYSETPOS=-1'
    )
    expect(rruleFor('monthly', at(2026, 1, 29))).toBe('FREQ=MONTHLY;BYMONTHDAY=28,29;BYSETPOS=-1')
    expect(rruleFor('yearly', at(2028, 2, 29))).toBe(
      'FREQ=YEARLY;BYMONTH=2;BYMONTHDAY=28,29;BYSETPOS=-1'
    )
  })

  it('the clamped rule names the same days Vault shows', () => {
    // «The last of 28…D that the month has» is what BYMONTHDAY=28..D;BYSETPOS=-1 means.
    const lastOf = (y: number, m: number, d: number): number =>
      Math.max(
        ...Array.from({ length: d - 27 }, (_, i) => 28 + i).filter(
          (x) => new Date(y, m, x).getMonth() === m
        )
      )
    for (const day of [29, 30, 31]) {
      const shown = occurrences(
        { startAt: at(2027, 1, day, 9), endAt: null, recurrence: 'monthly' },
        at(2027, 1, 1),
        at(2028, 12, 31)
      )
      for (const ts of shown) {
        const d = new Date(ts)
        const expected =
          day === 31
            ? new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate()
            : lastOf(d.getFullYear(), d.getMonth(), day)
        expect(d.getDate()).toBe(expected)
      }
    }
  })
})

describe('buildIcs', () => {
  it('a calendar of CRLF lines with floating times, an exclusive all-day end and alarms', () => {
    const text = buildIcs(
      [
        {
          uid: 'event-1@vault',
          title: 'Стендап, щодня',
          description: 'Рядок 1\nРядок 2',
          start: at(2026, 11, 26, 9, 30),
          end: at(2026, 11, 26, 10),
          allDay: false,
          rrule: 'FREQ=DAILY',
          alarms: [15, 1440]
        },
        {
          uid: 'card-2@vault',
          title: 'Відпустка',
          start: at(2026, 12, 1),
          end: at(2026, 12, 3),
          allDay: true
        }
      ],
      { now: NOW, name: 'Vault' }
    )
    expect(text.endsWith('\r\n')).toBe(true)
    expect(text.replace(/\r\n/g, '')).not.toMatch(/[\r\n]/)
    const lines = unfold(text)
    expect(lines[0]).toBe('BEGIN:VCALENDAR')
    expect(lines).toContain('VERSION:2.0')
    expect(lines.at(-1)).toBe('END:VCALENDAR')
    expect(lines).toContain('DTSTAMP:20261126T100000Z')
    expect(lines).toContain('DTSTART:20261126T093000')
    expect(lines).toContain('DTEND:20261126T100000')
    expect(lines).toContain('RRULE:FREQ=DAILY')
    expect(lines).toContain('SUMMARY:Стендап\\, щодня')
    expect(lines).toContain('DESCRIPTION:Рядок 1\\nРядок 2')
    expect(lines.filter((l) => l.startsWith('TRIGGER:'))).toEqual([
      'TRIGGER:-PT15M',
      'TRIGGER:-P1D'
    ])
    expect(lines).toContain('DTSTART;VALUE=DATE:20261201')
    expect(lines).toContain('DTEND;VALUE=DATE:20261204')
    expect(lines.filter((l) => l === 'BEGIN:VEVENT')).toHaveLength(2)
  })
})

describe('the calendar’s .ics file', () => {
  let v: Vault
  beforeEach(() => {
    v = openVault()
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(at(2026, 11, 26, 12))
    v.calendar.addFeedProvider((from, to) => v.boards.calendarFeed(from, to))
    v.calendar.addFeedProvider((from, to) => v.crm.calendarFeed(from, to))
  })
  afterEach(() => {
    vi.useRealTimers()
    v.close()
  })

  async function seed() {
    const event = await v.api.events.create({
      title: 'Оплата оренди',
      startAt: at(2026, 1, 31, 10),
      recurrence: 'monthly',
      remindMinutes: 60
    })
    const board = await v.api.boards.create({ title: 'Дошка' })
    const cols = v.boards.columns(board.id)
    const open = await v.api.cards.create({
      boardId: board.id,
      columnId: cols[0].id,
      title: 'Здати звіт',
      dueAt: at(2026, 12, 3)
    })
    const closed = await v.api.cards.create({
      boardId: board.id,
      columnId: cols.find((c) => c.isDone)!.id,
      title: 'Вже зроблено',
      dueAt: at(2026, 12, 4)
    })
    const far = await v.api.cards.create({
      boardId: board.id,
      columnId: cols[0].id,
      title: 'Через два роки',
      dueAt: at(2028, 12, 4)
    })
    return { event, open, closed, far }
  }

  it('own events whole with RRULE and VALARM; card deadlines in the window, without the done ones', async () => {
    const { event, open } = await seed()
    const lines = unfold(v.calendarExport.build(['event', 'card']).text)
    const uids = lines.filter((l) => l.startsWith('UID:'))
    expect(uids).toEqual([`UID:event-${event.id}@vault`, `UID:card-${open.id}@vault`])
    expect(lines).toContain('RRULE:FREQ=MONTHLY;BYMONTHDAY=-1')
    expect(lines).toContain('TRIGGER:-PT1H')
    expect(lines).toContain('DTSTART;VALUE=DATE:20261203')
    expect(lines).toContain('CATEGORIES:Дедлайн картки')
  })

  it('only the chosen sources; the same uids next time (a re-import updates, not duplicates)', async () => {
    await seed()
    const cardsOnly = unfold(v.calendarExport.build(['card']).text)
    expect(cardsOnly.some((l) => l.startsWith('RRULE:'))).toBe(false)
    const again = unfold(v.calendarExport.build(['card']).text)
    expect(again.filter((l) => l.startsWith('UID:'))).toEqual(
      cardsOnly.filter((l) => l.startsWith('UID:'))
    )
  })

  it('«Зберегти файл» writes where main’s dialog said; cancelled — nothing', async () => {
    await seed()
    expect(await v.api.events.exportIcs({ sources: ['event'] })).toBeNull()
    v.savePath = join(v.dir, 'out.ics')
    const res = await v.api.events.exportIcs({ sources: ['event', 'card'] })
    expect(res).toEqual({ path: v.savePath, count: 2 })
    expect(readFileSync(v.savePath, 'utf8')).toContain('BEGIN:VCALENDAR\r\n')
    await expect(v.api.events.exportIcs({ sources: [] })).rejects.toThrow()
  })

  it('accesses: only the term, never a secret', async () => {
    const p = await v.api.projects.create({ title: 'Сайт' })
    await v.crm.credentialsApi().create({
      kind: 'apiKey',
      projectId: p.id,
      label: 'OpenAI',
      secret: 'sk-very-secret-value',
      expiresAt: at(2026, 12, 20, 12)
    })
    const lines = unfold(v.calendarExport.build(['credential']).text)
    expect(lines.filter((l) => l.startsWith('DTSTART')).map((l) => l.slice(-8))).toEqual([
      '20261206',
      '20261217',
      '20261220'
    ])
    expect(lines).toContain('SUMMARY:Через 14 днів спливає ключ «OpenAI»')
    expect(lines.join(' ')).not.toContain('sk-very-secret-value')
  })
})
