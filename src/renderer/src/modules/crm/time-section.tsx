import type { ReactElement } from 'react'
import { Plus } from 'lucide-react'
import { EditableScope } from '@/components/common/detail-mode-context'
import { useApiMutation } from '@/lib/query'
import { Button } from '@/components/ui/button'
import { Section } from './parts'
import { EntryForm } from './entry-form'
import { RunningBar, StartBar } from './timer-bar'
import { DayGroup } from './time-history'
import { useInlineForm } from './inline-form'
import { emptyDraft, toRange } from './time-range'
import { useTimeHistory } from './use-time-history'

/**
 * Time tracking for a project: live timer, manual entry, history grouped by day.
 * For hourly projects it drives the money; for others it is a secondary "how long it really took" log.
 */
export function TimeSection({
  projectId,
  rate,
  currency,
  hourly,
  secondary,
  unpaid
}: {
  projectId: string
  rate: number
  currency: string
  hourly: boolean
  secondary?: boolean
  /** «Без оплати»: there is no rate to talk about, only where the time goes. */
  unpaid?: boolean
}): ReactElement {
  const [adding, setAdding] = useInlineForm()
  const { days, recent, running, mine, weeksBack, showEarlier, isPending } =
    useTimeHistory(projectId)
  const create = useApiMutation('time', 'create', {
    successMessage: 'Час додано',
    onSuccess: () => setAdding(false)
  })

  return (
    <Section
      title={secondary ? 'Облік часу' : 'Час'}
      hint={
        unpaid
          ? 'Для себе: скільки насправді йде на проєкт.'
          : secondary
            ? 'Для себе: скільки насправді йде на проєкт. На оплату не впливає.'
            : undefined
      }
      action={
        !adding && (
          <Button variant="soft" size="sm" data-edit-only onClick={() => setAdding(true)}>
            <Plus /> Вручну
          </Button>
        )
      }
    >
      {/* The timer is an action, not an edit of the project: it works while reading too. */}
      <EditableScope>
        {mine ? (
          <RunningBar key={mine.id} running={mine} />
        ) : (
          <StartBar projectId={projectId} recent={recent} otherRunning={running} />
        )}
      </EditableScope>
      {adding && (
        <EntryForm
          initial={emptyDraft()}
          submitLabel="Додати"
          showBillable={hourly}
          pending={create.isPending}
          onCancel={() => setAdding(false)}
          onSubmit={(d) => {
            const r = toRange(d)
            if (r && !create.isPending)
              create.mutate({ projectId, ...r, description: d.description, billable: d.billable })
          }}
        />
      )}
      {days.length === 0 && !adding && !mine && weeksBack === 0 && !isPending && (
        <p className="text-body text-muted-foreground">
          {hourly
            ? 'Запустіть таймер або додайте час вручну — години потраплять у розрахунок оплати.'
            : unpaid
              ? 'Запустіть таймер або додайте час вручну — побачите, скільки йде на проєкт.'
              : 'Запустіть таймер, щоб бачити фактичну ставку проєкту.'}
        </p>
      )}
      <div className="flex flex-col gap-4">
        {days.map(([day, list]) => (
          <DayGroup
            key={day}
            day={day}
            entries={list}
            rate={hourly ? rate : 0}
            currency={currency}
            showBillable={hourly}
          />
        ))}
        {days.length === 0 && weeksBack > 0 && (
          <p className="text-caption text-muted-foreground">За ці дні записів немає.</p>
        )}
        {(days.length > 0 || weeksBack > 0) && (
          <Button variant="soft" size="sm" className="w-fit" onClick={showEarlier}>
            Показати попередній тиждень
          </Button>
        )}
      </div>
    </Section>
  )
}
