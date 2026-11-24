import { useState } from 'react'
import { useNavigate } from 'react-router'
import { Component, Plus } from 'lucide-react'
import type { UiComponent } from '@shared/domain/components'
import { useApiMutation, useInfiniteApi } from '@/lib/query'
import { useDebounced } from '@/hooks/use-debounced'
import { fileUrl } from '@/lib/files'
import { EmptyState, Page, PageBody, PageHeader, SearchInput } from '@/components/common/page'
import { TagFilter, TagList } from '@/components/common/tags'
import { LivePreview } from '@/components/common/live-preview'
import { VirtualGrid } from '@/components/common/virtual-list'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { STARTER } from './starter'

function ComponentTile({ item, onOpen }: { item: UiComponent; onOpen: () => void }) {
  return (
    <Card
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), onOpen())}
      className="group cursor-pointer gap-0 overflow-hidden py-0 text-left transition-shadow outline-none hover:ring-1 hover:ring-border focus-visible:ring-[3px] focus-visible:ring-ring/40"
    >
      <div className="relative h-48 overflow-hidden bg-card">
        {item.coverPath ? (
          <img src={fileUrl(item.coverPath)} alt="" className="size-full object-cover" loading="lazy" />
        ) : item.code.trim() ? (
          // Non-interactive thumbnail: the iframe renders, clicks go to the tile.
          <div className="pointer-events-none size-full">
            <LivePreview code={item.code} language={item.language} bg={item.previewBg} debounce={0} className="size-full rounded-none ring-0" />
          </div>
        ) : (
          <div className="grid size-full place-items-center text-muted-foreground">
            <Component className="size-8" />
          </div>
        )}
        <Badge variant="ink" className="absolute top-3 right-3 uppercase">
          {item.language}
        </Badge>
      </div>
      <CardContent className="flex flex-col gap-2 p-4">
        <div className="truncate text-[14px] font-medium">{item.title}</div>
        {item.description && <div className="line-clamp-2 text-[12.5px] text-muted-foreground">{item.description}</div>}
        <TagList tags={item.tags} />
      </CardContent>
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
    const c = await create.mutateAsync({ title: 'Новый компонент', code: STARTER.tsx, language: 'tsx' })
    navigate(`/components/${c.id}`)
  }

  return (
    <Page>
      <PageHeader
        title="Компоненты"
        subtitle="Код, живое превью и скриншот — чтобы готовые куски интерфейса всегда были под рукой."
        actions={
          <Button variant="lime" onClick={() => void createNew()} disabled={create.isPending}>
            <Plus /> Новый компонент
          </Button>
        }
      >
        <div className="flex items-center gap-2">
          <SearchInput value={search} onChange={setSearch} placeholder="Поиск по названию и коду" className="w-80" />
          <TagFilter value={tagId} onChange={setTagId} />
        </div>
      </PageHeader>
      <PageBody className="flex min-h-0 flex-col">
        <VirtualGrid
          items={list.items}
          getKey={(c) => c.id}
          minColumnWidth={260}
          rowHeight={300}
          gap={12}
          hasMore={list.hasMore}
          loadingMore={list.loadingMore}
          onLoadMore={list.loadMore}
          renderItem={(c) => <ComponentTile item={c} onOpen={() => navigate(`/components/${c.id}`)} />}
          empty={
            !list.isLoading && (
              <EmptyState
                icon={Component}
                title={search || tagId ? 'Ничего не найдено' : 'Компонентов пока нет'}
                hint="Сохраните кнопку, карточку или целый блок — превью соберётся прямо в приложении."
                action={
                  !search &&
                  !tagId && (
                    <Button variant="lime" onClick={() => void createNew()}>
                      <Plus /> Создать первый
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
