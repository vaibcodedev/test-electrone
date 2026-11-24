import { useEffect, useState, type ReactNode } from 'react'
import { useNavigate } from 'react-router'
import { format } from 'date-fns'
import { ArrowUpRight, Pause, Pin, Star, Timer } from 'lucide-react'
import { ENTITY_META } from '@shared/entity-types'
import type { DueCard } from '@shared/domain/boards'
import type { CalendarItem } from '@shared/domain/calendar'
import { useApi, useApiMutation } from '@/lib/query'
import { LOCALE, fmtMinutes, fmtRelative, plural } from '@/lib/format'
import { useUi } from '@/stores/ui-store'
import { EntityRow } from '@/components/common/entity-link'
import { SegmentBar } from '@/components/common/page'
import { ENTITY_ICON } from '@/app/navigation'
import type { QuickAddTarget } from '@shared/domain/system'
import { cn } from '@/lib/utils'

function Tile({ children, className }: { children: ReactNode; className?: string }) {
  return <section className={cn('rounded-3xl bg-surface p-5', className)}>{children}</section>
}

function TileTitle({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <div className="mb-3 flex items-center justify-between gap-2">
      <h2 className="text-[13px] font-medium text-muted-foreground">{children}</h2>
      {action}
    </div>
  )
}

const PRIORITY_DOT: Record<string, string> = {
  urgent: 'bg-destructive',
  high: 'bg-warn',
  medium: 'bg-info',
  low: 'bg-ink-muted',
  none: 'bg-transparent'
}

function TodayCard({ cards, overdue }: { cards: DueCard[]; overdue: DueCard[] }) {
  const navigate = useNavigate()
  const all = [...overdue, ...cards]
  const done = all.filter((c) => c.columnIsDone).length
  const open = all.filter((c) => !c.columnIsDone)
  const now = new Date()
  return (
    <section className="ink-card col-span-7 flex min-h-[300px] flex-col rounded-3xl p-6">
      <div className="flex items-center justify-between text-[12.5px] text-ink-muted">
        <span className="capitalize">{format(now, 'EEEE, d MMMM', { locale: LOCALE })}</span>
        {all.length > 0 && (
          <span className="rounded-full bg-lime px-2.5 py-0.5 font-medium text-lime-foreground">
            {done}/{all.length}
          </span>
        )}
      </div>
      <h2 className="font-display mt-3 text-[40px] leading-[0.98]">
        {open.length
          ? `${open.length} ${plural(open.length, ['задача', 'задачи', 'задач'])} на сегодня`
          : all.length
            ? 'Всё сделано'
            : 'Свободный день'}
      </h2>
      {all.length > 0 && <SegmentBar value={done} total={all.length} segments={6} className="mt-4 text-ink-foreground" />}
      <ul className="mt-5 flex flex-col gap-1">
        {open.slice(0, 6).map((c) => {
          const late = c.dueAt! < new Date().setHours(0, 0, 0, 0)
          return (
            <li key={c.id}>
              <button
                type="button"
                onClick={() => navigate(ENTITY_META.card.route(c.id))}
                className="flex w-full items-center gap-3 rounded-xl px-2 py-2 text-left hover:bg-white/6"
              >
                <span className={cn('size-2 shrink-0 rounded-full', PRIORITY_DOT[c.priority])} />
                <span className="min-w-0 flex-1 truncate text-[14px]">{c.title}</span>
                <span className={cn('shrink-0 text-[12px]', late ? 'text-[#ff8f8f]' : 'text-ink-muted')}>
                  {late ? 'просрочено' : c.boardTitle}
                </span>
              </button>
            </li>
          )
        })}
      </ul>
      {!all.length && (
        <p className="mt-4 max-w-sm text-[13px] text-ink-muted">
          Поставьте дедлайн карточке на доске — она появится здесь в нужный день.
        </p>
      )}
    </section>
  )
}

function Agenda({ items }: { items: CalendarItem[] }) {
  const navigate = useNavigate()
  return (
    <Tile className="col-span-5 flex flex-col">
      <TileTitle
        action={
          <button type="button" onClick={() => navigate('/calendar')} className="text-[12px] text-muted-foreground hover:text-foreground">
            Календарь
          </button>
        }
      >
        Ближайшие 3 дня
      </TileTitle>
      {items.length === 0 ? (
        <p className="text-[13px] text-muted-foreground">Событий нет. Добавьте встречу или напоминание в календаре.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {items.slice(0, 7).map((i) => (
            <li key={i.key}>
              <button
                type="button"
                onClick={() => navigate(ENTITY_META[i.ref.type].route(i.ref.id))}
                className="flex w-full items-center gap-3 rounded-2xl bg-card px-3 py-2.5 text-left hover:ring-1 hover:ring-border"
              >
                <span className="w-14 shrink-0 text-[12px] text-muted-foreground tabular-nums">
                  {i.allDay ? format(i.startAt, 'd MMM', { locale: LOCALE }) : format(i.startAt, 'HH:mm')}
                </span>
                <span className="h-6 w-1 shrink-0 rounded-full" style={{ background: i.color ?? 'var(--lime)' }} />
                <span className={cn('min-w-0 flex-1 truncate text-[13px]', i.done && 'text-muted-foreground line-through')}>
                  {i.title}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </Tile>
  )
}

const QUICK: { target: QuickAddTarget; label: string; type: keyof typeof ENTITY_META }[] = [
  { target: 'idea', label: 'Записать идею', type: 'idea' },
  { target: 'card', label: 'Новая задача', type: 'card' },
  { target: 'snippet', label: 'Сохранить сниппет', type: 'snippet' },
  { target: 'word', label: 'Новое слово', type: 'word' }
]

function QuickTiles() {
  const setQuickAddOpen = useUi((s) => s.setQuickAddOpen)
  return (
    <div className="col-span-6 grid grid-cols-2 gap-3">
      {QUICK.map((q, i) => {
        const Icon = ENTITY_ICON[q.type]
        return (
          <button
            key={q.target}
            type="button"
            onClick={() => setQuickAddOpen(true)}
            className={cn(
              'group flex h-[118px] flex-col justify-between rounded-3xl p-4 text-left transition-transform active:scale-[0.99]',
              i === 3 ? 'bg-ink text-ink-foreground' : 'bg-surface hover:bg-accent'
            )}
          >
            <span className="flex items-center justify-between">
              <span className={cn('grid size-9 place-items-center rounded-full', i === 3 ? 'bg-white/10' : 'bg-card')}>
                <ArrowUpRight className="size-4 transition-transform group-hover:rotate-45" />
              </span>
              <Icon className={cn('size-4', i === 3 ? 'text-lime' : 'text-muted-foreground')} />
            </span>
            <span className="text-[15px] leading-tight font-medium">{q.label}</span>
          </button>
        )
      })}
    </div>
  )
}

function TimerTile({ timer, weekMinutes }: { timer: { projectTitle: string; startedAt: number; projectId: string } | null; weekMinutes: number }) {
  const stop = useApiMutation('time', 'stop', { successMessage: 'Таймер остановлен' })
  const navigate = useNavigate()
  const [, tick] = useState(0)
  useEffect(() => {
    if (!timer) return
    const t = setInterval(() => tick((x) => x + 1), 30_000)
    return () => clearInterval(t)
  }, [timer])
  const elapsed = timer ? Math.floor((Date.now() - timer.startedAt) / 60_000) : 0
  return (
    <section
      className={cn(
        'col-span-3 flex flex-col justify-between rounded-3xl p-5',
        timer ? 'bg-lime text-lime-foreground' : 'bg-surface'
      )}
    >
      <div className="flex items-center justify-between">
        <span className={cn('text-[13px] font-medium', !timer && 'text-muted-foreground')}>Время</span>
        <Timer className="size-4 opacity-60" />
      </div>
      {timer ? (
        <>
          <div>
            <div className="font-display text-[34px] leading-none tabular-nums">{fmtMinutes(elapsed)}</div>
            <button type="button" onClick={() => navigate(`/projects/${timer.projectId}`)} className="mt-1 truncate text-[12.5px] opacity-75 hover:underline">
              {timer.projectTitle}
            </button>
          </div>
          <button
            type="button"
            onClick={() => stop.mutate(undefined)}
            className="flex h-9 items-center justify-center gap-2 rounded-full bg-ink text-[13px] text-ink-foreground"
          >
            <Pause className="size-4" /> Остановить
          </button>
        </>
      ) : (
        <div>
          <div className="font-display text-[34px] leading-none">{fmtMinutes(weekMinutes)}</div>
          <div className="mt-1 text-[12.5px] text-muted-foreground">за эту неделю</div>
        </div>
      )}
    </section>
  )
}

function EnglishTile({ due, word }: { due: number; word: { id: string; term: string; translation: string; example: string } | null }) {
  const navigate = useNavigate()
  return (
    <section className="col-span-3 flex flex-col justify-between rounded-3xl bg-surface p-5">
      <div className="flex items-center justify-between">
        <span className="text-[13px] font-medium text-muted-foreground">Слово дня</span>
        {due > 0 && (
          <button
            type="button"
            onClick={() => navigate('/english/review')}
            className="rounded-full bg-ink px-2.5 py-0.5 text-[11.5px] font-medium text-lime"
          >
            {due} на повтор
          </button>
        )}
      </div>
      {word ? (
        <button type="button" onClick={() => navigate(ENTITY_META.word.route(word.id))} className="text-left">
          <div className="font-display text-[26px] leading-tight">{word.term}</div>
          <div className="mt-1 text-[13px] text-muted-foreground">{word.translation}</div>
        </button>
      ) : (
        <p className="text-[13px] text-muted-foreground">Добавьте слова из рабочей переписки — здесь будет одно каждый день.</p>
      )}
    </section>
  )
}

function Activity({ data }: { data: { day: string; count: number }[] }) {
  const max = Math.max(1, ...data.map((d) => d.count))
  const total = data.reduce((s, d) => s + d.count, 0)
  return (
    <Tile className="col-span-4 flex flex-col">
      <TileTitle>Сделано за 2 недели</TileTitle>
      <div className="font-display text-[34px] leading-none">{total}</div>
      <div className="mt-4 flex h-24 flex-1 items-end gap-1.5">
        {data.map((d, i) => (
          <div
            key={d.day}
            title={`${format(new Date(d.day), 'd MMM', { locale: LOCALE })}: ${d.count}`}
            className={cn('flex-1 rounded-full', i === data.length - 1 ? 'bg-ink dark:bg-lime' : 'bg-lime')}
            style={{ height: `${Math.max(6, (d.count / max) * 100)}%`, opacity: d.count ? 1 : 0.35 }}
          />
        ))}
      </div>
    </Tile>
  )
}

export function DashboardPage() {
  const { data } = useApi('app', 'dashboard', undefined, { refetchInterval: 60_000 })
  const navigate = useNavigate()
  if (!data) return <div className="p-8 text-muted-foreground">Загрузка…</div>
  const pinned = [...data.pinned, ...data.favorites.filter((f) => !data.pinned.some((p) => p.type === f.type && p.id === f.id))]

  return (
    <div className="h-full overflow-y-auto p-6">
      <div className="grid animate-rise grid-cols-12 gap-3">
        <TodayCard cards={data.today.cards} overdue={data.today.overdue} />
        <Agenda items={data.today.agenda} />

        <QuickTiles />
        <TimerTile timer={data.timer} weekMinutes={data.weekMinutes} />
        <EnglishTile due={data.english.due} word={data.english.wordOfDay} />

        <Tile className="col-span-4">
          <TileTitle>Закреплено</TileTitle>
          {pinned.length ? (
            <div className="-mx-2.5 flex flex-col">
              {pinned.slice(0, 7).map((p) => (
                <EntityRow
                  key={`${p.kind}:${p.type}:${p.id}`}
                  item={p}
                  trailing={p.kind === 'pin' ? <Pin className="size-3.5 text-muted-foreground" /> : <Star className="size-3.5 text-muted-foreground" />}
                />
              ))}
            </div>
          ) : (
            <p className="text-[13px] text-muted-foreground">Нажмите на булавку у любой записи, чтобы она появилась здесь.</p>
          )}
        </Tile>

        <Tile className="col-span-4">
          <TileTitle>Недавно менялось</TileTitle>
          <div className="-mx-2.5 flex flex-col">
            {data.recent.slice(0, 7).map((r) => (
              <EntityRow
                key={`${r.type}:${r.id}`}
                item={r}
                trailing={<span className="text-[11px] text-muted-foreground">{fmtRelative(r.updatedAt)}</span>}
              />
            ))}
            {!data.recent.length && <p className="px-2.5 text-[13px] text-muted-foreground">Пока пусто.</p>}
          </div>
        </Tile>

        <Activity data={data.activity} />

        <Tile className="col-span-6">
          <TileTitle
            action={
              <button type="button" onClick={() => navigate('/ideas')} className="text-[12px] text-muted-foreground hover:text-foreground">
                Все идеи
              </button>
            }
          >
            Идеи во входящих
          </TileTitle>
          {data.inboxIdeas.length ? (
            <div className="flex flex-wrap gap-2">
              {data.inboxIdeas.map((i) => (
                <button
                  key={i.id}
                  type="button"
                  onClick={() => navigate(ENTITY_META.idea.route(i.id))}
                  className="max-w-full truncate rounded-full bg-card px-3.5 py-2 text-[13px] hover:ring-1 hover:ring-border"
                >
                  {i.title}
                </button>
              ))}
            </div>
          ) : (
            <p className="text-[13px] text-muted-foreground">Входящие пусты. Глобальная клавиша быстрого добавления работает даже из трея.</p>
          )}
        </Tile>

        <Tile className="col-span-6">
          <TileTitle>Читаю сейчас</TileTitle>
          {data.reading.length ? (
            <ul className="flex flex-col gap-2">
              {data.reading.map((b) => (
                <li key={b.id}>
                  <button
                    type="button"
                    onClick={() => navigate(ENTITY_META.bookmark.route(b.id))}
                    className="flex w-full items-center gap-3 rounded-2xl bg-card px-3 py-2.5 text-left"
                  >
                    <span className="min-w-0 flex-1 truncate text-[13px]">{b.title}</span>
                    <span className="h-1.5 w-20 overflow-hidden rounded-full bg-surface">
                      <span className="block h-full rounded-full bg-lime" style={{ width: `${b.progress}%` }} />
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-[13px] text-muted-foreground">Отметьте закладку «читаю» — прогресс будет здесь.</p>
          )}
        </Tile>
      </div>
    </div>
  )
}
