import { useState } from 'react'
import { MAX } from '@shared/domain/limits'
import { Flame, Lightbulb, Plus, SquareKanban } from 'lucide-react'
import { IDEA_STATUSES, type Idea, type IdeaStatus } from '@shared/domain/ideas'
import { useApi, useApiMutation, useInfiniteApi, useInPlaceApi } from '@/lib/query'
import { RecordLoadError } from '@/components/common/record-load-error'
import { useDebounced } from '@/hooks/use-debounced'
import { accelToKeys, DEFAULT_QUICK_ADD } from '@/app/shortcuts'
import { VirtualList } from '@/components/common/virtual-list'
import { fmtRelative } from '@/lib/format'
import { EmptyState, FilterBar, FilterChips, NoResults, Page, PageHeader, SearchInput } from '@/components/common/page'
import { ListItem, MasterDetail, useOpenParam } from '@/components/common/master-detail'
import { TagFilter, TagList } from '@/components/common/tags'
import { FavoriteFilter } from '@/components/common/favorite-filter'
import { FavoriteMark } from '@/components/common/favorite-mark'
import { cn } from '@/lib/utils'
import { ImportButton } from '@/components/common/import-dialog'
import { DisabledHint } from '@/components/common/disabled-hint'
import { useFormGate } from '@/hooks/use-form-gate'
import { Badge } from '@/components/ui/badge'
import { InputGroup, InputGroupAddon, InputGroupButton, InputGroupInput } from '@/components/ui/input-group'
import { Kbd, KbdGroup } from '@/components/ui/kbd'
import { IDEA_STATUS_BADGE, IDEA_STATUS_LABEL, IMPACT_LABEL } from './labels'
import { IdeaDetail } from './idea-detail'
import { noResultsHint, presentChips } from '../claude/chips'

function NewIdeaInput({ onCreated }: { onCreated: (id: string) => void }) {
  const [title, setTitle] = useState('')
  // Enter here creates the idea: it opens for reading with a «Ідею додано» toast, not in «Редагувати» asking
  // «Зберегти» as if it were still a draft.
  const create = useApiMutation('ideas', 'create', {
    openInEdit: false,
    successMessage: 'Ідею додано',
    onSuccess: (idea) => onCreated(idea.id)
  })
  // The title is required: «+» is off while it is empty (with the reason), Enter adds nothing.
  const { attach, reason, submit } = useFormGate()
  return (
    <form
      ref={attach}
      onSubmit={(e) =>
        submit(e, () => {
          if (create.isPending) return
          // Cleared only after the server accepted it: a rejected title stays for fixing.
          create.mutate({ title: title.trim() }, { onSuccess: () => setTitle('') })
        })
      }
    >
      <InputGroup className="h-11 pr-1">
        {/* data-page-new: the page has no lime header button, so `N` puts the caret here. */}
        <InputGroupInput
          data-page-new
          required
          aria-label="Нова ідея"
          value={title}
          maxLength={MAX.title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Нова ідея…"
          className="pl-4 text-body"
        />
        <InputGroupAddon align="inline-end">
          <DisabledHint reason={reason}>
            <InputGroupButton
              type="submit"
              size="icon-sm"
              variant="default"
              className="rounded-full"
              disabled={!!reason || create.isPending}
              aria-label="Додати ідею"
            >
              <Plus />
            </InputGroupButton>
          </DisabledHint>
        </InputGroupAddon>
      </InputGroup>
    </form>
  )
}

/** Badges in the active (ink) row take an ink tint, like TagList chips. */
const ON_INK = 'in-data-active:bg-ink-foreground/12 in-data-active:text-ink-foreground'

function IdeaRow({ idea, active, onClick }: { idea: Idea; active: boolean; onClick: () => void }) {
  return (
    <ListItem active={active} onClick={onClick}>
      <div className="flex items-start gap-2">
        <span className="flex min-w-0 flex-1 items-start gap-1.5">
          <span className="line-clamp-2 min-w-0 text-body leading-snug font-medium">{idea.title}</span>
          <FavoriteMark entity={{ type: 'idea', id: idea.id }} onInk={active} className="mt-0.5" />
        </span>
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
  const [favorite, setFavorite] = useState(false)
  const { data: settings } = useApi('settings', 'get')
  // Loaded here, not inside the pane: MasterDetail keeps the previous record until this one arrives.
  const openRecord = useInPlaceApi('ideas', 'get', open ?? '', { enabled: !!open })
  const openIdea = openRecord.data
  const q = useDebounced(search.trim())
  const base = { search: q || undefined, tagId, favorite: favorite || undefined }
  // Chip counters come from the server under the same search and tag; the list itself is paged + virtualized.
  const { data: counts } = useApi('ideas', 'counts', base)
  const list = useInfiniteApi('ideas', 'list', { ...base, status })

  const statusChips = presentChips(IDEA_STATUSES, counts ?? {}, (s) => IDEA_STATUS_LABEL[s], status)
  // The debounced query, not the raw text: otherwise «Нічого не знайдено» flashed before the server answered.
  const filtered = !!(q || status || tagId || favorite)
  // No ideas at all: nothing to search or filter, so no filter row above the empty state. Shown while the
  // counts load, so an ordinary page doesn't jump.
  const none = !!counts && !filtered && Object.values(counts).every((n) => !n)
  const resetFilters = (): void => {
    setSearch('')
    setStatus(undefined)
    setTagId(undefined)
    setFavorite(false)
  }

  return (
    <Page>
      <PageHeader
        title="Ідеї"
        subtitle="Записуйте все, що спадає на думку. Дозрілу ідею — однією кнопкою в дошку."
        actions={<ImportButton kind="idea" onImported={(id) => id && setOpen(id)} />}
      >
        {!none && (
          <FilterBar
            chips={
              statusChips.length > 0 && (
                <FilterChips allLabel="Усі" value={status} onChange={setStatus} options={statusChips} />
              )
            }
            trailing={
              <>
                <FavoriteFilter type="idea" value={favorite} onChange={setFavorite} />
                <TagFilter value={tagId} onChange={setTagId} />
                <SearchInput value={search} onChange={setSearch} placeholder="Пошук ідей" />
              </>
            }
          />
        )}
      </PageHeader>
      <div className="flex min-h-0 flex-1 px-8 pb-6">
        <MasterDetail
          list={
            <div className="flex min-h-0 flex-1 flex-col gap-2">
              <NewIdeaInput onCreated={setOpen} />
              <VirtualList
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
                      <NoResults hint={noResultsHint(q, !!(status || tagId || favorite))} onReset={resetFilters} />
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
          detail={
            openRecord.failed ? (
              <RecordLoadError pane onRetry={openRecord.retry} onClose={() => setOpen(null)} />
            ) : open && openIdea?.id === open ? (
              <IdeaDetail key={openIdea.id} idea={openIdea} onClose={() => setOpen(null)} />
            ) : null
          }
        />
      </div>
    </Page>
  )
}
