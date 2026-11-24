import { useMemo, useState } from 'react'
import { MAX } from '@shared/domain/limits'
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
import { ImportButton } from '@/components/common/import-dialog'

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
        <InputGroupInput value={title} maxLength={MAX.title} onChange={(e) => setTitle(e.target.value)} placeholder="Нова ідея…" className="pl-4 text-body" />
        <InputGroupAddon align="inline-end">
          <InputGroupButton
            type="submit"
            size="icon-sm"
            variant="default"
            className="rounded-full"
            disabled={!title.trim()}
            aria-label="Додати ідею"
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
        <span className="line-clamp-2 min-w-0 flex-1 text-body leading-snug font-medium">{idea.title}</span>
        {idea.impact > 0 && (
          <span className={cn('shrink-0 text-meta tracking-widest', active ? 'text-ink-accent' : 'text-muted-foreground')}>
            {'●'.repeat(idea.impact)}
          </span>
        )}
      </div>
      <div className={cn('mt-1.5 flex flex-wrap items-center gap-2 text-meta', active ? 'text-ink-muted' : 'text-muted-foreground')}>
        <span>{IDEA_STATUS_LABEL[idea.status]}</span>
        {idea.boardId && (
          <span className="inline-flex items-center gap-1">
            <SquareKanban className="size-3" /> дошка
          </span>
        )}
        <span>· {fmtRelative(idea.updatedAt)}</span>
      </div>
      {idea.tags.length > 0 && <TagList tags={idea.tags} className="mt-1.5" max={3} />}
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
      <PageHeader
        title="Ідеї"
        subtitle="Записуйте все, що спадає на думку. Дозрілу ідею — однією кнопкою в дошку."
        actions={<ImportButton kind="idea" onImported={(id) => id && setOpen(id)} />}
      >
        <div className="flex flex-wrap items-center gap-2">
          <FilterChips
            allLabel="Усі"
            value={status}
            onChange={setStatus}
            options={IDEA_STATUSES.map((s) => ({ value: s, label: IDEA_STATUS_LABEL[s], count: counts[s] ?? 0 }))}
          />
          <div className="ml-auto flex items-center gap-2">
            <TagFilter value={tagId} onChange={setTagId} />
            <SearchInput value={search} onChange={setSearch} placeholder="Пошук ідеями" className="w-60" />
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
                loading={list.isLoading}
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
                      title={ideas.length ? 'Під фільтр нічого не потрапило' : 'Ідей поки немає'}
                      hint={
                        ideas.length
                          ? 'Скиньте фільтр статусу чи мітки.'
                          : 'Напишіть першу ідею в полі вище — або натисніть глобальне сполучення швидкого додавання з будь-якого вікна.'
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
