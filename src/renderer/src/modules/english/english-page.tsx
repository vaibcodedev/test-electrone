import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router'
import { Brain, Flame, Languages } from 'lucide-react'
import { WORD_KINDS, WORD_STAGES, type WordKind, type WordStage } from '@shared/domain/english'
import { useApi } from '@/lib/query'
import { fmtDay, plural } from '@/lib/format'
import { cn } from '@/lib/utils'
import { EmptyState, FilterChips, Page, PageHeader, SearchInput } from '@/components/common/page'
import { ListItem, MasterDetail, useOpenParam } from '@/components/common/master-detail'
import { TagFilter } from '@/components/common/tags'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { AddWordForm } from './add-word-form'
import { WordDetail } from './word-detail'
import { KIND_LABEL, STAGE_BADGE, STAGE_LABEL } from './labels'

const STAGE_COLOR: Record<WordStage, string> = {
  new: 'bg-ink-muted/50',
  learning: 'bg-warn',
  review: 'bg-info',
  mastered: 'bg-lime'
}

/** Stage distribution as one segmented bar with a legend. */
function StageBar({ byStage, total }: { byStage: Record<WordStage, number>; total: number }) {
  return (
    <div className="flex min-w-[280px] flex-col gap-2">
      <div className="flex h-2 gap-1">
        {WORD_STAGES.map((s) =>
          byStage[s] ? (
            <div key={s} className={cn('h-full rounded-full', STAGE_COLOR[s])} style={{ flexGrow: byStage[s] }} title={STAGE_LABEL[s]} />
          ) : null
        )}
        {!total && <div className="h-full flex-1 rounded-full bg-surface" />}
      </div>
      <div className="flex gap-3 text-[11.5px] text-muted-foreground">
        {WORD_STAGES.map((s) => (
          <span key={s} className="flex items-center gap-1.5">
            <span className={cn('size-1.5 rounded-full', STAGE_COLOR[s])} />
            {STAGE_LABEL[s]} <span className="text-foreground tabular-nums">{byStage[s]}</span>
          </span>
        ))}
      </div>
    </div>
  )
}

export function EnglishPage() {
  const navigate = useNavigate()
  const [open, setOpen] = useOpenParam()
  const [search, setSearch] = useState('')
  const [stage, setStage] = useState<WordStage | undefined>()
  const [kind, setKind] = useState<WordKind | undefined>()
  const [tagId, setTagId] = useState<string | undefined>()

  const { data: stats } = useApi('english', 'stats')
  const { data: all = [] } = useApi('english', 'list')
  const { data: words = [], isLoading } = useApi('english', 'list', {
    search: search.trim() || undefined,
    stage,
    kind,
    tagId
  })
  const { data: openWord } = useApi('english', 'get', open ?? '', { enabled: !!open })

  const nextDue = useMemo(() => {
    const future = all.map((w) => w.dueAt).filter((d) => d > Date.now())
    return future.length ? Math.min(...future) : null
  }, [all])

  const due = stats?.due ?? 0

  return (
    <Page>
      <PageHeader
        title="Английский"
        subtitle={
          stats
            ? `${stats.total} ${plural(stats.total, ['слово', 'слова', 'слов'])} · сегодня повторено ${stats.reviewedToday}`
            : undefined
        }
        actions={
          <div className="flex items-center gap-3">
            {stats && stats.streakDays > 0 && (
              <span className="flex items-center gap-1.5 rounded-full bg-surface px-3 py-1.5 text-[12.5px]">
                <Flame className="size-4 text-warn" />
                {stats.streakDays} {plural(stats.streakDays, ['день', 'дня', 'дней'])} подряд
              </span>
            )}
            <div className="flex flex-col items-end">
              <Button variant="lime" size="lg" disabled={!due} onClick={() => navigate('/english/review')}>
                <Brain /> {due ? `Повторить ${due}` : 'Нечего повторять'}
              </Button>
              {!due && nextDue && (
                <span className="mt-1 text-[11.5px] text-muted-foreground">Следующий повтор {fmtDay(nextDue)}</span>
              )}
            </div>
          </div>
        }
      >
        {stats && <StageBar byStage={stats.byStage} total={stats.total} />}
        <AddWordForm />
        <div className="flex flex-wrap items-center gap-2">
          <SearchInput value={search} onChange={setSearch} placeholder="Слово, перевод, пример" className="w-64" />
          <FilterChips
            allLabel="Все стадии"
            options={WORD_STAGES.map((s) => ({ value: s, label: STAGE_LABEL[s], count: stats?.byStage[s] }))}
            value={stage}
            onChange={setStage}
          />
          <FilterChips
            options={WORD_KINDS.map((k) => ({ value: k, label: KIND_LABEL[k] }))}
            value={kind}
            onChange={(k) => setKind(k === kind ? undefined : k)}
          />
          <TagFilter value={tagId} onChange={setTagId} />
        </div>
      </PageHeader>

      <div className="flex min-h-0 flex-1 px-8 pb-6">
        <MasterDetail
          listWidth="w-[400px]"
          list={
            <div className="min-h-0 flex-1 overflow-y-auto pr-1">
              {!isLoading && words.length === 0 ? (
                <EmptyState
                  icon={Languages}
                  title={all.length ? 'Ничего не подошло под фильтр' : 'Словарь пуст'}
                  hint={
                    all.length
                      ? 'Сбросьте стадию, тип или метку.'
                      : 'Добавьте слово из рабочей переписки в форме выше — оно сразу попадёт в повторение.'
                  }
                />
              ) : (
                <ul className={cn('grid gap-1.5', !open && 'grid-cols-2 xl:grid-cols-3')}>
                  {words.map((w) => {
                    const active = w.id === open
                    return (
                      <li key={w.id}>
                        <ListItem active={active} onClick={() => setOpen(active ? null : w.id)}>
                          <div className="flex items-baseline gap-2">
                            <span className="font-display truncate text-[18px]">{w.term}</span>
                            {w.transcription && (
                              <span className={cn('truncate text-[12px]', active ? 'text-ink-muted' : 'text-muted-foreground')}>
                                {w.transcription}
                              </span>
                            )}
                          </div>
                          <div className={cn('mt-0.5 truncate text-[13px]', active ? 'text-ink-foreground/80' : 'text-muted-foreground')}>
                            {w.translation || 'без перевода'}
                          </div>
                          <div className="mt-2 flex items-center gap-2">
                            <Badge variant={active ? 'lime' : STAGE_BADGE[w.stage]}>{STAGE_LABEL[w.stage]}</Badge>
                            <span className={cn('text-[11.5px]', active ? 'text-ink-muted' : 'text-muted-foreground')}>
                              {w.dueAt <= Date.now() ? 'пора повторить' : `повтор ${fmtDay(w.dueAt)}`}
                            </span>
                          </div>
                        </ListItem>
                      </li>
                    )
                  })}
                </ul>
              )}
            </div>
          }
          detail={open && openWord ? <WordDetail key={openWord.id} word={openWord} onClose={() => setOpen(null)} /> : null}
        />
      </div>
    </Page>
  )
}
