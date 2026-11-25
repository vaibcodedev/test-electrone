import { useState, type ReactElement } from 'react'
import { useNavigate, useSearchParams } from 'react-router'
import { ArrowLeft, MessageCircleQuestion, PartyPopper } from 'lucide-react'
import type { InterviewQuestion, QuestionCategory, QuestionGroup } from '@shared/domain/jobs'
import { useHotkey } from '@/hooks/use-hotkey'
import { EmptyState, Kbd, SegmentBar } from '@/components/common/page'
import { CardSkeleton, Delayed } from '@/components/common/page-skeleton'
import { Markdown } from '@/components/common/markdown'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card } from '@/components/ui/card'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { cn } from '@/lib/utils'
import { plural } from '@/lib/format'
import { LANG_LABEL, QUESTION_CATEGORY_LABEL } from './labels'
import { QuestionCategoryFilter } from './question-category'
import { usePracticeSession, type Grade } from './use-practice-session'

/** Four equal neutral buttons; only the label colour carries the meaning (same as the English trainer). */
const GRADES: { grade: Grade; label: string; hint: string; text: string; tile: string }[] = [
  { grade: 0, label: 'Не вдалося', hint: 'повернеться сьогодні', text: 'text-destructive', tile: 'bg-destructive/12 text-destructive' },
  { grade: 1, label: 'Насилу', hint: 'повторимо скоро', text: 'text-warn', tile: 'bg-warn/15 text-warn' },
  { grade: 2, label: 'Добре', hint: 'за планом', text: 'text-foreground', tile: '' },
  { grade: 3, label: 'Впевнено', hint: 'не скоро', text: 'text-success', tile: 'bg-success/15 text-success' }
]

/** «Тренуватися далі»: more questions ahead of schedule (soonest due and weakest first). */
function ExtraPractice({ busy, onStart }: { busy: boolean; onStart: (limit: number) => void }): ReactElement {
  return (
    <div className="mt-6 flex flex-col items-center gap-2">
      <span className="text-caption text-muted-foreground">Тренуватися далі</span>
      <div className="flex gap-2">
        <Button variant="soft" disabled={busy} onClick={() => onStart(10)}>
          Ще 10
        </Button>
        <Button variant="soft" disabled={busy} onClick={() => onStart(20)}>
          Ще 20
        </Button>
        <Button variant="soft" disabled={busy} onClick={() => onStart(500)}>
          Усі
        </Button>
      </div>
    </div>
  )
}

function BackToBank({ onClick }: { onClick: () => void }): ReactElement {
  return (
    <Button variant="soft" className="mt-3" onClick={onClick}>
      <ArrowLeft /> До банку питань
    </Button>
  )
}

/** Nothing due today: practise ahead or go back. */
function PracticeAllDone({ busy, onExtra, onExit }: { busy: boolean; onExtra: (limit: number) => void; onExit: () => void }): ReactElement {
  return (
    <div className="flex animate-enter flex-col items-center text-center">
      <div className="font-display text-title">На сьогодні все повторено</div>
      <p className="mt-2 max-w-md text-body text-muted-foreground">
        Питання повернуться, коли настане їхній інтервал. Хочете більше — тренуйтеся наперед, розклад від цього не зсунеться.
      </p>
      <ExtraPractice busy={busy} onStart={onExtra} />
      <BackToBank onClick={onExit} />
    </div>
  )
}

function PracticeSummary({
  uniqueTotal,
  done,
  results,
  busy,
  onExtra,
  onExit
}: {
  uniqueTotal: number
  done: number
  results: Record<Grade, number>
  busy: boolean
  onExtra: (limit: number) => void
  onExit: () => void
}): ReactElement {
  return (
    <div className="flex w-full max-w-lg animate-enter flex-col items-center text-center">
      <Avatar className="size-16">
        <AvatarFallback className="bg-lime text-lime-foreground">
          <PartyPopper className="size-7" />
        </AvatarFallback>
      </Avatar>
      <div className="font-display mt-5 text-title">Тренування завершено</div>
      <p className="mt-2 text-body text-muted-foreground">
        {uniqueTotal} {plural(uniqueTotal, ['питання', 'питання', 'питань'])}, відповідей: {done}
      </p>
      <div className="stagger mt-6 grid w-full grid-cols-4 gap-2">
        {GRADES.map((g) => (
          <Card key={g.grade} className={cn('gap-1 rounded-2xl px-3 py-3', g.tile)}>
            <div className="font-display text-headline leading-none">{results[g.grade]}</div>
            <div className="text-caption">{g.label}</div>
          </Card>
        ))}
      </div>
      <ExtraPractice busy={busy} onStart={onExtra} />
      <BackToBank onClick={onExit} />
    </div>
  )
}

/** The question card: answer out loud, reveal yours, grade with 1–4. */
function PracticeCard({
  question,
  revealed,
  onReveal,
  grading,
  onGrade
}: {
  question: InterviewQuestion
  revealed: boolean
  onReveal: () => void
  grading: boolean
  onGrade: (g: Grade) => void
}): ReactElement {
  return (
    <div className="flex w-full max-w-3xl animate-enter flex-col gap-4">
      <Card
        onClick={onReveal}
        className={cn(
          // Long questions and answers wrap inside the card instead of running off it.
          'min-h-[320px] items-center justify-center gap-3 rounded-3xl px-10 py-10 text-center ring-1 ring-foreground/8 [overflow-wrap:anywhere]',
          !revealed && 'cursor-pointer'
        )}
      >
        <div className="flex flex-wrap justify-center gap-1.5">
          <Badge variant="soft" className="font-normal text-muted-foreground">
            {QUESTION_CATEGORY_LABEL[question.category]}
          </Badge>
          {question.topic && (
            <Badge variant="soft" className="font-normal text-muted-foreground">
              {question.topic}
            </Badge>
          )}
          <Badge variant="soft" className="font-normal text-muted-foreground">
            {LANG_LABEL[question.lang]}
          </Badge>
        </div>
        <div className="font-display max-w-2xl text-headline leading-tight text-balance">{question.question}</div>
        {revealed ? (
          <div className="selectable mt-2 w-full animate-enter text-left">
            {question.answer.trim() ? (
              <Markdown source={question.answer} className="rounded-2xl bg-card p-5" />
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
                onReveal()
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
                disabled={grading}
                onClick={() => onGrade(g.grade)}
                className="tile h-16 flex-col gap-1 rounded-2xl bg-surface"
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
        <div className="flex h-16 items-center justify-center gap-1.5 rounded-2xl border border-dashed border-foreground/12 text-caption text-muted-foreground">
          Після відповіді оцініть себе клавішами <Kbd>1</Kbd>–<Kbd>4</Kbd>
        </div>
      )}
    </div>
  )
}

type Filter = { group: QuestionGroup | undefined; category: QuestionCategory | undefined }

/** Interview practice: say the answer out loud, reveal yours, grade. «Не вдалося» returns at the end of the session. */
export function PracticePage(): ReactElement {
  const [filter, setFilter] = useState<Filter>({ group: undefined, category: undefined })
  // A new filter starts a fresh session: remount instead of resetting every piece of state.
  return <PracticeSessionView key={`${filter.group}:${filter.category}`} filter={filter} onFilter={setFilter} />
}

function PracticeSessionView({ filter, onFilter }: { filter: Filter; onFilter: (next: Filter) => void }): ReactElement {
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const { group, category } = filter
  const s = usePracticeSession({ category, group, extraFirst: params.get('extra') === '1' })
  const filtered = !!(group || category)

  const exit = (): void => void navigate('/jobs/questions')

  useHotkey('escape', exit)
  useHotkey(' ', s.reveal, { enabled: !!s.current && !s.revealed })
  useHotkey('1', () => s.grade(0), { enabled: s.revealed })
  useHotkey('2', () => s.grade(1), { enabled: s.revealed })
  useHotkey('3', () => s.grade(2), { enabled: s.revealed })
  useHotkey('4', () => s.grade(3), { enabled: s.revealed })

  return (
    <div className="flex h-full flex-col gap-4 px-8 py-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="sm" onClick={exit}>
          <ArrowLeft /> До питань
        </Button>
        {/* No empty bar and «0/0» over an empty state: the progress appears with the first card. */}
        {s.total > 0 && (
          <>
            <SegmentBar value={s.done} total={s.total} segments={Math.min(s.total, 12)} className="flex-1" />
            <span className="w-16 text-right text-body text-muted-foreground tabular-nums">
              {Math.min(s.done + (s.finished ? 0 : 1), s.total)}/{s.total}
            </span>
          </>
        )}
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2">
        {!(s.bankEmpty && !filtered) && <QuestionCategoryFilter group={group} category={category} onChange={onFilter} />}
        {s.mode === 'extra' && <Badge variant="info">Тренування наперед — розклад не зсувається</Badge>}
      </div>

      <div className="flex min-h-0 flex-1 items-center justify-center overflow-y-auto">
        {s.loading ? (
          <Delayed delay={150}>
            <CardSkeleton height={320} className="w-full max-w-3xl" />
          </Delayed>
        ) : s.queue?.length === 0 && s.bankEmpty ? (
          filtered ? (
            <EmptyState
              icon={MessageCircleQuestion}
              title="У цій категорії питань немає"
              hint="Виберіть іншу категорію або додайте питання в банк."
              cta={{ label: 'Усі питання', onClick: () => onFilter({ group: undefined, category: undefined }) }}
            />
          ) : (
            <EmptyState
              icon={MessageCircleQuestion}
              title="Тут ще немає питань"
              hint="Додайте питання зі співбесіди й свою відповідь у банк — і тренуйтеся тут."
              cta={{ label: 'До банку питань', icon: ArrowLeft, onClick: exit }}
            />
          )
        ) : s.queue?.length === 0 ? (
          <PracticeAllDone busy={s.loadingExtra} onExtra={s.startExtra} onExit={exit} />
        ) : s.finished ? (
          <PracticeSummary
            uniqueTotal={s.uniqueTotal}
            done={s.done}
            results={s.results}
            busy={s.loadingExtra}
            onExtra={s.startExtra}
            onExit={exit}
          />
        ) : s.current ? (
          // Keyed by question: every next card enters with the same short motion.
          <PracticeCard
            key={`${s.current.id}:${s.index}`}
            question={s.current}
            revealed={s.revealed}
            onReveal={s.reveal}
            grading={s.grading}
            onGrade={s.grade}
          />
        ) : null}
      </div>
    </div>
  )
}
