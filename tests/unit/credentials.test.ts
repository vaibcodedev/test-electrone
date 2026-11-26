/**
 * Credentials by kind on a real database: kinds and schemas, rows from before the kinds, 2FA codes
 * (RFC 4226 / 6238 vectors), secrets kept out of list / export / search, the clipboard clear, the payment link and
 * client-paid subscriptions that never count as my expenses.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { join } from 'path'
import type { AppPaths } from '@main/core/paths'
import { credentials } from '@main/db/schema'
import { ExportService } from '@main/services/export-service'
import { SecretClipboard } from '@main/services/secret-clipboard'
import { Credentials } from '@main/modules/crm/credentials'
import { FinanceModule, monthKey } from '@main/modules/finance'
import { FreelanceModule } from '@main/modules/freelance'
import { hotp, totp } from '@main/core/totp'
import { addDays, dayKey } from '@main/core/util'
import { requiredOf } from '@/lib/limits'
import {
  connectionString,
  credentialInputSchema,
  credentialMainLine,
  credentialPatchSchema,
  credentialSchemas,
  sshCommand,
  type Credential
} from '@shared/domain/credentials'
import { nextBillingAt } from '@shared/domain/finance'
import { base32Decode, parseOtpSecret } from '@shared/totp'
import { openVault, type Vault } from './support/vault'

vi.mock('electron', async () => (await import('./support/electron-mock')).electronMock)
vi.mock('@main/core/logger', async () => (await import('./support/electron-mock')).loggerMock)

let v: Vault
beforeEach(() => {
  v = openVault()
})
afterEach(() => {
  vi.useRealTimers()
  v.close()
})

const api = (): ReturnType<Vault['crm']['credentialsApi']> => v.crm.credentialsApi()

describe('kinds and schemas', () => {
  it('each kind requires its minimum (requiredOf drives «Додати»)', () => {
    expect(requiredOf(credentialSchemas.account)).toEqual({ label: true })
    expect(requiredOf(credentialSchemas.server)).toEqual({ label: true, host: true })
    expect(requiredOf(credentialSchemas.database)).toEqual({
      label: true,
      engine: true,
      host: true
    })
    expect(requiredOf(credentialSchemas.ftp)).toEqual({ label: true, host: true })
    expect(requiredOf(credentialSchemas.apiKey)).toEqual({ label: true, secret: true })
    expect(requiredOf(credentialSchemas.mail)).toEqual({ label: true, host: true })
    expect(requiredOf(credentialSchemas.other)).toEqual({ label: true })
  })

  it('the kind decides the fields; a host with a scheme or a bad 2FA key is refused', () => {
    const server = credentialInputSchema.parse({ kind: 'server', label: 'VPS', host: '1.2.3.4' })
    expect(server).toMatchObject({ kind: 'server', port: null, privateKey: '' })
    expect(() =>
      credentialInputSchema.parse({ kind: 'server', label: 'VPS', host: 'https://1.2.3.4' })
    ).toThrow()
    expect(() =>
      credentialInputSchema.parse({ kind: 'account', label: 'Сайт', totp: 'not a key!' })
    ).toThrow()
    expect(() => credentialInputSchema.parse({ kind: 'apiKey', label: 'Stripe' })).toThrow()
  })

  it('a patch (patchOf) fills no defaults: untouched fields stay out', () => {
    const p = credentialPatchSchema.parse({ kind: 'server', label: 'Новий' })
    expect(p).toEqual({ kind: 'server', label: 'Новий' })
  })

  it('main lines, the SSH command and the DB string', () => {
    const c = (
      over: Partial<Credential>
    ): Pick<Credential, 'kind' | 'url' | 'login' | 'fields'> => ({
      kind: 'account',
      url: '',
      login: '',
      fields: {},
      ...over
    })
    expect(
      credentialMainLine(c({ kind: 'server', login: 'root', fields: { host: '1.2.3.4' } }))
    ).toBe('root@1.2.3.4:22')
    expect(credentialMainLine(c({ login: 'admin@site.com', url: 'https://site.com' }))).toBe(
      'admin@site.com'
    )
    const db = c({
      kind: 'database',
      login: 'app',
      fields: { engine: 'postgresql', host: 'db.local', database: 'shop' }
    })
    expect(credentialMainLine(db)).toBe('postgres://app@db.local:5432/shop')
    expect(connectionString(db, 'p@ss')).toBe('postgres://app:p%40ss@db.local:5432/shop')
    expect(sshCommand({ login: 'root', fields: { host: 'h', port: 2222 } })).toBe(
      'ssh -p 2222 root@h'
    )
    expect(sshCommand({ login: 'root', fields: { host: 'h', keyPath: 'C:\\My keys\\id' } })).toBe(
      'ssh -p 22 -i "C:\\My keys\\id" root@h'
    )
  })
})

describe('rows from before the kinds', () => {
  it('read as an account with the same url, login and password; nothing rewritten', async () => {
    const p = await v.api.projects.create({ title: 'Сайт' })
    // What a row of the first version looks like after the migration: only the column defaults.
    v.db.sqlite
      .prepare(
        `INSERT INTO credentials (id, project_id, label, url, login, secret, notes, created_at, updated_at)
         VALUES ('old1', ?, 'Адмінка', 'https://shop.com/admin', 'anna', ?, '', 1, 1)`
      )
      .run(p.id, v.m.secrets.encrypt('s3cret'))
    const [c] = await api().list({ projectId: p.id })
    expect(c).toMatchObject({
      kind: 'account',
      url: 'https://shop.com/admin',
      login: 'anna',
      hasSecret: true,
      fields: {},
      secretsSet: [],
      payment: null
    })
    expect(await api().reveal('old1')).toBe('s3cret')
    // An old caller without a kind still creates an account.
    const made = await api().create({ projectId: p.id, label: 'FTP', login: 'u' } as never)
    expect(made.kind).toBe('account')
  })
})

describe('2FA codes', () => {
  // RFC 4226 Appendix D: the key "12345678901234567890", counters 0…9.
  const key = new TextEncoder().encode('12345678901234567890')
  it('HOTP matches RFC 4226', () => {
    const expected = [
      '755224',
      '287082',
      '359152',
      '969429',
      '338314',
      '254676',
      '287922',
      '162583',
      '399871',
      '520489'
    ]
    expect(expected.map((_, i) => hotp(key, i))).toEqual(expected)
  })

  it('TOTP matches RFC 6238 (SHA-1, SHA-256, SHA-512; 8 digits, 30 s)', () => {
    const keys = {
      sha1: key,
      sha256: new TextEncoder().encode('12345678901234567890123456789012'),
      sha512: new TextEncoder().encode(
        '1234567890123456789012345678901234567890123456789012345678901234'
      )
    } as const
    const vectors: [number, string, string, string][] = [
      [59, '94287082', '46119246', '90693936'],
      [1111111109, '07081804', '68084774', '25091201'],
      [1111111111, '14050471', '67062674', '99943326'],
      [1234567890, '89005924', '91819424', '93441116'],
      [2000000000, '69279037', '90698825', '38618901'],
      [20000000000, '65353130', '77737706', '47863826']
    ]
    for (const [t, s1, s256, s512] of vectors) {
      const at = t * 1000
      expect(totp({ key: keys.sha1, digits: 8, period: 30, algorithm: 'sha1' }, at).code).toBe(s1)
      expect(totp({ key: keys.sha256, digits: 8, period: 30, algorithm: 'sha256' }, at).code).toBe(
        s256
      )
      expect(totp({ key: keys.sha512, digits: 8, period: 30, algorithm: 'sha512' }, at).code).toBe(
        s512
      )
    }
    expect(totp({ key, digits: 6, period: 30, algorithm: 'sha1' }, 59_000).expiresAt).toBe(60_000)
  })

  it('takes a base32 key (spaces, lower case) or an otpauth:// link', () => {
    const b32 = 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ'
    expect(base32Decode(b32)).toEqual(key)
    expect(parseOtpSecret('gezd gnbv gy3t qojq gezd gnbv gy3t qojq')?.key).toEqual(key)
    const uri = parseOtpSecret(`otpauth://totp/Site:anna?secret=${b32}&issuer=Site&digits=8`)
    expect(uri).toMatchObject({ digits: 8, period: 30, algorithm: 'sha1' })
    expect(parseOtpSecret('otpauth://hotp/x?secret=' + b32)).toBeNull()
    expect(parseOtpSecret('hello')).toBeNull()
  })

  it('main returns the current code, never the key', async () => {
    const p = await v.api.projects.create({ title: 'Сайт' })
    const c = await api().create({
      kind: 'account',
      projectId: p.id,
      label: 'Адмінка',
      totp: 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ'
    })
    expect(c.secretsSet).toEqual(['totp'])
    const code = await api().totp(c.id)
    expect(code.code).toMatch(/^\d{6}$/)
    expect(JSON.stringify(code)).not.toContain('GEZD')
  })
})

describe('secrets stay out of list, export and search', () => {
  const PASSWORD = 'pw-Секрет-1'
  const KEY = '-----BEGIN KEY-----zzSECRETKEYzz'
  const PAIR = 'pair-value-SECRET'

  async function seed(): Promise<{ projectId: string; ids: string[] }> {
    const p = await v.api.projects.create({ title: 'Магазин' })
    const server = await api().create({
      kind: 'server',
      projectId: p.id,
      label: 'Прод VPS',
      host: 'vps.hetzner.example',
      login: 'root',
      secret: PASSWORD,
      privateKey: KEY,
      passphrase: 'phrase-SECRET'
    })
    const other = await api().create({
      kind: 'other',
      projectId: p.id,
      label: 'Різне',
      pairs: [
        { name: 'Регіон', value: 'eu-central' },
        { name: 'Токен', value: PAIR, secret: true }
      ]
    })
    return { projectId: p.id, ids: [server.id, other.id] }
  }

  it('list returns which secrets are stored, never their values', async () => {
    const { projectId, ids } = await seed()
    const list = await api().list({ projectId })
    const text = JSON.stringify(list)
    for (const s of [PASSWORD, KEY, PAIR, 'phrase-SECRET']) expect(text).not.toContain(s)
    const server = list.find((c) => c.id === ids[0])!
    expect(server.secretsSet.sort()).toEqual(['passphrase', 'privateKey'])
    const other = list.find((c) => c.id === ids[1])!
    expect(other.fields.pairs).toEqual([
      { name: 'Регіон', value: 'eu-central', secret: false, hasValue: true },
      { name: 'Токен', value: '', secret: true, hasValue: true }
    ])
    expect(await api().reveal({ id: ids[0], field: 'privateKey' })).toBe(KEY)
    expect(await api().reveal({ id: ids[1], field: { pair: 'Токен' } })).toBe(PAIR)
  })

  it('a secret left empty in the form keeps the stored one; an empty extra secret removes it', async () => {
    const { ids } = await seed()
    await api().update({
      id: ids[1],
      patch: {
        kind: 'other',
        pairs: [
          { name: 'Регіон', value: 'eu-west' },
          { name: 'Токен', value: '', secret: true }
        ]
      }
    })
    expect(await api().reveal({ id: ids[1], field: { pair: 'Токен' } })).toBe(PAIR)
    const s = await api().update({ id: ids[0], patch: { kind: 'server', passphrase: '' } })
    expect(s.secretsSet).toEqual(['privateKey'])
    expect(await api().reveal(ids[0])).toBe(PASSWORD)
  })

  it('the JSON export has the host but no secret', async () => {
    await seed()
    const exporter = new ExportService(
      v.db,
      { filesDir: join(v.dir, 'files') } as AppPaths,
      v.registry,
      v.tags,
      v.links
    )
    const text = JSON.stringify(exporter.json())
    expect(text).toContain('vps.hetzner.example')
    for (const s of [PASSWORD, KEY, PAIR, 'phrase-SECRET']) expect(text).not.toContain(s)
  })

  it('search finds the project by the host, never by a secret; the AI reads neither', async () => {
    const { projectId } = await seed()
    expect(v.search.query({ text: 'hetzner' }).map((h) => h.id)).toContain(projectId)
    expect(v.search.query({ text: 'SECRETKEY' })).toEqual([])
    const doc = v.registry
      .get('project')
      .searchDoc(v.registry.findRow({ type: 'project', id: projectId })!)
    for (const s of [PASSWORD, KEY, PAIR]) expect(doc.body).not.toContain(s)
    // The record's own text (what the chat ШІ and tags get) has no credential host at all: search-only.
    expect(doc.body.toLowerCase()).not.toContain('hetzner')
    expect(doc.indexOnly?.toLowerCase()).toContain('hetzner')
  })
})

describe('clipboard', () => {
  it('a copied secret is cleared after 30 s only if the clipboard still holds it', async () => {
    vi.useFakeTimers()
    let text = ''
    let cleared = 0
    const fake = {
      writeText: async (t: string) => void (text = t),
      readText: async () => text,
      clear: () => void ((text = ''), cleared++)
    }
    const creds = new Credentials(v.m, new SecretClipboard(fake)).api()
    const p = await v.api.projects.create({ title: 'Сайт' })
    const c = await creds.create({ kind: 'account', projectId: p.id, label: 'A', secret: 'pw1' })
    await creds.copy({ id: c.id, field: 'secret' })
    expect(text).toBe('pw1')
    await vi.advanceTimersByTimeAsync(30_000)
    expect(text).toBe('')
    await creds.copy({ id: c.id, field: 'secret' })
    text = 'something the person copied since'
    await vi.advanceTimersByTimeAsync(30_000)
    expect(text).toBe('something the person copied since')
    expect(cleared).toBe(1)
  })
})

describe('terms in the calendar', () => {
  it('an API key reminds 14 and 3 days before and on the day; an owner in the trash hides it', async () => {
    const p = await v.api.projects.create({ title: 'Сайт' })
    const term = new Date(2027, 2, 20, 12).getTime()
    await api().create({
      kind: 'apiKey',
      projectId: p.id,
      label: 'Stripe',
      secret: 'sk_x',
      expiresAt: term
    })
    const feed = v.crm
      .calendarFeed(addDays(term, -30), addDays(term, 1))
      .filter((i) => i.source === 'credential')
    expect(feed.map((i) => dayKey(i.startAt))).toEqual(['2027-03-06', '2027-03-17', '2027-03-20'])
    expect(feed[0].title).toBe('Через 14 днів спливає ключ «Stripe»')
    expect(feed[0].ref).toEqual({ type: 'project', id: p.id })
    await v.api.projects.remove(p.id)
    expect(
      v.crm
        .calendarFeed(addDays(term, -30), addDays(term, 1))
        .filter((i) => i.source === 'credential')
    ).toEqual([])
  })
})

describe('payment of an access', () => {
  const finance = (): FinanceModule => new FinanceModule(v.m, new FreelanceModule(v.m, v.crm))

  it('links a subscription both ways; unlinking or deleting the access leaves it in Finance', async () => {
    const fin = finance().api()
    const p = await v.api.projects.create({ title: 'Сайт' })
    const c = await api().create({ kind: 'server', projectId: p.id, label: 'VPS', host: '1.2.3.4' })
    const sub = await fin.createSubscription({ title: 'VPS', amount: 12, billingDay: 3 })
    const linked = await api().setPayment({ id: c.id, subscriptionId: sub.id })
    expect(linked.payment).toMatchObject({ id: sub.id, amount: 12, ownExpense: true })
    expect(linked.payment!.nextAt).toBe(nextBillingAt({ ...sub }))
    expect((await fin.subscriptions())[0].credential).toEqual({
      id: c.id,
      label: 'VPS',
      owner: { type: 'project', id: p.id }
    })
    await api().setPayment({ id: c.id, subscriptionId: null })
    expect(await fin.subscriptions()).toHaveLength(1)
    await api().setPayment({ id: c.id, subscriptionId: sub.id })
    await fin.removeSubscription(sub.id)
    expect((await api().list({ projectId: p.id }))[0]).toMatchObject({
      subscriptionId: null,
      payment: null
    })
  })

  it('the next payment date: this month if the day is ahead, else the next one', () => {
    const at = new Date(2026, 10, 25, 9).getTime()
    const base = { period: 'monthly' as const, billingMonth: 0, active: true, startedAt: null }
    expect(dayKey(nextBillingAt({ ...base, billingDay: 28 }, at)!)).toBe('2026-11-28')
    expect(dayKey(nextBillingAt({ ...base, billingDay: 3 }, at)!)).toBe('2026-12-03')
    expect(
      dayKey(nextBillingAt({ ...base, billingDay: 31 }, new Date(2027, 1, 1).getTime())!)
    ).toBe('2027-02-28')
    expect(
      dayKey(nextBillingAt({ ...base, period: 'yearly', billingMonth: 1, billingDay: 10 }, at)!)
    ).toBe('2027-02-10')
    expect(nextBillingAt({ ...base, billingDay: 3, active: false }, at)).toBeNull()
  })
})

describe('a subscription the client pays', () => {
  it('is out of every total, month sum, chart and expense list; stays on the month list', async () => {
    const fin = finance()
    const api2 = fin.api()
    const mine = await api2.createSubscription({ title: 'Claude', amount: 20, billingDay: 5 })
    const theirs = await api2.createSubscription({
      title: 'Сервер клієнта',
      amount: 50,
      billingDay: 5,
      ownExpense: false
    })
    const month = monthKey(Date.now())
    await api2.setSubscriptionPaid({ id: mine.id, month, paid: true })
    await api2.setSubscriptionPaid({ id: theirs.id, month, paid: true })

    const report = await api2.month({ month })
    expect(report.expenses).toEqual({ USD: 20 })
    expect(report.profit.USD).toBe(-20)
    const overview = await api2.overview()
    expect(overview.monthlySubscriptions).toEqual({ USD: 20 })
    expect(overview.months[11].expenses).toEqual({ USD: 20 })
    const [from, to] = [report.from, report.to]
    expect((await api2.expenses({ from, to })).map((e) => e.title)).toEqual(['Claude'])
    // Still on the month list, marked paid.
    const rows = await api2.subscriptionMonth({ month })
    expect(rows.find((r) => r.id === theirs.id)).toMatchObject({ ownExpense: false })
    expect(rows.find((r) => r.id === theirs.id)!.expenseId).not.toBeNull()
    // Deleting it takes its marks along: they never turn into my expenses.
    await api2.removeSubscription(theirs.id)
    expect((await api2.month({ month })).expenses).toEqual({ USD: 20 })
  })

  function finance(): FinanceModule {
    return new FinanceModule(v.m, new FreelanceModule(v.m, v.crm))
  }
})

describe('credentials table', () => {
  it('a new access stores the kind and its non-secret fields as JSON', async () => {
    const p = await v.api.projects.create({ title: 'Сайт' })
    const c = await api().create({
      kind: 'database',
      projectId: p.id,
      label: 'БД',
      engine: 'mysql',
      host: 'db',
      login: 'app',
      secret: 'pw'
    })
    const row = v.db.orm
      .select()
      .from(credentials)
      .all()
      .find((r) => r.id === c.id)!
    expect(row.kind).toBe('database')
    expect(JSON.parse(row.fields)).toMatchObject({ engine: 'mysql', host: 'db', port: null })
    expect(row.secrets).toBe('')
    expect(c.fields).toMatchObject({ engine: 'mysql', host: 'db' })
  })
})

describe('accesses on the client page', () => {
  it('client details hold its own accesses and those of its live projects; one can move between them', async () => {
    const client = await v.api.clients.create({ name: 'Bloom' })
    const p1 = await v.api.projects.create({ title: 'Магазин', clientId: client.id })
    const p2 = await v.api.projects.create({ title: 'Лендінг', clientId: client.id })
    const own = await api().create({ kind: 'account', clientId: client.id, label: 'Пошта клієнта' })
    const ofProject = await api().create({
      kind: 'server',
      projectId: p1.id,
      label: 'VPS магазину',
      host: '1.2.3.4'
    })
    await api().create({ kind: 'account', projectId: p2.id, label: 'Адмінка лендінгу' })
    await v.api.projects.remove(p2.id)

    const details = (await v.api.clients.details(client.id))!
    expect(details.credentials.map((c) => c.label).sort()).toEqual(
      ['VPS магазину', 'Пошта клієнта'].sort()
    )
    // Stored once: the project page shows the very same record.
    expect((await v.api.projects.details(p1.id))!.credentials.map((c) => c.id)).toEqual([
      ofProject.id
    ])

    // «Для»: to the whole client and back; never to nobody.
    const moved = await api().update({
      id: ofProject.id,
      patch: { kind: 'server', clientId: client.id, projectId: null }
    })
    expect(moved).toMatchObject({ clientId: client.id, projectId: null })
    await expect(
      api().update({ id: own.id, patch: { kind: 'account', clientId: null } })
    ).rejects.toThrow(/належати/)
  })
})

describe('search after the update', () => {
  it('owners of accesses from before the kinds are re-indexed with their names and hosts', async () => {
    const p = await v.api.projects.create({ title: 'Сайт' })
    v.db.sqlite
      .prepare(
        `INSERT INTO credentials (id, project_id, label, url, login, secret, notes, created_at, updated_at)
         VALUES ('old2', ?, 'Cloudflare', 'https://dash.cloudflare.com', 'anna', ?, '', 1, 1)`
      )
      .run(p.id, v.m.secrets.encrypt('s3cret'))
    expect(v.search.query({ text: 'cloudflare' })).toEqual([])
    v.crm.reindexCredentialOwners()
    expect(v.search.query({ text: 'cloudflare' }).map((h) => h.id)).toEqual([p.id])
    expect(v.search.query({ text: 's3cret' })).toEqual([])
  })
})
