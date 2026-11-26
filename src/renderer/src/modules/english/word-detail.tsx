import { useId, useMemo, type KeyboardEvent, type ReactNode, type ReactElement } from 'react'
import { WORD_KINDS, wordInputSchema, type Word, type WordPatch } from '@shared/domain/english'
import { limitsOf } from '@/lib/limits'
import { useApiMutation } from '@/lib/query'
import { useAutosave } from '@/hooks/use-autosave'
import { fmtDateTime, fmtDay, easeLabel, plural } from '@/lib/format'
import { cn } from '@/lib/utils'
import {
  DetailPane,
  EntityAside,
  InlineTitle,
  SectionLabel
} from '@/components/common/master-detail'
import { Field, Segmented } from '@/components/common/page'
import { useReadOnly } from '@/components/common/detail-mode-context'
import { EditHintText } from '@/components/common/detail-mode'
import { StatCell } from '@/components/common/stat-tile'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { FieldError } from '@/components/ui/field'
import { KIND_LABEL, STAGE_BADGE, STAGE_LABEL_ONE } from './labels'

const LIMITS = limitsOf(wordInputSchema)

/** One-line fields shown in a Textarea (a long value wraps while reading): Enter adds no line break, as in InlineTitle. */
const noEnter = (e: KeyboardEvent): void => {
  if (e.key === 'Enter') e.preventDefault()
}
const oneLine = (v: string): string => v.replace(/\n/g, ' ')

type Form = Pick<
  Word,
  | 'term'
  | 'translation'
  | 'kind'
  | 'transcription'
  | 'example'
  | 'exampleTranslation'
  | 'context'
  | 'notes'
>

function toForm(w: Word): Form {
  return {
    term: w.term,
    translation: w.translation,
    kind: w.kind,
    transcription: w.transcription,
    example: w.example,
    exampleTranslation: w.exampleTranslation,
    context: w.context,
    notes: w.notes
  }
}

/** Spaced-repetition facts; a word never reviewed has none yet, so it says when it comes up instead. */
function Repetition({ word }: { word: Word }): ReactElement {
  return (
    <section className="flex flex-col gap-2">
      <SectionLabel>Повторення</SectionLabel>
      {!word.lastReviewedAt ? (
        <p className="text-body leading-relaxed text-muted-foreground">
          Ще не повторювали — слово буде в тренуванні {fmtDay(word.dueAt)}.
        </p>
      ) : (
        <div className="grid grid-cols-2 gap-1.5">
          <StatCell
            label="Наступне"
            value={fmtDay(word.dueAt) || '—'}
            hint={`Коли слово знову з’явиться в тренуванні: ${fmtDateTime(word.dueAt)}.`}
          />
          <StatCell
            label="Інтервал"
            value={
              word.intervalDays < 1
                ? 'менше дня'
                : `${Math.round(word.intervalDays)} ${plural(Math.round(word.intervalDays), ['день', 'дні', 'днів'])}`
            }
            hint="Скільки днів між повтореннями зараз. Згадали — інтервал росте, забули — знову короткий."
          />
          <StatCell
            label="Поспіль"
            value={String(word.repetitions)}
            hint="Скільки разів поспіль ви згадали слово без помилки."
          />
          <StatCell
            label="Помилок"
            value={String(word.lapses)}
            hint="Скільки разів слово забулося й повернулося на початок."
          />
          <StatCell
            label="Дається"
            value={easeLabel(word.ease)}
            hint="Наскільки легко дається слово за вашими відповідями. Що важче, то частіше воно трапляється."
          />
          <StatCell
            label="Останній раз"
            value={fmtDay(word.lastReviewedAt)}
            hint="Коли ви востаннє повторювали це слово."
          />
        </div>
      )}
    </section>
  )
}

/** The term is required: an emptied one isn't saved (the rest of the form still is) and says so while editing. */
function TermError({ id, empty }: { id: string; empty: boolean }): ReactElement | null {
  const readOnly = useReadOnly()
  if (!empty || readOnly) return null
  return (
    <FieldError id={id} className="text-caption">
      Введіть слово або фразу
    </FieldError>
  )
}

/**
 * Example and its translation side by side once the pane is wide enough (a narrow one stacks them); while
 * reading, a missing translation doesn't keep an empty column.
 */
function ExampleGrid({ wide, children }: { wide: boolean; children: ReactNode }): ReactElement {
  const readOnly = useReadOnly()
  return (
    <div className="@container">
      <div className={cn('grid gap-3', (wide || !readOnly) && '@md:grid-cols-2')}>{children}</div>
    </div>
  )
}

export function WordDetail({ word, onClose }: { word: Word; onClose: () => void }): ReactElement {
  const update = useApiMutation('english', 'update')
  const remove = useApiMutation('english', 'remove', { successMessage: 'Слово переміщено в кошик' })
  const initial = useMemo(() => toForm(word), [word])
  const [form, setForm] = useAutosave<Form>(initial, (next) => {
    // An emptied term is not saved, but the other fields are: closing the pane must not lose them.
    const { term, ...rest } = next
    update.mutate({ id: word.id, patch: (term.trim() ? next : rest) as WordPatch })
  })
  const set = <K extends keyof Form>(key: K, value: Form[K]): void =>
    setForm({ ...form, [key]: value })
  const entity = { type: 'word' as const, id: word.id }
  const id = useId()

  return (
    <DetailPane
      entity={entity}
      onClose={onClose}
      onDelete={() => remove.mutate(word.id)}
      headerExtra={<Badge variant={STAGE_BADGE[word.stage]}>{STAGE_LABEL_ONE[word.stage]}</Badge>}
      emptyHint={
        <>
          Перекладу й прикладу поки немає. <EditHintText />
        </>
      }
      aside={
        <EntityAside
          entity={entity}
          tags={word.tags}
          onTagsChange={(tagIds) => update.mutate({ id: word.id, patch: { tagIds } })}
          createdAt={word.createdAt}
          updatedAt={word.updatedAt}
          files={false}
        >
          <Repetition word={word} />
        </EntityAside>
      }
    >
      <div className="flex flex-col gap-5">
        <div>
          <InlineTitle
            value={form.term}
            onChange={(v) => set('term', v)}
            placeholder="Слово"
            maxLength={LIMITS.term}
            invalid={!form.term.trim()}
            describedBy={form.term.trim() ? undefined : `${id}-term-error`}
          />
          <TermError id={`${id}-term-error`} empty={!form.term.trim()} />
        </div>
        <Field label="Транскрипція" htmlFor={`${id}-tr`}>
          <Input
            id={`${id}-tr`}
            value={form.transcription}
            maxLength={LIMITS.transcription}
            onChange={(e) => set('transcription', e.target.value)}
            placeholder="Напр.: [ˈrəʊlaʊt]"
            className="max-w-xs"
          />
        </Field>
        {/* One line to start with, but a long translation wraps while reading instead of ending in «…». */}
        <Field label="Переклад" htmlFor={`${id}-translation`}>
          <Textarea
            id={`${id}-translation`}
            rows={1}
            value={form.translation}
            maxLength={LIMITS.translation}
            onKeyDown={noEnter}
            onChange={(e) => set('translation', oneLine(e.target.value))}
            placeholder="Як це українською"
            className="min-h-9"
          />
        </Field>
        <Field label="Тип">
          <Segmented
            options={WORD_KINDS.map((k) => ({ value: k, label: KIND_LABEL[k] }))}
            value={form.kind}
            onChange={(k) => set('kind', k)}
          />
        </Field>
        <ExampleGrid wide={!!form.exampleTranslation}>
          <Field label="Приклад" count={{ length: form.example.length, max: LIMITS.example }}>
            <Textarea
              value={form.example}
              maxLength={LIMITS.example}
              onChange={(e) => set('example', e.target.value)}
              placeholder="Речення, де ви це побачили"
            />
          </Field>
          <Field
            label="Переклад прикладу"
            count={{ length: form.exampleTranslation.length, max: LIMITS.exampleTranslation }}
          >
            <Textarea
              value={form.exampleTranslation}
              maxLength={LIMITS.exampleTranslation}
              onChange={(e) => set('exampleTranslation', e.target.value)}
              placeholder="Як це речення звучить українською"
            />
          </Field>
        </ExampleGrid>
        <Field label="Джерело" htmlFor={`${id}-context`}>
          <Textarea
            id={`${id}-context`}
            rows={1}
            value={form.context}
            maxLength={LIMITS.context}
            onKeyDown={noEnter}
            onChange={(e) => set('context', oneLine(e.target.value))}
            placeholder="Напр.: PR, документація, чат"
            className="min-h-9"
          />
        </Field>
        <Field label="Нотатки" count={{ length: form.notes.length, max: LIMITS.notes }}>
          <Textarea
            value={form.notes}
            maxLength={LIMITS.notes}
            onChange={(e) => set('notes', e.target.value)}
            placeholder="Синоніми, нюанси вживання"
          />
        </Field>
      </div>
    </DetailPane>
  )
}
