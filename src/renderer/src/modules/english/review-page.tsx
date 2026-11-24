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
import { cn } from '@/lib/utils'
import { plural } from '@/lib/format'

const GRADES: { grade: ReviewGrade; label: string; hint: string; cls: string }[] = [
  { grade: 0, label: 'Забыл', hint: '10 мин', cls: 'bg-destructive/12 text-destructive hover:bg-destructive/20' },
  { grade: 1, label: 'Трудно', hint: 'скоро', cls: 'bg-warn/15 text-warn hover:bg-warn/25' },
  { grade: 2, label: 'Хорошо', hint: 'по плану', cls: 'bg-surface hover:bg-accent' },
  { grade: 3, label: 'Легко', hint: 'надолго', cls: 'bg-lime text-lime-foreground hover:brightness-95' }
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
        <span className="w-16 text-right text-[13px] text-muted-foreground tabular-nums">
          {Math.min(done + (finished ? 0 : 1), total)}/{total}
        </span>
      </div>

      <div className="flex min-h-0 flex-1 items-center justify-center">
        {isLoading || queue === null ? (
          <span className="text-muted-foreground">Загрузка…</span>
        ) : queue.length === 0 ? (
          <div className="text-center">
            <div className="font-display text-title">Всё повторено</div>
            <p className="mt-2 text-[13px] text-muted-foreground">Новые слова появятся в очереди, когда подойдёт их интервал.</p>
            <Button className="mt-5" onClick={exit}>
              Вернуться к словарю
            </Button>
          </div>
        ) : finished ? (
          <div className="flex w-full max-w-lg flex-col items-center text-center">
            <span className="grid size-16 place-items-center rounded-full bg-lime text-lime-foreground">
              <PartyPopper className="size-7" />
            </span>
            <div className="font-display text-title mt-5">Сессия завершена</div>
            <p className="mt-2 text-[13px] text-muted-foreground">
              {uniqueTotal} {plural(uniqueTotal, ['слово', 'слова', 'слов'])}, ответов: {done}
            </p>
            <div className="mt-6 grid w-full grid-cols-4 gap-2">
              {GRADES.map((g) => (
                <div key={g.grade} className={cn('rounded-2xl px-3 py-3', g.cls)}>
                  <div className="font-display text-[26px] leading-none">{results[g.grade]}</div>
                  <div className="mt-1 text-[12px]">{g.label}</div>
                </div>
              ))}
            </div>
            <Button className="mt-6" onClick={exit}>
              Вернуться к словарю
            </Button>
          </div>
        ) : current ? (
          <div className="flex w-full max-w-2xl flex-col gap-5">
            <button
              type="button"
              onClick={() => setRevealed(true)}
              className={cn(
                'flex min-h-[340px] flex-col items-center justify-center rounded-[28px] px-10 py-12 text-center transition-colors',
                revealed ? 'bg-surface' : 'ink-card rounded-[28px]'
              )}
            >
              {current.context && (
                <span className={cn('mb-4 rounded-full px-3 py-1 text-[12px]', revealed ? 'bg-card text-muted-foreground' : 'bg-white/8 text-ink-muted')}>
                  {current.context}
                </span>
              )}
              <div className="font-display text-display">{current.term}</div>
              {current.transcription && (
                <div className={cn('mt-2 text-[14px]', revealed ? 'text-muted-foreground' : 'text-ink-muted')}>{current.transcription}</div>
              )}
              {revealed ? (
                <div className="selectable mt-6 flex animate-rise flex-col items-center gap-3">
                  <div className="text-[22px] font-medium">{current.translation || '—'}</div>
                  {current.example && <div className="max-w-xl text-[15px] italic">«{current.example}»</div>}
                  {current.exampleTranslation && (
                    <div className="max-w-xl text-[13px] text-muted-foreground">{current.exampleTranslation}</div>
                  )}
                </div>
              ) : (
                <div className="mt-8 flex items-center gap-2 text-[12.5px] text-ink-muted">
                  Нажмите или <Kbd className="border-white/15 bg-white/8 text-ink-foreground">Пробел</Kbd>, чтобы проверить себя
                </div>
              )}
            </button>
            <div className={cn('grid grid-cols-4 gap-2 transition-opacity', !revealed && 'pointer-events-none opacity-30')}>
              {GRADES.map((g) => (
                <button
                  key={g.grade}
                  type="button"
                  disabled={!revealed || busy}
                  onClick={() => void grade(g.grade)}
                  className={cn('flex h-16 flex-col items-center justify-center rounded-2xl text-[14px] font-medium transition-colors', g.cls)}
                >
                  <span>{g.label}</span>
                  <span className="text-[11px] font-normal opacity-70">
                    {g.grade + 1} · {g.hint}
                  </span>
                </button>
              ))}
            </div>
          </div>
        ) : null}
      </div>
    </div>
  )
}
