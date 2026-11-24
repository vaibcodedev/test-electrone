import { useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router'
import { ArrowLeft, PartyPopper } from 'lucide-react'
import { toast } from 'sonner'
import type { InterviewQuestion, QuestionCategory, QuestionGroup } from '@shared/domain/jobs'
import { api } from '@/lib/api'
import { invalidateAll, useApi } from '@/lib/query'
import { useHotkey } from '@/hooks/use-hotkey'
import { Kbd, SegmentBar } from '@/components/common/page'
import { Markdown } from '@/components/common/markdown'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card } from '@/components/ui/card'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { cn } from '@/lib/utils'
import { plural } from '@/lib/format'
import { LANG_LABEL, QUESTION_CATEGORY_LABEL } from './j2-labels'
import { QuestionCategoryFilter } from './question-category'

type Grade = 0 | 1 | 2 | 3
/** Four equal neutral buttons; only the label colour carries the meaning (same as the English trainer). */
const GRADES: { grade: Grade; label: string; hint: string; text: string; hover: string; tile: string }[] = [
  { grade: 0, label: 'Не зміг', hint: 'повернеться сьогодні', text: 'text-destructive', hover: 'hover:bg-destructive/12', tile: 'bg-destructive/12 text-destructive' },
  { grade: 1, label: 'Насилу', hint: 'повторимо скоро', text: 'text-warn', hover: 'hover:bg-warn/15', tile: 'bg-warn/15 text-warn' },
  { grade: 2, label: 'Відповів', hint: 'за планом', text: 'text-foreground', hover: 'hover:bg-accent', tile: '' },
  { grade: 3, label: 'Впевнено', hint: 'не скоро', text: 'text-success', hover: 'hover:bg-success/15', tile: 'bg-success/15 text-success' }
]

/** «Тренуватися далі»: more questions ahead of schedule (soonest due and weakest first). */
function ExtraPractice({ busy, onStart }: { busy: boolean; onStart: (limit: number) => void }) {
  return (
    <div className="mt-6 flex flex-col items-center gap-2">
      <span className="text-body font-medium">Тренуватися далі</span>
      <div className="flex gap-2">
        <Button variant="subtle" disabled={busy} onClick={() => onStart(10)}>
          Ще 10
        </Button>
        <Button variant="subtle" disabled={busy} onClick={() => onStart(20)}>
          Ще 20
        </Button>
        <Button variant="subtle" disabled={busy} onClick={() => onStart(500)}>
          Усі
        </Button>
      </div>
    </div>
  )
}

/** Interview practice: say the answer out loud, reveal yours, grade. «Не смог» returns at the end of the session. */
export function PracticePage() {
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const [category, setCategory] = useState<QuestionCategory | undefined>()
  const [group, setGroup] = useState<QuestionGroup | undefined>()
  const { data: initial, isLoading } = useApi(
    'jobs',
    'practiceQueue',
    { limit: 50, category, group },
    { staleTime: Infinity, refetchOnMount: 'always' }
  )
  /** «extra» = practising ahead of schedule: answers can't push reviews later. */
  const [mode, setMode] = useState<'due' | 'extra'>('due')
  const [seen, setSeen] = useState<string[]>([])
  const [loadingExtra, setLoadingExtra] = useState(false)
  const [queue, setQueue] = useState<InterviewQuestion[] | null>(null)
  const [index, setIndex] = useState(0)
  const [revealed, setRevealed] = useState(false)
  const [busy, setBusy] = useState(false)
  const [results, setResults] = useState<Record<Grade, number>>({ 0: 0, 1: 0, 2: 0, 3: 0 })
  const [uniqueTotal, setUniqueTotal] = useState(0)

  // A new category filter starts a fresh session.
  useEffect(() => {
    setQueue(null)
    setIndex(0)
    setRevealed(false)
    setMode('due')
    setSeen([])
    setResults({ 0: 0, 1: 0, 2: 0, 3: 0 })
  }, [category, group])

  const startExtra = async (limit: number): Promise<void> => {
    setLoadingExtra(true)
    try {
      const exclude = [...seen, ...(queue ?? []).map((q) => q.id)]
      const list = await api.jobs.practiceExtra({ limit, category, group, excludeIds: exclude.slice(-1000) })
      if (!list.length) {
        toast.info('Більше питань немає — додайте нові в банк')
        return
      }
      setSeen(exclude)
      setMode('extra')
      setQueue(list)
      setIndex(0)
      setRevealed(false)
      setUniqueTotal((n) => n + list.length)
    } catch (e) {
      toast.error((e as Error).message)
    } finally {
      setLoadingExtra(false)
    }
  }

  useEffect(() => {
    if (initial && queue === null) {
      // Opened from «Тренування» with nothing due → practise ahead right away instead of a dead end.
      if (!initial.length && params.get('extra') === '1' && mode === 'due' && !seen.length) {
        toast.info('На сьогодні все повторено — тренуємо наперед')
        void startExtra(10)
        return
      }
      setQueue(initial)
      setUniqueTotal(initial.length)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- runs once per loaded queue
  }, [initial, queue])

  const current = queue?.[index]
  const finished = queue !== null && queue.length > 0 && index >= queue.length

  const exit = (): void => {
    invalidateAll()
    navigate('/jobs/questions')
  }

  const grade = async (g: Grade): Promise<void> => {
    if (!current || !revealed || busy) return
    setBusy(true)
    try {
      await api.jobs.reviewQuestion({ id: current.id, grade: g, extra: mode === 'extra' })
      setResults((r) => ({ ...r, [g]: r[g] + 1 }))
      if (g === 0) setQueue((q) => (q ? [...q, current] : q))
      setIndex((i) => i + 1)
      setRevealed(false)
    } catch (e) {
      toast.error((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  useHotkey('escape', exit)
  useHotkey(' ', () => setRevealed(true), { enabled: !!current && !revealed })
  useHotkey('1', () => void grade(0), { enabled: revealed })
  useHotkey('2', () => void grade(1), { enabled: revealed })
  useHotkey('3', () => void grade(2), { enabled: revealed })
  useHotkey('4', () => void grade(3), { enabled: revealed })

  const total = queue?.length ?? 0
  const done = Math.min(index, total)

  return (
    <div className="flex h-full flex-col gap-4 px-8 py-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="sm" onClick={exit}>
          <ArrowLeft /> До питань
        </Button>
        <SegmentBar value={done} total={Math.max(total, 1)} segments={Math.min(Math.max(total, 1), 12)} className="flex-1" />
        <span className="w-16 text-right text-body text-muted-foreground tabular-nums">
          {Math.min(done + (finished ? 0 : 1), total)}/{total}
        </span>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <QuestionCategoryFilter
          size="xs"
          group={group}
          category={category}
          onChange={(next) => {
            setGroup(next.group)
            setCategory(next.category)
          }}
        />
        {mode === 'extra' && <Badge variant="info">Тренування наперед — розклад не зсувається</Badge>}
      </div>

      <div className="flex min-h-0 flex-1 items-center justify-center overflow-y-auto">
        {isLoading || queue === null ? (
          <span className="text-muted-foreground">Завантаження…</span>
        ) : queue.length === 0 ? (
          <div className="flex animate-enter flex-col items-center text-center">
            <div className="font-display text-title">На сьогодні все повторено</div>
            <p className="mt-2 max-w-md text-body text-muted-foreground">
              Питання повернуться, коли настане їхній інтервал. Хочете більше — тренуйтеся наперед, розклад від цього не зсунеться.
            </p>
            <ExtraPractice busy={loadingExtra} onStart={(n) => void startExtra(n)} />
            <Button variant="ghost" className="mt-3" onClick={exit}>
              До банку питань
            </Button>
          </div>
        ) : finished ? (
          <div className="flex w-full max-w-lg animate-enter flex-col items-center text-center">
            <Avatar className="size-16">
              <AvatarFallback className="bg-lime text-lime-foreground">
                <PartyPopper className="size-7" />
              </AvatarFallback>
            </Avatar>
            <div className="font-display text-title mt-5">Тренування завершено</div>
            <p className="mt-2 text-body text-muted-foreground">
              {uniqueTotal} {plural(uniqueTotal, ['питання', 'питання', 'питань'])}, відповідей: {done}
            </p>
            <div className="stagger mt-6 grid w-full grid-cols-4 gap-2">
              {GRADES.map((g) => (
                <Card key={g.grade} className={cn('gap-1 rounded-2xl px-3 py-3', g.tile)}>
                  <div className="font-display text-[26px] leading-none">{results[g.grade]}</div>
                  <div className="text-caption">{g.label}</div>
                </Card>
              ))}
            </div>
            <ExtraPractice busy={loadingExtra} onStart={(n) => void startExtra(n)} />
            <Button variant="ghost" className="mt-3" onClick={exit}>
              До банку питань
            </Button>
          </div>
        ) : current ? (
          // Keyed by question: every next card enters with the same short motion.
          <div key={`${current.id}:${index}`} className="flex w-full max-w-3xl animate-enter flex-col gap-4">
            <Card
              onClick={() => setRevealed(true)}
              className={cn(
                // Long questions and answers wrap inside the card instead of running off it.
                'min-h-[320px] items-center justify-center gap-3 rounded-[28px] px-10 py-10 text-center ring-1 ring-foreground/8 [overflow-wrap:anywhere]',
                !revealed && 'cursor-pointer'
              )}
            >
              <div className="flex flex-wrap justify-center gap-1.5">
                <Badge variant="soft" className="font-normal text-muted-foreground">
                  {QUESTION_CATEGORY_LABEL[current.category]}
                </Badge>
                {current.topic && (
                  <Badge variant="soft" className="font-normal text-muted-foreground">
                    {current.topic}
                  </Badge>
                )}
                <Badge variant="soft" className="font-normal text-muted-foreground">
                  {LANG_LABEL[current.lang]}
                </Badge>
              </div>
              <div className="font-display max-w-2xl text-[30px] leading-tight text-balance">{current.question}</div>
              {revealed ? (
                <div className="selectable mt-2 w-full animate-enter text-left">
                  {current.answer.trim() ? (
                    <Markdown source={current.answer} className="rounded-2xl bg-card p-5" />
                  ) : (
                    <p className="text-center text-body text-muted-foreground">Відповіді поки немає — допишіть її в банку питань.</p>
                  )}
                </div>
              ) : (
                <div className="mt-3 flex flex-col items-center gap-2.5">
                  <p className="text-body text-muted-foreground">Дайте відповідь уголос, потім відкрийте свою.</p>
                  <Button
                    variant="lime"
                    size="lg"
                    onClick={(e) => {
                      e.stopPropagation()
                      setRevealed(true)
                    }}
                  >
                    Показати відповідь
                  </Button>
                  <span className="flex items-center gap-1.5 text-caption text-muted-foreground">
                    або <Kbd>Пробіл</Kbd>
                  </span>
                </div>
              )}
            </Card>
            {revealed ? (
              <div className="flex animate-enter flex-col gap-2">
                <div className="text-center text-body font-medium">Як вдалося відповісти?</div>
                <div className="grid grid-cols-4 gap-2">
                  {GRADES.map((g) => (
                    <Button
                      key={g.grade}
                      variant="soft"
                      disabled={busy}
                      onClick={() => void grade(g.grade)}
                      className={cn('h-16 flex-col gap-1 rounded-2xl bg-surface', g.hover)}
                    >
                      <span className={cn('text-lead font-semibold', g.text)}>{g.label}</span>
                      <span className="flex items-center gap-1.5 text-meta font-normal text-muted-foreground">
                        <Kbd className="h-4 min-w-4">{g.grade + 1}</Kbd>
                        {g.hint}
                      </span>
                    </Button>
                  ))}
                </div>
              </div>
            ) : (
              // Same height as the grade row, so nothing jumps when the answer opens.
              <div className="flex h-16 items-center justify-center rounded-2xl border border-dashed border-foreground/12 text-caption text-muted-foreground">
                Відповідайте, відкрийте свою відповідь і оцініть себе
              </div>
            )}
          </div>
        ) : null}
      </div>
    </div>
  )
}
