import { useState } from 'react'
import { useSearchParams } from 'react-router'
import { Tags, Trash2 } from 'lucide-react'
import { useApi, useApiMutation } from '@/lib/query'
import { EmptyState, Page, PageBody, PageHeader } from '@/components/common/page'
import { EntityRow } from '@/components/common/entity-link'
import { TAG_COLORS } from '@/components/common/tags'
import { Confirm } from '@/components/common/confirm'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

/** Global tags shared by all modules: rename, recolor, delete, and see everything carrying a tag. */
export function TagsPage() {
  const [params, setParams] = useSearchParams()
  const selected = params.get('tag')
  const { data: tags = [] } = useApi('tags', 'list')
  const { data: entities = [] } = useApi('tags', 'entities', selected ?? '', { enabled: !!selected })
  const create = useApiMutation('tags', 'create')
  const update = useApiMutation('tags', 'update')
  const remove = useApiMutation('tags', 'remove', { successMessage: 'Метка удалена' })
  const [name, setName] = useState('')
  const current = tags.find((t) => t.id === selected)

  return (
    <Page>
      <PageHeader title="Метки" subtitle="Общие для всех разделов: одна метка «shopify» найдёт идеи, сниппеты, дизайны и ошибки." />
      <PageBody className="flex gap-6">
        <div className="flex w-[340px] shrink-0 flex-col gap-3">
          <form
            className="flex gap-2"
            onSubmit={(e) => {
              e.preventDefault()
              if (!name.trim()) return
              create.mutate({ name: name.trim(), color: TAG_COLORS[tags.length % TAG_COLORS.length] })
              setName('')
            }}
          >
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Новая метка" />
            <Button type="submit" variant="lime" disabled={!name.trim()}>
              Добавить
            </Button>
          </form>
          <ul className="flex flex-col gap-1">
            {tags.map((t) => (
              <li key={t.id}>
                <button
                  type="button"
                  onClick={() => setParams({ tag: t.id })}
                  className={cn(
                    'flex w-full items-center gap-3 rounded-full px-4 py-2 text-left text-[13px]',
                    selected === t.id ? 'bg-ink text-ink-foreground' : 'hover:bg-surface'
                  )}
                >
                  <span className="size-2.5 rounded-full" style={{ background: t.color ?? 'var(--muted-foreground)' }} />
                  <span className="flex-1">{t.name}</span>
                  <span className="text-[12px] opacity-60 tabular-nums">{t.usage}</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
        <div className="min-w-0 flex-1">
          {!current ? (
            <EmptyState icon={Tags} title="Выберите метку" hint="Справа появится всё, что ей помечено, из всех разделов." />
          ) : (
            <div className="flex flex-col gap-5">
              <div className="flex items-center gap-3">
                <Input
                  key={current.id}
                  defaultValue={current.name}
                  className="font-display h-12 max-w-sm text-xl"
                  onBlur={(e) => e.target.value.trim() && e.target.value !== current.name && update.mutate({ id: current.id, patch: { name: e.target.value.trim() } })}
                />
                <div className="flex gap-1">
                  {TAG_COLORS.map((c) => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => update.mutate({ id: current.id, patch: { color: c } })}
                      className={cn('size-6 rounded-full ring-offset-2 ring-offset-card', current.color === c && 'ring-2 ring-foreground')}
                      style={{ background: c }}
                      aria-label={c}
                    />
                  ))}
                </div>
                <Confirm
                  title={`Удалить метку «${current.name}»?`}
                  description="Записи останутся, пропадёт только метка."
                  onConfirm={() => {
                    remove.mutate(current.id)
                    setParams({})
                  }}
                >
                  <Button variant="ghost" size="icon">
                    <Trash2 />
                  </Button>
                </Confirm>
              </div>
              <div className="flex flex-col">
                {entities.map((e) => (
                  <EntityRow key={`${e.type}:${e.id}`} item={e} />
                ))}
                {!entities.length && <p className="text-[13px] text-muted-foreground">Этой меткой пока ничего не помечено.</p>}
              </div>
            </div>
          )}
        </div>
      </PageBody>
    </Page>
  )
}
