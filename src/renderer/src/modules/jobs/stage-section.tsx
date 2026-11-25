import { useState, type ReactElement } from 'react'
import { useNavigate } from 'react-router'
import { CalendarCheck, ChevronDown, Plus, Trash2 } from 'lucide-react'
import { STAGE_STATUSES, stageInputSchema, type Stage, type StagePatch } from '@shared/domain/jobs'
import { limitsOf, rangesOf } from '@/lib/limits'
import { useApiMutation } from '@/lib/query'
import { useAutosave } from '@/hooks/use-autosave'
import { fmtMinutes } from '@/lib/format'
import { cn } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Textarea } from '@/components/ui/textarea'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { Field, Segmented } from '@/components/common/page'
import { SectionLabel } from '@/components/common/master-detail'
import { DatePicker } from '@/components/common/date-picker'
import { Confirm } from '@/components/common/confirm'
import { Choice } from '@/components/common/choice'
import { NumberInput } from '@/components/common/number-input'
import { DUE_BEFORE_START } from '../crm/labels'
import { LinkInput, TextField } from '@/components/common/text-field'
import { useReadOnly } from '@/components/common/detail-mode-context'
import { EditHint } from '@/components/common/detail-mode'
import { KIND_OPTIONS, STAGE_KIND_LABEL, STAGE_STATUS_LABEL, STAGE_STATUS_VARIANT, whenLabel } from './labels'
import { AddStageDialog } from './add-stage-dialog'

const LIMITS = limitsOf(stageInputSchema)
const RANGES = rangesOf(stageInputSchema)

/** Calendar mirror indicator: the backend creates/updates events for interview time and test deadline. */
function CalendarBadge({ eventId, label }: { eventId: string | null; label: string }): ReactElement | null {
  const navigate = useNavigate()
  if (!eventId) return null
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button variant="ghost" size="xs" className="h-6" onClick={() => navigate(`/calendar?open=${eventId}`)}>
          <CalendarCheck className="text-success" /> {label}
        </Button>
      </TooltipTrigger>
      <TooltipContent>Є в календарі з нагадуваннями за день і за годину. Відкрити подію</TooltipContent>
    </Tooltip>
  )
}

function StageEditor({ stage }: { stage: Stage }): ReactElement {
  const update = useApiMutation('jobs', 'updateStage')
  const remove = useApiMutation('jobs', 'removeStage', { successMessage: 'Етап видалено' })
  const patch = (p: StagePatch): void => update.mutate({ id: stage.id, patch: p })
  const [notes, setNotes] = useAutosave(stage.notes, (v) => patch({ notes: v }))
  // View mode: kind, title, time and outcome are already in the row header — show only the extras.
  const readOnly = useReadOnly()
  const isTest = stage.kind === 'test_task'
  const deadlineBeforeStart = !!stage.at && !!stage.deadlineAt && stage.deadlineAt < stage.at
  return (
    <div className="flex flex-col gap-4 pt-3">
      <div className="grid grid-cols-2 gap-4">
        {!readOnly && (
          <>
            <Field label="Тип етапу">
              <Choice value={stage.kind} onChange={(v) => v && patch({ kind: v })} options={KIND_OPTIONS} />
            </Field>
            <TextField
              label="Назва"
              value={stage.title}
              onSave={(title) => patch({ title })}
              placeholder="Напр.: технічна з тімлідом"
              maxLength={LIMITS.title}
            />
            <Field label={isTest ? 'Завдання отримано' : 'Дата й час'}>
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
          </>
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
      {!readOnly && (
        <Field label="Підсумок">
          <Segmented
            size="xs"
            value={stage.status}
            onChange={(status) => patch({ status })}
            options={STAGE_STATUSES.map((s) => ({ value: s, label: STAGE_STATUS_LABEL[s] }))}
          />
        </Field>
      )}
      <Field label="Як пройшло, що покращити" count={{ length: notes.length, max: LIMITS.notes }}>
        <Textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Питання, реакція, що підтягнути до наступного разу"
          className="min-h-20"
          maxLength={LIMITS.notes}
        />
      </Field>
      <div data-edit-only className="flex justify-end">
        <Confirm title="Видалити етап?" description="Пов’язані події календаря теж буде видалено." onConfirm={() => remove.mutate(stage.id)}>
          <Button variant="ghost" size="sm" className="text-muted-foreground hover:text-destructive">
            <Trash2 /> Видалити етап
          </Button>
        </Confirm>
      </div>
    </div>
  )
}

/** The row's second line: everything about «when» that view mode doesn't show elsewhere. */
function stageWhen(stage: Stage): string {
  if (stage.kind === 'test_task')
    return [stage.at ? `отримано ${whenLabel(stage.at)}` : '', stage.deadlineAt ? `здати ${whenLabel(stage.deadlineAt)}` : 'без терміну']
      .filter(Boolean)
      .join(' · ')
  return [whenLabel(stage.at), stage.at && stage.durationMin ? fmtMinutes(stage.durationMin) : ''].filter(Boolean).join(' · ')
}

/**
 * One stage: header (name, when, outcome badge) that expands into its fields. The outcome is the badge only —
 * no coloured dot, no faded card for a cancelled one. While reading, a stage without a link, interviewers or
 * notes has nothing to expand, so its header is plain text.
 */
function StageRow({ stage, defaultOpen }: { stage: Stage; defaultOpen: boolean }): ReactElement {
  const readOnly = useReadOnly()
  const [open, setOpen] = useState(defaultOpen)
  const expandable = !readOnly || !!(stage.location.trim() || stage.interviewers.trim() || stage.notes.trim())
  const head = (
    <>
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="truncate text-body font-medium">{stage.title || STAGE_KIND_LABEL[stage.kind]}</span>
        <span className="truncate text-caption text-muted-foreground">{stageWhen(stage)}</span>
      </span>
      <Badge variant={STAGE_STATUS_VARIANT[stage.status]}>{STAGE_STATUS_LABEL[stage.status]}</Badge>
    </>
  )
  return (
    <Collapsible open={expandable && open} onOpenChange={setOpen}>
      <Card className="gap-0 rounded-2xl px-4 py-3">
        {expandable ? (
          <CollapsibleTrigger asChild>
            <Button variant="ghost" className="-mx-2 h-auto justify-start gap-3 rounded-xl px-2 py-1 text-left font-normal hover:bg-transparent">
              {head}
              <ChevronDown className={cn('transition-transform', open && 'rotate-180')} />
            </Button>
          </CollapsibleTrigger>
        ) : (
          <div className="flex items-center gap-3 py-1">{head}</div>
        )}
        {/* -ml-2.5 = the ghost button's padding: the calendar icon lines up with the stage name. */}
        <div className="-ml-2.5 flex flex-wrap gap-1">
          <CalendarBadge eventId={stage.eventId} label="у календарі" />
          <CalendarBadge eventId={stage.deadlineEventId} label="дедлайн у календарі" />
        </div>
        {expandable && (
          <CollapsibleContent>
            <StageEditor stage={stage} />
          </CollapsibleContent>
        )}
      </Card>
    </Collapsible>
  )
}

/** Interview rounds and test tasks of one vacancy, mirrored to the calendar by the backend. */
export function StageSection({ applicationId, stages }: { applicationId: string; stages: Stage[] }): ReactElement {
  const readOnly = useReadOnly()
  const [adding, setAdding] = useState(false)
  const nextPlanned = stages.find((s) => s.status === 'planned')
  return (
    <section className="flex flex-col gap-3">
      <SectionLabel
        action={
          <Button data-edit-only variant="outline" size="xs" onClick={() => setAdding(true)}>
            <Plus /> Етап
          </Button>
        }
      >
        Етапи
      </SectionLabel>
      {stages.length === 0 ? (
        readOnly ? (
          <EditHint action="додати перший">Етапів ще немає.</EditHint>
        ) : (
          <p className="text-body leading-relaxed text-muted-foreground">
            Скринінг, технічна, тестове — додайте етап, і він одразу з’явиться в календарі.
          </p>
        )
      ) : (
        <div className="flex flex-col gap-2">
          {stages.map((s) => (
            <StageRow key={s.id} stage={s} defaultOpen={!readOnly && s.id === nextPlanned?.id && stages.length <= 2} />
          ))}
        </div>
      )}
      {adding && <AddStageDialog applicationId={applicationId} open={adding} onOpenChange={setAdding} />}
    </section>
  )
}
