import { useId, useState, type ReactElement } from 'react'
import { Lock, LockOpen, Plus, Trash2 } from 'lucide-react'
import {
  CREDENTIAL_KIND_HINT,
  CREDENTIAL_KIND_LABEL,
  CREDENTIAL_KINDS,
  credentialPairSchema,
  credentialSchemas,
  HOST_ERROR,
  isLikelyHost,
  isSecretKey,
  type Credential,
  type CredentialInput,
  type CredentialKind,
  type CredentialPatch
} from '@shared/domain/credentials'
import { isLikelyOtpSecret, OTP_ERROR } from '@shared/totp'
import { useApiMutation } from '@/lib/query'
import { isLikelyUrl, limitsOf, rangesOf, requiredOf, URL_ERROR } from '@/lib/limits'
import { normalizeUrl } from '@/lib/open-url'
import { cn } from '@/lib/utils'
import { Field, Segmented } from '@/components/common/page'
import { Choice } from '@/components/common/choice'
import { DatePicker } from '@/components/common/date-picker'
import { NumberField } from '@/components/common/number-field'
import { IconAction } from '@/components/common/icon-action'
import { SubmitButton } from '@/components/common/submit-button'
import { useFormGate } from '@/hooks/use-form-gate'
import { FormAttemptContext } from '@/components/ui/field-control'
import { NO_CHANGES } from '@/lib/edit-session'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { escapeCloses } from './inline-form'
import {
  KIND_FORM,
  KIND_ICON,
  KIND_START,
  type FormField,
  type FormValues
} from './credential-kinds'

export type CredentialOwner = { projectId: string } | { clientId: string }

/**
 * The client page: an access belongs to the whole client or to one of its projects («Для»). Each is stored once,
 * with its owner, and can move between them.
 */
export interface OwnerChoice {
  clientId: string
  projects: { id: string; title: string }[]
}

const WHOLE_CLIENT = 'client'

const PAIR_L = limitsOf(credentialPairSchema)
const NOTES_MAX = limitsOf(credentialSchemas.account).notes

/** An editable «Інше» pair; `hasValue` — a secret one already stored (left empty, it stays). */
interface PairRow {
  key: number
  name: string
  value: string
  secret: boolean
  hasValue: boolean
}

/** The kind's chips: picking one shows its fields; on an existing access it changes the kind. */
function KindPicker({
  value,
  onChange
}: {
  value: CredentialKind | null
  onChange: (kind: CredentialKind) => void
}): ReactElement {
  return (
    <ToggleGroup
      type="single"
      variant="chip-neutral"
      size="sm"
      value={value ?? ''}
      onValueChange={(v) => v && onChange(v as CredentialKind)}
      aria-label="Тип доступу"
      className="flex-wrap justify-start"
    >
      {CREDENTIAL_KINDS.map((k) => {
        const Icon = KIND_ICON[k]
        return (
          <Tooltip key={k}>
            <TooltipTrigger asChild>
              <ToggleGroupItem value={k} data-kind={k}>
                <Icon />
                {CREDENTIAL_KIND_LABEL[k]}
              </ToggleGroupItem>
            </TooltipTrigger>
            <TooltipContent>{CREDENTIAL_KIND_HINT[k]}</TooltipContent>
          </Tooltip>
        )
      })}
    </ToggleGroup>
  )
}

function startValues(initial?: Credential): FormValues {
  if (!initial) return { ...KIND_START, label: '', url: '', login: '', notes: '' }
  // Pairs have their own state (rows with keys).
  const fields: FormValues = { ...initial.fields }
  delete fields.pairs
  return {
    ...KIND_START,
    ...fields,
    label: initial.label,
    url: initial.url,
    login: initial.login,
    notes: initial.notes
  }
}

let pairKey = 0
const startPairs = (initial?: Credential): PairRow[] =>
  (initial?.fields.pairs ?? []).map((p) => ({ ...p, key: ++pairKey }))

/**
 * What the form sends for `kind`: the schema's keys only (a kind switched from another keeps no foreign field). A
 * secret goes only when typed; '' when «Видалити» was pressed; left out otherwise (the stored one stays).
 */
function buildPayload(
  kind: CredentialKind,
  values: FormValues,
  secrets: Record<string, string>,
  cleared: ReadonlySet<string>,
  pairs: PairRow[]
): Record<string, unknown> {
  const out: Record<string, unknown> = { kind }
  for (const key of Object.keys(credentialSchemas[kind].shape)) {
    if (key === 'kind' || key === 'projectId' || key === 'clientId') continue
    if (key === 'secret' || isSecretKey(key)) {
      if (secrets[key]) out[key] = secrets[key]
      else if (cleared.has(key)) out[key] = ''
    } else if (key === 'pairs') {
      out.pairs = pairs.map((p) => ({ name: p.name.trim(), value: p.value, secret: p.secret }))
    } else if (key === 'url') {
      const url = String(values.url ?? '').trim()
      out.url = url ? normalizeUrl(url) : ''
    } else if (values[key] !== undefined) {
      out[key] = typeof values[key] === 'string' ? (values[key] as string).trim() : values[key]
    }
  }
  return out
}

/** A secret field: typed in a password box (a key or codes — in a text area), «Видалити» drops the stored one. */
function SecretField({
  field,
  id,
  value,
  stored,
  cleared,
  required,
  max,
  error,
  onChange,
  onClear
}: {
  field: Extract<FormField, { type: 'secret' }>
  id: string
  value: string
  stored: boolean
  cleared: boolean
  required?: boolean
  max?: number
  error?: string
  onChange: (value: string) => void
  onClear: (clear: boolean) => void
}): ReactElement {
  const hint = cleared ? (
    <>
      Буде видалено після збереження.{' '}
      <Button type="button" variant="link" className="text-caption" onClick={() => onClear(false)}>
        Залишити
      </Button>
    </>
  ) : stored ? (
    <>
      Збережено — залиште порожнім, щоб не змінювати.
      {!required && (
        <>
          {' '}
          <Button
            type="button"
            variant="link"
            className="text-caption"
            onClick={() => onClear(true)}
          >
            Видалити
          </Button>
        </>
      )}
    </>
  ) : (
    field.hint
  )
  return (
    <Field
      label={field.label}
      htmlFor={id}
      required={required}
      className={cn(field.wide && 'col-span-2')}
      hint={hint}
      error={error}
    >
      {field.multiline ? (
        <Textarea
          id={id}
          className="min-h-16 font-mono"
          spellCheck={false}
          maxLength={max}
          value={value}
          aria-invalid={!!error || undefined}
          placeholder={stored ? '••••••••' : undefined}
          onChange={(e) => onChange(e.target.value)}
        />
      ) : (
        <Input
          id={id}
          type="password"
          autoComplete="new-password"
          className="font-mono"
          maxLength={max}
          value={value}
          aria-invalid={!!error || undefined}
          placeholder={stored ? '••••••••' : undefined}
          onChange={(e) => onChange(e.target.value)}
        />
      )}
    </Field>
  )
}

/** «Інше»: free «назва — значення» rows, each can be marked secret (stored encrypted, shown as dots). */
function PairsField({
  id,
  pairs,
  onChange
}: {
  id: string
  pairs: PairRow[]
  onChange: (pairs: PairRow[]) => void
}): ReactElement {
  const names = pairs.map((p) => p.name.trim().toLowerCase()).filter(Boolean)
  const duplicate = new Set(names).size !== names.length
  const set = (key: number, patch: Partial<PairRow>): void =>
    onChange(pairs.map((p) => (p.key === key ? { ...p, ...patch } : p)))
  return (
    <Field
      label="Поля"
      className="col-span-2"
      error={duplicate ? 'Назви полів мають бути різними' : undefined}
      hint={pairs.length ? undefined : 'Додайте пари «назва — значення»: ID акаунта, PIN, регіон…'}
    >
      <div className="flex flex-col gap-2" data-invalid={duplicate || undefined}>
        {pairs.map((p, i) => (
          <div
            key={p.key}
            className="grid grid-cols-[minmax(0,2fr)_minmax(0,3fr)_auto_auto] items-center gap-2"
          >
            <Input
              aria-label={`Назва поля ${i + 1}`}
              value={p.name}
              maxLength={PAIR_L.name}
              required
              placeholder="Назва"
              onChange={(e) => set(p.key, { name: e.target.value })}
            />
            <Input
              id={i === 0 ? id : undefined}
              aria-label={`Значення поля ${i + 1}`}
              type={p.secret ? 'password' : 'text'}
              autoComplete="new-password"
              className="font-mono"
              value={p.value}
              maxLength={PAIR_L.value}
              placeholder={p.secret && p.hasValue ? 'Збережено' : 'Значення'}
              onChange={(e) => set(p.key, { value: e.target.value })}
            />
            <IconAction
              label={p.secret ? 'Зробити звичайним полем' : 'Зробити секретним'}
              aria-pressed={p.secret}
              onClick={() => set(p.key, { secret: !p.secret, hasValue: false })}
            >
              {p.secret ? <Lock /> : <LockOpen />}
            </IconAction>
            <IconAction
              label={`Прибрати поле ${p.name.trim() || i + 1}`}
              className="text-muted-foreground hover:text-destructive"
              onClick={() => onChange(pairs.filter((x) => x.key !== p.key))}
            >
              <Trash2 />
            </IconAction>
          </div>
        ))}
        <Button
          type="button"
          variant="soft"
          size="xs"
          className="w-fit"
          disabled={pairs.length >= 30}
          onClick={() =>
            onChange([
              ...pairs,
              { key: ++pairKey, name: '', value: '', secret: false, hasValue: false }
            ])
          }
        >
          <Plus /> Поле
        </Button>
      </div>
    </Field>
  )
}

/**
 * «+ Доступ» and the row's pencil: the kind first (chips), then that kind's fields. Required ones come from the
 * kind's schema (requiredOf), so «Додати доступ» stays off until the minimum is there (useFormGate).
 */
export function CredentialForm({
  initial,
  owner,
  owners,
  onDone
}: {
  initial?: Credential
  owner: CredentialOwner
  /** On the client page: «Для» — the whole client or one of its projects. */
  owners?: OwnerChoice
  onDone: () => void
}): ReactElement {
  const uid = useId()
  const startTarget = initial?.projectId ?? WHOLE_CLIENT
  const [target, setTarget] = useState(startTarget)
  const [kind, setKind] = useState<CredentialKind | null>(initial?.kind ?? null)
  const [values, setValues] = useState<FormValues>(() => startValues(initial))
  const [secrets, setSecrets] = useState<Record<string, string>>({})
  const [cleared, setCleared] = useState<ReadonlySet<string>>(new Set())
  const [pairs, setPairs] = useState<PairRow[]>(() => startPairs(initial))
  const [baseline] = useState(() =>
    initial
      ? JSON.stringify(
          buildPayload(initial.kind, startValues(initial), {}, new Set(), startPairs(initial))
        )
      : ''
  )
  const create = useApiMutation('credentials', 'create', {
    successMessage: 'Доступ додано',
    onSuccess: onDone
  })
  const update = useApiMutation('credentials', 'update', {
    successMessage: 'Доступ збережено',
    onSuccess: onDone
  })
  const { attach, reason: gateReason, attempted, submit } = useFormGate()
  const pending = create.isPending || update.isPending

  const set = (key: string, value: unknown): void => setValues((v) => ({ ...v, [key]: value }))
  const schema = kind ? credentialSchemas[kind] : null
  const REQ = schema ? requiredOf(schema) : {}
  const L = schema ? limitsOf(schema) : {}
  const R = schema ? rangesOf(schema) : {}
  const payload = kind ? buildPayload(kind, values, secrets, cleared, pairs) : null
  // «Для»: a new access goes to the picked owner; an edited one moves only when the pick changed.
  const ownerPatch: Record<string, string | null> | null = !owners
    ? null
    : initial && target === startTarget
      ? null
      : target === WHOLE_CLIENT
        ? { clientId: owners.clientId, projectId: null }
        : { projectId: target, clientId: null }
  // Editing: «Зберегти» waits for a change (an empty secret keeps the stored one).
  const unchanged = !!initial && !!payload && !ownerPatch && JSON.stringify(payload) === baseline
  // The password column is shared by every kind; the extra secrets belong to the kind they were saved with.
  const stored = (key: string): boolean =>
    key === 'secret'
      ? !!initial?.hasSecret
      : (initial?.secretsSet as string[] | undefined)?.includes(key) === true &&
        initial?.kind === kind

  const fieldError = (f: FormField): string | undefined => {
    const v = String(values[f.key] ?? '')
    if (f.type === 'url') return isLikelyUrl(v) ? undefined : URL_ERROR
    if (f.type === 'host') return isLikelyHost(v.trim()) ? undefined : HOST_ERROR
    if (f.key === 'totp') return isLikelyOtpSecret(secrets.totp ?? '') ? undefined : OTP_ERROR
    return undefined
  }

  const renderField = (f: FormField): ReactElement => {
    const id = `${uid}-${f.key}`
    const required = REQ[f.key as keyof typeof REQ]
    const wide = cn(f.wide && 'col-span-2')
    const error = fieldError(f)
    switch (f.type) {
      case 'secret':
        return (
          <SecretField
            key={f.key}
            field={f}
            id={id}
            value={secrets[f.key] ?? ''}
            stored={stored(f.key)}
            cleared={cleared.has(f.key)}
            // A key that is stored already isn't asked for again.
            required={!!required && !stored(f.key)}
            max={L[f.key as keyof typeof L]}
            error={error}
            onChange={(v) => setSecrets((s) => ({ ...s, [f.key]: v }))}
            onClear={(clear) =>
              setCleared((c) => {
                const next = new Set(c)
                if (clear) next.add(f.key)
                else next.delete(f.key)
                return next
              })
            }
          />
        )
      case 'port':
        return (
          <NumberField
            key={f.key}
            id={id}
            className={wide}
            label={f.label}
            integer
            live
            {...R[f.key as keyof typeof R]}
            placeholder={String(f.defaultPort(values))}
            value={(values[f.key] as number | null) ?? null}
            onCommit={(v) => set(f.key, v)}
          />
        )
      case 'choice':
        return (
          <Field key={f.key} label={f.label} htmlFor={id} required={required} className={wide}>
            {f.segmented ? (
              <Segmented
                className="w-fit"
                value={String(values[f.key] ?? f.options[0].value)}
                onChange={(v) => set(f.key, v)}
                options={f.options}
              />
            ) : (
              <Choice
                id={id}
                value={String(values[f.key] ?? '')}
                onChange={(v) => set(f.key, v)}
                options={f.options}
              />
            )}
          </Field>
        )
      case 'date':
        return (
          <Field key={f.key} label={f.label} htmlFor={id} className={wide}>
            <DatePicker
              id={id}
              value={(values[f.key] as number | null) ?? null}
              onChange={(v) => set(f.key, v)}
            />
          </Field>
        )
      case 'switch':
        return (
          <div key={f.key} className={cn('flex items-center gap-3 self-end pb-2', wide)}>
            <Switch
              id={id}
              checked={values[f.key] === true}
              onCheckedChange={(v) => set(f.key, v)}
            />
            <Label htmlFor={id} className="text-body text-foreground">
              {f.label}
            </Label>
          </div>
        )
      case 'pairs':
        return <PairsField key={f.key} id={id} pairs={pairs} onChange={setPairs} />
      default:
        return (
          <Field
            key={f.key}
            label={f.label}
            htmlFor={id}
            required={required}
            className={wide}
            error={error}
          >
            <Input
              id={id}
              type={f.type === 'url' ? 'url' : 'text'}
              autoFocus={f.key === 'label' && !initial}
              className={cn(
                f.type === 'text' && f.mono && 'font-mono',
                f.type === 'host' && 'font-mono'
              )}
              spellCheck={f.type === 'text' && !f.mono}
              value={String(values[f.key] ?? '')}
              maxLength={L[f.key as keyof typeof L]}
              aria-invalid={!!error || undefined}
              placeholder={'placeholder' in f ? f.placeholder : undefined}
              onChange={(e) => set(f.key, e.target.value)}
            />
          </Field>
        )
    }
  }

  return (
    <Card className="p-4" data-credential-form>
      <form
        ref={attach}
        className="grid grid-cols-2 gap-3"
        onKeyDown={escapeCloses(onDone)}
        onSubmit={(e) =>
          submit(e, () => {
            if (!kind || !payload || pending || unchanged) return
            if (initial)
              update.mutate({
                id: initial.id,
                patch: { ...payload, ...ownerPatch } as CredentialPatch
              })
            else create.mutate({ ...payload, ...(ownerPatch ?? owner) } as CredentialInput)
          })
        }
      >
        <FormAttemptContext.Provider value={attempted}>
          <div className="col-span-2 flex flex-col gap-2">
            <KindPicker value={kind} onChange={setKind} />
            {!kind && (
              <p className="text-caption text-muted-foreground">
                Оберіть, що це за доступ: від типу залежать поля й швидкі дії.
              </p>
            )}
          </div>
          {kind && owners && owners.projects.length > 0 && (
            <Field label="Для" htmlFor={`${uid}-owner`} className="col-span-2">
              <Choice
                id={`${uid}-owner`}
                className="sm:max-w-80"
                value={target}
                onChange={(v) => setTarget(v ?? WHOLE_CLIENT)}
                options={[
                  { value: WHOLE_CLIENT, label: 'Увесь клієнт' },
                  ...owners.projects.map((p) => ({ value: p.id, label: `Проєкт: ${p.title}` }))
                ]}
              />
            </Field>
          )}
          {kind && KIND_FORM[kind].map(renderField)}
          {kind && (
            <Field
              label="Нотатка"
              htmlFor={`${uid}-notes`}
              className="col-span-2"
              count={{ length: String(values.notes ?? '').length, max: NOTES_MAX }}
            >
              <Textarea
                id={`${uid}-notes`}
                className="min-h-12"
                maxLength={NOTES_MAX}
                value={String(values.notes ?? '')}
                onChange={(e) => set('notes', e.target.value)}
              />
            </Field>
          )}
          <div className="col-span-2 flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={onDone}>
              Скасувати
            </Button>
            <SubmitButton
              variant="subtle"
              reason={
                !kind ? 'Оберіть тип доступу' : (gateReason ?? (unchanged ? NO_CHANGES : undefined))
              }
              disabled={!kind}
              pending={pending}
            >
              {initial ? 'Зберегти' : 'Додати доступ'}
            </SubmitButton>
          </div>
        </FormAttemptContext.Provider>
      </form>
    </Card>
  )
}
