import { useId, useState, type ReactNode, type ReactElement } from 'react'
import { Copy, ExternalLink, Eye, EyeOff, KeyRound, Pencil, Plus, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { credentialInputSchema, type Credential, type CredentialInput } from '@shared/domain/crm'
import { api } from '@/lib/api'
import { useApiMutation } from '@/lib/query'
import { isLikelyUrl, limitsOf, URL_ERROR } from '@/lib/limits'
import { hostOf } from '@/lib/format'
import { normalizeUrl, openUrl } from '@/lib/open-url'
import { copyText } from '@/components/common/copy-button'
import { Confirm } from '@/components/common/confirm'
import { IconAction } from '@/components/common/icon-action'
import { Field } from '@/components/common/page'
import { useDetailMode } from '@/components/common/detail-mode-context'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Section } from './parts'
import { escapeCloses, useInlineForm } from './inline-form'

type Owner = { projectId: string } | { clientId: string }

const L = limitsOf(credentialInputSchema)

function CredentialForm({
  initial,
  owner,
  onDone
}: {
  initial?: Credential
  owner: Owner
  onDone: () => void
}): ReactElement {
  const [form, setForm] = useState({
    label: initial?.label ?? '',
    url: initial?.url ?? '',
    login: initial?.login ?? '',
    secret: '',
    notes: initial?.notes ?? ''
  })
  const uid = useId()
  const create = useApiMutation('credentials', 'create', {
    successMessage: 'Доступ додано',
    onSuccess: onDone
  })
  const update = useApiMutation('credentials', 'update', {
    successMessage: 'Доступ оновлено',
    onSuccess: onDone
  })
  const set = (patch: Partial<typeof form>): void => setForm((f) => ({ ...f, ...patch }))
  const urlBad = !isLikelyUrl(form.url)
  const noLabel = !form.label.trim()
  const pending = create.isPending || update.isPending
  return (
    <Card className="p-4">
      <form
        className="grid grid-cols-2 gap-3"
        onKeyDown={escapeCloses(onDone)}
        onSubmit={(e) => {
          e.preventDefault()
          if (noLabel || urlBad || pending) return
          // Saved with a scheme: hostOf() and «Відкрити» need a full URL.
          const values = { ...form, url: form.url.trim() ? normalizeUrl(form.url) : '' }
          if (initial) {
            const { secret, ...rest } = values
            update.mutate({ id: initial.id, patch: secret ? values : rest })
          } else {
            create.mutate({ ...values, ...owner } as CredentialInput)
          }
        }}
      >
        <Field
          label="Назва"
          htmlFor={`${uid}-label`}
          hint={noLabel ? 'Обов’язкове поле' : undefined}
        >
          <Input
            id={`${uid}-label`}
            autoFocus
            value={form.label}
            maxLength={L.label}
            onChange={(e) => set({ label: e.target.value })}
            placeholder="Shopify admin"
          />
        </Field>
        <Field label="Посилання" htmlFor={`${uid}-url`} error={urlBad ? URL_ERROR : undefined}>
          <Input
            id={`${uid}-url`}
            type="url"
            maxLength={L.url}
            aria-invalid={urlBad || undefined}
            value={form.url}
            onChange={(e) => set({ url: e.target.value })}
            placeholder="https://"
          />
        </Field>
        <Field label="Логін" htmlFor={`${uid}-login`}>
          <Input
            id={`${uid}-login`}
            value={form.login}
            maxLength={L.login}
            onChange={(e) => set({ login: e.target.value })}
          />
        </Field>
        <Field
          label={initial?.hasSecret ? 'Новий пароль' : 'Пароль / токен'}
          htmlFor={`${uid}-secret`}
          hint={initial?.hasSecret ? 'Залиште порожнім, щоб не змінювати' : undefined}
        >
          <Input
            id={`${uid}-secret`}
            type="password"
            autoComplete="new-password"
            value={form.secret}
            maxLength={L.secret}
            onChange={(e) => set({ secret: e.target.value })}
          />
        </Field>
        <Field
          label="Нотатка"
          htmlFor={`${uid}-notes`}
          className="col-span-2"
          count={{ length: form.notes.length, max: L.notes }}
        >
          <Textarea
            id={`${uid}-notes`}
            className="min-h-12"
            maxLength={L.notes}
            value={form.notes}
            onChange={(e) => set({ notes: e.target.value })}
          />
        </Field>
        <div className="col-span-2 flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={onDone}>
            Скасувати
          </Button>
          {/* subtle, not lime: the form only exists while editing, and then CSS paints lime as the surface card. */}
          <Button type="submit" variant="subtle" disabled={noLabel || urlBad || pending}>
            {initial ? 'Оновити доступ' : 'Додати доступ'}
          </Button>
        </div>
      </form>
    </Card>
  )
}

/** One value cell (Логін / Пароль): label on top, monospace value, its actions on the right. */
function SecretCell({
  label,
  value,
  children
}: {
  label: string
  value: ReactNode
  children: ReactNode
}): ReactElement {
  return (
    <div className="flex min-w-0 items-center gap-2 rounded-xl bg-card px-3 py-2">
      <div className="min-w-0 flex-1">
        <div className="text-meta text-muted-foreground">{label}</div>
        <div className="selectable truncate font-mono text-body">{value}</div>
      </div>
      <div className="flex shrink-0 items-center">{children}</div>
    </div>
  )
}

/**
 * Credential card, password-manager style: key chip + name + host on top, then Логін / Пароль cells
 * with copy and show/hide right next to the value. Empty cells aren't drawn («—» looked like data).
 */
function CredentialRow({ item, owner }: { item: Credential; owner: Owner }): ReactElement {
  const [secret, setSecret] = useState<string | null>(null)
  const [editing, setEditing] = useInlineForm()
  const remove = useApiMutation('credentials', 'remove', { successMessage: 'Доступ видалено' })

  const reveal = async (): Promise<string | null> => {
    try {
      return await api.credentials.reveal(item.id)
    } catch (e) {
      toast.error((e as Error).message)
      return null
    }
  }

  if (editing)
    return <CredentialForm initial={item} owner={owner} onDone={() => setEditing(false)} />

  const host = item.url ? hostOf(item.url) : ''
  const empty = !item.login && !item.hasSecret
  return (
    <Card className="group gap-3 bg-surface p-4">
      <div className="flex min-w-0 items-center gap-3">
        <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-foreground/[0.07] text-muted-foreground">
          <KeyRound className="size-4" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="truncate text-body font-semibold">{item.label}</div>
          {host && <div className="truncate text-meta text-muted-foreground">{host}</div>}
        </div>
        <div className="flex shrink-0 items-center gap-0.5">
          {item.url && (
            <IconAction label={`Відкрити ${host}`} onClick={() => void openUrl(item.url)}>
              <ExternalLink />
            </IconAction>
          )}
          <span data-edit-only className="flex items-center gap-0.5">
            <IconAction label="Змінити" onClick={() => setEditing(true)}>
              <Pencil />
            </IconAction>
            <Confirm
              title={`Видалити доступ «${item.label}»?`}
              description="Пароль буде видалено без можливості відновлення."
              onConfirm={() => remove.mutate(item.id)}
            >
              <IconAction label="Видалити доступ" className="hover:text-destructive">
                <Trash2 />
              </IconAction>
            </Confirm>
          </span>
        </div>
      </div>
      {empty ? (
        <p className="text-caption text-muted-foreground">
          Логін і пароль ще не додано. Додайте їх у режимі правки.
        </p>
      ) : (
        <div className="grid gap-2 sm:grid-cols-2">
          {item.login && (
            <SecretCell label="Логін" value={item.login}>
              <IconAction
                label="Скопіювати логін"
                onClick={() => void copyText(item.login, 'Логін скопійовано')}
              >
                <Copy />
              </IconAction>
            </SecretCell>
          )}
          {item.hasSecret && (
            <SecretCell label="Пароль" value={secret ?? '••••••••••'}>
              <IconAction
                label={secret ? 'Сховати пароль' : 'Показати пароль'}
                onClick={async () => setSecret(secret ? null : await reveal())}
              >
                {secret ? <EyeOff /> : <Eye />}
              </IconAction>
              <IconAction
                label="Скопіювати пароль"
                onClick={async () => {
                  const s = secret ?? (await reveal())
                  if (s !== null) await copyText(s, 'Пароль скопійовано')
                }}
              >
                <Copy />
              </IconAction>
            </SecretCell>
          )}
        </div>
      )}
      {item.notes && (
        <p className="line-clamp-2 text-caption text-muted-foreground">{item.notes}</p>
      )}
    </Card>
  )
}

/** Access credentials of a client or project. Secrets are revealed on demand and never cached. */
export function CredentialsSection({
  items,
  owner
}: {
  items: Credential[]
  owner: Owner
}): ReactElement {
  const mode = useDetailMode()
  const [adding, setAdding] = useInlineForm()
  return (
    <Section
      title="Доступи"
      action={
        !adding && (
          <Button variant="soft" size="sm" data-edit-only onClick={() => setAdding(true)}>
            <Plus /> Доступ
          </Button>
        )
      }
    >
      {adding && <CredentialForm owner={owner} onDone={() => setAdding(false)} />}
      {items.length > 0 && (
        <div className="flex flex-col gap-2">
          {items.map((c) => (
            <CredentialRow key={c.id} item={c} owner={owner} />
          ))}
        </div>
      )}
      {!items.length && !adding && (
        <div className="flex flex-col items-start gap-3">
          <p className="text-body leading-relaxed text-muted-foreground">
            Доступів ще немає. Логіни від адмінок, хостингу й FTP — паролі шифруються ключем
            Windows.
          </p>
          {!mode.editing && (
            <Button
              variant="soft"
              size="sm"
              onClick={() => {
                mode.setEditing(true)
                setAdding(true)
              }}
            >
              <Plus /> Додати доступ
            </Button>
          )}
        </div>
      )}
    </Section>
  )
}
