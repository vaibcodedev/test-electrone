import { useEffect, useRef, useState, type ReactElement } from 'react'
import { useNavigate } from 'react-router'
import { AlertTriangle, Component, Plus } from 'lucide-react'
import type { UiComponent } from '@shared/domain/components'
import { useApiMutation, useInfiniteApi } from '@/lib/query'
import { useDebounced } from '@/hooks/use-debounced'
import { fileUrl } from '@/lib/files'
import { mdPreview } from '@/lib/format'
import { clickableProps } from '@/lib/clickable'
import {
  EmptyState,
  FilterBar,
  NoResults,
  Page,
  PageBody,
  PageHeader,
  SearchInput
} from '@/components/common/page'
import { TagFilter, TagList } from '@/components/common/tags'
import { LivePreview } from '@/components/common/live-preview'
import { VirtualGrid } from '@/components/common/virtual-list'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card } from '@/components/ui/card'
import { noResultsHint } from '@/components/common/filter-helpers'

/** Virtual size the live preview renders at; the tile scales it down to fit (same 16:10 aspect). */
const PREVIEW_W = 800
const PREVIEW_H = 500

/** Live preview rendered at a fixed virtual size and scaled to the tile width, centred. */
function ScaledPreview({
  item,
  onStatus
}: {
  item: UiComponent
  onStatus: (s: { ok: boolean; error?: string }) => void
}): ReactElement {
  const box = useRef<HTMLDivElement>(null)
  const [scale, setScale] = useState(0.3)
  useEffect(() => {
    const el = box.current
    if (!el) return
    const ro = new ResizeObserver(([entry]) => setScale(entry.contentRect.width / PREVIEW_W))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  return (
    <div ref={box} className="pointer-events-none absolute inset-0">
      <div
        className="origin-top-left"
        style={{ width: PREVIEW_W, height: PREVIEW_H, transform: `scale(${scale})` }}
      >
        <LivePreview
          code={item.code}
          language={item.language}
          bg={item.previewBg}
          debounce={0}
          showStatus={false}
          // The tile's own badge tells about an error; the sandbox's scaled-down red block would be unreadable.
          quiet
          onStatus={onStatus}
          className="size-full rounded-none ring-0"
        />
      </div>
    </div>
  )
}

/**
 * Gallery tile, equal height for every component: fixed 16:10 preview, one-line description and a
 * tags row that are always reserved. Live preview when there is code; the user's screenshot only
 * when there's nothing to render. Only a failed render is marked — a scaled-down error is unreadable.
 */
function ComponentTile({ item, onOpen }: { item: UiComponent; onOpen: () => void }): ReactElement {
  const [status, setStatus] = useState<{ ok: boolean; error?: string } | null>(null)
  const hasCode = !!item.code.trim()
  return (
    <Card
      {...clickableProps(onOpen)}
      className="group tile h-full min-w-0 gap-0 overflow-hidden p-1.5 text-left"
    >
      <div className="relative aspect-[16/10] overflow-hidden rounded-[18px] bg-card bg-[conic-gradient(var(--surface)_25%,transparent_0_50%,var(--surface)_0_75%,transparent_0)] bg-[length:16px_16px]">
        <div className="absolute inset-0 transition-transform duration-300 group-hover:scale-[1.02]">
          {hasCode ? (
            <ScaledPreview item={item} onStatus={setStatus} />
          ) : item.coverPath ? (
            <img
              src={fileUrl(item.coverPath)}
              alt=""
              className="size-full object-cover"
              loading="lazy"
            />
          ) : (
            <div className="grid size-full place-items-center text-muted-foreground">
              <Component className="size-8" />
            </div>
          )}
        </div>
        {hasCode && status && !status.ok && (
          // Like LivePreview's own status: soft on card, colour only in the icon — readable over any preview.
          <Badge
            variant="soft"
            className="absolute top-2.5 left-2.5 bg-card text-foreground shadow-sm"
            title={status.error}
          >
            <AlertTriangle className="text-destructive" /> Помилка в коді
          </Badge>
        )}
      </div>
      <div className="flex min-w-0 flex-1 flex-col gap-1 px-2.5 pt-3 pb-1.5">
        <div className="flex min-w-0 items-center gap-2">
          <span className="min-w-0 flex-1 truncate text-body font-semibold">{item.title}</span>
          <Badge variant="outline" className="shrink-0 font-normal text-muted-foreground uppercase">
            {item.language}
          </Badge>
        </div>
        <div className="min-h-5 truncate text-caption text-muted-foreground">
          {item.description ? mdPreview(item.description) : ' '}
        </div>
        <div className="mt-auto flex min-h-6 min-w-0 items-center overflow-hidden pt-1">
          <TagList tags={item.tags} max={3} className="flex-nowrap" />
        </div>
      </div>
    </Card>
  )
}

export function ComponentsPage(): ReactElement {
  const navigate = useNavigate()
  const [search, setSearch] = useState('')
  const [tagId, setTagId] = useState<string | undefined>()
  const q = useDebounced(search.trim())
  // Paged + virtualized: live-preview iframes are heavy, so only visible tiles are mounted.
  const list = useInfiniteApi('components', 'list', { search: q || undefined, tagId }, 60)
  const create = useApiMutation('components', 'create')

  // By the debounced query the list was fetched with: right after «Скинути фільтри» the old empty result is
  // still on screen, and the raw input would flash the empty-base state over it.
  const filtered = !!(q || tagId)
  const resetFilters = (): void => {
    setSearch('')
    setTagId(undefined)
  }

  const createNew = async (): Promise<void> => {
    // Enter or a double click while the request is running must not create a second component.
    if (create.isPending) return
    try {
      // No starter code: an untouched component stays a draft and is discarded on leaving (component-page);
      // «Вставити приклад» in the editor fills it on request.
      const c = await create.mutateAsync({ title: 'Новий компонент', code: '', language: 'tsx' })
      void navigate(`/components/${c.id}`)
    } catch {
      // useApiMutation has already shown the error toast; there is nothing to open.
    }
  }

  return (
    <Page>
      <PageHeader
        title="Компоненти"
        subtitle="Код, живе прев’ю й скриншот — щоб готові шматки інтерфейсу завжди були під рукою."
        actions={
          <Button variant="lime" onClick={() => void createNew()} disabled={create.isPending}>
            <Plus /> Компонент
          </Button>
        }
      >
        <FilterBar
          trailing={
            <>
              <TagFilter value={tagId} onChange={setTagId} tone="accent" />
              <SearchInput
                value={search}
                onChange={setSearch}
                placeholder="Пошук за назвою й кодом"
              />
            </>
          }
        />
      </PageHeader>
      <PageBody className="flex min-h-0 flex-col">
        <VirtualGrid
          items={list.items}
          loading={list.isLoading}
          getKey={(c) => c.id}
          minColumnWidth={260}
          rowHeight={290}
          gap={12}
          hasMore={list.hasMore}
          loadingMore={list.loadingMore}
          onLoadMore={list.loadMore}
          renderItem={(c) => (
            <ComponentTile item={c} onOpen={() => navigate(`/components/${c.id}`)} />
          )}
          empty={
            !list.isLoading &&
            !list.isPlaceholderData &&
            (filtered ? (
              <NoResults icon={Component} hint={noResultsHint(q, !!tagId)} onReset={resetFilters} />
            ) : (
              <EmptyState
                icon={Component}
                title="Компонентів поки немає"
                hint="Збережіть кнопку, картку чи цілий блок — прев’ю збереться просто в застосунку."
                cta={{ label: 'Створити компонент', icon: Plus, onClick: () => void createNew() }}
              />
            ))
          }
        />
      </PageBody>
    </Page>
  )
}
