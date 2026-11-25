import { asc, eq, inArray, or } from 'drizzle-orm'
import { z } from 'zod'
import type { CredentialsApi } from '@shared/api'
import type { EntityType } from '@shared/entity-types'
import { FEED_COLOR, type CalendarItem } from '@shared/domain/calendar'
import {
  CLIPBOARD_CLEAR_SECONDS,
  CREDENTIAL_KINDS,
  connectionString,
  credentialCopySchema,
  credentialInputSchema,
  credentialPatchSchema,
  credentialSearchText,
  credentialSecretRefSchema,
  isColumnKey,
  kindFieldKeys,
  kindSecretKeys,
  type Credential,
  type CredentialFields,
  type CredentialKind,
  type CredentialPair,
  type CredentialPayment,
  type CredentialSecretField
} from '@shared/domain/credentials'
import { nextBillingAt, type SubscriptionPeriod } from '@shared/domain/finance'
import { parseOtpSecret } from '@shared/totp'
import { clients, credentials, projects, subscriptions } from '../../db/schema'
import type { Orm } from '../../db/client'
import { addDays, newId, now, NotFoundError, UserError } from '../../core/util'
import { totp } from '../../core/totp'
import type { SecretClipboard } from '../../services/secret-clipboard'
import { idArg, type ModuleContext } from '../context'
import type { CredentialRow } from './shared'

/** Decrypted extra secrets of one credential: 2FA, SSH key… and the values of the secret «Інше» pairs by name. */
type StoredSecrets = Partial<Record<CredentialSecretField, string>> & {
  pairs?: Record<string, string>
}

/** `fields` JSON as stored: the kind's non-secret fields + `$secrets` — names of the stored extra secrets. */
type StoredFields = Record<string, unknown> & { $secrets?: string[] }

const isKind = (k: string): k is CredentialKind =>
  (CREDENTIAL_KINDS as readonly string[]).includes(k)

function readJson(text: string): StoredFields {
  try {
    const v: unknown = JSON.parse(text || '{}')
    return v && typeof v === 'object' && !Array.isArray(v) ? (v as StoredFields) : {}
  } catch {
    return {}
  }
}

function readPairs(raw: unknown): CredentialPair[] {
  if (!Array.isArray(raw)) return []
  return raw
    .filter((p): p is Record<string, unknown> => !!p && typeof p === 'object')
    .map((p) => ({
      name: String(p.name ?? ''),
      value: p.secret ? '' : String(p.value ?? ''),
      secret: !!p.secret,
      hasValue: !!p.hasValue
    }))
}

/** Older callers (scripts, an old renderer) send no kind: the first version only had accounts. */
const withKind = (v: unknown, kind: string): unknown =>
  v && typeof v === 'object' && !('kind' in v) ? { ...v, kind } : v

/** Days before a term (API key «діє до», domain «продовжити до») the calendar reminds; 0 — the day itself. */
const TERM_REMINDERS = [14, 3, 0] as const

/**
 * Logins of a client or project, by kind. The main secret (`secret`) and the extra ones (`secrets`) are encrypted
 * (SecretBox); list / details return only which ones are stored. A secret leaves main only through «Показати»
 * (reveal); «Скопіювати» puts it on the clipboard right here and clears it after 30 s; the 2FA key never leaves —
 * only its current code does.
 */
export class Credentials {
  constructor(
    private readonly m: ModuleContext,
    private readonly clipboard?: SecretClipboard
  ) {}

  private get db(): Orm {
    return this.m.db.orm
  }

  private payments(ids: string[]): Map<string, CredentialPayment> {
    const out = new Map<string, CredentialPayment>()
    if (!ids.length) return out
    for (const s of this.db
      .select()
      .from(subscriptions)
      .where(inArray(subscriptions.id, ids))
      .all()) {
      out.set(s.id, {
        id: s.id,
        title: s.title,
        amount: s.amount,
        currency: s.currency,
        period: s.period as SubscriptionPeriod,
        ownExpense: s.ownExpense,
        active: s.active,
        nextAt: nextBillingAt({ ...s, period: s.period as SubscriptionPeriod })
      })
    }
    return out
  }

  private toCredential(r: CredentialRow, payments?: Map<string, CredentialPayment>): Credential {
    const kind = isKind(r.kind) ? r.kind : 'account'
    const raw = readJson(r.fields)
    const fields: CredentialFields = {}
    for (const key of kindFieldKeys(kind)) {
      if (key === 'pairs') fields.pairs = readPairs(raw.pairs)
      else if (key in raw) (fields as Record<string, unknown>)[key] = raw[key]
    }
    const own = kindSecretKeys(kind)
    const pay = payments ?? this.payments(r.subscriptionId ? [r.subscriptionId] : [])
    return {
      id: r.id,
      projectId: r.projectId,
      clientId: r.clientId,
      kind,
      label: r.label,
      url: r.url,
      login: r.login,
      hasSecret: !!r.secret,
      notes: r.notes,
      fields,
      secretsSet: (raw.$secrets ?? []).filter((k): k is CredentialSecretField =>
        (own as string[]).includes(k)
      ),
      subscriptionId: r.subscriptionId,
      payment: (r.subscriptionId && pay.get(r.subscriptionId)) || null,
      createdAt: r.createdAt,
      updatedAt: r.updatedAt
    }
  }

  private rowsOf(where: { projectIds?: string[]; clientId?: string }): CredentialRow[] {
    const conds = [
      where.projectIds?.length ? inArray(credentials.projectId, where.projectIds) : undefined,
      where.clientId ? eq(credentials.clientId, where.clientId) : undefined
    ].filter(Boolean)
    if (!conds.length) return []
    return this.db
      .select()
      .from(credentials)
      .where(or(...conds))
      .orderBy(asc(credentials.label))
      .all()
  }

  forOwner(where: { projectIds?: string[]; clientId?: string }): Credential[] {
    const rows = this.rowsOf(where)
    const pay = this.payments([...new Set(rows.flatMap((r) => r.subscriptionId ?? []))])
    return rows.map((r) => this.toCredential(r, pay))
  }

  /**
   * What the global search knows of a client's or project's accesses (their record's searchDoc): names, hosts,
   * services, domains — never a secret. The AI reads the same text, so it never sees one either.
   */
  searchText(where: { projectId?: string; clientId?: string }): string {
    const rows = this.rowsOf({
      projectIds: where.projectId ? [where.projectId] : undefined,
      clientId: where.clientId
    })
    return rows.map((r) => credentialSearchText(this.toCredential(r, new Map()))).join('\n')
  }

  /** The owner's search entry follows its accesses (the descriptor's searchDoc reads searchText). */
  private reindexOwner(r: Pick<CredentialRow, 'projectId' | 'clientId'>): void {
    const refs: { type: EntityType; id: string }[] = []
    if (r.projectId) refs.push({ type: 'project', id: r.projectId })
    if (r.clientId) refs.push({ type: 'client', id: r.clientId })
    for (const ref of refs) {
      const row = this.m.registry.findRow(ref)
      if (row) this.m.repo.search.indexRow(ref.type, row)
    }
  }

  private secretsOf(r: CredentialRow): StoredSecrets {
    if (!r.secrets) return {}
    const v = readJson(this.m.secrets.decrypt(r.secrets))
    return v as StoredSecrets
  }

  /**
   * Splits a parsed input / patch of `kind` into columns, `fields` and `secrets`, on top of what is stored (`row`).
   * Extra secrets: undefined — unchanged, '' — removed. A secret «Інше» pair with an empty value keeps the stored
   * one of that name.
   */
  private write(
    kind: CredentialKind,
    data: Record<string, unknown>,
    row?: CredentialRow
  ): Partial<typeof credentials.$inferInsert> {
    const values: Record<string, unknown> = { kind }
    const fields: StoredFields = row ? readJson(row.fields) : {}
    const secretKeys = kindSecretKeys(kind)
    const pairsChange = kind === 'other' && Array.isArray(data.pairs)
    const touchesSecrets = pairsChange || secretKeys.some((k) => data[k] !== undefined)
    const stored: StoredSecrets = row && touchesSecrets ? this.secretsOf(row) : {}
    for (const [key, value] of Object.entries(data)) {
      if (value === undefined || key === 'kind' || key === 'pairs') continue
      if (key === 'secret') values.secret = this.m.secrets.encrypt(String(value))
      else if (isColumnKey(key)) values[key] = value
      else if ((secretKeys as string[]).includes(key)) {
        if (value) stored[key as CredentialSecretField] = String(value)
        else delete stored[key as CredentialSecretField]
      } else fields[key] = value
    }
    if (pairsChange) {
      const old = stored.pairs ?? {}
      const next: Record<string, string> = {}
      fields.pairs = (data.pairs as { name: string; value: string; secret: boolean }[]).map((p) => {
        const name = p.name.trim()
        if (!p.secret) return { name, value: p.value, secret: false, hasValue: !!p.value }
        const value = p.value || old[name] || ''
        if (value) next[name] = value
        return { name, value: '', secret: true, hasValue: !!value }
      })
      stored.pairs = next
    }
    if (touchesSecrets) {
      const set = Object.keys(stored).filter(
        (k) => k !== 'pairs' && stored[k as CredentialSecretField]
      )
      fields.$secrets = set
      const empty = !set.length && !Object.keys(stored.pairs ?? {}).length
      values.secrets = empty ? '' : this.m.secrets.encrypt(JSON.stringify(stored))
    }
    values.fields = JSON.stringify(fields)
    return values
  }

  private find(id: string): CredentialRow {
    const row = this.db.select().from(credentials).where(eq(credentials.id, id)).get()
    if (!row) throw new NotFoundError('Доступ', id)
    return row
  }

  /** One decrypted secret of a credential; '' when it isn't stored. */
  private secretValue(row: CredentialRow, field: CredentialCopyField): string {
    if (field === 'secret') return this.m.secrets.decrypt(row.secret)
    if (typeof field === 'object') return this.secretsOf(row).pairs?.[field.pair.trim()] ?? ''
    return this.secretsOf(row)[field] ?? ''
  }

  /**
   * Calendar: an API key's «діє до» and a domain's «продовжити до» — 14 and 3 days before and on the day. Accesses
   * of a client or project in the trash stay off the calendar.
   */
  calendarFeed(from: number, to: number): CalendarItem[] {
    const rows = this.db
      .select({
        c: credentials,
        projectDeleted: projects.deletedAt,
        clientDeleted: clients.deletedAt
      })
      .from(credentials)
      .leftJoin(projects, eq(projects.id, credentials.projectId))
      .leftJoin(clients, eq(clients.id, credentials.clientId))
      .where(inArray(credentials.kind, ['apiKey', 'hosting']))
      .all()
    const items: CalendarItem[] = []
    for (const { c, projectDeleted, clientDeleted } of rows) {
      if ((c.projectId && projectDeleted) || (c.clientId && clientDeleted)) continue
      const cred = this.toCredential(c, new Map())
      const term = cred.kind === 'apiKey' ? cred.fields.expiresAt : cred.fields.renewAt
      if (!term) continue
      const owner: { type: EntityType; id: string } = c.projectId
        ? { type: 'project', id: c.projectId }
        : { type: 'client', id: c.clientId! }
      const what =
        cred.kind === 'apiKey'
          ? `спливає ключ «${cred.label}»`
          : `продовжити ${cred.fields.domain ? `домен ${cred.fields.domain}` : `«${cred.label}»`}`
      for (const days of TERM_REMINDERS) {
        const at = addDays(term, -days)
        if (at < from || at > to) continue
        const when = days === 0 ? 'Сьогодні' : `Через ${days} ${days === 3 ? 'дні' : 'днів'}`
        items.push({
          key: `credential:${c.id}:${days}`,
          source: 'credential',
          ref: owner,
          title: `${when} ${cred.kind === 'apiKey' ? what : `— ${what}`}`,
          startAt: at,
          endAt: null,
          allDay: true,
          color: FEED_COLOR.credential,
          done: false
        })
      }
    }
    return items
  }

  api(): CredentialsApi {
    return {
      list: async (args) => {
        const { projectId, clientId } = z
          .object({ projectId: idArg.optional(), clientId: idArg.optional() })
          .parse(args ?? {})
        return this.forOwner({ projectIds: projectId ? [projectId] : undefined, clientId })
      },
      create: async (input) => {
        const data = credentialInputSchema.parse(withKind(input, 'account'))
        if (!data.projectId && !data.clientId)
          throw new UserError('Доступ має належати клієнту або проєкту')
        const ts = now()
        const row = this.db
          .insert(credentials)
          .values({
            label: data.label,
            ...this.write(data.kind, data as Record<string, unknown>),
            id: newId(),
            createdAt: ts,
            updatedAt: ts
          })
          .returning()
          .get()
        this.reindexOwner(row)
        return this.toCredential(row)
      },
      update: async (args) => {
        const raw = z.object({ id: idArg, patch: z.unknown() }).parse(args)
        const current = this.find(raw.id)
        const patch = credentialPatchSchema.parse(withKind(raw.patch, current.kind))
        // «Для»: an access moves between the client and its projects, but always belongs to someone.
        const projectId = patch.projectId !== undefined ? patch.projectId : current.projectId
        const clientId = patch.clientId !== undefined ? patch.clientId : current.clientId
        if (!projectId && !clientId) throw new UserError('Доступ має належати клієнту або проєкту')
        const row = this.db
          .update(credentials)
          .set({
            ...this.write(patch.kind, patch as Record<string, unknown>, current),
            updatedAt: now()
          })
          .where(eq(credentials.id, raw.id))
          .returning()
          .get()
        this.reindexOwner(current)
        if (row!.projectId !== current.projectId || row!.clientId !== current.clientId)
          this.reindexOwner(row!)
        return this.toCredential(row!)
      },
      remove: async (id) => {
        const row = this.db
          .select()
          .from(credentials)
          .where(eq(credentials.id, idArg.parse(id)))
          .get()
        if (!row) return
        this.db.delete(credentials).where(eq(credentials.id, row.id)).run()
        this.reindexOwner(row)
      },
      reveal: async (arg) => {
        const ref = credentialSecretRefSchema.parse(
          typeof arg === 'string' ? { id: arg, field: 'secret' } : arg
        )
        return this.secretValue(this.find(ref.id), ref.field)
      },
      copy: async (arg) => {
        const ref = credentialCopySchema.parse(arg)
        const row = this.find(ref.id)
        const value =
          ref.field === 'connectionWithPassword'
            ? connectionString(
                this.toCredential(row, new Map()),
                this.m.secrets.decrypt(row.secret)
              )
            : this.secretValue(row, ref.field)
        if (!value) throw new UserError('Цей секрет не збережено — копіювати нічого')
        if (!this.clipboard) throw new UserError('Буфер обміну зараз недоступний')
        await this.clipboard.copy(value, CLIPBOARD_CLEAR_SECONDS)
      },
      totp: async (id) => {
        const row = this.find(idArg.parse(id))
        const params = parseOtpSecret(this.secretsOf(row).totp ?? '')
        if (!params) throw new UserError('Для цього доступу 2FA не налаштовано')
        return totp(params)
      },
      setPayment: async (args) => {
        const { id, subscriptionId } = z
          .object({ id: idArg, subscriptionId: idArg.nullable() })
          .parse(args)
        this.find(id)
        if (subscriptionId) {
          const sub = this.db
            .select({ id: subscriptions.id })
            .from(subscriptions)
            .where(eq(subscriptions.id, subscriptionId))
            .get()
          if (!sub) throw new NotFoundError('Підписка', subscriptionId)
        }
        // Only the link changes: the subscription itself stays in Finance either way.
        const row = this.db
          .update(credentials)
          .set({ subscriptionId, updatedAt: now() })
          .where(eq(credentials.id, id))
          .returning()
          .get()
        return this.toCredential(row!)
      }
    }
  }
}

type CredentialCopyField = 'secret' | CredentialSecretField | { pair: string }
