/**
 * Credentials by kind (план.md §16): a server, a database, an API key… each with its own fields. One table: the
 * columns of the first version (label, url, login, secret, notes) keep their meaning for every kind, the kind's
 * other non-secret fields live in `fields` (JSON), the extra secrets in `secrets` (encrypted JSON). Which key goes
 * where is read from the kind's schema below — the single source for main and the forms.
 */
import { z } from 'zod'
import { MAX } from './limits'
import { idSchema, timestampSchema, urlSchema, patchOf } from './common'
import { isLikelyOtpSecret, OTP_ERROR } from '../totp'
import { hostOf } from '../url'

export const CREDENTIAL_KINDS = [
  'account',
  'server',
  'database',
  'ftp',
  'apiKey',
  'hosting',
  'mail',
  'other'
] as const
export type CredentialKind = (typeof CREDENTIAL_KINDS)[number]

export const CREDENTIAL_KIND_LABEL: Record<CredentialKind, string> = {
  account: 'Обліковий запис',
  server: 'Сервер',
  database: 'База даних',
  ftp: 'FTP / SFTP',
  apiKey: 'API-ключ',
  hosting: 'Хостинг / домен',
  mail: 'Пошта',
  other: 'Інше'
}

/** What the kind is for, under its name in the «+ Доступ» picker. */
export const CREDENTIAL_KIND_HINT: Record<CredentialKind, string> = {
  account: 'Сайт, адмінка, сервіс',
  server: 'SSH, VPS',
  database: 'PostgreSQL, MySQL, MongoDB…',
  ftp: 'Файли на сервері',
  apiKey: 'Токен сервісу',
  hosting: 'Панель і домен',
  mail: 'SMTP / IMAP',
  other: 'Свої поля'
}

export const DB_ENGINES = ['postgresql', 'mysql', 'mariadb', 'mongodb', 'redis', 'mssql'] as const
export type DbEngine = (typeof DB_ENGINES)[number]
export const DB_ENGINE_LABEL: Record<DbEngine, string> = {
  postgresql: 'PostgreSQL',
  mysql: 'MySQL',
  mariadb: 'MariaDB',
  mongodb: 'MongoDB',
  redis: 'Redis',
  mssql: 'SQL Server'
}
export const DB_DEFAULT_PORT: Record<DbEngine, number> = {
  postgresql: 5432,
  mysql: 3306,
  mariadb: 3306,
  mongodb: 27017,
  redis: 6379,
  mssql: 1433
}

export const FTP_PROTOCOLS = ['sftp', 'ftps', 'ftp'] as const
export type FtpProtocol = (typeof FTP_PROTOCOLS)[number]
export const FTP_DEFAULT_PORT: Record<FtpProtocol, number> = { sftp: 22, ftps: 21, ftp: 21 }

export const MAIL_SECURITY = ['ssl', 'starttls', 'none'] as const
export type MailSecurity = (typeof MAIL_SECURITY)[number]
export const MAIL_SECURITY_LABEL: Record<MailSecurity, string> = {
  ssl: 'SSL/TLS',
  starttls: 'STARTTLS',
  none: 'Без шифрування'
}
export const MAIL_DEFAULT_PORTS: Record<MailSecurity, { smtp: number; imap: number }> = {
  ssl: { smtp: 465, imap: 993 },
  starttls: { smtp: 587, imap: 143 },
  none: { smtp: 25, imap: 143 }
}

export const SSH_DEFAULT_PORT = 22

/** Extra secrets, stored encrypted in `secrets`; never returned by list, exported, logged or sent to the AI. */
export const CREDENTIAL_SECRET_FIELDS = ['totp', 'backupCodes', 'privateKey', 'passphrase'] as const
export type CredentialSecretField = (typeof CREDENTIAL_SECRET_FIELDS)[number]

/** Keys that are table columns, not `fields`. `secret` is the main password / key / token. */
export const CREDENTIAL_COLUMNS = [
  'projectId',
  'clientId',
  'label',
  'url',
  'login',
  'secret',
  'notes'
] as const

export const HOST_ERROR = 'Вкажіть домен або IP — без пробілів і без https://'

/** A domain or IP as a host field takes it: no spaces, no scheme, no path. Empty passes (optional field). */
export const isLikelyHost = (v: string): boolean =>
  !/\s/.test(v) && !v.includes('://') && !v.includes('/')
/** A host name is at most 253 characters (RFC 1035); an IP fits too. */
const hostSchema = z.string().trim().max(253).refine(isLikelyHost, HOST_ERROR)
const requiredHost = z.string().trim().min(1).max(253).refine(isLikelyHost, HOST_ERROR)
const portSchema = z.number().int().min(1).max(65_535)
const optionalPort = portSchema.nullable().default(null)

const owner = {
  projectId: idSchema.nullable().default(null),
  clientId: idSchema.nullable().default(null)
}
const base = {
  ...owner,
  label: z.string().trim().min(1).max(MAX.name),
  notes: z.string().max(MAX.note).default('')
}
const login = z.string().trim().max(MAX.line).default('')
/** Plain text on input only; stored encrypted, never returned by list(). */
const password = z.string().max(MAX.secret).default('')

/** A free «назва — значення» pair of the «Інше» kind; a secret one is stored encrypted, like a password. */
export const credentialPairSchema = z.object({
  name: z.string().trim().min(1).max(MAX.label),
  value: z.string().max(MAX.secret).default(''),
  secret: z.boolean().default(false)
})
export type CredentialPairInput = z.input<typeof credentialPairSchema>

/** Up to 30 pairs, names unique: a secret pair is kept by its name when the form leaves its value empty. */
const pairsSchema = z
  .array(credentialPairSchema)
  .max(30)
  .refine(
    (pairs) => new Set(pairs.map((p) => p.name.trim().toLowerCase())).size === pairs.length,
    'Назви полів мають бути різними'
  )

export const credentialSchemas = {
  account: z.object({
    kind: z.literal('account'),
    ...base,
    url: urlSchema.default(''),
    login,
    secret: password,
    /** base32 key or otpauth:// link (2 048 like a URL): Vault shows the current code, never the key. */
    totp: z.string().trim().max(2048).refine(isLikelyOtpSecret, OTP_ERROR).default(''),
    /** A dozen one-time codes fit easily. */
    backupCodes: z.string().max(MAX.short).default('')
  }),
  server: z.object({
    kind: z.literal('server'),
    ...base,
    host: requiredHost,
    port: optionalPort,
    login,
    secret: password,
    /** A private key in PEM (RSA-4096 ≈ 3 300 characters). */
    privateKey: z.string().max(MAX.secret).default(''),
    passphrase: z.string().max(MAX.line).default(''),
    /** Path to the key file on this computer (for «ssh -i»). */
    keyPath: z.string().trim().max(MAX.line).default(''),
    provider: z.string().trim().max(MAX.label).default(''),
    /** Control panel of the provider. */
    url: urlSchema.default('')
  }),
  database: z.object({
    kind: z.literal('database'),
    ...base,
    engine: z.enum(DB_ENGINES),
    host: requiredHost,
    port: optionalPort,
    database: z.string().trim().max(MAX.label).default(''),
    login,
    secret: password,
    ssl: z.boolean().default(false)
  }),
  ftp: z.object({
    kind: z.literal('ftp'),
    ...base,
    protocol: z.enum(FTP_PROTOCOLS).default('sftp'),
    host: requiredHost,
    port: optionalPort,
    login,
    secret: password,
    path: z.string().trim().max(MAX.line).default('')
  }),
  apiKey: z.object({
    kind: z.literal('apiKey'),
    ...base,
    service: z.string().trim().max(MAX.name).default(''),
    /** The key itself: a key without it is not a key. */
    secret: z.string().min(1).max(MAX.secret),
    scopes: z.string().trim().max(MAX.line).default(''),
    expiresAt: timestampSchema.nullable().default(null),
    /** Console / dashboard of the service. */
    url: urlSchema.default('')
  }),
  hosting: z.object({
    kind: z.literal('hosting'),
    ...base,
    /** Control panel. */
    url: urlSchema.default(''),
    login,
    secret: password,
    domain: hostSchema.default(''),
    renewAt: timestampSchema.nullable().default(null)
  }),
  mail: z.object({
    kind: z.literal('mail'),
    ...base,
    host: requiredHost,
    security: z.enum(MAIL_SECURITY).default('ssl'),
    smtpPort: optionalPort,
    imapPort: optionalPort,
    login,
    secret: password
  }),
  other: z.object({
    kind: z.literal('other'),
    ...base,
    pairs: pairsSchema.default([])
  })
} as const

const s = credentialSchemas
/** Create input: the kind decides the fields. Without a kind (older callers) main reads it as 'account'. */
export const credentialInputSchema = z.discriminatedUnion('kind', [
  s.account,
  s.server,
  s.database,
  s.ftp,
  s.apiKey,
  s.hosting,
  s.mail,
  s.other
])
export type CredentialInput = z.input<typeof credentialInputSchema>
export type CredentialKindInput<K extends CredentialKind> = z.input<(typeof credentialSchemas)[K]>

/**
 * Patch of the kind it names (the kind may change: an old «Обліковий запис» that is really a server). Secret
 * fields: left out — unchanged, '' — removed. Built with patchOf: zod 4 `.partial()` would reset other fields.
 */
export const credentialPatchSchema = z.discriminatedUnion('kind', [
  patchOf(s.account).extend({ kind: z.literal('account') }),
  patchOf(s.server).extend({ kind: z.literal('server') }),
  patchOf(s.database).extend({ kind: z.literal('database') }),
  patchOf(s.ftp).extend({ kind: z.literal('ftp') }),
  patchOf(s.apiKey).extend({ kind: z.literal('apiKey') }),
  patchOf(s.hosting).extend({ kind: z.literal('hosting') }),
  patchOf(s.mail).extend({ kind: z.literal('mail') }),
  patchOf(s.other).extend({ kind: z.literal('other') })
])
export type CredentialPatch = z.input<typeof credentialPatchSchema>

export function isColumnKey(key: string): boolean {
  return (CREDENTIAL_COLUMNS as readonly string[]).includes(key)
}
export function isSecretKey(key: string): key is CredentialSecretField {
  return (CREDENTIAL_SECRET_FIELDS as readonly string[]).includes(key)
}

/** The kind's non-secret extra fields (what goes into the `fields` JSON), read from its schema. */
export function kindFieldKeys(kind: CredentialKind): string[] {
  return Object.keys(credentialSchemas[kind].shape).filter(
    (k) => k !== 'kind' && !isColumnKey(k) && !isSecretKey(k)
  )
}

/** The kind's extra secret fields (2FA, SSH key…), read from its schema. */
export function kindSecretKeys(kind: CredentialKind): CredentialSecretField[] {
  return Object.keys(credentialSchemas[kind].shape).filter(isSecretKey)
}

/** Whether the kind uses a column (url, login, secret): «Інше» has none of them. */
export function kindHas(kind: CredentialKind, key: 'url' | 'login' | 'secret'): boolean {
  return key in credentialSchemas[kind].shape
}

/** A pair as the renderer sees it: the value of a secret one is never sent, only whether it is stored. */
export interface CredentialPair {
  name: string
  value: string
  secret: boolean
  /** Secret pairs: a value is stored. */
  hasValue: boolean
}

/** Non-secret fields of every kind; each credential carries only its kind's ones. */
export interface CredentialFields {
  host?: string
  port?: number | null
  provider?: string
  keyPath?: string
  engine?: DbEngine
  database?: string
  ssl?: boolean
  protocol?: FtpProtocol
  path?: string
  service?: string
  scopes?: string
  expiresAt?: number | null
  domain?: string
  renewAt?: number | null
  security?: MailSecurity
  smtpPort?: number | null
  imapPort?: number | null
  pairs?: CredentialPair[]
}

/** The Finance subscription that pays for the access, as the card shows it. */
export interface CredentialPayment {
  id: string
  title: string
  amount: number
  currency: string
  period: 'monthly' | 'yearly'
  /** false — the client pays it: not in my expenses. */
  ownExpense: boolean
  active: boolean
  /** Next billing day (noon, local); null while the subscription is switched off. */
  nextAt: number | null
}

export interface Credential {
  id: string
  projectId: string | null
  clientId: string | null
  kind: CredentialKind
  label: string
  url: string
  login: string
  /** The main password / key / token is stored. */
  hasSecret: boolean
  notes: string
  fields: CredentialFields
  /** Extra secrets that are stored — names only, never values. */
  secretsSet: CredentialSecretField[]
  subscriptionId: string | null
  payment: CredentialPayment | null
  createdAt: number
  updatedAt: number
}

/** What «Показати» / «Скопіювати» may ask main for: the main secret, an extra one or a secret pair. */
export const credentialSecretRefSchema = z.object({
  id: idSchema,
  field: z.union([
    z.literal('secret'),
    z.enum(CREDENTIAL_SECRET_FIELDS),
    z.object({ pair: z.string().trim().min(1).max(MAX.label) })
  ])
})
export type CredentialSecretRef = z.input<typeof credentialSecretRefSchema>

/** What main copies to the clipboard itself (cleared after 30 s): a secret or the DB string with the password. */
export const credentialCopySchema = z.union([
  credentialSecretRefSchema,
  z.object({ id: idSchema, field: z.literal('connectionWithPassword') })
])
export type CredentialCopy = z.input<typeof credentialCopySchema>

/** Seconds the clipboard keeps a copied secret before main clears it (if it still holds that value). */
export const CLIPBOARD_CLEAR_SECONDS = 30

/* ───────────── Derived lines (card, quick actions) ───────────── */

const urlHost = (url: string): string => hostOf(url) ?? ''

/** IPv6 goes in brackets inside a URL or `user@host`. */
const hostPart = (host: string): string =>
  host.includes(':') && !host.startsWith('[') ? `[${host}]` : host

type Line = Pick<Credential, 'kind' | 'url' | 'login' | 'fields'>

export function serverPort(f: CredentialFields): number {
  return f.port ?? SSH_DEFAULT_PORT
}

/** `ssh -p 22 user@host`, with `-i "<path>"` when a key file is set. */
export function sshCommand(c: Pick<Credential, 'login' | 'fields'>): string {
  const f = c.fields
  const target = `${c.login ? `${c.login}@` : ''}${hostPart(f.host ?? '')}`
  const key = f.keyPath ? ` -i ${/\s/.test(f.keyPath) ? `"${f.keyPath}"` : f.keyPath}` : ''
  return `ssh -p ${serverPort(f)}${key} ${target}`
}

/**
 * The database URL: `postgres://user@host:5432/db`; with `password` (only main passes it, for «з паролем») — after
 * the user. SQL Server takes the JDBC-like `sqlserver://host:port;database=…` that its drivers read.
 */
export function connectionString(
  c: Pick<Credential, 'login' | 'fields'>,
  password?: string
): string {
  const f = c.fields
  const engine = f.engine ?? 'postgresql'
  const port = f.port ?? DB_DEFAULT_PORT[engine]
  const host = hostPart(f.host ?? '')
  const db = f.database ?? ''
  if (engine === 'mssql') {
    const parts = [`sqlserver://${host}:${port}`]
    if (db) parts.push(`database=${db}`)
    if (c.login) parts.push(`user=${c.login}`)
    if (password) parts.push(`password={${password.replace(/}/g, '}}')}}`)
    if (f.ssl) parts.push('encrypt=true')
    return parts.join(';')
  }
  const auth = c.login
    ? `${encodeURIComponent(c.login)}${password ? `:${encodeURIComponent(password)}` : ''}@`
    : password
      ? `:${encodeURIComponent(password)}@`
      : ''
  const scheme =
    engine === 'postgresql'
      ? 'postgres'
      : engine === 'mongodb'
        ? 'mongodb'
        : engine === 'redis'
          ? f.ssl
            ? 'rediss'
            : 'redis'
          : 'mysql'
  const ssl =
    !f.ssl || engine === 'redis'
      ? ''
      : engine === 'postgresql'
        ? '?sslmode=require'
        : engine === 'mongodb'
          ? '?tls=true'
          : '?ssl-mode=REQUIRED'
  return `${scheme}://${auth}${host}:${port}${db ? `/${encodeURIComponent(db)}` : ''}${ssl}`
}

/** `sftp://user@host:22/path` */
export function ftpAddress(c: Pick<Credential, 'login' | 'fields'>): string {
  const f = c.fields
  const protocol = f.protocol ?? 'sftp'
  const port = f.port ?? FTP_DEFAULT_PORT[protocol]
  const path = f.path ? (f.path.startsWith('/') ? f.path : `/${f.path}`) : ''
  return `${protocol}://${c.login ? `${c.login}@` : ''}${hostPart(f.host ?? '')}:${port}${path}`
}

/** The card's main line: who and where, at a glance (`user@1.2.3.4:22`, `admin@site.com`, `postgres://…/db`). */
export function credentialMainLine(c: Line): string {
  const f = c.fields
  switch (c.kind) {
    case 'account':
      return c.login || urlHost(c.url)
    case 'server':
      return `${c.login ? `${c.login}@` : ''}${hostPart(f.host ?? '')}:${serverPort(f)}`
    case 'database':
      return connectionString(c)
    case 'ftp':
      return ftpAddress(c)
    case 'apiKey':
      return f.service || urlHost(c.url)
    case 'hosting':
      return f.domain || urlHost(c.url)
    case 'mail':
      return [c.login, f.host].filter(Boolean).join(' · ')
    case 'other': {
      const first = f.pairs?.find((p) => !p.secret && p.value)
      return first ? `${first.name}: ${first.value}` : ''
    }
  }
}

/** Words Ctrl+K finds the access by (via its client or project): name, host, service, domain — never a secret. */
export function credentialSearchText(c: Line & Pick<Credential, 'label'>): string {
  const f = c.fields
  return [c.label, f.host, f.service, f.domain, f.provider, urlHost(c.url)]
    .filter(Boolean)
    .join(' ')
}
