import { useMemo, useState } from 'react'
import { Lightbulb, Plus, SquareKanban } from 'lucide-react'
import { IDEA_STATUSES, type Idea, type IdeaStatus } from '@shared/domain/ideas'
import { useApi, useApiMutation, useInfiniteApi } from '@/lib/query'
import { useDebounced } from '@/hooks/use-debounced'
import { VirtualList } from '@/components/common/virtual-list'
import { fmtRelative } from '@/lib/format'
import { EmptyState, FilterChips, Page, PageHeader, SearchInput } from '@/components/common/page'
import { ListItem, MasterDetail, useOpenParam } from '@/components/common/master-detail'
import { TagFilter, TagList } from '@/components/common/tags'
import { cn } from '@/lib/utils'
import { InputGroup, InputGroupAddon, InputGroupButton, InputGroupInput } from '@/components/ui/input-group'
import { IDEA_STATUS_LABEL } from './labels'
import { IdeaDetail } from './idea-detail'

function NewIdeaInput({ onCreated }: { onCreated: (id: string) => void }) {
  const [title, setTitle] = useState('')
  const create = useApiMutation('ideas', 'create', { onSuccess: (idea) => onCreated(idea.id) })
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        if (!title.trim()) return
        create.mutate({ title: title.trim() })
        setTitle('')
      }}
    >
      <InputGroup className="h-11 pr-1">
        <InputGroupInput value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Новая идея…" className="pl-4 text-[13.5px]" />
        <InputGroupAddon align="inline-end">
          <InputGroupButton
            type="submit"
            size="icon-sm"
            variant="default"
            className="rounded-full"
            disabled={!title.trim()}
            aria-label="Добавить идею"
          >
            <Plus />
          </InputGroupButton>
        </InputGroupAddon>
      </InputGroup>
    </form>
  )
}

function IdeaRow({ idea, active, onClick }: { idea: Idea; active: boolean; onClick: () => void }) {
  return (
    <ListItem active={active} onClick={onClick}>
      <div className="flex items-start gap-2">
        <span className="min-w-0 flex-1 text-[13.5px] leading-snug font-medium">{idea.title}</span>
        {idea.impact > 0 && (
          <span className={cn('shrink-0 text-[10px] tracking-widest', active ? 'text-ink-accent' : 'text-muted-foreground')}>
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
  const q = useDebounced(search.trim())
  const base = { search: q || undefined, tagId }
  // Counts per status (cheap: personal data scale); the rendered list is paged + virtualized.
  const { data: ideas = [] } = useApi('ideas', 'list', base)
  const list = useInfiniteApi('ideas', 'list', { ...base, status })

  const counts = useMemo(() => {
    const c: Partial<Record<IdeaStatus, number>> = {}
    for (const i of ideas) c[i.status] = (c[i.status] ?? 0) + 1
    return c
  }, [ideas])

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
              <VirtualList
                className="pr-1"
                items={list.items}
                getKey={(idea) => idea.id}
                estimateSize={84}
                hasMore={list.hasMore}
                loadingMore={list.loadingMore}
                onLoadMore={list.loadMore}
                renderItem={(idea) => <IdeaRow idea={idea} active={idea.id === open} onClick={() => setOpen(idea.id)} />}
                empty={
                  !list.isLoading && (
                    <EmptyState
                      icon={Lightbulb}
                      title={ideas.length ? 'Под фильтр ничего не попало' : 'Идей пока нет'}
                      hint={
                        ideas.length
                          ? 'Сбросьте фильтр статуса или метки.'
                          : 'Напишите первую идею в поле выше — или нажмите глобальное сочетание быстрого добавления из любого окна.'
                      }
                    />
                  )
                }
              />
            </div>
          }
          detail={open ? <IdeaDetail key={open} id={open} onClose={() => setOpen(null)} /> : null}
        />
      </div>
    </Page>
  )
}
