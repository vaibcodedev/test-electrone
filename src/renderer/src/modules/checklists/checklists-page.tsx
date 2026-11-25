import { useState, type ReactElement } from 'react'
import { useNavigate, useSearchParams } from 'react-router'
import { ListChecks, Plus, Rocket } from 'lucide-react'
import type { Checklist } from '@shared/domain/checklists'
import { useApi, useApiMutation, useInfiniteApi } from '@/lib/query'
import { useDebounced } from '@/hooks/use-debounced'
import { VirtualGrid } from '@/components/common/virtual-list'
import { fmtRelative, mdPreview, plural } from '@/lib/format'
import { EmptyState, Page, PageHeader, SearchInput, SegmentBar, Segmented } from '@/components/common/page'
import { TagFilter, TagList } from '@/components/common/tags'
import { ImportButton } from '@/components/common/import-dialog'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Progress } from '@/components/ui/progress'
import { LaunchDialog } from './launch-dialog'

type Tab = 'template' | 'run'

function TabLabel({ label, count }: { label: string; count?: number }): ReactElement {
  return (
    <>
      {label}
      {count !== undefined && <span className="text-muted-foreground tabular-nums">{count}</span>}
    </>
  )
}

function TemplateCard({ item, onLaunch }: { item: Checklist; onLaunch: () => void }) {
  const navigate = useNavigate()
  const open = (): void => {
    void navigate(`/checklists/${item.id}`)
  }
  return (
    <Card
      role="button"
      tabIndex={0}
      onClick={open}
      onKeyDown={(e) => e.key === 'Enter' && open()}
      // Fixed order top-down (count → title → description), button pinned to the bottom: titles line up
      // across a row whether a card has a description or not.
      className="group tile h-full min-h-[190px] gap-0 p-5"
    >
      <span className="text-caption text-muted-foreground tabular-nums">
        {item.total} {plural(item.total, ['пункт', 'пункти', 'пунктів'])}
      </span>
      <div className="mt-3 min-w-0">
        <div title={item.title} className="font-display line-clamp-2 text-stat-sm leading-tight">
          {item.title}
        </div>
        {item.description && (
          <p className="mt-1 line-clamp-2 text-caption text-muted-foreground">{mdPreview(item.description)}</p>
        )}
        <TagList tags={item.tags} className="mt-2" />
      </div>
      <div className="mt-auto pt-4">
        {/* An empty template would launch a «0 з 0» run: lead to adding items instead. */}
        <Button
          variant="subtle"
          size="sm"
          onClick={(e) => {
            e.stopPropagation()
            if (item.total === 0) open()
            else onLaunch()
          }}
        >
          {item.total === 0 ? (
            <>
              <Plus /> Додати пункти
            </>
          ) : (
            <>
              <Rocket /> Запустити
            </>
          )}
        </Button>
      </div>
    </Card>
  )
}

/** Up to this many items a run's bar has one segment per item (docs/design-system.md → Прогресс). */
const SEGMENTS_MAX = 8

function RunCard({ item }: { item: Checklist }) {
  const navigate = useNavigate()
  const open = (): void => {
    void navigate(`/checklists/${item.id}`)
  }
  const complete = item.total > 0 && item.done === item.total
  return (
    <Card
      role="button"
      tabIndex={0}
      onClick={open}
      onKeyDown={(e) => e.key === 'Enter' && open()}
      className="tile h-full min-h-[150px] gap-0 p-5"
    >
      <div className="flex items-center gap-2">
        <Badge variant={complete ? 'success' : 'info'}>{complete ? 'Готово' : 'У процесі'}</Badge>
        <span className="min-w-0 truncate text-meta text-muted-foreground">{fmtRelative(item.updatedAt)}</span>
      </div>
      <div title={item.title} className="mt-3 line-clamp-2 text-lead font-medium">
        {item.title}
      </div>
      <div className="mt-auto flex flex-col gap-1.5 pt-4">
        {item.total > 0 &&
          (item.total <= SEGMENTS_MAX ? (
            <SegmentBar value={item.done} total={item.total} segments={item.total} />
          ) : (
            <Progress value={(item.done / item.total) * 100} className="h-1.5" />
          ))}
        <span className="min-w-0 truncate text-meta text-muted-foreground">
          {item.total ? `Готово ${item.done} з ${item.total}` : 'Поки без пунктів'}
        </span>
      </div>
    </Card>
  )
}

export function ChecklistsPage() {
  const [params, setParams] = useSearchParams()
  const tab: Tab = params.get('tab') === 'runs' ? 'run' : 'template'
  const [search, setSearch] = useState('')
  const [tagId, setTagId] = useState<string | undefined>()
  const [launch, setLaunch] = useState<{ id: string; title: string } | null>(null)
  const navigate = useNavigate()
  const q = useDebounced(search.trim())
  const page = useInfiniteApi('checklists', 'list', { kind: tab, search: q || undefined, tagId })
  const { data: counts } = useApi('checklists', 'counts')
  const create = useApiMutation('checklists', 'create', {
    onSuccess: (c) => navigate(`/checklists/${c.id}`)
  })

  return (
    <Page>
      <PageHeader
        title="Чек-листи"
        subtitle="Шаблони для повторюваних процесів: запуск магазину, деплой, SEO. Кожен запуск — окремий прогін із галочками."
        actions={
          <>
            <ImportButton kind="checklist" onImported={(id) => id && navigate(`/checklists/${id}`)} />
            <Button
              variant="lime"
              disabled={create.isPending}
              onClick={() => create.mutate({ title: 'Новий чек-лист', kind: 'template' })}
            >
              <Plus /> Шаблон
            </Button>
          </>
        }
      >
        <div className="flex flex-wrap items-center gap-3">
          <Segmented<Tab>
            options={[
              { value: 'template', label: <TabLabel label="Шаблони" count={counts?.template} /> },
              { value: 'run', label: <TabLabel label="Прогони" count={counts?.run} /> }
            ]}
            value={tab}
            onChange={(v) => setParams(v === 'run' ? { tab: 'runs' } : {}, { replace: true })}
          />
          <div className="ml-auto flex items-center gap-2">
            <TagFilter value={tagId} onChange={setTagId} />
            <SearchInput value={search} onChange={setSearch} placeholder="Пошук чек-листів" className="w-64" />
          </div>
        </div>
      </PageHeader>
      <div className="flex min-h-0 flex-1 flex-col px-8 pb-6">
        <VirtualGrid
          items={page.items}
          loading={page.isLoading}
          getKey={(c) => c.id}
          minColumnWidth={260}
          rowHeight={tab === 'template' ? 200 : 160}
          hasMore={page.hasMore}
          loadingMore={page.loadingMore}
          onLoadMore={page.loadMore}
          renderItem={(c) =>
            tab === 'template' ? (
              <TemplateCard item={c} onLaunch={() => setLaunch({ id: c.id, title: c.title })} />
            ) : (
              <RunCard item={c} />
            )
          }
          empty={
            !page.isLoading && (
              <EmptyState
                icon={ListChecks}
                title={search || tagId ? 'Нічого не знайдено' : tab === 'template' ? 'Шаблонів немає' : 'Прогонів поки немає'}
                hint={
                  search || tagId
                    ? undefined
                    : tab === 'template'
                      ? 'Створіть шаблон — список кроків, який ви повторюєте від проєкту до проєкту.'
                      : 'Відкрийте шаблон і натисніть «Запустити» — зʼявиться прогін, у якому можна ставити галочки.'
                }
              />
            )
          }
        />
      </div>
      <LaunchDialog template={launch} open={!!launch} onOpenChange={(o) => !o && setLaunch(null)} />
    </Page>
  )
}
