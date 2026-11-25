import { useMemo, useState, type ReactElement } from 'react'
import { Bookmark as BookmarkIcon, Plus, X } from 'lucide-react'
import { BOOKMARK_KINDS, BOOKMARK_STATUSES, type BookmarkKind, type BookmarkStatus } from '@shared/domain/bookmarks'
import { useApi, useApiMutation, useInfiniteApi } from '@/lib/query'
import { useDebounced } from '@/hooks/use-debounced'
import { accelToKeys, DEFAULT_QUICK_ADD } from '@/app/shortcuts'
import { VirtualList } from '@/components/common/virtual-list'
import { Button } from '@/components/ui/button'
import { Kbd, KbdGroup } from '@/components/ui/kbd'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { EmptyState, FilterBar, FilterChips, Page, PageBody, PageHeader, SearchInput } from '@/components/common/page'
import { TagFilter } from '@/components/common/tags'
import { MasterDetail, useOpenParam } from '@/components/common/master-detail'
import { ImportButton } from '@/components/common/import-dialog'
import { countBy } from '../claude/editor-kit'
import { presentChips } from '../claude/chips'
import { BookmarkDetail } from './bookmark-detail'
import { BookmarkRow } from './bookmark-row'
import { KIND_LABEL, STATUS_LABEL } from './labels'

const ALL_KINDS = '__all'

export function BookmarksPage(): ReactElement | null {
  const [status, setStatus] = useState<BookmarkStatus | undefined>()
  const [kind, setKind] = useState<BookmarkKind | undefined>()
  const [search, setSearch] = useState('')
  const [tagId, setTagId] = useState<string | undefined>()
  const [openId, setOpen] = useOpenParam()
  const q = useDebounced(search.trim())
  const base = { search: q || undefined, tagId }
  // Full list only feeds the chip counters; the rendered list is paged + virtualized.
  const { data: all = [], isPending: allPending } = useApi('bookmarks', 'list', base)
  const list = useInfiniteApi('bookmarks', 'list', { ...base, kind, status })
  const { data: openItem } = useApi('bookmarks', 'get', openId ?? '', { enabled: !!openId })
  const { data: settings } = useApi('settings', 'get')
  const create = useApiMutation('bookmarks', 'create')

  const byKind = kind ? all.filter((b) => b.kind === kind) : all
  const statusCounts = useMemo(() => countBy(byKind, (b) => b.status), [byKind])
  const kindCounts = useMemo(() => countBy(all, (b) => b.kind), [all])
  const usedKinds = BOOKMARK_KINDS.filter((k) => kindCounts[k])

  const filtered = !!(search.trim() || tagId || status || kind)
  // No row of filters over an empty base (it stays while the counts load: nothing jumps).
  const showFilters = allPending || all.length > 0 || filtered
  const resetFilters = (): void => {
    setSearch('')
    setTagId(undefined)
    setStatus(undefined)
    setKind(undefined)
  }
  const addBookmark = async (): Promise<void> => {
    if (create.isPending) return
    const created = await create.mutateAsync({ title: 'Нова закладка', kind: kind ?? 'article', status: status ?? 'queue' })
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
            <Button variant="lime" disabled={create.isPending} onClick={() => void addBookmark().catch(() => undefined)}>
              <Plus /> Закладка
            </Button>
          </>
        }
      >
        {showFilters && (
          <FilterBar
            chips={
              <FilterChips
                allLabel="Усі"
                value={status}
                onChange={setStatus}
                options={presentChips(BOOKMARK_STATUSES, statusCounts, (s) => STATUS_LABEL[s], status)}
              />
            }
            trailing={
              <>
                {(usedKinds.length > 1 || kind) && (
                  <Select value={kind ?? ALL_KINDS} onValueChange={(v) => setKind(v === ALL_KINDS ? undefined : (v as BookmarkKind))}>
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
                <TagFilter value={tagId} onChange={setTagId} />
                <SearchInput value={search} onChange={setSearch} placeholder="Назва, сайт, нотатки" className="w-72" />
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
                  <EmptyState
                    icon={BookmarkIcon}
                    title="Нічого не знайдено"
                    hint={[
                      search.trim() && `За запитом «${search.trim()}» нічого немає.`,
                      (tagId || status || kind) && 'Спробуйте зняти фільтри.'
                    ]
                      .filter(Boolean)
                      .join(' ')}
                    action={
                      <Button variant="soft" onClick={resetFilters}>
                        <X /> Скинути фільтри
                      </Button>
                    }
                  />
                ) : (
                  <EmptyState
                    icon={BookmarkIcon}
                    title="Закладок поки немає"
                    cta={{
                      label: 'Додати закладку',
                      icon: Plus,
                      disabled: create.isPending,
                      onClick: () => void addBookmark().catch(() => undefined)
                    }}
                    hint={
                      <>
                        Збережіть статтю чи курс на потім — тут або з будь-якого екрана через швидке додавання{' '}
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
              renderItem={(b) => <BookmarkRow bookmark={b} active={b.id === openId} onOpen={() => setOpen(b.id)} />}
            />
          }
          detail={openId && openItem ? <BookmarkDetail key={openItem.id} item={openItem} onClose={() => setOpen(null)} /> : null}
        />
      </PageBody>
    </Page>
  )
}
