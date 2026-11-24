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

const GRADES: { grade: ReviewGrade; label: string; hint: string; cls: string; tile: string }[] = [
  { grade: 0, label: 'Забыл', hint: '10 мин', cls: 'bg-destructive/12 text-destructive hover:bg-destructive/20', tile: 'bg-destructive/12 text-destructive' },
  { grade: 1, label: 'Трудно', hint: 'скоро', cls: 'bg-warn/15 text-warn hover:bg-warn/25', tile: 'bg-warn/15 text-warn' },
  { grade: 2, label: 'Хорошо', hint: 'по плану', cls: '', tile: '' },
  { grade: 3, label: 'Легко', hint: 'надолго', cls: '', tile: 'bg-lime text-lime-foreground' }
]
const GRADE_VARIANT: Record<ReviewGrade, 'soft' | 'lime'> = { 0: 'soft', 1: 'soft', 2: 'soft', 3: 'lime' }

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
      await api.english.review({ id: current.id, grade: g })
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
          <ArrowLeft /> К словарю
        </Button>
        <SegmentBar value={done} total={Math.max(total, 1)} segments={Math.min(Math.max(total, 1), 12)} className="flex-1" />
        <span className="w-16 text-right text-body text-muted-foreground tabular-nums">
          {Math.min(done + (finished ? 0 : 1), total)}/{total}
        </span>
      </div>

      <div className="flex min-h-0 flex-1 items-center justify-center">
        {isLoading || queue === null ? (
          <span className="text-muted-foreground">Загрузка…</span>
        ) : queue.length === 0 ? (
          <div className="text-center">
            <div className="font-display text-title">Всё повторено</div>
            <p className="mt-2 text-body text-muted-foreground">Новые слова появятся в очереди, когда подойдёт их интервал.</p>
            <Button className="mt-5" onClick={exit}>
              Вернуться к словарю
            </Button>
          </div>
        ) : finished ? (
          <div className="flex w-full max-w-lg flex-col items-center text-center">
            <Avatar className="size-16">
              <AvatarFallback className="bg-lime text-lime-foreground">
                <PartyPopper className="size-7" />
              </AvatarFallback>
            </Avatar>
            <div className="font-display text-title mt-5">Сессия завершена</div>
            <p className="mt-2 text-body text-muted-foreground">
              {uniqueTotal} {plural(uniqueTotal, ['слово', 'слова', 'слов'])}, ответов: {done}
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
              Вернуться к словарю
            </Button>
          </div>
        ) : current ? (
          <div className="flex w-full max-w-2xl flex-col gap-5">
            <Card
              onClick={() => setRevealed(true)}
              className={cn(
                'min-h-[340px] cursor-pointer items-center justify-center rounded-[28px] px-10 py-12 text-center transition-colors',
                revealed ? 'cursor-default' : 'bg-ink text-ink-foreground'
              )}
            >
              {current.context && (
                <Badge variant="soft" className={cn('text-caption font-normal', revealed ? 'bg-card text-muted-foreground' : 'bg-ink-foreground/8 text-ink-muted')}>
                  {current.context}
                </Badge>
              )}
              <div className="font-display text-display">{current.term}</div>
              {current.transcription && (
                <div className={cn('text-lead', revealed ? 'text-muted-foreground' : 'text-ink-muted')}>{current.transcription}</div>
              )}
              {revealed ? (
                <div className="selectable mt-4 flex animate-rise flex-col items-center gap-3">
                  <div className="text-stat-sm font-medium">{current.translation || '—'}</div>
                  {current.example && <div className="max-w-xl text-lead italic">«{current.example}»</div>}
                  {current.exampleTranslation && (
                    <div className="max-w-xl text-body text-muted-foreground">{current.exampleTranslation}</div>
                  )}
                </div>
              ) : (
                <Button
                  variant="lime"
                  className="mt-6"
                  onClick={(e) => {
                    e.stopPropagation()
                    setRevealed(true)
                  }}
                >
                  Показать ответ <Kbd className="bg-lime-foreground/10 text-lime-foreground ring-0">Пробел</Kbd>
                </Button>
              )}
            </Card>
            <div className={cn('grid grid-cols-4 gap-2 transition-opacity', !revealed && 'pointer-events-none opacity-30')}>
              {GRADES.map((g) => (
                <Button
                  key={g.grade}
                  variant={GRADE_VARIANT[g.grade]}
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
