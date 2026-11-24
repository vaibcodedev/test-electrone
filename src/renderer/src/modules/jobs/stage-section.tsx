import { useState } from 'react'
import { useNavigate } from 'react-router'
import { CalendarCheck, ChevronDown, Plus, Trash2 } from 'lucide-react'
import { STAGE_KINDS, STAGE_STATUSES, type Stage, type StageKind, type StagePatch } from '@shared/domain/jobs'
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
import { LinkInput, NumberInput, TextField } from './j1-fields'
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
      <TooltipContent>Есть в календаре с напоминаниями за день и за час. Открыть событие</TooltipContent>
    </Tooltip>
  )
}

function StageEditor({ stage }: { stage: Stage }) {
  const update = useApiMutation('jobs', 'updateStage')
  const remove = useApiMutation('jobs', 'removeStage', { successMessage: 'Этап удалён' })
  const patch = (p: StagePatch): void => update.mutate({ id: stage.id, patch: p })
  const [notes, setNotes] = useAutosave(stage.notes, (v) => patch({ notes: v }))
  const isTest = stage.kind === 'test_task'
  return (
    <div className="flex flex-col gap-4 pt-3">
      <div className="grid grid-cols-2 gap-4">
        <Field label="Тип этапа">
          <Choice value={stage.kind} onChange={(v) => v && patch({ kind: v })} options={KIND_OPTIONS} />
        </Field>
        <TextField label="Название" value={stage.title} onSave={(title) => patch({ title })} placeholder={STAGE_KIND_LABEL[stage.kind]} />
        <Field label={isTest ? 'Получил задание' : 'Дата и время'}>
          <DatePicker withTime value={stage.at} onChange={(at) => patch({ at })} placeholder="Назначить" />
        </Field>
        {isTest ? (
          <Field label="Сдать до">
            <DatePicker withTime value={stage.deadlineAt} onChange={(deadlineAt) => patch({ deadlineAt })} placeholder="Без срока" />
          </Field>
        ) : (
          <Field label="Длительность">
            <NumberInput value={stage.durationMin} onCommit={(v) => patch({ durationMin: Math.round(v ?? 60) })} suffix="мин" max={1440} />
          </Field>
        )}
        <Field label={isTest ? 'Ссылка на задание / репозиторий' : 'Ссылка на звонок или адрес'}>
          <LinkInput value={stage.location} onSave={(location) => patch({ location })} placeholder="https://meet.google.com/…" />
        </Field>
        <TextField label="Кто проводил" value={stage.interviewers} onSave={(interviewers) => patch({ interviewers })} placeholder="Имена, роли" />
      </div>
      <Field label="Итог">
        <Segmented
          size="xs"
          value={stage.status}
          onChange={(status) => patch({ status })}
          options={STAGE_STATUSES.map((s) => ({ value: s, label: STAGE_STATUS_LABEL[s] }))}
        />
      </Field>
      <Field label="Как прошло, что улучшить">
        <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Вопросы, реакция, что подтянуть к следующему разу" className="min-h-20" />
      </Field>
      <div className="flex justify-end">
        <Confirm title="Удалить этап?" description="Связанные события календаря тоже удалятся." onConfirm={() => remove.mutate(stage.id)}>
          <Button variant="ghost" size="sm" className="text-muted-foreground hover:text-destructive">
            <Trash2 /> Удалить этап
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
                {stage.kind === 'test_task' ? (stage.deadlineAt ? `сдать ${whenLabel(stage.deadlineAt)}` : 'без срока') : whenLabel(when)}
              </span>
            </span>
            <Badge variant={STAGE_STATUS_VARIANT[stage.status]}>{STAGE_STATUS_LABEL[stage.status]}</Badge>
            <ChevronDown className={cn('transition-transform', open && 'rotate-180')} />
          </Button>
        </CollapsibleTrigger>
        <div className="flex flex-wrap gap-1 pl-5">
          <CalendarBadge eventId={stage.eventId} label="в календаре" />
          <CalendarBadge eventId={stage.deadlineEventId} label="дедлайн в календаре" />
        </div>
        <CollapsibleContent>
          <StageEditor stage={stage} />
        </CollapsibleContent>
      </Card>
    </Collapsible>
  )
}

function AddStageDialog({ applicationId, open, onOpenChange }: { applicationId: string; open: boolean; onOpenChange: (o: boolean) => void }) {
  const [kind, setKind] = useState<StageKind>('screening')
  const [at, setAt] = useState<number | null>(() => tomorrowAt(11))
  const [deadlineAt, setDeadlineAt] = useState<number | null>(null)
  const [durationMin, setDurationMin] = useState<number | null>(60)
  const add = useApiMutation('jobs', 'addStage', {
    successMessage: 'Этап добавлен — событие уже в календаре',
    onSuccess: () => onOpenChange(false)
  })
  const isTest = kind === 'test_task'
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[520px]">
        <DialogHeader>
          <DialogTitle>Новый этап</DialogTitle>
          <DialogDescription>
            {isTest
              ? 'Срок сдачи появится в календаре с напоминанием за день.'
              : 'Собеседование появится в календаре с напоминаниями за день и за час.'}
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-4">
          <Field label="Что за этап">
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
            <Field label={isTest ? 'Получил задание' : 'Дата и время'}>
              <DatePicker withTime value={at} onChange={setAt} clearable={isTest} />
            </Field>
            {isTest ? (
              <Field label="Сдать до">
                <DatePicker withTime value={deadlineAt} onChange={setDeadlineAt} placeholder="Без срока" />
              </Field>
            ) : (
              <Field label="Длительность">
                <NumberInput value={durationMin} onCommit={setDurationMin} suffix="мин" max={1440} />
              </Field>
            )}
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Отмена
          </Button>
          <Button
            variant="lime"
            disabled={add.isPending || (!isTest && !at)}
            onClick={() =>
              add.mutate({
                applicationId,
                kind,
                at,
                deadlineAt: isTest ? deadlineAt : null,
                durationMin: Math.round(durationMin ?? 60)
              })
            }
          >
            Добавить этап
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
            <Plus /> Этап
          </Button>
        }
      >
        Этапы
      </SectionLabel>
      {stages.length === 0 ? (
        <p className="text-caption text-muted-foreground">
          Скрининг, техническое, тестовое — добавьте этап, и он сразу появится в календаре.
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
