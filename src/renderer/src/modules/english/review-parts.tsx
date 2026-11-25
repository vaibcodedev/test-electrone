import type { ReactElement } from 'react'
import { PartyPopper } from 'lucide-react'
import type { ReviewGrade, Word } from '@shared/domain/english'
import { plural } from '@/lib/format'
import { cn } from '@/lib/utils'
import { Kbd } from '@/components/common/page'
import { Button } from '@/components/ui/button'
import { ButtonGroup } from '@/components/ui/button-group'
import { Badge } from '@/components/ui/badge'
import { Card } from '@/components/ui/card'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import type { GradeCounts } from './use-review-session'

/** Four equal neutral buttons; only the label colour carries the meaning (no single loud one). */
const GRADES: { grade: ReviewGrade; label: string; hint: string; text: string; hover: string; tile: string }[] = [
  { grade: 0, label: 'Не згадав', hint: 'покажу ще раз', text: 'text-destructive', hover: 'hover:bg-destructive/12', tile: 'bg-destructive/12 text-destructive' },
  { grade: 1, label: 'Насилу', hint: 'повторимо скоро', text: 'text-warn', hover: 'hover:bg-warn/15', tile: 'bg-warn/15 text-warn' },
  { grade: 2, label: 'Згадав', hint: 'за планом', text: 'text-foreground', hover: 'hover:bg-accent', tile: '' },
  { grade: 3, label: 'Легко', hint: 'не скоро', text: 'text-success', hover: 'hover:bg-success/15', tile: 'bg-success/15 text-success' }
]

/** The flashcard: the term first, translation and example after «Показати відповідь» (or Space). */
export function ReviewCard({ word, revealed, onReveal }: { word: Word; revealed: boolean; onReveal: () => void }): ReactElement {
  return (
    <Card
      onClick={onReveal}
      className={cn(
        // Long words and sentences wrap inside the card instead of running off it.
        'min-h-[340px] items-center justify-center gap-3 rounded-[28px] px-10 py-12 text-center ring-1 ring-foreground/8 [overflow-wrap:anywhere]',
        !revealed && 'cursor-pointer'
      )}
    >
      {word.context && (
        <Badge variant="soft" className="max-w-full text-caption font-normal text-muted-foreground">
          {word.context}
        </Badge>
      )}
      <div className="font-display max-w-full text-display">{word.term}</div>
      {word.transcription && <div className="text-lead text-muted-foreground">{word.transcription}</div>}
      {revealed ? (
        <div className="selectable mt-3 flex max-w-xl animate-enter flex-col items-center gap-2.5">
          <div className="text-stat-sm font-medium">{word.translation || '—'}</div>
          {word.example && <div className="text-lead text-foreground/85 italic">«{word.example}»</div>}
          {word.exampleTranslation && <div className="text-body text-muted-foreground">{word.exampleTranslation}</div>}
        </div>
      ) : (
        <div className="mt-5 flex flex-col items-center gap-2.5">
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
  )
}

/** Grade row after the answer is open; before that a placeholder of the same height (nothing jumps). */
export function GradeButtons({ revealed, busy, onGrade }: { revealed: boolean; busy: boolean; onGrade: (g: ReviewGrade) => void }): ReactElement {
  if (!revealed)
    return (
      <div className="flex h-16 items-center justify-center rounded-2xl border border-dashed border-foreground/12 text-caption text-muted-foreground">
        Згадайте переклад, відкрийте відповідь і оцініть, наскільки легко він дався
      </div>
    )
  return (
    <div className="flex animate-enter flex-col gap-2">
      <div className="text-center text-body font-medium">Як ви згадали переклад?</div>
      <div className="grid grid-cols-4 gap-2">
        {GRADES.map((g) => (
          <Button
            key={g.grade}
            variant="soft"
            disabled={busy}
            onClick={() => onGrade(g.grade)}
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
  )
}

/** End of a session: how many words, answers per grade. */
export function SessionSummary({
  extra,
  uniqueTotal,
  done,
  results
}: {
  extra: boolean
  uniqueTotal: number
  done: number
  results: GradeCounts
}): ReactElement {
  return (
    <>
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
    </>
  )
}

/** Practice beyond the norm (doesn't shift the schedule) and the way back. */
export function PracticeMore({ onStart, onExit }: { onStart: (limit: number) => void; onExit: () => void }): ReactElement {
  return (
    <div className="mt-6 flex flex-col items-center gap-3">
      <span className="text-caption text-muted-foreground">Потренуватися понад норму — розклад повторень не збиватиметься</span>
      <ButtonGroup>
        <Button variant="soft" onClick={() => onStart(10)}>
          Ще 10
        </Button>
        <Button variant="soft" onClick={() => onStart(20)}>
          Ще 20
        </Button>
        <Button variant="soft" onClick={() => onStart(500)}>
          Усі
        </Button>
      </ButtonGroup>
      <Button variant="soft" onClick={onExit}>
        Повернутися до словника
      </Button>
    </div>
  )
}
