import { useState, type ReactElement } from 'react'
import { useNavigate, useSearchParams } from 'react-router'
import { ListChecks, Plus, Rocket } from 'lucide-react'
import type { Checklist } from '@shared/domain/checklists'
import { useApi, useApiMutation, useInfiniteApi } from '@/lib/query'
import { useDebounced } from '@/hooks/use-debounced'
import { VirtualGrid } from '@/components/common/virtual-list'
import { fmtRelative, mdPreview, plural } from '@/lib/format'
import {
  EmptyState,
  FilterBar,
  NoResults,
  Page,
  PageHeader,
  SearchInput,
  Segmented
} from '@/components/common/page'
import { ProgressLine } from '@/components/common/progress-line'
import { TagFilter, TagList } from '@/components/common/tags'
import { FavoriteFilter } from '@/components/common/favorite-filter'
import { FavoriteMark } from '@/components/common/favorite-mark'
import { ImportButton } from '@/components/common/import-dialog'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardTitle } from '@/components/ui/card'
import { clickableProps } from '@/lib/clickable'
import { noResultsHint } from '../claude/chips'
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
      {...clickableProps(open)}
      // The title is always first and the button pinned to the bottom: titles line up across a row whether a
      // card has a description or not.
      className="group tile h-full min-h-47.5 gap-0 p-5"
    >
      <div className="min-w-0">
        <div className="flex min-w-0 items-start gap-1.5">
          <CardTitle
            title={item.title}
            className="font-display line-clamp-2 min-w-0 text-stat-sm leading-tight font-normal"
          >
            {item.title}
          </CardTitle>
          <FavoriteMark entity={{ type: 'checklist', id: item.id }} className="mt-1.5" />
        </div>
        {item.description && (
          <p className="mt-1 line-clamp-2 text-caption text-muted-foreground">
            {mdPreview(item.description)}
          </p>
        )}
        <TagList tags={item.tags} className="mt-2" />
      </div>
      <div className="mt-auto flex items-center justify-between gap-3 pt-4">
        {/* An empty template would launch a «0 з 0» run: lead straight to the add field instead. */}
        <Button
          variant="subtle"
          size="sm"
          onClick={(e) => {
            e.stopPropagation()
            if (item.total === 0) void navigate(`/checklists/${item.id}?add=1`)
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
        {item.total > 0 && (
          <span className="shrink-0 text-meta text-muted-foreground tabular-nums">
            {item.total} {plural(item.total, ['пункт', 'пункти', 'пунктів'])}
          </span>
        )}
      </div>
    </Card>
  )
}

function RunCard({ item }: { item: Checklist }) {
  const navigate = useNavigate()
  const open = (): void => {
    void navigate(`/checklists/${item.id}`)
  }
  const complete = item.total > 0 && item.done === item.total
  return (
    <Card {...clickableProps(open)} className="tile h-full min-h-37.5 gap-0 p-5">
      <div className="flex min-w-0 items-start gap-1.5">
        <CardTitle
          title={item.title}
          className="font-display line-clamp-2 min-w-0 text-stat-sm leading-tight font-normal"
        >
          {item.title}
        </CardTitle>
        <FavoriteMark entity={{ type: 'checklist', id: item.id }} className="mt-1.5" />
      </div>
      <div className="mt-auto flex flex-col gap-2 pt-4">
        <div className="flex items-center justify-between gap-2">
          <Badge variant={complete ? 'success' : 'info'}>{complete ? 'Готово' : 'У процесі'}</Badge>
          <span className="min-w-0 truncate text-meta text-muted-foreground">
            {fmtRelative(item.updatedAt)}
          </span>
        </div>
        {item.total > 0 ? (
          <ProgressLine value={item.done} total={item.total} />
        ) : (
          <span className="text-caption text-muted-foreground">Поки без пунктів</span>
        )}
      </div>
    </Card>
  )
}

export function ChecklistsPage() {
  const [params, setParams] = useSearchParams()
  const tab: Tab = params.get('tab') === 'runs' ? 'run' : 'template'
  const [search, setSearch] = useState('')
  const [tagId, setTagId] = useState<string | undefined>()
  const [favorite, setFavorite] = useState(false)
  const [launch, setLaunch] = useState<{ id: string; title: string } | null>(null)
  const navigate = useNavigate()
  const q = useDebounced(search.trim())
  const filtered = !!(q || tagId || favorite)
  const page = useInfiniteApi('checklists', 'list', {
    kind: tab,
    search: q || undefined,
    tagId,
    favorite: favorite || undefined
  })
  const { data: counts } = useApi('checklists', 'counts')
  const create = useApiMutation('checklists', 'create', {
    onSuccess: (c) => navigate(`/checklists/${c.id}`)
  })

  return (
    <Page>
      <PageHeader
        title="Чек-листи"
        subtitle="Шаблони для повторюваних процесів: запуск магазину, деплой, SEO. Кожен запуск — окремий прогін."
        actions={
          <>
            <ImportButton
              kind="checklist"
              onImported={(id) => id && navigate(`/checklists/${id}`)}
            />
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
        <FilterBar
          chips={
            <Segmented<Tab>
              options={[
                { value: 'template', label: <TabLabel label="Шаблони" count={counts?.template} /> },
                { value: 'run', label: <TabLabel label="Прогони" count={counts?.run} /> }
              ]}
              value={tab}
              onChange={(v) => setParams(v === 'run' ? { tab: 'runs' } : {}, { replace: true })}
            />
          }
          trailing={
            <>
              <FavoriteFilter type="checklist" value={favorite} onChange={setFavorite} />
              <TagFilter value={tagId} onChange={setTagId} />
              <SearchInput value={search} onChange={setSearch} placeholder="Пошук чек-листів" />
            </>
          }
        />
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
            !page.isLoading &&
            (filtered ? (
              <NoResults
                hint={noResultsHint(q, !!(tagId || favorite))}
                onReset={() => {
                  setSearch('')
                  setTagId(undefined)
                  setFavorite(false)
                }}
              />
            ) : tab === 'template' ? (
              <EmptyState
                icon={ListChecks}
                title="Шаблонів поки немає"
                hint="Створіть шаблон — список кроків, який ви повторюєте від проєкту до проєкту."
                cta={{
                  label: 'Створити шаблон',
                  icon: Plus,
                  disabled: create.isPending,
                  onClick: () => create.mutate({ title: 'Новий чек-лист', kind: 'template' })
                }}
              />
            ) : (
              <EmptyState
                icon={ListChecks}
                title="Прогонів поки немає"
                hint="Відкрийте шаблон і натисніть «Запустити» — з’явиться прогін, у якому можна ставити галочки."
                cta={{ label: 'До шаблонів', onClick: () => setParams({}, { replace: true }) }}
              />
            ))
          }
        />
      </div>
      <LaunchDialog template={launch} open={!!launch} onOpenChange={(o) => !o && setLaunch(null)} />
    </Page>
  )
}
