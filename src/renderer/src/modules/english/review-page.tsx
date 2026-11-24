import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router'
import { ArrowLeft, PartyPopper } from 'lucide-react'
import { toast } from 'sonner'
import type { ReviewGrade, Word } from '@shared/domain/english'
import { api } from '@/lib/api'
import { invalidateAll, useApi } from '@/lib/query'
import { useHotkey } from '@/hooks/use-hotkey'
import { Kbd, SegmentBar } from '@/components/common/page'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card } from '@/components/ui/card'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { cn } from '@/lib/utils'
import { plural } from '@/lib/format'

/** Four equal neutral buttons; only the label colour carries the meaning (no single loud one). */
const GRADES: { grade: ReviewGrade; label: string; hint: string; text: string; hover: string; tile: string }[] = [
  { grade: 0, label: 'Не згадав', hint: 'покажу ще раз', text: 'text-destructive', hover: 'hover:bg-destructive/12', tile: 'bg-destructive/12 text-destructive' },
  { grade: 1, label: 'Насилу', hint: 'повторимо скоро', text: 'text-warn', hover: 'hover:bg-warn/15', tile: 'bg-warn/15 text-warn' },
  { grade: 2, label: 'Згадав', hint: 'за планом', text: 'text-foreground', hover: 'hover:bg-accent', tile: '' },
  { grade: 3, label: 'Легко', hint: 'не скоро', text: 'text-success', hover: 'hover:bg-success/15', tile: 'bg-success/15 text-success' }
]

/** Focused flashcard session. Words graded «Забыл» return at the end of the same session. */
export function ReviewPage() {
  const navigate = useNavigate()
  const { data: initial, isLoading } = useApi('english', 'queue', 50, { staleTime: Infinity, refetchOnMount: 'always' })
  const [queue, setQueue] = useState<Word[] | null>(null)
  const [index, setIndex] = useState(0)
  const [revealed, setRevealed] = useState(false)
  const [busy, setBusy] = useState(false)
  const [results, setResults] = useState<Record<ReviewGrade, number>>({ 0: 0, 1: 0, 2: 0, 3: 0 })
  const [uniqueTotal, setUniqueTotal] = useState(0)
  /** Practice beyond the norm: grades don't push the schedule (see english.review `extra`). */
  const [extra, setExtra] = useState(false)

  const startExtra = async (limit: number): Promise<void> => {
    try {
      const words = await api.english.practiceExtra(limit)
      if (!words.length) {
        toast.info('Більше слів для тренування немає — додайте нові у словник')
        return
      }
      setExtra(true)
      setQueue(words)
      setIndex(0)
      setRevealed(false)
      setResults({ 0: 0, 1: 0, 2: 0, 3: 0 })
      setUniqueTotal(words.length)
    } catch (e) {
      toast.error((e as Error).message)
    }
  }

  const moreButtons = (
    <div className="mt-6 flex flex-col items-center gap-2">
      <span className="text-caption text-muted-foreground">Потренуватися понад норму — розклад повторень не збиватиметься</span>
      <div className="flex gap-2">
        <Button variant="subtle" onClick={() => void startExtra(10)}>
          Ще 10
        </Button>
        <Button variant="subtle" onClick={() => void startExtra(20)}>
          Ще 20
        </Button>
        <Button variant="subtle" onClick={() => void startExtra(500)}>
          Усі
        </Button>
      </div>
    </div>
  )

  useEffect(() => {
    if (initial && queue === null) {
      setQueue(initial)
      setUniqueTotal(initial.length)
    }
  }, [initial, queue])

  const current = queue?.[index]
  const finished = queue !== null && index >= queue.length

  const exit = (): void => {
    invalidateAll()
    navigate('/english')
  }

  const grade = async (g: ReviewGrade): Promise<void> => {
    if (!current || !revealed || busy) return
    setBusy(true)
    try {
      await api.english.review({ id: current.id, grade: g, extra })
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
  // useHotkey matches e.key for non-letter keys, so Space is ' '.
  useHotkey(' ', () => setRevealed(true), { enabled: !!current && !revealed })
  useHotkey('1', () => void grade(0), { enabled: revealed })
  useHotkey('2', () => void grade(1), { enabled: revealed })
  useHotkey('3', () => void grade(2), { enabled: revealed })
  useHotkey('4', () => void grade(3), { enabled: revealed })

  const done = Math.min(index, queue?.length ?? 0)
  const total = queue?.length ?? 0

  return (
    <div className="flex h-full flex-col px-8 py-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="sm" onClick={exit}>
          <ArrowLeft /> До словника
        </Button>
        <SegmentBar value={done} total={Math.max(total, 1)} segments={Math.min(Math.max(total, 1), 12)} className="flex-1" />
        <span className="w-16 text-right text-body text-muted-foreground tabular-nums">
          {Math.min(done + (finished ? 0 : 1), total)}/{total}
        </span>
      </div>

      <div className="flex min-h-0 flex-1 items-center justify-center">
        {isLoading || queue === null ? (
          <span className="text-muted-foreground">Завантаження…</span>
        ) : queue.length === 0 ? (
          <div className="text-center">
            <div className="font-display text-title">Усе повторено</div>
            <p className="mt-2 text-body text-muted-foreground">Нові слова зʼявляться в черзі, коли настане їхній інтервал.</p>
            {moreButtons}
            <Button variant="ghost" className="mt-3" onClick={exit}>
              Повернутися до словника
            </Button>
          </div>
        ) : finished ? (
          <div className="flex w-full max-w-lg animate-enter flex-col items-center text-center">
            <Avatar className="size-16">
              <AvatarFallback className="bg-lime text-lime-foreground">
                <PartyPopper className="size-7" />
              </AvatarFallback>
            </Avatar>
            <div className="font-display text-title mt-5">{extra ? 'Тренування завершено' : 'Сесію завершено'}</div>
            <p className="mt-2 text-body text-muted-foreground">
              {uniqueTotal} {plural(uniqueTotal, ['слово', 'слова', 'слів'])}, відповідей: {done}
            </p>
            <div className="stagger mt-6 grid w-full grid-cols-4 gap-2">
              {GRADES.map((g) => (
                <Card key={g.grade} className={cn('gap-1 rounded-2xl px-3 py-3', g.tile)}>
                  <div className="font-display text-headline leading-none">{results[g.grade]}</div>
                  <div className="text-caption">{g.label}</div>
                </Card>
              ))}
            </div>
            {moreButtons}
            <Button variant="ghost" className="mt-3" onClick={exit}>
              Повернутися до словника
            </Button>
          </div>
        ) : current ? (
          // Keyed by word: every next card enters with the same short motion.
          <div key={`${current.id}:${index}`} className="flex w-full max-w-2xl animate-enter flex-col gap-4">
            <Card
              onClick={() => setRevealed(true)}
              className={cn(
                // Long words and sentences wrap inside the card instead of running off it.
                'min-h-[340px] items-center justify-center gap-3 rounded-[28px] px-10 py-12 text-center ring-1 ring-foreground/8 [overflow-wrap:anywhere]',
                !revealed && 'cursor-pointer'
              )}
            >
              {current.context && (
                <Badge variant="soft" className="max-w-full text-caption font-normal text-muted-foreground">
                  {current.context}
                </Badge>
              )}
              <div className="font-display max-w-full text-display">{current.term}</div>
              {current.transcription && <div className="text-lead text-muted-foreground">{current.transcription}</div>}
              {revealed ? (
                <div className="selectable mt-3 flex max-w-xl animate-enter flex-col items-center gap-2.5">
                  <div className="text-stat-sm font-medium">{current.translation || '—'}</div>
                  {current.example && <div className="text-lead text-foreground/85 italic">«{current.example}»</div>}
                  {current.exampleTranslation && <div className="text-body text-muted-foreground">{current.exampleTranslation}</div>}
                </div>
              ) : (
                <div className="mt-5 flex flex-col items-center gap-2.5">
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
                <div className="text-center text-body font-medium">Як ви згадали переклад?</div>
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
                Згадайте переклад, відкрийте відповідь і оцініть, наскільки легко він дався
              </div>
            )}
          </div>
        ) : null}
      </div>
    </div>
  )
}
