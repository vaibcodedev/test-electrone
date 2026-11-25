import type { ReactElement } from 'react'
import { useNavigate } from 'react-router'
import { ArrowLeft, Languages, Plus } from 'lucide-react'
import { invalidateAll, useApi } from '@/lib/query'
import { useHotkey } from '@/hooks/use-hotkey'
import { EmptyState, SegmentBar } from '@/components/common/page'
import { PageSkeleton } from '@/components/common/page-skeleton'
import { LoadError } from '@/features/route-error'
import { Button } from '@/components/ui/button'
import { GradeButtons, PracticeMore, ReviewCard, SessionSummary } from './review-parts'
import { useReviewSession } from './use-review-session'

/** Focused flashcard session. Words graded «Не згадали» return at the end of the same session. */
export function ReviewPage(): ReactElement {
  const navigate = useNavigate()
  const { data: stats, error: statsError, refetch: refetchStats } = useApi('english', 'stats')
  const s = useReviewSession()

  const exit = (): void => {
    invalidateAll()
    navigate('/english')
  }

  useHotkey('escape', exit)
  // useHotkey matches e.key for non-letter keys, so Space is ' '.
  useHotkey(' ', s.reveal, { enabled: !!s.current && !s.revealed })
  useHotkey('1', () => void s.grade(0), { enabled: s.revealed })
  useHotkey('2', () => void s.grade(1), { enabled: s.revealed })
  useHotkey('3', () => void s.grade(2), { enabled: s.revealed })
  useHotkey('4', () => void s.grade(3), { enabled: s.revealed })

  // A failed load must not leave the skeleton on forever.
  if (s.error || (statsError && !stats))
    return (
      <LoadError
        title="Не вдалося завантажити тренування"
        onRetry={() => {
          if (s.error) s.retry()
          if (statsError) void refetchStats()
        }}
      />
    )
  if (s.loading || !stats) return <PageSkeleton kind="focus" />

  const startExtra = (limit: number): void => void s.startExtra(limit)
  let body
  if (stats.total === 0) {
    body = (
      <EmptyState
        icon={Languages}
        title="Словник порожній"
        hint="Додайте перше слово — воно одразу потрапить у повторення."
        // The only action on this screen, so it is the lime one.
        action={
          <Button variant="lime" onClick={() => navigate('/english')}>
            <Plus /> Додати слово
          </Button>
        }
      />
    )
  } else if (s.total === 0) {
    body = (
      <div className="text-center">
        <div className="font-display text-title">На сьогодні все</div>
        <p className="mt-2 text-body text-muted-foreground">
          Слова повернуться, коли настане час повторення.
        </p>
        <PracticeMore onStart={startExtra} onExit={exit} />
      </div>
    )
  } else if (s.finished) {
    body = (
      <div className="flex w-full max-w-lg animate-enter flex-col items-center text-center">
        <SessionSummary
          extra={s.extra}
          uniqueTotal={s.uniqueTotal}
          done={s.done}
          results={s.results}
        />
        <PracticeMore onStart={startExtra} onExit={exit} />
      </div>
    )
  } else if (s.current) {
    body = (
      // Keyed by word: every next card enters with the same short motion.
      <div
        key={`${s.current.id}:${s.index}`}
        className="flex w-full max-w-2xl animate-enter flex-col gap-4"
      >
        <ReviewCard word={s.current} revealed={s.revealed} onReveal={s.reveal} />
        <GradeButtons revealed={s.revealed} busy={s.busy} onGrade={(g) => void s.grade(g)} />
      </div>
    )
  }

  return (
    <div className="flex h-full flex-col px-8 py-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="sm" onClick={exit}>
          <ArrowLeft /> До словника
        </Button>
        {s.total > 0 && (
          <div className="flex flex-1 items-center gap-3">
            <SegmentBar
              value={s.done}
              total={s.total}
              segments={Math.min(s.total, 12)}
              className="flex-1"
            />
            <span className="shrink-0 text-meta text-muted-foreground tabular-nums">
              Готово {s.done} з {s.total}
            </span>
          </div>
        )}
      </div>
      <div className="flex min-h-0 flex-1 items-center justify-center">{body}</div>
    </div>
  )
}
