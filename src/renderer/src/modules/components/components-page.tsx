import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router'
import { Component, Plus } from 'lucide-react'
import type { UiComponent } from '@shared/domain/components'
import { useApiMutation, useInfiniteApi } from '@/lib/query'
import { useDebounced } from '@/hooks/use-debounced'
import { fileUrl } from '@/lib/files'
import { mdPreview } from '@/lib/format'
import { EmptyState, Page, PageBody, PageHeader, SearchInput } from '@/components/common/page'
import { TagFilter, TagList } from '@/components/common/tags'
import { LivePreview } from '@/components/common/live-preview'
import { VirtualGrid } from '@/components/common/virtual-list'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card } from '@/components/ui/card'
import { STARTER } from './starter'

/** Virtual size the live preview renders at; the tile scales it down to fit (same 16:10 aspect). */
const PREVIEW_W = 800
const PREVIEW_H = 500

/** Live preview rendered at a fixed virtual size and scaled to the tile width, centred. */
function ScaledPreview({ item, onStatus }: { item: UiComponent; onStatus: (s: { ok: boolean; error?: string }) => void }) {
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
      <div className="origin-top-left" style={{ width: PREVIEW_W, height: PREVIEW_H, transform: `scale(${scale})` }}>
        <LivePreview
          code={item.code}
          language={item.language}
          bg={item.previewBg}
          debounce={0}
          showStatus={false}
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
function ComponentTile({ item, onOpen }: { item: UiComponent; onOpen: () => void }) {
  const [status, setStatus] = useState<{ ok: boolean; error?: string } | null>(null)
  const hasCode = !!item.code.trim()
  return (
    <Card
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), onOpen())}
      className="group tile h-full min-w-0 gap-0 overflow-hidden p-1.5 text-left"
    >
      <div className="relative aspect-[16/10] overflow-hidden rounded-[18px] bg-card bg-[conic-gradient(var(--surface)_25%,transparent_0_50%,var(--surface)_0_75%,transparent_0)] bg-[length:16px_16px]">
        <div className="absolute inset-0 transition-transform duration-300 group-hover:scale-[1.02]">
          {hasCode ? (
            <ScaledPreview item={item} onStatus={setStatus} />
          ) : item.coverPath ? (
            <img src={fileUrl(item.coverPath)} alt="" className="size-full object-cover" loading="lazy" />
          ) : (
            <div className="grid size-full place-items-center text-muted-foreground">
              <Component className="size-8" />
            </div>
          )}
        </div>
        {hasCode && status && !status.ok && (
          // A card under the tinted badge: it stays readable over a white, dark or grid preview.
          <span className="absolute top-2.5 left-2.5 rounded-full bg-card">
            <Badge variant="destructive" title={status.error}>
              Помилка в коді
            </Badge>
          </span>
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

export function ComponentsPage() {
  const navigate = useNavigate()
  const [search, setSearch] = useState('')
  const [tagId, setTagId] = useState<string | undefined>()
  const q = useDebounced(search.trim())
  // Paged + virtualized: live-preview iframes are heavy, so only visible tiles are mounted.
  const list = useInfiniteApi('components', 'list', { search: q || undefined, tagId }, 60)
  const create = useApiMutation('components', 'create')

  const createNew = async (): Promise<void> => {
    const c = await create.mutateAsync({ title: 'Новий компонент', code: STARTER.tsx, language: 'tsx' })
    navigate(`/components/${c.id}`)
  }

  return (
    <Page>
      <PageHeader
        title="Компоненти"
        subtitle="Код, живе превʼю й скриншот — щоб готові шматки інтерфейсу завжди були під рукою."
        actions={
          <Button variant="lime" onClick={() => void createNew()} disabled={create.isPending}>
            <Plus /> Новий компонент
          </Button>
        }
      >
        {/* Same place as on the other lists: «Мітка» and search on the right. */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="ml-auto flex items-center gap-2">
            <TagFilter value={tagId} onChange={setTagId} />
            <SearchInput value={search} onChange={setSearch} placeholder="Пошук за назвою й кодом" className="w-64" />
          </div>
        </div>
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
          renderItem={(c) => <ComponentTile item={c} onOpen={() => navigate(`/components/${c.id}`)} />}
          empty={
            !list.isLoading && (
              <EmptyState
                icon={Component}
                title={search || tagId ? 'Нічого не знайдено' : 'Компонентів поки немає'}
                hint="Збережіть кнопку, картку чи цілий блок — превʼю збереться просто в застосунку."
                action={
                  !search &&
                  !tagId && (
                    <Button variant="soft" onClick={() => void createNew()} disabled={create.isPending}>
                      <Plus /> Створити компонент
                    </Button>
                  )
                }
              />
            )
          }
        />
      </PageBody>
    </Page>
  )
}
