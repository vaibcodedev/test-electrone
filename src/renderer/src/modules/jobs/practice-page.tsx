import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router'
import { ArrowLeft, PartyPopper } from 'lucide-react'
import { toast } from 'sonner'
import { QUESTION_CATEGORIES, type InterviewQuestion, type QuestionCategory } from '@shared/domain/jobs'
import { api } from '@/lib/api'
import { invalidateAll, useApi } from '@/lib/query'
import { useHotkey } from '@/hooks/use-hotkey'
import { FilterChips, Kbd, SegmentBar } from '@/components/common/page'
import { Markdown } from '@/components/common/markdown'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card } from '@/components/ui/card'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { cn } from '@/lib/utils'
import { plural } from '@/lib/format'
import { LANG_LABEL, QUESTION_CATEGORY_LABEL } from './j2-labels'

type Grade = 0 | 1 | 2 | 3
const GRADES: { grade: Grade; label: string; hint: string; cls: string; tile: string }[] = [
  { grade: 0, label: 'Не смог', hint: 'вернётся сегодня', cls: 'bg-destructive/12 text-destructive hover:bg-destructive/20', tile: 'bg-destructive/12 text-destructive' },
  { grade: 1, label: 'С трудом', hint: 'скоро', cls: 'bg-warn/15 text-warn hover:bg-warn/25', tile: 'bg-warn/15 text-warn' },
  { grade: 2, label: 'Ответил', hint: 'по плану', cls: '', tile: '' },
  { grade: 3, label: 'Уверенно', hint: 'надолго', cls: '', tile: 'bg-lime text-lime-foreground' }
]

/** Interview practice: say the answer out loud, reveal yours, grade. «Не смог» returns at the end of the session. */
export function PracticePage() {
  const navigate = useNavigate()
  const [category, setCategory] = useState<QuestionCategory | undefined>()
  const { data: initial, isLoading } = useApi('jobs', 'practiceQueue', { limit: 50, category }, { staleTime: Infinity, refetchOnMount: 'always' })
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
    setResults({ 0: 0, 1: 0, 2: 0, 3: 0 })
  }, [category])

  useEffect(() => {
    if (initial && queue === null) {
      setQueue(initial)
      setUniqueTotal(initial.length)
    }
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
      await api.jobs.reviewQuestion({ id: current.id, grade: g })
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
          <ArrowLeft /> К вопросам
        </Button>
        <SegmentBar value={done} total={Math.max(total, 1)} segments={Math.min(Math.max(total, 1), 12)} className="flex-1" />
        <span className="w-16 text-right text-body text-muted-foreground tabular-nums">
          {Math.min(done + (finished ? 0 : 1), total)}/{total}
        </span>
      </div>
      <FilterChips
        size="xs"
        allLabel="Все категории"
        value={category}
        onChange={setCategory}
        options={QUESTION_CATEGORIES.map((c) => ({ value: c, label: QUESTION_CATEGORY_LABEL[c] }))}
      />

      <div className="flex min-h-0 flex-1 items-center justify-center overflow-y-auto">
        {isLoading || queue === null ? (
          <span className="text-muted-foreground">Загрузка…</span>
        ) : queue.length === 0 ? (
          <div className="text-center">
            <div className="font-display text-title">Всё повторено</div>
            <p className="mt-2 text-body text-muted-foreground">Вопросы вернутся, когда подойдёт их интервал. Можно добавить новые.</p>
            <Button className="mt-5" onClick={exit}>
              К банку вопросов
            </Button>
          </div>
        ) : finished ? (
          <div className="flex w-full max-w-lg flex-col items-center text-center">
            <Avatar className="size-16">
              <AvatarFallback className="bg-lime text-lime-foreground">
                <PartyPopper className="size-7" />
              </AvatarFallback>
            </Avatar>
            <div className="font-display text-title mt-5">Тренировка завершена</div>
            <p className="mt-2 text-body text-muted-foreground">
              {uniqueTotal} {plural(uniqueTotal, ['вопрос', 'вопроса', 'вопросов'])}, ответов: {done}
            </p>
            <div className="mt-6 grid w-full grid-cols-4 gap-2">
              {GRADES.map((g) => (
                <Card key={g.grade} className={cn('gap-1 rounded-2xl px-3 py-3', g.tile)}>
                  <div className="font-display text-[26px] leading-none">{results[g.grade]}</div>
                  <div className="text-caption">{g.label}</div>
                </Card>
              ))}
            </div>
            <Button className="mt-6" onClick={exit}>
              К банку вопросов
            </Button>
          </div>
        ) : current ? (
          <div className="flex w-full max-w-3xl flex-col gap-5">
            <Card
              onClick={() => setRevealed(true)}
              className={cn(
                'min-h-[320px] cursor-pointer items-center justify-center rounded-[28px] px-10 py-10 text-center transition-colors',
                revealed ? 'cursor-default' : 'bg-ink text-ink-foreground'
              )}
            >
              <div className="flex flex-wrap justify-center gap-1.5">
                <Badge variant="soft" className={cn('font-normal', revealed ? 'bg-card' : 'bg-ink-foreground/8 text-ink-muted')}>
                  {QUESTION_CATEGORY_LABEL[current.category]}
                </Badge>
                {current.topic && (
                  <Badge variant="soft" className={cn('font-normal', revealed ? 'bg-card' : 'bg-ink-foreground/8 text-ink-muted')}>
                    {current.topic}
                  </Badge>
                )}
                <Badge variant="soft" className={cn('font-normal', revealed ? 'bg-card' : 'bg-ink-foreground/8 text-ink-muted')}>
                  {LANG_LABEL[current.lang]}
                </Badge>
              </div>
              <div className="font-display max-w-2xl text-[30px] leading-tight text-balance">{current.question}</div>
              {revealed ? (
                <div className="selectable mt-2 w-full animate-rise text-left">
                  {current.answer.trim() ? (
                    <Markdown source={current.answer} className="rounded-2xl bg-card p-5" />
                  ) : (
                    <p className="text-center text-body text-muted-foreground">Ответа пока нет — допиши его в банке вопросов.</p>
                  )}
                </div>
              ) : (
                <>
                  <p className="text-body text-ink-muted">Ответь вслух, затем открой свой ответ.</p>
                  <Button
                    variant="lime"
                    className="mt-2"
                    onClick={(e) => {
                      e.stopPropagation()
                      setRevealed(true)
                    }}
                  >
                    Показать ответ <Kbd className="bg-lime-foreground/10 text-lime-foreground ring-0">Пробел</Kbd>
                  </Button>
                </>
              )}
            </Card>
            <div className={cn('grid grid-cols-4 gap-2 transition-opacity', !revealed && 'pointer-events-none opacity-30')}>
              {GRADES.map((g) => (
                <Button
                  key={g.grade}
                  variant={g.grade === 3 ? 'lime' : 'soft'}
                  disabled={!revealed || busy}
                  onClick={() => void grade(g.grade)}
                  className={cn('h-16 flex-col gap-0.5 rounded-2xl text-lead', g.cls)}
                >
                  <span>{g.label}</span>
                  <span className="flex items-center gap-1.5 text-meta font-normal opacity-70">
                    <Kbd className="h-4 min-w-4 bg-transparent text-current ring-current/30">{g.grade + 1}</Kbd>
                    {g.hint}
                  </span>
                </Button>
              ))}
            </div>
          </div>
        ) : null}
      </div>
    </div>
  )
}
