import { useState, type ReactElement } from 'react'
import { MoreHorizontal, Pause, Pencil, Play, Plus, Target, Trash2 } from 'lucide-react'
import {
  GOAL_METRICS,
  GOAL_PERIODS,
  goalInputSchema,
  type Goal,
  type GoalInput,
  type GoalMetric,
  type GoalPeriod
} from '@shared/domain/freelance'
import type { Currency } from '@shared/domain/crm'
import { useApi, useApiMutation, useInPlaceApi } from '@/lib/query'
import { LoadError } from '@/features/route-error'
import { limitsOf, rangesOf, requiredOf } from '@/lib/limits'
import { fmtNumber } from '@/lib/format'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card } from '@/components/ui/card'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select'
import { Confirm } from '@/components/common/confirm'
import { IconAction } from '@/components/common/icon-action'
import { EmptyState, Field, Page, PageBody, PageHeader, Segmented } from '@/components/common/page'
import { FormDialog } from '@/components/common/form-dialog'
import { SectionLabel } from '@/components/common/section-label'
import { NumberField, useInvalidFields } from '@/components/common/number-field'
import { GOAL_METRIC_LABEL, GOAL_PERIOD_LABEL } from './g2-labels'
import { GoalCard } from './goal-card'
import { useNewParam } from './use-new-param'
import { formatGoalValue, goalTitle } from './goal-format'
import { freshOnOpen } from '@/components/common/fresh-on-open'

const TITLE_MAX = limitsOf(goalInputSchema).title
const GOAL_R = rangesOf(goalInputSchema)
const GOAL_REQ = requiredOf(goalInputSchema)

const ALL = '__all__'

const isRateMetric = (m: GoalMetric): boolean => m === 'reply_rate' || m === 'hire_rate'

/** Create / edit dialog: Enter submits; a target out of range blocks the button with the reason under the field. */
function GoalDialogForm({
  goal,
  open,
  onOpenChange
}: {
  goal?: Goal
  open: boolean
  onOpenChange: (open: boolean) => void
}): ReactElement {
  const { data: platformList = [] } = useApi('platforms', 'list')
  const create = useApiMutation('goals', 'create', { successMessage: 'Ціль додано' })
  const update = useApiMutation('goals', 'update', { successMessage: 'Ціль збережено' })
  const numbers = useInvalidFields()
  const empty = {
    title: '',
    metric: 'proposals' as GoalMetric,
    period: 'week' as GoalPeriod,
    target: 10 as number | null,
    platformId: null as string | null
  }
  // Created anew on each opening (freshOnOpen): the goal as it is now, or a blank form.
  const [form, setForm] = useState(() =>
    goal
      ? {
          title: goal.title,
          metric: goal.metric,
          period: goal.period,
          target: goal.target as number | null,
          platformId: goal.platformId
        }
      : empty
  )

  const rate = isRateMetric(form.metric)
  // «Усі платформи» has no currency of its own: the server counts in the one with the most payments.
  const anyCurrency = form.metric === 'net_income' && form.platformId === null
  const unit =
    form.metric === 'net_income'
      ? platformList.find((p) => p.id === form.platformId)?.currency
      : rate
        ? '%'
        : undefined
  const pending = create.isPending || update.isPending
  const noTarget = form.target === null || form.target <= 0
  const submit = (): void => {
    if (pending || form.target === null || noTarget) return
    const input: GoalInput = {
      title: form.title,
      metric: form.metric,
      period: form.period,
      target: form.target,
      platformId: form.platformId
    }
    const done = { onSuccess: () => onOpenChange(false) }
    if (goal) update.mutate({ id: goal.id, patch: input }, done)
    else create.mutate(input, done)
  }

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title={goal ? 'Змінити ціль' : 'Нова ціль'}
      description="Прогрес рахується автоматично за відгуками й оплатами."
      submitLabel={goal ? 'Зберегти' : 'Додати ціль'}
      className="sm:max-w-md"
      invalid={noTarget || numbers.invalid}
      pending={pending}
      values={goal ? form : undefined}
      onSubmit={submit}
    >
      <Field label="Що рахуємо">
        <Select
          value={form.metric}
          onValueChange={(v) => setForm((f) => ({ ...f, metric: v as GoalMetric }))}
        >
          <SelectTrigger className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {GOAL_METRICS.map((m) => (
              <SelectItem key={m} value={m}>
                {GOAL_METRIC_LABEL[m]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Field>
      <div className="grid grid-cols-2 items-start gap-3">
        <Field label="Період">
          <Segmented
            className="w-fit"
            value={form.period}
            onChange={(period) => setForm((f) => ({ ...f, period }))}
            options={GOAL_PERIODS.map((p) => ({ value: p, label: GOAL_PERIOD_LABEL[p] }))}
          />
        </Field>
        <NumberField
          id="goal-target"
          label="Ціль"
          required={GOAL_REQ.target}
          min={1}
          max={rate ? 100 : GOAL_R.target?.max}
          integer={form.metric !== 'net_income' && !rate}
          unit={unit}
          value={form.target}
          hint={
            form.target === null
              ? 'Вкажіть ціль'
              : anyCurrency
                ? 'Рахується у валюті, в якій найбільше оплат за період'
                : undefined
          }
          onCommit={(target) => setForm((f) => ({ ...f, target }))}
          live
          onValidityChange={numbers.report('target')}
        />
      </div>
      <Field label="Платформа">
        <Select
          value={form.platformId ?? ALL}
          onValueChange={(v) => setForm((f) => ({ ...f, platformId: v === ALL ? null : v }))}
        >
          <SelectTrigger className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>Усі платформи</SelectItem>
            {platformList.map((p) => (
              <SelectItem key={p.id} value={p.id}>
                {p.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Field>
      {/* The generated name is a hint, not a placeholder: a placeholder read as an already typed value. */}
      <Field
        label="Назва (необов’язково)"
        htmlFor="goal-title"
        hint={`Якщо лишити порожнім — «${goalTitle({ ...form, title: '' })}»`}
      >
        <Input
          id="goal-title"
          value={form.title}
          maxLength={TITLE_MAX}
          onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
        />
      </Field>
    </FormDialog>
  )
}

/** Opens clean every time: created anew on each opening (freshOnOpen). */
const GoalDialog = freshOnOpen(GoalDialogForm, { identity: (p) => p.goal?.id })

/**
 * ⋯ menu instead of bare icons + an unlabeled switch: Змінити / Призупинити (Продовжити) / Видалити.
 * Not «Відновити»: in the app that word means back from the trash.
 */
function GoalMenu({ goal }: { goal: Goal }): ReactElement {
  const [editing, setEditing] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const update = useApiMutation('goals', 'update', {
    successMessage: goal.active ? 'Ціль призупинено' : 'Ціль знову активна'
  })
  const remove = useApiMutation('goals', 'remove', { successMessage: 'Ціль видалено' })
  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <IconAction label="Дії з ціллю">
            <MoreHorizontal />
          </IconAction>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onSelect={() => setEditing(true)}>
            <Pencil /> Змінити
          </DropdownMenuItem>
          <DropdownMenuItem
            onSelect={() => update.mutate({ id: goal.id, patch: { active: !goal.active } })}
          >
            {goal.active ? <Pause /> : <Play />} {goal.active ? 'Призупинити' : 'Продовжити'}
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem variant="destructive" onSelect={() => setConfirming(true)}>
            <Trash2 /> Видалити
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <GoalDialog goal={goal} open={editing} onOpenChange={setEditing} />
      <Confirm
        open={confirming}
        onOpenChange={setConfirming}
        title={`Видалити ціль «${goalTitle(goal)}»?`}
        description="Прогрес за минулі періоди теж зникне. Відновити не можна."
        onConfirm={() => remove.mutate(goal.id)}
      />
    </>
  )
}

export function GoalsPage() {
  const { data: progress = [], isLoading: progressLoading } = useApi('goals', 'progress')
  const query = useInPlaceApi('goals', 'list')
  const { data: goals = [], isLoading } = query
  const { data: platformList = [] } = useApi('platforms', 'list')
  const [createOpen, setCreateOpen] = useState(false)
  // «Поставити ціль» on the overview lands here with ?new=1.
  useNewParam(() => setCreateOpen(true))
  const platformName = (id: string | null): string | undefined =>
    platformList.find((p) => p.id === id)?.name
  const platformCurrency = (id: string | null): Currency | undefined =>
    platformList.find((p) => p.id === id)?.currency
  const inactive = goals.filter((g) => !g.active)

  return (
    <Page>
      <PageHeader
        title="Цілі"
        subtitle="Тижневі й місячні цілі за відгуками, відповідями, контрактами й доходом."
        actions={
          <Button variant="lime" onClick={() => setCreateOpen(true)}>
            <Plus /> Ціль
          </Button>
        }
      />
      <GoalDialog open={createOpen} onOpenChange={setCreateOpen} />
      <PageBody className="flex flex-col gap-6">
        {query.failed ? (
          <LoadError title="Не вдалося завантажити цілі" onRetry={query.retry} />
        ) : !isLoading && goals.length === 0 ? (
          <EmptyState
            icon={Target}
            title="Цілей поки немає"
            hint="Наприклад: 10 відгуків на тиждень або 3 000 USD на руки за місяць."
            cta={{ label: 'Поставити ціль', icon: Plus, onClick: () => setCreateOpen(true) }}
          />
        ) : progress.length > 0 ? (
          <div className="stagger grid grid-cols-[repeat(auto-fill,minmax(300px,1fr))] gap-3">
            {progress.map((g) => {
              const goal = goals.find((x) => x.id === g.id)
              return (
                <GoalCard
                  key={g.id}
                  g={g}
                  platformName={platformName(g.platformId)}
                  actions={goal && <GoalMenu goal={goal} />}
                />
              )
            })}
          </div>
        ) : (
          !progressLoading && inactive.length > 0 && (
            <p className="text-body text-muted-foreground">
              Усі цілі на паузі — продовжте потрібну в меню ⋯.
            </p>
          )
        )}
        {inactive.length > 0 && (
          <section className="flex flex-col gap-2">
            <SectionLabel>На паузі</SectionLabel>
            {/* Quieter by colour, not by opacity: a faded row fell below 4.5:1. */}
            {inactive.map((g) => (
              <Card key={g.id} className="flex-row items-center gap-3 px-5 py-3">
                <span className="flex-1 truncate text-body text-muted-foreground">
                  {goalTitle(g)}
                </span>
                <span className="text-caption text-muted-foreground">
                  ціль{' '}
                  {g.metric === 'net_income' && g.platformId === null
                    ? fmtNumber(g.target)
                    : formatGoalValue(g.metric, g.target, platformCurrency(g.platformId))}
                </span>
                <GoalMenu goal={g} />
              </Card>
            ))}
          </section>
        )}
      </PageBody>
    </Page>
  )
}
