import { useState, type ReactElement } from 'react'
import { Bookmark as BookmarkIcon, Plus } from 'lucide-react'
import {
  BOOKMARK_KINDS,
  BOOKMARK_STATUSES,
  type BookmarkKind,
  type BookmarkStatus
} from '@shared/domain/bookmarks'
import { useApi, useApiMutation, useInfiniteApi, useInPlaceApi } from '@/lib/query'
import { RecordLoadError } from '@/components/common/record-load-error'
import { useDebounced } from '@/hooks/use-debounced'
import { accelToKeys, DEFAULT_QUICK_ADD } from '@/app/shortcuts'
import { VirtualList } from '@/components/common/virtual-list'
import { Button } from '@/components/ui/button'
import { Kbd, KbdGroup } from '@/components/ui/kbd'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select'
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
import { TagFilter } from '@/components/common/tags'
import { FavoriteFilter } from '@/components/common/favorite-filter'
import { MasterDetail, useOpenParam } from '@/components/common/master-detail'
import { ImportButton } from '@/components/common/import-dialog'
import { noResultsHint, presentChips } from '@/components/common/filter-helpers'
import { BookmarkDetail } from './bookmark-detail'
import { BookmarkRow } from './bookmark-row'
import { KIND_LABEL, STATUS_LABEL } from './labels'

const ALL_KINDS = '__all'

export function BookmarksPage(): ReactElement | null {
  const [status, setStatus] = useState<BookmarkStatus | undefined>()
  const [kind, setKind] = useState<BookmarkKind | undefined>()
  const [search, setSearch] = useState('')
  const [tagId, setTagId] = useState<string | undefined>()
  const [favorite, setFavorite] = useState(false)
  const [openId, setOpen] = useOpenParam()
  const q = useDebounced(search.trim())
  const base = { search: q || undefined, tagId, favorite: favorite || undefined }
  // The chip counters are counted by the server: statuses within the chosen kind, kinds over all of them.
  const { data: counts, isPending: countsPending } = useApi('bookmarks', 'counts', {
    ...base,
    kind
  })
  const list = useInfiniteApi('bookmarks', 'list', { ...base, kind, status })
  const openRecord = useInPlaceApi('bookmarks', 'get', openId ?? '', { enabled: !!openId })
  const openItem = openRecord.data
  const { data: settings } = useApi('settings', 'get')
  const create = useApiMutation('bookmarks', 'create')

  const statusCounts = counts?.byStatus ?? {}
  const kindCounts = counts?.byKind ?? {}
  const usedKinds = BOOKMARK_KINDS.filter((k) => kindCounts[k])

  const filtered = !!(search.trim() || tagId || status || kind || favorite)
  // No row of filters over an empty base (it stays while the counts load: nothing jumps).
  const showFilters = countsPending || usedKinds.length > 0 || filtered
  const resetFilters = (): void => {
    setSearch('')
    setTagId(undefined)
    setFavorite(false)
    setStatus(undefined)
    setKind(undefined)
  }
  const addBookmark = async (): Promise<void> => {
    if (create.isPending) return
    const created = await create.mutateAsync({
      title: 'Нова закладка',
      kind: kind ?? 'article',
      status: status ?? 'queue'
    })
    setOpen(created.id)
  }

  return (
    <Page>
      <PageHeader
        title="Закладки"
        subtitle="Статті, відео й курси: що прочитати, що читаю, що вже прочитано."
        actions={
          <>
            <ImportButton kind="bookmark" onImported={(id) => id && setOpen(id)} />
            {/* A failure is toasted by the mutation. */}
            <Button
              variant="lime"
              disabled={create.isPending}
              onClick={() => void addBookmark().catch(() => undefined)}
            >
              <Plus /> Закладка
            </Button>
          </>
        }
      >
        {showFilters && (
          <FilterBar
            chips={
              <FilterChips
                label="Статус"
                allLabel="Усі"
                value={status}
                onChange={setStatus}
                options={presentChips(
                  BOOKMARK_STATUSES,
                  statusCounts,
                  (s) => STATUS_LABEL[s],
                  status
                )}
              />
            }
            trailing={
              <>
                {(usedKinds.length > 1 || kind) && (
                  <Select
                    value={kind ?? ALL_KINDS}
                    onValueChange={(v) =>
                      setKind(v === ALL_KINDS ? undefined : (v as BookmarkKind))
                    }
                  >
                    <SelectTrigger size="sm" className="w-44" aria-label="Тип">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={ALL_KINDS}>Усі типи</SelectItem>
                      {BOOKMARK_KINDS.filter((k) => kindCounts[k] || k === kind).map((k) => (
                        <SelectItem key={k} value={k}>
                          {KIND_LABEL[k]} · {kindCounts[k] ?? 0}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
                <FavoriteFilter type="bookmark" value={favorite} onChange={setFavorite} />
                <TagFilter value={tagId} onChange={setTagId} />
                <SearchInput
                  value={search}
                  onChange={setSearch}
                  placeholder="Назва, сайт, нотатки"
                />
              </>
            }
          />
        )}
      </PageHeader>
      <PageBody className="flex min-h-0 flex-col">
        <MasterDetail
          list={
            <VirtualList
              className="-mx-1 px-1"
              items={list.items}
              loading={list.isLoading}
              getKey={(x) => x.id}
              estimateSize={88}
              hasMore={list.hasMore}
              loadingMore={list.loadingMore}
              onLoadMore={list.loadMore}
              empty={
                !list.isLoading &&
                (filtered ? (
                  <NoResults
                    icon={BookmarkIcon}
                    hint={noResultsHint(search, !!(tagId || status || kind || favorite))}
                    onReset={resetFilters}
                  />
                ) : (
                  <EmptyState
                    illustration="bookmark"
                    title="Закладок поки немає"
                    cta={{
                      label: 'Додати закладку',
                      icon: Plus,
                      disabled: create.isPending,
                      onClick: () => void addBookmark().catch(() => undefined)
                    }}
                    hint={
                      <>
                        Збережіть статтю чи курс на потім — тут або з{' '}
                        {/* Kept whole: the line used to break at the hyphen («з будь-» / «якого екрана»). */}
                        <span className="whitespace-nowrap">будь-якого</span> екрана через швидке
                        додавання{' '}
                        <KbdGroup>
                          {accelToKeys(settings?.quickAddShortcut || DEFAULT_QUICK_ADD).map((k) => (
                            <Kbd key={k}>{k}</Kbd>
                          ))}
                        </KbdGroup>
                        .
                      </>
                    }
                  />
                ))
              }
              renderItem={(b) => (
                <BookmarkRow bookmark={b} active={b.id === openId} onOpen={() => setOpen(b.id)} />
              )}
            />
          }
          detail={
            openRecord.failed ? (
              <RecordLoadError pane onRetry={openRecord.retry} onClose={() => setOpen(null)} />
            ) : openId && openItem ? (
              <BookmarkDetail key={openItem.id} item={openItem} onClose={() => setOpen(null)} />
            ) : null
          }
        />
      </PageBody>
    </Page>
  )
}
