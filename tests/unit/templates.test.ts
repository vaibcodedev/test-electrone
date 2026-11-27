/**
 * Message templates on a real database: «Для чого» (purpose) — the 0011 backfill, create/patch, the direction
 * filter — and the person's own situations next to the built-in ones.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join, resolve } from 'path'
import { openVault, type Vault } from './support/vault'
import { DbContext } from '@main/db/client'
import { createEach } from '@main/services/import-service'
import { isDraft } from '@main/core/registry'
import { aiActionSchema } from '@shared/domain/ai-actions'
import {
  builtinSituationOf,
  purposeOfSituation,
  situationLabel,
  SITUATION_PURPOSE,
  TEMPLATE_SITUATIONS,
  TEMPLATE_VERSIONS_MAX,
  templatePatchSchema
} from '@shared/domain/freelance'

vi.mock('electron', async () => (await import('./support/electron-mock')).electronMock)
vi.mock('@main/core/logger', async () => (await import('./support/electron-mock')).loggerMock)

const MIGRATIONS = resolve('src/main/db/migrations')

describe('0011: «Для чого» for the templates from before the field', () => {
  it('keeps every template with its data, fills purpose from the situation, and never again', () => {
    const dir = mkdtempSync(join(tmpdir(), 'vault-tpl-upgrade-'))
    try {
      // The migrations of the previous version: everything up to 0010.
      const oldMigrations = join(dir, 'migrations')
      cpSync(MIGRATIONS, oldMigrations, { recursive: true })
      const journalFile = join(oldMigrations, 'meta', '_journal.json')
      const journal = JSON.parse(readFileSync(journalFile, 'utf8')) as { entries: { tag: string }[] }
      journal.entries = journal.entries.filter((e) => e.tag < '0011')
      writeFileSync(journalFile, JSON.stringify(journal))

      const file = join(dir, 'vault.db')
      const old = new DbContext(file, oldMigrations)
      old.open()
      const t = 1_700_000_000_000
      const insert = old.sqlite.prepare(
        `INSERT INTO message_templates (id, situation, title, trigger, body, note, niche, copy_count, created_at, updated_at, deleted_at)
         VALUES (?, ?, ?, 'коли', 'Hi {client}', 'нотатка', 'Next.js', 3, ?, ?, ?)`
      )
      TEMPLATE_SITUATIONS.forEach((s, i) => insert.run(`t-${s}`, s, `Шаблон ${i}`, t, t + i, null))
      insert.run('t-trash', 'cover_letter', 'У кошику', t, t, t + 5)
      old.close()

      const db = new DbContext(file, MIGRATIONS)
      db.open()
      const rows = () =>
        db.sqlite.prepare('SELECT * FROM message_templates ORDER BY id').all() as Record<string, unknown>[]
      try {
        const after = rows()
        expect(after).toHaveLength(TEMPLATE_SITUATIONS.length + 1)
        for (const s of TEMPLATE_SITUATIONS) {
          const r = after.find((x) => x.id === `t-${s}`)!
          expect(r.purpose).toBe(SITUATION_PURPOSE[s])
          expect(r).toMatchObject({
            situation: s,
            trigger: 'коли',
            body: 'Hi {client}',
            note: 'нотатка',
            niche: 'Next.js',
            copy_count: 3,
            created_at: t
          })
        }
        expect(after.find((x) => x.id === 't-trash')).toMatchObject({ purpose: 'jobs', deleted_at: t + 5 })
        // 0012: the text stays the first version, unnamed, with no further ones.
        for (const r of after) expect(r).toMatchObject({ body: 'Hi {client}', body_name: '', versions: '[]' })
        // The exact mapping the person approved.
        expect(Object.fromEntries(after.map((r) => [r.situation, r.purpose]))).toMatchObject({
          cover_letter: 'jobs',
          recruiter: 'jobs',
          thank_you: 'jobs',
          proposal: 'freelance',
          estimate: 'freelance',
          tz_questions: 'freelance',
          revisions: 'freelance',
          small_talk: 'freelance',
          closing: 'freelance',
          first_message: 'any',
          follow_up: 'any',
          other: 'any'
        })

        // The person changes it; a restart does not run the fill again.
        db.sqlite.prepare("UPDATE message_templates SET purpose = 'any' WHERE id = 't-cover_letter'").run()
        db.sqlite.prepare("UPDATE message_templates SET purpose = 'jobs' WHERE id = 't-proposal'").run()
      } finally {
        db.close()
      }
      const again = new DbContext(file, MIGRATIONS)
      again.open()
      try {
        expect(again.migratedOnOpen).toBe(0)
        const r = again.sqlite
          .prepare("SELECT id, purpose FROM message_templates WHERE id IN ('t-cover_letter', 't-proposal') ORDER BY id")
          .all()
        expect(r).toEqual([
          { id: 't-cover_letter', purpose: 'any' },
          { id: 't-proposal', purpose: 'jobs' }
        ])
      } finally {
        again.close()
      }
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('the SQL of the migrations only adds columns (no table is recreated)', () => {
    const sql = readFileSync(join(MIGRATIONS, '0011_template_purpose.sql'), 'utf8')
    expect(sql).toContain('ALTER TABLE `message_templates` ADD `purpose`')
    const versions = readFileSync(join(MIGRATIONS, '0012_template_versions.sql'), 'utf8')
    expect(versions).toContain('ALTER TABLE `message_templates` ADD `versions`')
    for (const text of [sql, versions]) expect(text).not.toMatch(/DROP TABLE|__new_|CREATE TABLE/i)
  })
})

let v: Vault
beforeEach(() => {
  v = openVault()
})
afterEach(() => v.close())

describe('templates: «Для чого»', () => {
  it('create without it derives it from the situation; a given one wins', async () => {
    const letter = await v.api.templates.create({ title: 'Лист', situation: 'cover_letter' })
    const bid = await v.api.templates.create({ title: 'Відгук' })
    const hello = await v.api.templates.create({ title: 'Привіт', situation: 'first_message' })
    const mine = await v.api.templates.create({ title: 'Свій', situation: 'proposal', purpose: 'jobs' })
    expect([letter.purpose, bid.purpose, hello.purpose, mine.purpose]).toEqual([
      'jobs',
      'freelance',
      'any',
      'jobs'
    ])
  })

  it('a patch never resets it — not by another field, not by a new situation', async () => {
    const t = await v.api.templates.create({ title: 'Лист', situation: 'cover_letter', purpose: 'any' })
    expect(templatePatchSchema.parse({ title: 'X' })).not.toHaveProperty('purpose')
    await v.api.templates.update({ id: t.id, patch: { title: 'Інший' } })
    expect((await v.api.templates.get(t.id))?.purpose).toBe('any')
    await v.api.templates.update({ id: t.id, patch: { situation: 'proposal' } })
    expect((await v.api.templates.get(t.id))?.purpose).toBe('any')
    await v.api.templates.update({ id: t.id, patch: { purpose: 'freelance' } })
    expect((await v.api.templates.get(t.id))?.purpose).toBe('freelance')
  })

  it('a direction lists its own templates and the «Будь-де» ones, with the situation filter on top', async () => {
    await v.api.templates.create({ title: 'F', situation: 'proposal' })
    await v.api.templates.create({ title: 'J', situation: 'cover_letter' })
    await v.api.templates.create({ title: 'A', situation: 'follow_up' })
    await v.api.templates.create({ title: 'JF', situation: 'follow_up', purpose: 'jobs' })
    const titles = async (q: Parameters<typeof v.api.templates.list>[0]) =>
      (await v.api.templates.list(q)).map((t) => t.title).sort()
    expect(await titles({ purpose: 'freelance' })).toEqual(['A', 'F'])
    expect(await titles({ purpose: 'jobs' })).toEqual(['A', 'J', 'JF'])
    expect(await titles({ purpose: 'jobs', situation: 'follow_up' })).toEqual(['A', 'JF'])
    expect(await titles({ purpose: 'freelance', situation: 'follow_up' })).toEqual(['A'])
    expect(await titles({})).toEqual(['A', 'F', 'J', 'JF'])
    // Paged as before.
    expect(await v.api.templates.list({ purpose: 'jobs', limit: 2, offset: 0 })).toHaveLength(2)
    await expect(v.api.templates.list({ purpose: 'any' as never })).rejects.toThrow()
  })

  it('after the update (restart on an old database) the filter works on the migrated rows in both directions', async () => {
    // The app's own database replaced by one from the previous version, then opened again — as a restart does.
    v.db.close()
    const file = join(v.dir, 'vault.db')
    for (const f of [file, `${file}-wal`, `${file}-shm`]) rmSync(f, { force: true })
    const oldMigrations = join(v.dir, 'old-migrations')
    cpSync(MIGRATIONS, oldMigrations, { recursive: true })
    const journalFile = join(oldMigrations, 'meta', '_journal.json')
    const journal = JSON.parse(readFileSync(journalFile, 'utf8')) as { entries: { tag: string }[] }
    journal.entries = journal.entries.filter((e) => e.tag < '0011')
    writeFileSync(journalFile, JSON.stringify(journal))
    const old = new DbContext(file, oldMigrations)
    old.open()
    const ins = old.sqlite.prepare(
      'INSERT INTO message_templates (id, situation, title, created_at, updated_at) VALUES (?, ?, ?, 1, 1)'
    )
    for (const [id, s] of [
      ['a', 'proposal'],
      ['b', 'cover_letter'],
      ['c', 'follow_up'],
      ['d', 'thank_you'],
      ['e', 'small_talk']
    ])
      ins.run(id, s, `T-${s}`)
    old.close()
    v.db.open()
    expect(v.db.migratedOnOpen).toBe(2)
    const ids = async (purpose?: 'freelance' | 'jobs') =>
      (await v.api.templates.list(purpose ? { purpose } : {})).map((t) => t.id).sort()
    expect(await ids()).toEqual(['a', 'b', 'c', 'd', 'e'])
    expect(await ids('freelance')).toEqual(['a', 'c', 'e'])
    expect(await ids('jobs')).toEqual(['b', 'c', 'd'])
    expect((await v.api.templates.list({ purpose: 'jobs', situation: 'follow_up' })).map((t) => t.id)).toEqual(['c'])
    // Every row carries its value (the page counts and labels from it).
    expect((await v.api.templates.list({})).every((t) => !!t.purpose)).toBe(true)
  })

  it('«Зробити шаблоном» from a proposal is a freelance template', async () => {
    const platform = await v.api.platforms.create({ name: 'Upwork' })
    const p = await v.api.proposals.create({ platformId: platform.id, jobTitle: 'Лендинг', coverLetter: 'Hi' })
    expect((await v.api.proposals.toTemplate(p.id)).purpose).toBe('freelance')
  })
})

describe('templates: own situations', () => {
  it('own text is stored as typed, with «Будь-де» unless a purpose is given', async () => {
    const hr = await v.api.templates.create({ title: 'HR', situation: '  Привітання HR ' })
    expect(hr).toMatchObject({ situation: 'Привітання HR', purpose: 'any' })
    const jobs = await v.api.templates.create({ title: 'Відмова', situation: 'Відповідь на відмову', purpose: 'jobs' })
    expect(jobs.purpose).toBe('jobs')
    expect(await v.api.templates.situations()).toEqual(['Відповідь на відмову', 'Привітання HR'])
  })

  it('a built-in label in any case is its key; a case-only variant of an own one takes its spelling', async () => {
    expect((await v.api.templates.create({ title: 'a', situation: 'ВІДГУК' })).situation).toBe('proposal')
    expect((await v.api.templates.create({ title: 'b', situation: 'Cover_Letter' })).situation).toBe('cover_letter')
    await v.api.templates.create({ title: 'c', situation: 'Привітання HR' })
    const d = await v.api.templates.create({ title: 'd', situation: 'привітання hr' })
    expect(d.situation).toBe('Привітання HR')
    const e = await v.api.templates.create({ title: 'e' })
    await v.api.templates.update({ id: e.id, patch: { situation: 'ПРИВІТАННЯ HR' } })
    expect((await v.api.templates.get(e.id))?.situation).toBe('Привітання HR')
    await v.api.templates.update({ id: e.id, patch: { situation: 'нагадування' } })
    expect((await v.api.templates.get(e.id))?.situation).toBe('follow_up')
    expect(await v.api.templates.situations()).toEqual(['Привітання HR'])
  })

  it('empty and too long are rejected; the filter and the list order take own situations', async () => {
    await expect(v.api.templates.create({ title: 'x', situation: '   ' })).rejects.toThrow()
    await expect(v.api.templates.create({ title: 'x', situation: 'я'.repeat(101) })).rejects.toThrow()
    await v.api.templates.create({ title: 'own', situation: 'Затримався з відповіддю на 3 дні' })
    await v.api.templates.create({ title: 'bid', situation: 'proposal' })
    await v.api.templates.create({ title: 'other', situation: 'other' })
    expect((await v.api.templates.list({ situation: 'Затримався з відповіддю на 3 дні' })).map((t) => t.title)).toEqual(['own'])
    // Built-in groups in the chip order, own ones after them.
    expect((await v.api.templates.list({})).map((t) => t.title)).toEqual(['bid', 'other', 'own'])
  })

  it('a removed template stops offering its own situation', async () => {
    const t = await v.api.templates.create({ title: 'x', situation: 'Одноразова' })
    expect(await v.api.templates.situations()).toEqual(['Одноразова'])
    await v.api.templates.remove(t.id)
    expect(await v.api.templates.situations()).toEqual([])
  })

  it('JSON import: old items without purpose, own situations and built-in keys', async () => {
    v.importer.register('template', createEach(v.api.templates.create))
    await v.importer.run({
      kind: 'template',
      payload: [
        { situation: 'recruiter', title: 'Старий формат', body: 'Hi' },
        { situation: 'Привітання HR', title: 'Своя', purpose: 'jobs' },
        { title: 'Без ситуації' }
      ]
    })
    const all = await v.api.templates.list({})
    expect(all.map((t) => [t.title, t.situation, t.purpose]).sort()).toEqual([
      ['Без ситуації', 'proposal', 'freelance'],
      ['Своя', 'Привітання HR', 'jobs'],
      ['Старий формат', 'recruiter', 'jobs']
    ])
  })
})

describe('situation helpers and the chat action', () => {
  it('labels never come out undefined', () => {
    expect(situationLabel('follow_up')).toBe('Нагадування')
    expect(situationLabel('нагадування')).toBe('Нагадування')
    expect(situationLabel('Привітання HR')).toBe('Привітання HR')
    expect(builtinSituationOf('Привітання HR')).toBeNull()
    expect(builtinSituationOf(' Супровідний ЛИСТ ')).toBe('cover_letter')
    expect(purposeOfSituation('Привітання HR')).toBe('any')
    expect(purposeOfSituation('thank_you')).toBe('jobs')
  })

  it('create_template takes an own situation and a purpose; nonsense falls back', () => {
    const own = aiActionSchema.parse({
      type: 'create_template',
      title: 'HR',
      situation: 'Привітання HR',
      purpose: 'jobs'
    })
    expect(own).toMatchObject({ situation: 'Привітання HR', purpose: 'jobs' })
    const bad = aiActionSchema.parse({ type: 'create_template', title: 'X', situation: '', purpose: 'mars' })
    expect(bad).toMatchObject({ situation: 'other' })
    expect((bad as { purpose?: string }).purpose).toBeUndefined()
  })
})

describe('templates: text versions', () => {
  const ua = { name: 'Українська', body: 'Вітаю, {name}!' }
  const en = { name: 'English', body: 'Hi {name}!' }

  it('create keeps them; a patch of anything else never wipes them', async () => {
    const t = await v.api.templates.create({
      title: 'Привіт',
      body: 'Привет, {name}!',
      bodyName: 'Русский',
      versions: [ua, en]
    })
    expect(t).toMatchObject({ body: 'Привет, {name}!', bodyName: 'Русский', versions: [ua, en] })
    expect(templatePatchSchema.parse({ title: 'X' })).toEqual({ title: 'X' })
    await v.api.templates.update({ id: t.id, patch: { title: 'Інша', body: 'Привет!', purpose: 'jobs' } })
    expect((await v.api.templates.get(t.id))?.versions).toEqual([ua, en])
    await v.api.templates.update({ id: t.id, patch: { versions: [en] } })
    expect(await v.api.templates.get(t.id)).toMatchObject({ bodyName: 'Русский', versions: [en] })
  })

  it('names are unique in a template, in any case; an unnamed first one is «Основна»', async () => {
    await expect(v.api.templates.create({ title: 'x', bodyName: 'english', versions: [en] })).rejects.toThrow(
      /English|english/
    )
    await expect(
      v.api.templates.create({ title: 'x', versions: [{ name: 'ОСНОВНА', body: '' }] })
    ).rejects.toThrow(/ОСНОВНА|Основна/)
    const t = await v.api.templates.create({ title: 'x', versions: [ua] })
    await expect(v.api.templates.update({ id: t.id, patch: { bodyName: 'українська' } })).rejects.toThrow(
      /українська|Українська/
    )
    expect((await v.api.templates.get(t.id))?.bodyName).toBe('')
    // The same name in another template is fine.
    await v.api.templates.create({ title: 'y', versions: [ua] })
  })

  it('limits: an empty name, too many versions', async () => {
    await expect(v.api.templates.create({ title: 'x', versions: [{ name: ' ', body: '' }] })).rejects.toThrow()
    const many = Array.from({ length: TEMPLATE_VERSIONS_MAX }, (_, i) => ({ name: `V${i}`, body: '' }))
    await expect(v.api.templates.create({ title: 'x', versions: many })).rejects.toThrow()
    await v.api.templates.create({ title: 'x', versions: many.slice(1) })
  })

  it('every version is found by search, and «Скасувати» brings the versions back', async () => {
    const t = await v.api.templates.create({
      title: 'Відгук',
      body: 'Hello',
      versions: [{ name: 'Українська', body: 'Унікальнеслово тут' }]
    })
    expect(v.search.query({ text: 'Унікальнеслово' }).map((h) => h.id)).toEqual([t.id])
    expect((await v.api.templates.list({ search: 'унікальнеслово' })).map((x) => x.id)).toEqual([t.id])
    const ref = { type: 'template' as const, id: t.id }
    const snap = v.revisions.snapshot(ref)
    await v.api.templates.update({ id: t.id, patch: { versions: [], bodyName: 'English' } })
    expect(v.revisions.changed(ref, snap)).toBe(true)
    v.revisions.revert(ref, snap)
    expect(await v.api.templates.get(t.id)).toMatchObject({
      bodyName: '',
      versions: [{ name: 'Українська', body: 'Унікальнеслово тут' }]
    })
    expect(v.revisions.changed(ref, snap)).toBe(false)
  })

  it('a new template is still an empty draft with no versions', async () => {
    const t = await v.api.templates.create({ title: 'Новий шаблон' })
    const row = v.registry.findRow({ type: 'template', id: t.id })!
    expect(isDraft(v.registry.get('template'), row)).toBe(true)
    await v.api.templates.update({ id: t.id, patch: { versions: [en] } })
    expect(isDraft(v.registry.get('template'), v.registry.findRow({ type: 'template', id: t.id })!)).toBe(false)
  })

  it('export: the versions as readable sections; JSON import with and without them, old «niche» ignored', async () => {
    const t = await v.api.templates.create({ title: 'E', body: 'Hi', bodyName: 'English', versions: [ua] })
    const row = v.registry.findRow({ type: 'template', id: t.id })!
    expect(v.registry.get('template').exportBody?.(row)).toEqual([
      '## Версія: English',
      '',
      'Hi',
      '',
      '## Версія: Українська',
      '',
      'Вітаю, {name}!',
      ''
    ])
    v.importer.register('template', createEach(v.api.templates.create))
    await v.importer.run({
      kind: 'template',
      payload: [
        { title: 'Старий', body: 'Text', niche: 'Next.js' },
        { title: 'Новий', body: 'Hi', bodyName: 'English', versions: [ua] }
      ]
    })
    const all = await v.api.templates.list({})
    const old = all.find((x) => x.title === 'Старий')!
    expect(old).toMatchObject({ bodyName: '', versions: [] })
    expect(v.registry.findRow({ type: 'template', id: old.id })?.niche).toBe('')
    expect(all.find((x) => x.title === 'Новий')).toMatchObject({ bodyName: 'English', versions: [ua] })
  })
})

describe('templates: «Тип завдання» is gone from the UI, its old values stay', () => {
  it('an old niche value is kept, findable, and not touched by edits', async () => {
    const t = await v.api.templates.create({ title: 'Старий шаблон', body: 'x' })
    v.db.sqlite.prepare("UPDATE message_templates SET niche = 'Вебфлоу' WHERE id = ?").run(t.id)
    v.search.indexRow('template', v.registry.findRow({ type: 'template', id: t.id })!)
    await v.api.templates.update({ id: t.id, patch: { title: 'Новий заголовок', niche: 'інше' } as never })
    expect(v.registry.findRow({ type: 'template', id: t.id })?.niche).toBe('Вебфлоу')
    expect(v.search.query({ text: 'Вебфлоу' }).map((h) => h.id)).toEqual([t.id])
  })

  it('«Зробити шаблоном» from a proposal no longer writes the niche', async () => {
    const platform = await v.api.platforms.create({ name: 'Upwork' })
    const p = await v.api.proposals.create({
      platformId: platform.id,
      jobTitle: 'Лендинг',
      niche: 'Webflow',
      coverLetter: 'Hi'
    })
    const t = await v.api.proposals.toTemplate(p.id)
    expect(v.registry.findRow({ type: 'template', id: t.id })?.niche).toBe('')
    expect(t.title).toBe('Webflow: Лендинг')
  })
})
