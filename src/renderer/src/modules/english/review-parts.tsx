import { useRef, useState, type ReactElement } from 'react'
import { CircleCheck, CircleX, PartyPopper } from 'lucide-react'
import type { ReviewGrade, Word } from '@shared/domain/english'
import { isGapAnswer, type GapCard } from '@shared/english-gaps'
import { Input } from '@/components/ui/input'
import { SpeakButton } from './speak-button'
import type { Pronounce } from './use-pronounce'
import { plural } from '@/lib/format'
import { cn } from '@/lib/utils'
import { Kbd } from '@/components/common/page'
import { Button } from '@/components/ui/button'
import { ButtonGroup } from '@/components/ui/button-group'
import { Badge } from '@/components/ui/badge'
import { Card } from '@/components/ui/card'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import type { GradeCounts } from './use-review-session'

/**
 * Four equal neutral buttons; only the label colour carries the meaning (no single loud one). Labels without
 * gender (glossary «Статусы»), and every hint says one thing in one voice: when the word comes back.
 */
const GRADES: {
  grade: ReviewGrade
  label: string
  hint: string
  text: string
  hover: string
  tile: string
}[] = [
  {
    grade: 0,
    label: 'Не згадали',
    hint: 'ще в цій сесії',
    text: 'text-destructive',
    hover: 'hover:bg-destructive/12',
    tile: 'bg-destructive/12 text-destructive'
  },
  {
    grade: 1,
    label: 'Насилу',
    hint: 'скоро',
    text: 'text-warn',
    hover: 'hover:bg-warn/15',
    tile: 'bg-warn/15 text-warn'
  },
  {
    grade: 2,
    label: 'Згадали',
    hint: 'за планом',
    text: 'text-foreground',
    hover: 'hover:bg-accent',
    tile: ''
  },
  {
    grade: 3,
    label: 'Легко',
    hint: 'нескоро',
    text: 'text-success',
    hover: 'hover:bg-success/15',
    tile: 'bg-success/15 text-success'
  }
]

/** The flashcard: the term first, translation and example after «Показати відповідь» (or Space). */
export function ReviewCard({
  word,
  revealed,
  onReveal,
  pronounce
}: {
  word: Word
  revealed: boolean
  onReveal: () => void
  pronounce: Pronounce
}): ReactElement {
  return (
    <Card
      onClick={onReveal}
      className={cn(
        // Long words and sentences wrap inside the card instead of running off it.
        'min-h-85 items-center justify-center gap-3 rounded-3xl px-10 py-12 text-center ring-1 ring-foreground/8 wrap-anywhere',
        !revealed && 'cursor-pointer'
      )}
    >
      {word.context && (
        <Badge
          variant="soft"
          truncate
          className="max-w-full text-caption font-normal text-muted-foreground"
        >
          {word.context}
        </Badge>
      )}
      <div className="flex max-w-full items-center gap-2">
        <div className="font-display min-w-0 text-display">{word.term}</div>
        {word.kind !== 'rule' && (
          <SpeakButton text={word.term} shortcut="R" pronounce={pronounce} />
        )}
      </div>
      {word.transcription && (
        <div className="text-lead text-muted-foreground">{word.transcription}</div>
      )}
      {revealed ? (
        <div className="selectable mt-3 flex max-w-xl animate-enter flex-col items-center gap-2.5">
          <div className="text-stat-sm font-medium">{word.translation || '—'}</div>
          {word.example && (
            <div className="text-lead text-foreground/85 italic">«{word.example}»</div>
          )}
          {word.exampleTranslation && (
            <div className="text-body text-muted-foreground">{word.exampleTranslation}</div>
          )}
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
export function GradeButtons({
  revealed,
  busy,
  onGrade,
  rule = false
}: {
  revealed: boolean
  busy: boolean
  onGrade: (g: ReviewGrade) => void
  /** A grammar card: the hint and the question speak of the gap, not of a translation. */
  rule?: boolean
}): ReactElement {
  if (!revealed)
    return (
      <div className="flex h-16 items-center justify-center text-caption text-muted-foreground">
        {rule
          ? 'Впишіть пропущене й натисніть Enter — тоді оцініть, наскільки легко далося'
          : 'Згадайте переклад, відкрийте відповідь і оцініть, наскільки легко він дався'}
      </div>
    )
  return (
    <div className="flex animate-enter flex-col gap-2">
      <div className="text-center text-body font-medium">
        {rule ? 'Як далося правило?' : 'Як ви згадали переклад?'}
      </div>
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
      <div className="font-display text-title mt-5">
        {extra ? 'Тренування завершено' : 'Сесію завершено'}
      </div>
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
export function PracticeMore({
  onStart,
  onMoreNew,
  newCount,
  onExit
}: {
  onStart: (limit: number) => void
  /** Offered while the dictionary still has new entries beyond today's goal. */
  onMoreNew: (limit: number) => void
  newCount: number
  onExit: () => void
}): ReactElement {
  return (
    <div className="mt-6 flex flex-col items-center gap-3">
      {newCount > 0 && (
        <>
          <span className="text-caption text-muted-foreground">
            Ціль на сьогодні виконано, а нових слів у словнику ще {newCount}
          </span>
          <Button variant="soft" onClick={() => onMoreNew(5)}>
            Ще {Math.min(5, newCount)} {plural(Math.min(5, newCount), ['нове', 'нові', 'нових'])}
          </Button>
        </>
      )}
      <span className="text-caption text-muted-foreground">
        Потренуватися понад норму — розклад повторень не збиватиметься
      </span>
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

/**
 * A grammar card: the sentence with a gap (and its hint), the answer typed in, Enter checks. After that the gap is
 * filled — green when it matched, otherwise the right answer next to what was typed — and the rule is shown.
 */
export function GapReviewCard({
  rule,
  card,
  revealed,
  onReveal,
  pronounce
}: {
  rule: Word
  card: GapCard
  revealed: boolean
  onReveal: () => void
  pronounce: Pronounce
}): ReactElement {
  const [typed, setTyped] = useState('')
  const input = useRef<HTMLInputElement>(null)
  const right = isGapAnswer(card, typed)
  const reveal = (): void => {
    // Out of the field: the grade keys 1–4 don't work while typing.
    input.current?.blur()
    onReveal()
  }
  return (
    <Card className="min-h-85 items-center justify-center gap-4 rounded-3xl px-10 py-12 text-center ring-1 ring-foreground/8 wrap-anywhere">
      <Badge
        variant="soft"
        truncate
        className="max-w-full text-caption font-normal text-muted-foreground"
      >
        Граматика · {rule.term}
      </Badge>
      <div className="font-display max-w-2xl text-headline leading-snug">
        {card.before}
        {revealed ? (
          <span
            className={cn(
              'font-semibold underline underline-offset-6',
              right ? 'text-success' : 'text-foreground'
            )}
          >
            {card.answers[0]}
          </span>
        ) : (
          <span className="inline-block min-w-24 border-b-2 border-foreground/40 px-1 text-muted-foreground">
            {card.hint ? `(${card.hint})` : '\u00a0'}
          </span>
        )}
        {card.after}
      </div>
      {revealed ? (
        <div className="selectable flex max-w-xl animate-enter flex-col items-center gap-2.5">
          {typed.trim() && (
            <div
              className={cn(
                'flex items-center gap-1.5 text-body font-medium',
                right ? 'text-success' : 'text-destructive'
              )}
            >
              {right ? <CircleCheck className="size-4" /> : <CircleX className="size-4" />}
              {right ? 'Правильно' : `Ви написали: ${typed.trim()}`}
            </div>
          )}
          {card.answers.length > 1 && (
            <div className="text-caption text-muted-foreground">
              Також правильно: {card.answers.slice(1).join(', ')}
            </div>
          )}
          {rule.translation && (
            <div className="text-body whitespace-pre-line text-muted-foreground">
              {rule.translation}
            </div>
          )}
          <SpeakButton text={card.sentence} shortcut="R" pronounce={pronounce} />
        </div>
      ) : (
        <form
          className="mt-2 flex w-full max-w-sm flex-col items-center gap-2.5"
          onSubmit={(e) => {
            e.preventDefault()
            reveal()
          }}
        >
          <Input
            ref={input}
            autoFocus
            value={typed}
            maxLength={200}
            onChange={(e) => setTyped(e.target.value)}
            placeholder="Що пропущено?"
            aria-label="Відповідь"
            autoComplete="off"
            spellCheck={false}
            className="text-center"
          />
          <Button type="submit" variant="lime" size="lg">
            Перевірити
          </Button>
          <span className="flex items-center gap-1.5 text-caption text-muted-foreground">
            або <Kbd>Enter</Kbd>
          </span>
        </form>
      )}
    </Card>
  )
}
