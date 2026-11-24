import { useState } from 'react'
import { useNavigate } from 'react-router'
import { Component, Plus } from 'lucide-react'
import type { UiComponent } from '@shared/domain/components'
import { useApi, useApiMutation } from '@/lib/query'
import { fileUrl } from '@/lib/files'
import { EmptyState, Page, PageBody, PageHeader, SearchInput } from '@/components/common/page'
import { TagFilter, TagList } from '@/components/common/tags'
import { LivePreview } from '@/components/common/live-preview'
import { Button } from '@/components/ui/button'
import { STARTER } from './starter'

function ComponentTile({ item, onOpen }: { item: UiComponent; onOpen: () => void }) {
  return (
    <button
      type="button"
      onClick={onOpen}
      className="group flex flex-col overflow-hidden rounded-3xl bg-surface text-left transition-shadow hover:ring-1 hover:ring-border"
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
        <span className="absolute top-3 right-3 rounded-full bg-ink px-2.5 py-0.5 text-[11px] font-medium text-ink-foreground uppercase">
          {item.language}
        </span>
      </div>
      <div className="flex flex-col gap-2 p-4">
        <div className="truncate text-[14px] font-medium">{item.title}</div>
        {item.description && <div className="line-clamp-2 text-[12.5px] text-muted-foreground">{item.description}</div>}
        <TagList tags={item.tags} />
      </div>
    </button>
  )
}

export function ComponentsPage() {
  const navigate = useNavigate()
  const [search, setSearch] = useState('')
  const [tagId, setTagId] = useState<string | undefined>()
  const { data: items = [], isLoading } = useApi('components', 'list', { search: search || undefined, tagId })
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
      <PageBody>
        {!isLoading && items.length === 0 ? (
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
        ) : (
          <div className="grid grid-cols-[repeat(auto-fill,minmax(260px,1fr))] gap-3">
            {items.map((c) => (
              <ComponentTile key={c.id} item={c} onOpen={() => navigate(`/components/${c.id}`)} />
            ))}
          </div>
        )}
      </PageBody>
    </Page>
  )
}
