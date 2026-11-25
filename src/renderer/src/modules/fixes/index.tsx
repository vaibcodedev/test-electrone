import { useState, type ReactElement } from 'react'
import { Bug, CircleCheck, Plus } from 'lucide-react'
import { fixInputSchema, type Fix, type FixPatch } from '@shared/domain/fixes'
import { limitsOf } from '@/lib/limits'
import { useApi, useApiMutation, useInfiniteApi } from '@/lib/query'
import { useDebounced } from '@/hooks/use-debounced'
import { VirtualList } from '@/components/common/virtual-list'
import { fmtRelative } from '@/lib/format'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Toggle } from '@/components/ui/toggle'
import {
  EmptyState,
  FilterBar,
  FilterChips,
  NoResults,
  Page,
  PageBody,
  PageHeader,
  SearchInput
} from '@/components/common/page'
import { useReadOnly } from '@/components/common/detail-mode-context'
import { EditHintText } from '@/components/common/detail-mode'
import { TextField } from '@/components/common/text-field'
import { ShowMore } from '@/components/common/show-more'
import { toastTrashed } from '@/components/common/trash-toast'
import { noResultsHint, presentChips } from '@/components/common/filter-helpers'
import { TagFilter, TagList } from '@/components/common/tags'
import { FavoriteFilter } from '@/components/common/favorite-filter'
import { FavoriteMark } from '@/components/common/favorite-mark'
import {
  DetailPane,
  EntityAside,
  ListItem,
  MasterDetail,
  useOpenParam
} from '@/components/common/master-detail'
import { AutoCode, AutoMarkdown, AutoTitle, Block, EditorStack } from '../claude/editor-kit'

const LIMITS = limitsOf(fixInputSchema)

type ResolvedFilter = 'open' | 'resolved'

function firstLine(text: string): string {
  return (
    text
      .split('\n')
      .find((l) => l.trim())
      ?.trim() ?? ''
  )
}

/**
 * Reading: a long stack trace folds, so «Причина» and the solution — what the record is opened for — stay in
 * view. A single long line with wraps counts too, hence the length check. Editing shows the whole field.
 */
function ErrorTextField({
  fix,
  save
}: {
  fix: Fix
  save: (patch: FixPatch) => void
}): ReactElement {
  const readOnly = useReadOnly()
  const long = fix.errorText.length > 800 || fix.errorText.split('\n').length > 10
  return (
    <Block label="Текст помилки">
      <ShowMore
        enabled={readOnly && long}
        collapsedClass="max-h-56 overflow-hidden mask-[linear-gradient(to_bottom,black_75%,transparent)]"
        moreLabel="Показати весь текст"
      >
        <AutoCode
          value={fix.errorText}
          onSave={(errorText) => save({ errorText })}
          language="text"
          lineNumbers={false}
          minHeight="90px"
          placeholder="Вставте повідомлення або стек помилки"
          maxLength={LIMITS.errorText}
        />
      </ShowMore>
    </Block>
  )
}

function FixDetail({ fix, onClose }: { fix: Fix; onClose: () => void }): ReactElement {
  const update = useApiMutation('fixes', 'update')
  // The toast's «Скасувати» brings a missed click on the trash straight back.
  const remove = useApiMutation('fixes', 'remove', {
    onSuccess: (_r, id) => toastTrashed('Помилку переміщено в кошик', { type: 'fix', id })
  })
  const save = (patch: FixPatch): void => update.mutate({ id: fix.id, patch })
  const entity = { type: 'fix' as const, id: fix.id }

  return (
    <DetailPane
      entity={entity}
      onClose={onClose}
      onDelete={() => {
        remove.mutate(fix.id)
        onClose()
      }}
      emptyHint={
        <>
          Тексту помилки й рішення ще немає. <EditHintText />
        </>
      }
      headerExtra={
        // Like «Працює» in Claude: an action while off, a success tint (not an ink inversion) once pressed.
        <Toggle
          size="sm"
          variant="status"
          pressed={fix.resolved}
          onPressedChange={(resolved) => save({ resolved })}
        >
          <CircleCheck />
          {fix.resolved ? 'Вирішено' : 'Позначити вирішеною'}
        </Toggle>
      }
      aside={
        <EntityAside
          entity={entity}
          tags={fix.tags}
          onTagsChange={(tagIds) => save({ tagIds })}
          createdAt={fix.createdAt}
          updatedAt={fix.updatedAt}
        >
          <TextField
            label="Де сталося"
            value={fix.context}
            onSave={(context) => save({ context })}
            maxLength={LIMITS.context}
            placeholder="Hydrogen, Vite, Electron…"
          />
        </EntityAside>
      }
    >
      <EditorStack>
        <AutoTitle
          value={fix.title}
          onSave={(title) => save({ title })}
          placeholder="Що зламалося"
          maxLength={LIMITS.title}
        />
        <ErrorTextField fix={fix} save={save} />
        <AutoMarkdown
          label="Причина"
          value={fix.cause}
          onSave={(cause) => save({ cause })}
          placeholder="Чому так сталося"
          maxLength={LIMITS.cause}
          minHeight="100px"
        />
        <AutoMarkdown
          label="Рішення"
          value={fix.solution}
          onSave={(solution) => save({ solution })}
          placeholder="Кроки, команди, код виправлення"
          maxLength={LIMITS.solution}
          minHeight="180px"
        />
      </EditorStack>
    </DetailPane>
  )
}

export function FixesPage(): ReactElement {
  const [search, setSearch] = useState('')
  const [tagId, setTagId] = useState<string | undefined>()
  const [favorite, setFavorite] = useState(false)
  const [resolved, setResolved] = useState<ResolvedFilter | undefined>()
  const [openId, setOpen] = useOpenParam()
  const q = useDebounced(search.trim())
  const base = { search: q || undefined, tagId, favorite: favorite || undefined }
  // Chip counters come from the server under the same search and tag; the rendered list is paged + virtualized.
  const { data: stateCounts } = useApi('fixes', 'counts', base)
  const list = useInfiniteApi('fixes', 'list', {
    ...base,
    resolved: resolved ? resolved === 'resolved' : undefined
  })
  const { data: openItem } = useApi('fixes', 'get', openId ?? '', { enabled: !!openId })
  const create = useApiMutation('fixes', 'create')

  const stateChips = presentChips(
    ['open', 'resolved'] as const,
    { open: stateCounts?.open ?? 0, resolved: stateCounts?.resolved ?? 0 },
    (v) => (v === 'open' ? 'Не вирішено' : 'Вирішено'),
    resolved
  )
  // By the debounced query the list was fetched with (see the empty state below).
  const filtered = !!(q || tagId || resolved || favorite)
  const resetFilters = (): void => {
    setSearch('')
    setTagId(undefined)
    setFavorite(false)
    setResolved(undefined)
  }

  const createNew = async (): Promise<void> => {
    if (create.isPending) return
    try {
      const created = await create.mutateAsync({ title: 'Нова помилка', resolved: false })
      setOpen(created.id)
    } catch {
      // useApiMutation has already shown the error toast; there is nothing to open.
    }
  }

  return (
    <Page>
      <PageHeader
        title="Помилки й рішення"
        subtitle="Що зламалося і як це виправити — щоб удруге не шукати."
        actions={
          <Button variant="lime" onClick={() => void createNew()} disabled={create.isPending}>
            <Plus /> Помилка
          </Button>
        }
      >
        <FilterBar
          chips={
            stateChips.length > 0 && (
              <FilterChips
                allLabel="Усі"
                value={resolved}
                onChange={setResolved}
                options={stateChips}
              />
            )
          }
          trailing={
            <>
              <FavoriteFilter type="fix" value={favorite} onChange={setFavorite} />
              <TagFilter value={tagId} onChange={setTagId} />
              <SearchInput
                value={search}
                onChange={setSearch}
                placeholder="Текст помилки або рішення"
              />
            </>
          }
        />
      </PageHeader>
      <PageBody className="flex min-h-0 flex-col">
        <MasterDetail
          list={
            <VirtualList
              className="-mx-1 px-1"
              items={list.items}
              loading={list.isLoading}
              getKey={(x) => x.id}
              estimateSize={76}
              hasMore={list.hasMore}
              loadingMore={list.loadingMore}
              onLoadMore={list.loadMore}
              empty={
                // Not over a placeholder page (keepPreviousData): no flash of the empty-base state after a reset.
                !list.isLoading &&
                !list.isPlaceholderData &&
                (filtered ? (
                  <NoResults
                    icon={Bug}
                    hint={noResultsHint(q, !!(tagId || resolved || favorite))}
                    onReset={resetFilters}
                  />
                ) : (
                  <EmptyState
                    icon={Bug}
                    title="Помилок поки немає"
                    hint="Запишіть наступну помилку разом із рішенням, і пошук знайде її за півроку."
                    cta={{ label: 'Записати помилку', icon: Plus, onClick: () => void createNew() }}
                  />
                ))
              }
              renderItem={(f) => {
                const active = f.id === openId
                const line = firstLine(f.errorText)
                return (
                  <ListItem active={active} onClick={() => setOpen(f.id)}>
                    {/* Height follows content: title line, optional error line, one meta line (status · place · tags … time).
                        Only the unresolved state is marked: as a badge, not a coloured dot (docs/design-system.md → Чипы и строки). */}
                    <div className="flex min-w-0 items-center gap-1.5">
                      <span className="truncate text-body font-medium">{f.title}</span>
                      <FavoriteMark entity={{ type: 'fix', id: f.id }} onInk={active} />
                    </div>
                    {line && (
                      <div
                        className={cn(
                          'mt-1 truncate font-mono text-meta',
                          active ? 'text-ink-muted' : 'text-muted-foreground'
                        )}
                      >
                        {line}
                      </div>
                    )}
                    <div className="mt-1.5 flex min-w-0 items-center gap-1.5">
                      {!f.resolved && (
                        <Badge
                          variant={active ? 'soft' : 'destructive'}
                          className={cn(
                            'h-5 shrink-0',
                            active && 'bg-ink-foreground/12 text-ink-foreground'
                          )}
                        >
                          Не вирішено
                        </Badge>
                      )}
                      {f.context && (
                        <Badge
                          variant="outline"
                          truncate
                          className={cn(
                            'h-5 max-w-40',
                            active && 'border-ink-foreground/20 text-ink-foreground'
                          )}
                        >
                          {f.context}
                        </Badge>
                      )}
                      <div className="flex min-w-0 flex-1 overflow-hidden">
                        <TagList tags={f.tags} max={2} className="flex-nowrap" />
                      </div>
                      <span
                        className={cn(
                          'ml-auto shrink-0 text-meta whitespace-nowrap',
                          active ? 'text-ink-muted' : 'text-muted-foreground'
                        )}
                      >
                        {fmtRelative(f.updatedAt)}
                      </span>
                    </div>
                  </ListItem>
                )
              }}
            />
          }
          detail={
            openId && openItem ? (
              <FixDetail key={openItem.id} fix={openItem} onClose={() => setOpen(null)} />
            ) : null
          }
        />
      </PageBody>
    </Page>
  )
}
