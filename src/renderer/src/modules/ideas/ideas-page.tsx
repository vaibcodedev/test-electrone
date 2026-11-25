import { useMemo, useRef, useState, type Ref } from 'react'
import { MAX } from '@shared/domain/limits'
import { Flame, Lightbulb, Plus, SquareKanban } from 'lucide-react'
import { IDEA_STATUSES, type Idea, type IdeaStatus } from '@shared/domain/ideas'
import { useApi, useApiMutation, useInfiniteApi } from '@/lib/query'
import { useDebounced } from '@/hooks/use-debounced'
import { useHotkey } from '@/hooks/use-hotkey'
import { accelToKeys, DEFAULT_QUICK_ADD } from '@/app/shortcuts'
import { VirtualList } from '@/components/common/virtual-list'
import { fmtRelative } from '@/lib/format'
import { EmptyState, FilterChips, Page, PageHeader, SearchInput } from '@/components/common/page'
import { ListItem, MasterDetail, useOpenParam } from '@/components/common/master-detail'
import { TagFilter, TagList } from '@/components/common/tags'
import { cn } from '@/lib/utils'
import { ImportButton } from '@/components/common/import-dialog'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { InputGroup, InputGroupAddon, InputGroupButton, InputGroupInput } from '@/components/ui/input-group'
import { Kbd, KbdGroup } from '@/components/ui/kbd'
import { IDEA_STATUS_BADGE, IDEA_STATUS_LABEL, IMPACT_LABEL } from './labels'
import { IdeaDetail } from './idea-detail'

function NewIdeaInput({ onCreated, inputRef }: { onCreated: (id: string) => void; inputRef: Ref<HTMLInputElement> }) {
  const [title, setTitle] = useState('')
  const create = useApiMutation('ideas', 'create', { onSuccess: (idea) => onCreated(idea.id) })
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        if (!title.trim() || create.isPending) return
        // Cleared only after the server accepted it: a rejected title stays for fixing.
        create.mutate({ title: title.trim() }, { onSuccess: () => setTitle('') })
      }}
    >
      <InputGroup className="h-11 pr-1">
        <InputGroupInput
          ref={inputRef}
          value={title}
          maxLength={MAX.title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Нова ідея…"
          className="pl-4 text-body"
        />
        <InputGroupAddon align="inline-end">
          <InputGroupButton
            type="submit"
            size="icon-sm"
            variant="default"
            className="rounded-full"
            disabled={!title.trim() || create.isPending}
            aria-label="Додати ідею"
          >
            <Plus />
          </InputGroupButton>
        </InputGroupAddon>
      </InputGroup>
    </form>
  )
}

/** Badges in the active (ink) row take an ink tint, like TagList chips. */
const ON_INK = '[[data-active]_&]:bg-ink-foreground/12 [[data-active]_&]:text-ink-foreground'

function IdeaRow({ idea, active, onClick }: { idea: Idea; active: boolean; onClick: () => void }) {
  return (
    <ListItem active={active} onClick={onClick}>
      <div className="flex items-start gap-2">
        <span className="line-clamp-2 min-w-0 flex-1 text-body leading-snug font-medium">{idea.title}</span>
        {idea.impact > 0 && (
          <Badge variant="soft" className={cn('shrink-0', ON_INK)}>
            <Flame />
            {IMPACT_LABEL[idea.impact]}
          </Badge>
        )}
      </div>
      <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
        <Badge
          variant={IDEA_STATUS_BADGE[idea.status]}
          className={cn(idea.status === 'dropped' && 'text-muted-foreground', ON_INK)}
        >
          {IDEA_STATUS_LABEL[idea.status]}
        </Badge>
        {idea.boardId && (
          <Badge variant="soft" className={ON_INK}>
            <SquareKanban /> На дошці
          </Badge>
        )}
        <span className={cn('text-meta', active ? 'text-ink-muted' : 'text-muted-foreground')}>
          {fmtRelative(idea.updatedAt)}
        </span>
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
  const newIdeaRef = useRef<HTMLInputElement>(null)
  // N (the page's «create») goes to the quick input: this page has no lime header button.
  useHotkey('n', () => newIdeaRef.current?.focus())
  const { data: settings } = useApi('settings', 'get')
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

  const filtered = !!(search.trim() || status || tagId)

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
            <SearchInput value={search} onChange={setSearch} placeholder="Пошук ідей" className="w-60" />
          </div>
        </div>
      </PageHeader>
      <div className="flex min-h-0 flex-1 px-8 pb-6">
        <MasterDetail
          list={
            <div className="flex min-h-0 flex-1 flex-col gap-2">
              <NewIdeaInput onCreated={setOpen} inputRef={newIdeaRef} />
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
                    filtered ? (
                      <EmptyState
                        icon={Lightbulb}
                        title="Нічого не знайдено"
                        hint="Спробуйте інший запит або скиньте фільтри."
                        action={
                          <Button
                            variant="subtle"
                            size="sm"
                            onClick={() => {
                              setSearch('')
                              setStatus(undefined)
                              setTagId(undefined)
                            }}
                          >
                            Скинути фільтри
                          </Button>
                        }
                      />
                    ) : (
                      <EmptyState
                        icon={Lightbulb}
                        title="Ідей поки немає"
                        hint={
                          <>
                            Напишіть першу ідею в полі вище або натисніть{' '}
                            <KbdGroup>
                              {accelToKeys(settings?.quickAddShortcut || DEFAULT_QUICK_ADD).map((k) => (
                                <Kbd key={k}>{k}</Kbd>
                              ))}
                            </KbdGroup>{' '}
                            у будь-якому вікні.
                          </>
                        }
                      />
                    )
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
