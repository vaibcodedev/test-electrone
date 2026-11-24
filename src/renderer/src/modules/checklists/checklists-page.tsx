import { useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router'
import { ArrowUpRight, ListChecks, Plus, Rocket } from 'lucide-react'
import type { Checklist } from '@shared/domain/checklists'
import { useApi, useApiMutation } from '@/lib/query'
import { fmtRelative, plural } from '@/lib/format'
import {
  EmptyState,
  FilterChips,
  Page,
  PageBody,
  PageHeader,
  SearchInput,
  SegmentBar
} from '@/components/common/page'
import { TagFilter, TagList } from '@/components/common/tags'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Item } from '@/components/ui/item'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { cn } from '@/lib/utils'
import { LaunchDialog } from './launch-dialog'

type Tab = 'template' | 'run'

function TemplateCard({ item, onLaunch }: { item: Checklist; onLaunch: () => void }) {
  const navigate = useNavigate()
  return (
    <Card
      role="button"
      tabIndex={0}
      onClick={() => navigate(`/checklists/${item.id}`)}
      onKeyDown={(e) => e.key === 'Enter' && navigate(`/checklists/${item.id}`)}
      className="group min-h-[190px] cursor-pointer justify-between gap-0 p-5 transition-colors hover:bg-accent"
    >
      <div className="flex items-start justify-between gap-3">
        <Avatar className="size-10">
          <AvatarFallback className="bg-card">
            <ListChecks className="size-4" />
          </AvatarFallback>
        </Avatar>
        <span className="text-[12px] text-muted-foreground tabular-nums">
          {item.total} {plural(item.total, ['пункт', 'пункта', 'пунктов'])}
        </span>
      </div>
      <div>
        <div className="font-display text-[22px] leading-tight">{item.title}</div>
        {item.description && (
          <p className="mt-1 line-clamp-2 text-[12.5px] text-muted-foreground">
            {item.description}
          </p>
        )}
        <TagList tags={item.tags} className="mt-2" />
        <Button
          variant="default"
          size="sm"
          className="mt-4"
          onClick={(e) => {
            e.stopPropagation()
            onLaunch()
          }}
        >
          <Rocket /> Запустить
        </Button>
      </div>
    </Card>
  )
}

function RunCard({ item }: { item: Checklist }) {
  const navigate = useNavigate()
  const complete = item.total > 0 && item.done === item.total
  return (
    <Item
      asChild
      className={cn(
        'group min-h-[150px] flex-col flex-nowrap items-stretch justify-between rounded-3xl p-5 text-left',
        complete ? 'bg-lime text-lime-foreground' : 'bg-ink text-ink-foreground'
      )}
    >
      <button type="button" onClick={() => navigate(`/checklists/${item.id}`)}>
        <div className="flex items-start justify-between gap-3">
          <span className={cn('text-[12px]', complete ? 'opacity-70' : 'text-ink-muted')}>
            {complete ? 'Готово' : 'В процессе'} · {fmtRelative(item.updatedAt)}
          </span>
          <ArrowUpRight className="size-4 opacity-60 transition-transform group-hover:rotate-45" />
        </div>
        <div>
          <div className="truncate text-[16px] font-medium">{item.title}</div>
          <div className="mt-3 flex items-center gap-3">
            <SegmentBar
              value={item.done}
              total={Math.max(1, item.total)}
              segments={Math.min(8, Math.max(3, item.total))}
              tone={complete ? 'ink' : 'lime'}
              className="flex-1"
            />
            <span className="text-[12px] tabular-nums">
              {item.done}/{item.total}
            </span>
          </div>
        </div>
      </button>
    </Item>
  )
}

export function ChecklistsPage() {
  const [params, setParams] = useSearchParams()
  const tab: Tab = params.get('tab') === 'runs' ? 'run' : 'template'
  const [search, setSearch] = useState('')
  const [tagId, setTagId] = useState<string | undefined>()
  const [launch, setLaunch] = useState<{ id: string; title: string } | null>(null)
  const navigate = useNavigate()
  const { data: list = [] } = useApi('checklists', 'list', {
    kind: tab,
    search: search || undefined,
    tagId
  })
  const { data: counts } = useApi('checklists', 'list')
  const create = useApiMutation('checklists', 'create', {
    onSuccess: (c) => navigate(`/checklists/${c.id}`)
  })
  const templates = counts?.filter((c) => c.kind === 'template').length
  const runs = counts?.filter((c) => c.kind === 'run').length

  return (
    <Page>
      <PageHeader
        title="Чек-листы"
        subtitle="Шаблоны для повторяющихся процессов: запуск магазина, деплой, SEO. Каждый запуск — отдельный прогон с галочками."
        actions={
          <Button
            variant="lime"
            onClick={() => create.mutate({ title: 'Новый чек-лист', kind: 'template' })}
          >
            <Plus /> Шаблон
          </Button>
        }
      >
        <div className="flex flex-wrap items-center gap-3">
          <FilterChips<Tab>
            options={[
              { value: 'template', label: 'Шаблоны', count: templates },
              { value: 'run', label: 'Прогоны', count: runs }
            ]}
            value={tab}
            onChange={(v) => setParams(v === 'run' ? { tab: 'runs' } : {}, { replace: true })}
          />
          <SearchInput value={search} onChange={setSearch} className="w-64" />
          <TagFilter value={tagId} onChange={setTagId} />
        </div>
      </PageHeader>
      <PageBody>
        {list.length === 0 ? (
          <EmptyState
            icon={ListChecks}
            title={tab === 'template' ? 'Шаблонов нет' : 'Прогонов пока нет'}
            hint={
              tab === 'template'
                ? 'Создайте шаблон — список шагов, который вы повторяете от проекта к проекту.'
                : 'Откройте шаблон и нажмите «Запустить» — появится прогон, в котором можно ставить галочки.'
            }
          />
        ) : tab === 'template' ? (
          <div className="grid grid-cols-[repeat(auto-fill,minmax(260px,1fr))] gap-3">
            {list.map((c) => (
              <TemplateCard
                key={c.id}
                item={c}
                onLaunch={() => setLaunch({ id: c.id, title: c.title })}
              />
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-[repeat(auto-fill,minmax(260px,1fr))] gap-3">
            {list.map((c) => (
              <RunCard key={c.id} item={c} />
            ))}
          </div>
        )}
      </PageBody>
      <LaunchDialog template={launch} open={!!launch} onOpenChange={(o) => !o && setLaunch(null)} />
    </Page>
  )
}
