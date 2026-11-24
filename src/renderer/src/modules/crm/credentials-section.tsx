import { useState } from 'react'
import { ExternalLink, Eye, EyeOff, KeyRound, Pencil, Plus, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import type { Credential, CredentialInput } from '@shared/domain/crm'
import { useApiMutation } from '@/lib/query'
import { api } from '@/lib/api'
import { copyText, CopyButton } from '@/components/common/copy-button'
import { Confirm } from '@/components/common/confirm'
import { Field } from '@/components/common/page'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Section } from './parts'

type Owner = { projectId: string } | { clientId: string }

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
    successMessage: 'Доступ сохранён',
    onSuccess: onDone
  })
  const update = useApiMutation('credentials', 'update', {
    successMessage: 'Доступ обновлён',
    onSuccess: onDone
  })
  const set = (patch: Partial<typeof form>): void => setForm((f) => ({ ...f, ...patch }))
  return (
    <form
      className="grid grid-cols-2 gap-3 rounded-2xl bg-surface p-4"
      onSubmit={(e) => {
        e.preventDefault()
        if (!form.label.trim()) return
        if (initial) {
          const { secret, ...rest } = form
          update.mutate({ id: initial.id, patch: secret ? form : rest })
        } else {
          create.mutate({ ...form, ...owner } as CredentialInput)
        }
      }}
    >
      <Field label="Название">
        <Input
          autoFocus
          className="bg-card"
          value={form.label}
          onChange={(e) => set({ label: e.target.value })}
          placeholder="Shopify admin"
        />
      </Field>
      <Field label="Ссылка">
        <Input
          className="bg-card"
          value={form.url}
          onChange={(e) => set({ url: e.target.value })}
          placeholder="https://"
        />
      </Field>
      <Field label="Логин">
        <Input
          className="bg-card"
          value={form.login}
          onChange={(e) => set({ login: e.target.value })}
        />
      </Field>
      <Field label={initial?.hasSecret ? 'Новый пароль (пусто — оставить)' : 'Пароль / токен'}>
        <Input
          className="bg-card"
          type="password"
          autoComplete="new-password"
          value={form.secret}
          onChange={(e) => set({ secret: e.target.value })}
        />
      </Field>
      <Field label="Заметка" className="col-span-2">
        <Textarea
          className="min-h-12 bg-card"
          value={form.notes}
          onChange={(e) => set({ notes: e.target.value })}
        />
      </Field>
      <div className="col-span-2 flex justify-end gap-2">
        <Button type="button" variant="ghost" onClick={onDone}>
          Отмена
        </Button>
        <Button type="submit" variant="lime" disabled={!form.label.trim()}>
          Сохранить
        </Button>
      </div>
    </form>
  )
}

function CredentialRow({ item, owner }: { item: Credential; owner: Owner }) {
  const [secret, setSecret] = useState<string | null>(null)
  const [editing, setEditing] = useState(false)
  const remove = useApiMutation('credentials', 'remove', { successMessage: 'Доступ удалён' })

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
    <div className="group flex items-center gap-3 rounded-2xl bg-surface px-4 py-3">
      <span className="grid size-9 shrink-0 place-items-center rounded-full bg-card">
        <KeyRound className="size-4" />
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="truncate text-[13.5px] font-medium">{item.label}</span>
          {item.url && (
            <button
              type="button"
              title={item.url}
              className="text-muted-foreground hover:text-foreground"
              onClick={() =>
                api.app.openExternal(item.url).catch((e: Error) => toast.error(e.message))
              }
            >
              <ExternalLink className="size-3.5" />
            </button>
          )}
        </div>
        <div className="mt-0.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-[12px] text-muted-foreground">
          {item.login && (
            <button
              type="button"
              className="selectable hover:text-foreground"
              title="Скопировать логин"
              onClick={() => copyText(item.login, 'Логин скопирован')}
            >
              {item.login}
            </button>
          )}
          {item.hasSecret && (
            <span className="flex items-center gap-1.5">
              <span className="selectable font-mono">{secret ?? '••••••••'}</span>
              <button
                type="button"
                className="hover:text-foreground"
                title={secret ? 'Скрыть' : 'Показать'}
                onClick={async () => setSecret(secret ? null : await reveal())}
              >
                {secret ? <EyeOff className="size-3.5" /> : <Eye className="size-3.5" />}
              </button>
            </span>
          )}
        </div>
        {item.notes && <div className="mt-1 text-[12px] text-muted-foreground">{item.notes}</div>}
      </div>
      <div className="flex items-center gap-1">
        {item.hasSecret && (
          <Button
            variant="ghost"
            size="sm"
            onClick={async () => {
              const s = await reveal()
              if (s !== null) await copyText(s, 'Пароль скопирован')
            }}
          >
            Копировать пароль
          </Button>
        )}
        {item.login && !item.hasSecret && <CopyButton text={item.login} variant="ghost" />}
        <Button variant="ghost" size="icon-sm" title="Изменить" onClick={() => setEditing(true)}>
          <Pencil />
        </Button>
        <Confirm
          title={`Удалить доступ «${item.label}»?`}
          description="Пароль будет удалён без возможности восстановления."
          onConfirm={() => remove.mutate(item.id)}
        >
          <Button variant="ghost" size="icon-sm" title="Удалить">
            <Trash2 />
          </Button>
        </Confirm>
      </div>
    </div>
  )
}

/** Access credentials of a client or project. Secrets are revealed on demand and never cached. */
export function CredentialsSection({ items, owner }: { items: Credential[]; owner: Owner }) {
  const [adding, setAdding] = useState(false)
  return (
    <Section
      title="Доступы"
      action={
        !adding && (
          <Button variant="soft" size="sm" onClick={() => setAdding(true)}>
            <Plus /> Доступ
          </Button>
        )
      }
    >
      {adding && <CredentialForm owner={owner} onDone={() => setAdding(false)} />}
      {items.map((c) => (
        <CredentialRow key={c.id} item={c} owner={owner} />
      ))}
      {!items.length && !adding && (
        <p className="text-[13px] text-muted-foreground">
          Логины от админок, хостинга и FTP. Пароли шифруются ключом Windows и показываются по
          кнопке.
        </p>
      )}
    </Section>
  )
}
