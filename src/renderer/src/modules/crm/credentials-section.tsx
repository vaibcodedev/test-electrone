import { useState, type ReactNode } from 'react'
import { openUrl } from '@/lib/open-url'
import { Copy, ExternalLink, Eye, EyeOff, KeyRound, Pencil, Plus, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { credentialInputSchema, type Credential, type CredentialInput } from '@shared/domain/crm'
import { useApiMutation } from '@/lib/query'
import { isLikelyUrl, limitsOf, URL_ERROR } from '@/lib/limits'
import { api } from '@/lib/api'
import { hostOf } from '@/lib/format'
import { copyText } from '@/components/common/copy-button'
import { Confirm } from '@/components/common/confirm'
import { Field } from '@/components/common/page'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Section } from './parts'
import { Card } from '@/components/ui/card'
import { IconAction } from '@/components/common/icon-action'

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
}) {
  const [form, setForm] = useState({
    label: initial?.label ?? '',
    url: initial?.url ?? '',
    login: initial?.login ?? '',
    secret: '',
    notes: initial?.notes ?? ''
  })
  const create = useApiMutation('credentials', 'create', {
    successMessage: 'Доступ збережено',
    onSuccess: onDone
  })
  const update = useApiMutation('credentials', 'update', {
    successMessage: 'Доступ оновлено',
    onSuccess: onDone
  })
  const set = (patch: Partial<typeof form>): void => setForm((f) => ({ ...f, ...patch }))
  const urlBad = !isLikelyUrl(form.url)
  const pending = create.isPending || update.isPending
  return (
    <Card className="p-4">
      <form
        className="grid grid-cols-2 gap-3"
        onSubmit={(e) => {
          e.preventDefault()
          if (!form.label.trim() || urlBad || pending) return
          if (initial) {
            const { secret, ...rest } = form
            update.mutate({ id: initial.id, patch: secret ? form : rest })
          } else {
            create.mutate({ ...form, ...owner } as CredentialInput)
          }
        }}
      >
        <Field label="Назва">
          <Input
            autoFocus
            className="bg-card"
            value={form.label}
            maxLength={L.label}
            onChange={(e) => set({ label: e.target.value })}
            placeholder="Shopify admin"
          />
        </Field>
        <Field label="Посилання" error={urlBad ? URL_ERROR : undefined}>
          <Input
            className="bg-card"
            type="url"
            maxLength={L.url}
            aria-invalid={urlBad || undefined}
            value={form.url}
            onChange={(e) => set({ url: e.target.value })}
            placeholder="https://"
          />
        </Field>
        <Field label="Логін">
          <Input
            className="bg-card"
            value={form.login}
            maxLength={L.login}
            onChange={(e) => set({ login: e.target.value })}
          />
        </Field>
        <Field label={initial?.hasSecret ? 'Новий пароль (порожньо — залишити)' : 'Пароль / токен'}>
          <Input
            className="bg-card"
            type="password"
            autoComplete="new-password"
            value={form.secret}
            maxLength={L.secret}
            onChange={(e) => set({ secret: e.target.value })}
          />
        </Field>
        <Field
          label="Нотатка"
          className="col-span-2"
          count={{ length: form.notes.length, max: L.notes }}
        >
          <Textarea
            className="min-h-12 bg-card"
            maxLength={L.notes}
            value={form.notes}
            onChange={(e) => set({ notes: e.target.value })}
          />
        </Field>
        <div className="col-span-2 flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={onDone}>
            Скасувати
          </Button>
          <Button type="submit" variant="lime" disabled={!form.label.trim() || urlBad || pending}>
            Зберегти
          </Button>
        </div>
      </form>
    </Card>
  )
}

/** One value cell (Логін / Пароль): label on top, monospace value, its actions on the right. */
function SecretCell({ label, value, children }: { label: string; value: ReactNode; children: ReactNode }) {
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
function CredentialRow({ item, owner }: { item: Credential; owner: Owner }) {
  const [secret, setSecret] = useState<string | null>(null)
  const [editing, setEditing] = useState(false)
  const remove = useApiMutation('credentials', 'remove', { successMessage: 'Доступ видалено' })

  const reveal = async (): Promise<string | null> => {
    try {
      return await api.credentials.reveal(item.id)
    } catch (e) {
      toast.error((e as Error).message)
      return null
    }
  }

  if (editing) return <CredentialForm initial={item} owner={owner} onDone={() => setEditing(false)} />

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
            <IconAction
              label={`Відкрити ${host}`}
              onClick={() => openUrl(item.url).catch((e: Error) => toast.error(e.message))}
            >
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
              {/* Confirm wraps its trigger with asChild: the tooltip trigger can't sit in between. */}
              <Button variant="ghost" size="icon-xs" aria-label="Видалити" className="hover:text-destructive">
                <Trash2 />
              </Button>
            </Confirm>
          </span>
        </div>
      </div>
      {empty ? (
        <p className="text-caption text-muted-foreground">Логін і пароль ще не додано — «Редагувати» → олівець.</p>
      ) : (
        <div className="grid gap-2 sm:grid-cols-2">
          {item.login && (
            <SecretCell label="Логін" value={item.login}>
              <IconAction label="Скопіювати логін" onClick={() => void copyText(item.login, 'Логін скопійовано')}>
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
      {item.notes && <p className="line-clamp-2 text-caption text-muted-foreground">{item.notes}</p>}
    </Card>
  )
}

/** Access credentials of a client or project. Secrets are revealed on demand and never cached. */
export function CredentialsSection({ items, owner }: { items: Credential[]; owner: Owner }) {
  const [adding, setAdding] = useState(false)
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
        <p className="text-body text-muted-foreground">
          Логіни від адмінок, хостингу й FTP. Паролі шифруються ключем Windows і показуються за
          кнопкою.
        </p>
      )}
    </Section>
  )
}
