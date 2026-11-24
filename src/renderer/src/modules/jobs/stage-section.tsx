import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router'
import { CalendarCheck, ChevronDown, Plus, Trash2 } from 'lucide-react'
import { STAGE_KINDS, STAGE_STATUSES, stageInputSchema, type Stage, type StageKind, type StagePatch } from '@shared/domain/jobs'
import { limitsOf, rangesOf } from '@/lib/limits'

const LIMITS = limitsOf(stageInputSchema)
const RANGES = rangesOf(stageInputSchema)
import { useApiMutation } from '@/lib/query'
import { useAutosave } from '@/hooks/use-autosave'
import { cn } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Textarea } from '@/components/ui/textarea'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { Field, Segmented } from '@/components/common/page'
import { SectionLabel } from '@/components/common/master-detail'
import { DatePicker } from '@/components/common/date-picker'
import { Confirm } from '@/components/common/confirm'
import { Choice } from '../crm/parts'
import { NumberInput } from '@/components/common/number-input'
import { DUE_BEFORE_START } from '../crm/labels'
import { LinkInput, TextField } from './j1-fields'
import { STAGE_KIND_LABEL, STAGE_STATUS_LABEL, STAGE_STATUS_VARIANT, whenLabel } from './j1-labels'

const KIND_OPTIONS = STAGE_KINDS.map((k) => ({ value: k, label: STAGE_KIND_LABEL[k] }))

function tomorrowAt(hour: number): number {
  const d = new Date()
  d.setDate(d.getDate() + 1)
  d.setHours(hour, 0, 0, 0)
  return d.getTime()
}

/** Calendar mirror indicator: the backend creates/updates events for interview time and test deadline. */
function CalendarBadge({ eventId, label }: { eventId: string | null; label: string }) {
  const navigate = useNavigate()
  if (!eventId) return null
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button variant="ghost" size="xs" className="h-6 text-success" onClick={() => navigate(`/calendar?open=${eventId}`)}>
          <CalendarCheck /> {label}
        </Button>
      </TooltipTrigger>
      <TooltipContent>Є в календарі з нагадуваннями за день і за годину. Відкрити подію</TooltipContent>
    </Tooltip>
  )
}

function StageEditor({ stage }: { stage: Stage }) {
  const update = useApiMutation('jobs', 'updateStage')
  const remove = useApiMutation('jobs', 'removeStage', { successMessage: 'Етап видалено' })
  const patch = (p: StagePatch): void => update.mutate({ id: stage.id, patch: p })
  const [notes, setNotes] = useAutosave(stage.notes, (v) => patch({ notes: v }))
  const isTest = stage.kind === 'test_task'
  const deadlineBeforeStart = !!stage.at && !!stage.deadlineAt && stage.deadlineAt < stage.at
  return (
    <div className="flex flex-col gap-4 pt-3">
      <div className="grid grid-cols-2 gap-4">
        <Field label="Тип етапу">
          <Choice value={stage.kind} onChange={(v) => v && patch({ kind: v })} options={KIND_OPTIONS} />
        </Field>
        <TextField
          label="Назва"
          value={stage.title}
          onSave={(title) => patch({ title })}
          placeholder={STAGE_KIND_LABEL[stage.kind]}
          maxLength={LIMITS.title}
        />
        <Field label={isTest ? 'Отримав завдання' : 'Дата й час'}>
          <DatePicker withTime value={stage.at} onChange={(at) => patch({ at })} placeholder="Призначити" />
        </Field>
        {isTest ? (
          <Field label="Здати до" error={deadlineBeforeStart ? DUE_BEFORE_START : undefined}>
            <DatePicker
              withTime
              value={stage.deadlineAt}
              min={stage.at}
              invalid={deadlineBeforeStart}
              onChange={(deadlineAt) => patch({ deadlineAt })}
              placeholder="Без терміну"
            />
          </Field>
        ) : (
          <Field label="Тривалість, хв">
            <NumberInput
              integer
              {...RANGES.durationMin}
              value={stage.durationMin}
              onChange={(v) => patch({ durationMin: v ?? 60 })}
            />
          </Field>
        )}
        <Field label={isTest ? 'Посилання на завдання / репозиторій' : 'Посилання на дзвінок або адреса'}>
          <LinkInput
            value={stage.location}
            onSave={(location) => patch({ location })}
            placeholder="https://meet.google.com/…"
            maxLength={LIMITS.location}
            strict={false}
          />
        </Field>
        <TextField
          label="Хто проводив"
          value={stage.interviewers}
          onSave={(interviewers) => patch({ interviewers })}
          placeholder="Імена, ролі"
          maxLength={LIMITS.interviewers}
        />
      </div>
      <Field label="Підсумок">
        <Segmented
          size="xs"
          value={stage.status}
          onChange={(status) => patch({ status })}
          options={STAGE_STATUSES.map((s) => ({ value: s, label: STAGE_STATUS_LABEL[s] }))}
        />
      </Field>
      <Field label="Як пройшло, що покращити" count={{ length: notes.length, max: LIMITS.notes }}>
        <Textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Питання, реакція, що підтягнути до наступного разу"
          className="min-h-20"
          maxLength={LIMITS.notes}
        />
      </Field>
      <div className="flex justify-end">
        <Confirm title="Видалити етап?" description="Пов’язані події календаря теж буде видалено." onConfirm={() => remove.mutate(stage.id)}>
          <Button variant="ghost" size="sm" className="text-muted-foreground hover:text-destructive">
            <Trash2 /> Видалити етап
          </Button>
        </Confirm>
      </div>
    </div>
  )
}

function StageRow({ stage, defaultOpen }: { stage: Stage; defaultOpen: boolean }) {
  const [open, setOpen] = useState(defaultOpen)
  const when = stage.kind === 'test_task' ? stage.deadlineAt : stage.at
  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <Card className={cn('gap-0 rounded-2xl px-4 py-3', stage.status === 'cancelled' && 'opacity-60')}>
        <CollapsibleTrigger asChild>
          <Button variant="ghost" className="-mx-2 h-auto justify-start gap-3 rounded-xl px-2 py-1 text-left font-normal hover:bg-transparent">
            <span
              className={cn(
                'size-2.5 shrink-0 rounded-full',
                stage.status === 'planned' ? 'bg-info' : stage.status === 'passed' ? 'bg-success' : stage.status === 'failed' ? 'bg-destructive' : 'bg-muted-foreground'
              )}
            />
            <span className="flex min-w-0 flex-1 flex-col">
              <span className="truncate text-body font-medium">{stage.title || STAGE_KIND_LABEL[stage.kind]}</span>
              <span className="text-caption text-muted-foreground">
                {stage.kind === 'test_task' ? (stage.deadlineAt ? `здати ${whenLabel(stage.deadlineAt)}` : 'без терміну') : whenLabel(when)}
              </span>
            </span>
            <Badge variant={STAGE_STATUS_VARIANT[stage.status]}>{STAGE_STATUS_LABEL[stage.status]}</Badge>
            <ChevronDown className={cn('transition-transform', open && 'rotate-180')} />
          </Button>
        </CollapsibleTrigger>
        <div className="flex flex-wrap gap-1 pl-5">
          <CalendarBadge eventId={stage.eventId} label="у календарі" />
          <CalendarBadge eventId={stage.deadlineEventId} label="дедлайн у календарі" />
        </div>
        <CollapsibleContent>
          <StageEditor stage={stage} />
        </CollapsibleContent>
      </Card>
    </Collapsible>
  )
}

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
}) {
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
      setDeadlineAt(tomorrowAt(18) + 2 * 86_400_000)
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
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[520px]">
        <DialogHeader>
          <DialogTitle>{title ?? 'Новий етап'}</DialogTitle>
          <DialogDescription>
            {context ? `${context}. ` : ''}
            {isTest
              ? 'Термін здачі з’явиться в календарі з нагадуванням за день.'
              : 'Співбесіда з’явиться в календарі з нагадуваннями за день і за годину.'}
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-4">
          <Field label="Що за етап">
            <Segmented
              size="xs"
              value={kind}
              onChange={(k) => {
                setKind(k)
                if (k === 'test_task') {
                  setAt(Date.now())
                  setDeadlineAt(tomorrowAt(18) + 2 * 86_400_000)
                } else if (!at || at < Date.now()) setAt(tomorrowAt(11))
              }}
              options={KIND_OPTIONS}
            />
          </Field>
          <div className="grid grid-cols-2 gap-4">
            <Field label={isTest ? 'Отримав завдання' : 'Дата й час'} error={!isTest && !at ? 'Вкажіть дату й час' : undefined}>
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
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            {cancelLabel}
          </Button>
          <Button
            variant="lime"
            disabled={add.isPending || missingDate || deadlineEarly}
            onClick={() =>
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
            Запланувати
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/** Interview rounds and test tasks of one vacancy, mirrored to the calendar by the backend. */
export function StageSection({ applicationId, stages }: { applicationId: string; stages: Stage[] }) {
  const [adding, setAdding] = useState(false)
  const nextPlanned = stages.find((s) => s.status === 'planned')
  return (
    <section className="flex flex-col gap-3">
      <SectionLabel
        action={
          <Button variant="soft" size="xs" onClick={() => setAdding(true)}>
            <Plus /> Етап
          </Button>
        }
      >
        Етапи
      </SectionLabel>
      {stages.length === 0 ? (
        <p className="text-caption text-muted-foreground">
          Скринінг, технічна, тестове — додайте етап, і він одразу з’явиться в календарі.
        </p>
      ) : (
        <div className="flex flex-col gap-2">
          {stages.map((s) => (
            <StageRow key={s.id} stage={s} defaultOpen={s.id === nextPlanned?.id && stages.length <= 2} />
          ))}
        </div>
      )}
      {adding && <AddStageDialog applicationId={applicationId} open={adding} onOpenChange={setAdding} />}
    </section>
  )
}
