import { useMemo, useState } from 'react'
import { Lightbulb, Plus, SquareKanban } from 'lucide-react'
import { IDEA_STATUSES, type Idea, type IdeaStatus } from '@shared/domain/ideas'
import { useApi, useApiMutation } from '@/lib/query'
import { fmtRelative } from '@/lib/format'
import { EmptyState, FilterChips, Page, PageHeader, SearchInput } from '@/components/common/page'
import { ListItem, MasterDetail, useOpenParam } from '@/components/common/master-detail'
import { TagFilter, TagList } from '@/components/common/tags'
import { cn } from '@/lib/utils'
import { IDEA_STATUS_LABEL } from './labels'
import { IdeaDetail } from './idea-detail'

function NewIdeaInput({ onCreated }: { onCreated: (id: string) => void }) {
  const [title, setTitle] = useState('')
  const create = useApiMutation('ideas', 'create', { onSuccess: (idea) => onCreated(idea.id) })
  return (
    <form
      className="flex items-center gap-2 rounded-2xl bg-surface p-1.5 pl-4 focus-within:ring-[3px] focus-within:ring-ring/25"
      onSubmit={(e) => {
        e.preventDefault()
        if (!title.trim()) return
        create.mutate({ title: title.trim() })
        setTitle('')
      }}
    >
      <input
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="Новая идея…"
        className="min-w-0 flex-1 bg-transparent text-[13.5px] outline-none placeholder:text-muted-foreground"
      />
      <button
        type="submit"
        disabled={!title.trim()}
        className="grid size-8 place-items-center rounded-full bg-ink text-lime disabled:opacity-40"
        aria-label="Добавить идею"
      >
        <Plus className="size-4" />
      </button>
    </form>
  )
}

function IdeaRow({ idea, active, onClick }: { idea: Idea; active: boolean; onClick: () => void }) {
  return (
    <ListItem active={active} onClick={onClick}>
      <div className="flex items-start gap-2">
        <span className="min-w-0 flex-1 text-[13.5px] leading-snug font-medium">{idea.title}</span>
        {idea.impact > 0 && (
          <span className={cn('shrink-0 text-[10px] tracking-widest', active ? 'text-lime' : 'text-muted-foreground')}>
            {'●'.repeat(idea.impact)}
          </span>
        )}
      </div>
      <div className={cn('mt-1.5 flex flex-wrap items-center gap-2 text-[11.5px]', active ? 'text-ink-muted' : 'text-muted-foreground')}>
        <span>{IDEA_STATUS_LABEL[idea.status]}</span>
        {idea.boardId && (
          <span className="inline-flex items-center gap-1">
            <SquareKanban className="size-3" /> доска
          </span>
        )}
        <span>· {fmtRelative(idea.updatedAt)}</span>
      </div>
      {idea.tags.length > 0 && <TagList tags={idea.tags} className="mt-2" max={3} />}
    </ListItem>
  )
}

export function IdeasPage() {
  const [open, setOpen] = useOpenParam()
  const [search, setSearch] = useState('')
  const [tagId, setTagId] = useState<string | undefined>()
  const [status, setStatus] = useState<IdeaStatus | undefined>()
  const { data: ideas = [], isLoading } = useApi('ideas', 'list', { search: search || undefined, tagId })

  const counts = useMemo(() => {
    const c: Partial<Record<IdeaStatus, number>> = {}
    for (const i of ideas) c[i.status] = (c[i.status] ?? 0) + 1
    return c
  }, [ideas])
  const visible = status ? ideas.filter((i) => i.status === status) : ideas

  return (
    <Page>
      <PageHeader title="Идеи" subtitle="Записывайте всё, что приходит в голову. Созревшую идею — одной кнопкой в доску.">
        <div className="flex flex-wrap items-center gap-2">
          <FilterChips
            allLabel="Все"
            value={status}
            onChange={setStatus}
            options={IDEA_STATUSES.map((s) => ({ value: s, label: IDEA_STATUS_LABEL[s], count: counts[s] ?? 0 }))}
          />
          <div className="ml-auto flex items-center gap-2">
            <TagFilter value={tagId} onChange={setTagId} />
            <SearchInput value={search} onChange={setSearch} placeholder="Поиск по идеям" className="w-60" />
          </div>
        </div>
      </PageHeader>
      <div className="flex min-h-0 flex-1 px-8 pb-6">
        <MasterDetail
          list={
            <div className="flex min-h-0 flex-1 flex-col gap-2">
              <NewIdeaInput onCreated={setOpen} />
              <div className="flex min-h-0 flex-1 flex-col gap-1.5 overflow-y-auto pr-1">
                {visible.map((idea) => (
                  <IdeaRow key={idea.id} idea={idea} active={idea.id === open} onClick={() => setOpen(idea.id)} />
                ))}
                {!isLoading && visible.length === 0 && (
                  <EmptyState
                    icon={Lightbulb}
                    title={ideas.length ? 'Под фильтр ничего не попало' : 'Идей пока нет'}
                    hint={
                      ideas.length
                        ? 'Сбросьте фильтр статуса или метки.'
                        : 'Напишите первую идею в поле выше — или нажмите глобальное сочетание быстрого добавления из любого окна.'
                    }
                  />
                )}
              </div>
            </div>
          }
          detail={open ? <IdeaDetail key={open} id={open} onClose={() => setOpen(null)} /> : null}
        />
      </div>
    </Page>
  )
}
