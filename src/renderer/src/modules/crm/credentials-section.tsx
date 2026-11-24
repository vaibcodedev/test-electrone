import { useState, type ReactNode } from 'react'
import { Copy, ExternalLink, Eye, EyeOff, KeyRound, Pencil, Plus, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { credentialInputSchema, type Credential, type CredentialInput } from '@shared/domain/crm'
import { useApiMutation } from '@/lib/query'
import { isLikelyUrl, limitsOf, URL_ERROR } from '@/lib/limits'
import { api } from '@/lib/api'
import { copyText } from '@/components/common/copy-button'
import { Confirm } from '@/components/common/confirm'
import { Field } from '@/components/common/page'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Section } from './parts'
import { Card } from '@/components/ui/card'
import {
  Item,
  ItemActions,
  ItemContent,
  ItemGroup,
  ItemMedia,
  ItemTitle
} from '@/components/ui/item'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'

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
  return (
    <Card className="p-4">
      <form
        className="grid grid-cols-2 gap-3"
        onSubmit={(e) => {
          e.preventDefault()
          if (!form.label.trim() || urlBad) return
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
          <Button type="submit" variant="lime" disabled={!form.label.trim() || urlBad}>
            Зберегти
          </Button>
        </div>
      </form>
    </Card>
  )
}

/** Ghost icon button with a tooltip — the row's inline actions (copy, show, edit, delete). */
function IconAction({
  label,
  onClick,
  className,
  children
}: {
  label: string
  onClick?: () => void
  className?: string
  children: ReactNode
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant="ghost"
          size="icon-xs"
          aria-label={label}
          className={className}
          onClick={onClick}
        >
          {children}
        </Button>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  )
}

/**
 * Credential row: name (+ link) on top, then a small definition grid with muted labels —
 * Логін / Пароль / Нотатка — so it's always clear what each value is. Copy and show/hide are
 * inline icon buttons next to their value; empty values show «—».
 */
function CredentialRow({ item, owner }: { item: Credential; owner: Owner }) {
  const [secret, setSecret] = useState<string | null>(null)
  const [editing, setEditing] = useState(false)
  const remove = useApiMutation('credentials', 'remove', { successMessage: 'Доступ видалено' })

  const reveal = async (): Promise<string | null> => {
    try {
      const s = await api.credentials.reveal(item.id)
      return s
    } catch (e) {
      toast.error((e as Error).message)
      return null
    }
  }

  if (editing)
    return <CredentialForm initial={item} owner={owner} onDone={() => setEditing(false)} />

  return (
    <Item variant="muted" size="sm" className="group items-start">
      <ItemMedia variant="icon" className="size-9 bg-card">
        <KeyRound />
      </ItemMedia>
      <ItemContent className="min-w-0 gap-2">
        <ItemTitle className="w-full min-w-0 text-body font-semibold">
          <span className="truncate">{item.label}</span>
          {item.url && (
            <IconAction
              label={`Відкрити ${item.url}`}
              className="text-muted-foreground"
              onClick={() =>
                api.app.openExternal(item.url).catch((e: Error) => toast.error(e.message))
              }
            >
              <ExternalLink />
            </IconAction>
          )}
        </ItemTitle>
        <dl className="grid grid-cols-[auto_minmax(0,1fr)] items-center gap-x-4 gap-y-1 text-caption">
          <dt className="text-muted-foreground">Логін</dt>
          <dd className="flex min-w-0 items-center gap-1">
            {item.login ? (
              <>
                <span className="selectable truncate font-mono">{item.login}</span>
                <IconAction
                  label="Скопіювати логін"
                  onClick={() => void copyText(item.login, 'Логін скопійовано')}
                >
                  <Copy />
                </IconAction>
              </>
            ) : (
              <span className="text-muted-foreground">—</span>
            )}
          </dd>
          <dt className="text-muted-foreground">Пароль</dt>
          <dd className="flex min-w-0 items-center gap-1">
            {item.hasSecret ? (
              <>
                <span className="selectable truncate font-mono">{secret ?? '••••••••'}</span>
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
              </>
            ) : (
              <span className="text-muted-foreground">—</span>
            )}
          </dd>
          {item.notes && (
            <>
              <dt className="self-start text-muted-foreground">Нотатка</dt>
              <dd className="line-clamp-2 min-w-0 text-muted-foreground">{item.notes}</dd>
            </>
          )}
        </dl>
      </ItemContent>
      <ItemActions data-edit-only>
        <IconAction label="Змінити" onClick={() => setEditing(true)}>
          <Pencil />
        </IconAction>
        <Confirm
          title={`Видалити доступ «${item.label}»?`}
          description="Пароль буде видалено без можливості відновлення."
          onConfirm={() => remove.mutate(item.id)}
        >
          {/* Confirm wraps its trigger with asChild: the tooltip trigger can't sit in between. */}
          <Button
            variant="ghost"
            size="icon-xs"
            aria-label="Видалити"
            className="hover:text-destructive"
          >
            <Trash2 />
          </Button>
        </Confirm>
      </ItemActions>
    </Item>
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
        <ItemGroup className="gap-2">
          {items.map((c) => (
            <CredentialRow key={c.id} item={c} owner={owner} />
          ))}
        </ItemGroup>
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
