import { useEffect, useState, type ReactElement } from 'react'
import { addDays } from 'date-fns'
import { stageInputSchema, type StageKind } from '@shared/domain/jobs'
import { limitsOf, rangesOf } from '@/lib/limits'
import { useApiMutation } from '@/lib/query'
import { Textarea } from '@/components/ui/textarea'
import { Field, Segmented } from '@/components/common/page'
import { FormDialog } from '@/components/common/form-dialog'
import { DatePicker } from '@/components/common/date-picker'
import { NumberInput } from '@/components/common/number-input'
import { DUE_BEFORE_START } from '../crm/labels'
import { KIND_OPTIONS } from './labels'

const LIMITS = limitsOf(stageInputSchema)
const RANGES = rangesOf(stageInputSchema)

function tomorrowAt(hour: number): number {
  const d = new Date()
  d.setDate(d.getDate() + 1)
  d.setHours(hour, 0, 0, 0)
  return d.getTime()
}

/** Test task deadline: in three days at 18:00 local time (addDays keeps the hour across DST changes). */
const defaultDeadline = (): number => addDays(new Date(tomorrowAt(18)), 2).getTime()

/**
 * New stage form (also used by the «Запланувати» prompt when a vacancy moves to interview / test task).
 * The backend mirrors the stage to the calendar.
 */
export function AddStageDialog({
  applicationId,
  open,
  onOpenChange,
  defaultKind = 'screening',
  title,
  context,
  cancelLabel = 'Скасувати'
}: {
  applicationId: string
  open: boolean
  onOpenChange: (o: boolean) => void
  defaultKind?: StageKind
  /** Dialog title; defaults to «Новий етап». */
  title?: string
  /** Shown under the title, e.g. «Senior Frontend · Grammarly». */
  context?: string
  cancelLabel?: string
}): ReactElement {
  const [kind, setKind] = useState<StageKind>(defaultKind)
  const [at, setAt] = useState<number | null>(() => tomorrowAt(11))
  const [deadlineAt, setDeadlineAt] = useState<number | null>(null)
  const [durationMin, setDurationMin] = useState<number | null>(60)
  const [notes, setNotes] = useState('')

  // Fresh, prefilled form every time it opens (kind from the status the vacancy moved to).
  useEffect(() => {
    if (!open) return
    setKind(defaultKind)
    setNotes('')
    setDurationMin(60)
    if (defaultKind === 'test_task') {
      setAt(Date.now())
      setDeadlineAt(defaultDeadline())
    } else {
      setAt(tomorrowAt(11))
      setDeadlineAt(null)
    }
  }, [open, defaultKind])

  const add = useApiMutation('jobs', 'addStage', {
    successMessage: 'Етап заплановано — подія вже в календарі',
    onSuccess: () => onOpenChange(false)
  })
  const isTest = kind === 'test_task'
  const missingDate = isTest ? !deadlineAt : !at
  const deadlineEarly = isTest && !!at && !!deadlineAt && deadlineAt < at
  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title={title ?? 'Новий етап'}
      description={
        <>
          {context ? `${context}. ` : ''}
          {isTest
            ? 'Термін здачі з’явиться в календарі з нагадуванням за день.'
            : 'Співбесіда з’явиться в календарі з нагадуваннями за день і за годину.'}
        </>
      }
      submitLabel="Запланувати"
      cancelLabel={cancelLabel}
      invalid={missingDate || deadlineEarly}
      pending={add.isPending}
      onSubmit={() =>
        add.mutate({
          applicationId,
          kind,
          at,
          deadlineAt: isTest ? deadlineAt : null,
          durationMin: Math.round(durationMin ?? 60),
          notes: notes.trim()
        })
      }
    >
      <Field label="Що за етап">
        <Segmented
          size="xs"
          value={kind}
          onChange={(k) => {
            setKind(k)
            if (k === 'test_task') {
              setAt(Date.now())
              setDeadlineAt(defaultDeadline())
            } else if (!at || at < Date.now()) setAt(tomorrowAt(11))
          }}
          options={KIND_OPTIONS}
        />
      </Field>
      <div className="grid grid-cols-2 gap-4">
        <Field label={isTest ? 'Завдання отримано' : 'Дата й час'} error={!isTest && !at ? 'Вкажіть дату й час' : undefined}>
          <DatePicker withTime value={at} onChange={setAt} clearable={isTest} />
        </Field>
        {isTest ? (
          <Field label="Здати до" error={!deadlineAt ? 'Вкажіть термін здачі' : deadlineEarly ? DUE_BEFORE_START : undefined}>
            <DatePicker withTime value={deadlineAt} onChange={setDeadlineAt} placeholder="Без терміну" min={at} invalid={deadlineEarly} />
          </Field>
        ) : (
          <Field label="Тривалість, хв">
            <NumberInput integer allowEmpty {...RANGES.durationMin} value={durationMin} onChange={setDurationMin} placeholder="60" />
          </Field>
        )}
      </div>
      <Field label="Нотатка (необов’язково)" count={{ length: notes.length, max: LIMITS.notes }}>
        <Textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder={isTest ? 'Що треба зробити, стек, вимоги' : 'Посилання на дзвінок, з ким, що підготувати'}
          className="min-h-16"
          maxLength={LIMITS.notes}
        />
      </Field>
    </FormDialog>
  )
}
