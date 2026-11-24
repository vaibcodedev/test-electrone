import { useEffect, useState, type ReactNode } from 'react'
import { MoreHorizontal, Pause, Pencil, Play, Plus, Target, Trash2 } from 'lucide-react'
import {
  GOAL_METRICS,
  GOAL_PERIODS,
  goalInputSchema,
  type Goal,
  type GoalInput,
  type GoalMetric,
  type GoalPeriod,
  type GoalProgress
} from '@shared/domain/freelance'
import type { Currency } from '@shared/domain/crm'
import { useApi, useApiMutation } from '@/lib/query'
import { NumberInput } from '@/components/common/number-input'
import { draftToNumber, numberToDraft } from '../crm/money'
import { limitsOf, rangesOf } from '@/lib/limits'
import { fmtDate, fmtMoney, plural } from '@/lib/format'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Card, CardAction, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Progress } from '@/components/ui/progress'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu'
import { Field, FieldLabel } from '@/components/ui/field'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger
} from '@/components/ui/dialog'
import { EmptyState, Page, PageBody, PageHeader, Segmented } from '@/components/common/page'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle
} from '@/components/ui/alert-dialog'
import { GOAL_METRIC_LABEL, GOAL_PERIOD_LABEL } from './g2-labels'

const TITLE_MAX = limitsOf(goalInputSchema).title
const GOAL_R = rangesOf(goalInputSchema)

const ALL = '__all__'
const selectCls = 'w-full'

/** `currency` — from `GoalProgress.currency` (server picks it); USD only when nothing is known. */
export function formatGoalValue(
  metric: GoalMetric,
  value: number,
  currency?: Currency | null
): string {
  if (metric === 'net_income') return fmtMoney(value, currency ?? 'USD')
  if (metric === 'reply_rate' || metric === 'hire_rate') return `${Math.round(value * 10) / 10}%`
  return String(Math.round(value))
}

export function goalTitle(g: Pick<Goal, 'title' | 'metric' | 'period'>): string {
  return (
    g.title.trim() ||
    `${GOAL_METRIC_LABEL[g.metric]} за ${g.period === 'week' ? 'тиждень' : 'місяць'}`
  )
}

/** Create / edit dialog. */
function GoalDialog({
  goal,
  trigger,
  open: openProp,
  onOpenChange
}: {
  goal?: Goal
  trigger?: ReactNode
  /** Controlled mode — opened from the card's ⋯ menu. */
  open?: boolean
  onOpenChange?: (open: boolean) => void
}) {
  const [openState, setOpenState] = useState(false)
  const open = openProp ?? openState
  const setOpen = (o: boolean): void => (onOpenChange ? onOpenChange(o) : setOpenState(o))
  const { data: platformList = [] } = useApi('platforms', 'list')
  const create = useApiMutation('goals', 'create', { successMessage: 'Ціль додано' })
  const update = useApiMutation('goals', 'update', { successMessage: 'Ціль збережено' })
  const empty = {
    title: '',
    metric: 'proposals' as GoalMetric,
    period: 'week' as GoalPeriod,
    target: '10',
    platformId: null as string | null
  }
  const [form, setForm] = useState(empty)

  const reset = (): void =>
    setForm(
      goal
        ? {
            title: goal.title,
            metric: goal.metric,
            period: goal.period,
            target: String(goal.target),
            platformId: goal.platformId
          }
        : empty
    )

  useEffect(() => {
    if (open) reset()
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reset only when the dialog opens
  }, [open])

  const pending = create.isPending || update.isPending
  const submit = (): void => {
    // A second click while saving must not add a duplicate goal.
    if (pending || !(Number(form.target) > 0)) return
    const input: GoalInput = {
      title: form.title,
      metric: form.metric,
      period: form.period,
      target: Math.max(0, Number(form.target) || 0),
      platformId: form.platformId
    }
    const done = { onSuccess: () => setOpen(false) }
    if (goal) update.mutate({ id: goal.id, patch: input }, done)
    else create.mutate(input, done)
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      {trigger && <DialogTrigger asChild>{trigger}</DialogTrigger>}
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{goal ? 'Змінити ціль' : 'Нова ціль'}</DialogTitle>
          <DialogDescription>
            Прогрес рахується автоматично за відгуками й оплатами.
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-4">
          <Field className="gap-2">
            <FieldLabel>Що рахуємо</FieldLabel>
            <Select
              value={form.metric}
              onValueChange={(v) => setForm((f) => ({ ...f, metric: v as GoalMetric }))}
            >
              <SelectTrigger className={selectCls}>
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
          <div className="grid grid-cols-2 gap-3">
            <Field className="gap-2">
              <FieldLabel>Період</FieldLabel>
              <Segmented
                className="w-fit"
                value={form.period}
                onChange={(period) => setForm((f) => ({ ...f, period }))}
                options={GOAL_PERIODS.map((p) => ({ value: p, label: GOAL_PERIOD_LABEL[p] }))}
              />
            </Field>
            <Field className="gap-2">
              <FieldLabel htmlFor="goal-target">
                Ціль
                {form.metric === 'net_income'
                  ? form.platformId
                    ? `, ${platformList.find((p) => p.id === form.platformId)?.currency ?? ''}`
                    : ''
                  : form.metric.endsWith('rate')
                    ? ', %'
                    : ''}
              </FieldLabel>
              <NumberInput
                id="goal-target"
                min={0}
                max={GOAL_R.target?.max}
                integer={form.metric !== 'net_income'}
                value={draftToNumber(form.target)}
                onChange={(v) => setForm((f) => ({ ...f, target: numberToDraft(v) }))}
              />
            </Field>
          </div>
          <Field className="gap-2">
            <FieldLabel>Платформа</FieldLabel>
            <Select
              value={form.platformId ?? ALL}
              onValueChange={(v) => setForm((f) => ({ ...f, platformId: v === ALL ? null : v }))}
            >
              <SelectTrigger className={selectCls}>
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
          <Field className="gap-2">
            <FieldLabel htmlFor="goal-title">Назва (необов’язково)</FieldLabel>
            <Input
              id="goal-title"
              value={form.title}
              maxLength={TITLE_MAX}
              placeholder={goalTitle(form)}
              onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
            />
          </Field>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)}>
            Скасувати
          </Button>
          <Button
            variant="lime"
            onClick={submit}
            disabled={!(Number(form.target) > 0) || pending}
          >
            {goal ? 'Зберегти' : 'Додати ціль'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

const DAY = 86_400_000

type GoalStatus = { label: string; variant: 'success' | 'warn' | 'soft' }

/** Done / behind (period >70% over, progress <50%) / in progress. */
function goalStatus(g: GoalProgress, now: number): GoalStatus {
  if (g.ratio >= 1) return { label: 'Виконано ✓', variant: 'success' }
  const span = Math.max(1, g.periodEnd - g.periodStart)
  const elapsed = (now - g.periodStart) / span
  if (elapsed > 0.7 && g.ratio < 0.5) return { label: 'Не встигаю', variant: 'warn' }
  return { label: 'У процесі', variant: 'soft' }
}

/** Progress card, reused on the freelance overview: status badge, bar, «ще N · залишилось M днів». */
export function GoalCard({
  g,
  platformName,
  actions
}: {
  g: GoalProgress
  platformName?: string
  actions?: ReactNode
}) {
  const [now] = useState(() => Date.now())
  const done = g.ratio >= 1
  const status = goalStatus(g, now)
  const daysLeft = Math.max(0, Math.ceil((g.periodEnd - now) / DAY))
  const remaining = Math.max(0, g.target - g.current)
  return (
    <Card>
      <CardHeader>
        <CardTitle>{goalTitle(g)}</CardTitle>
        <CardAction className="flex items-center gap-1">
          <Badge variant={status.variant}>{status.label}</Badge>
          {actions}
        </CardAction>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <div className="flex items-baseline gap-2">
          <span className="font-display text-stat leading-none tabular-nums">
            {formatGoalValue(g.metric, g.current, g.currency)}
          </span>
          <span className="text-body text-muted-foreground">
            з {formatGoalValue(g.metric, g.target, g.currency)}
          </span>
        </div>
        <Progress
          value={Math.min(100, g.ratio * 100)}
          aria-label="Прогрес цілі"
          className={cn(
            'h-2',
            done
              ? '[&>[data-slot=progress-indicator]]:bg-success'
              : '[&>[data-slot=progress-indicator]]:bg-chart-1'
          )}
        />
        <p className={cn('text-caption', done ? 'text-success' : 'text-muted-foreground')}>
          {done
            ? `Виконано: ${formatGoalValue(g.metric, g.current, g.currency)} з ${formatGoalValue(g.metric, g.target, g.currency)}`
            : `Ще ${formatGoalValue(g.metric, remaining, g.currency)} · ${
                daysLeft > 0
                  ? `залишилось ${daysLeft} ${plural(daysLeft, ['день', 'дні', 'днів'])}`
                  : 'останній день'
              }`}
        </p>
        <div className="flex flex-wrap items-center gap-1.5 text-meta text-muted-foreground">
          <span>
            {GOAL_PERIOD_LABEL[g.period]}: {fmtDate(g.periodStart, 'd MMM')} —{' '}
            {fmtDate(g.periodEnd, 'd MMM')}
          </span>
          {platformName && <Badge variant="soft">{platformName}</Badge>}
        </div>
      </CardContent>
    </Card>
  )
}

/** ⋯ menu instead of bare icons + an unlabeled switch: Змінити / Призупинити (Відновити) / Видалити. */
function GoalMenu({ goal }: { goal: Goal }) {
  const [editing, setEditing] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const update = useApiMutation('goals', 'update', {
    successMessage: goal.active ? 'Ціль призупинено' : 'Ціль відновлено'
  })
  const remove = useApiMutation('goals', 'remove', { successMessage: 'Ціль видалено' })
  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon-xs" aria-label="Дії з ціллю">
            <MoreHorizontal />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onSelect={() => setEditing(true)}>
            <Pencil /> Змінити
          </DropdownMenuItem>
          <DropdownMenuItem
            onSelect={() => update.mutate({ id: goal.id, patch: { active: !goal.active } })}
          >
            {goal.active ? <Pause /> : <Play />} {goal.active ? 'Призупинити' : 'Відновити'}
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem variant="destructive" onSelect={() => setConfirming(true)}>
            <Trash2 /> Видалити
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <GoalDialog goal={goal} open={editing} onOpenChange={setEditing} />
      <AlertDialog open={confirming} onOpenChange={setConfirming}>
        <AlertDialogContent className="rounded-3xl">
          <AlertDialogHeader>
            <AlertDialogTitle>Видалити ціль «{goalTitle(goal)}»?</AlertDialogTitle>
            <AlertDialogDescription>Прогрес за минулі періоди теж зникне.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Скасувати</AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={() => remove.mutate(goal.id)}>
              Видалити
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}

export function GoalsPage() {
  const { data: progress = [] } = useApi('goals', 'progress')
  const { data: goals = [] } = useApi('goals', 'list')
  const { data: platformList = [] } = useApi('platforms', 'list')
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
          <GoalDialog
            trigger={
              <Button variant="lime">
                <Plus /> Ціль
              </Button>
            }
          />
        }
      />
      <PageBody className="flex flex-col gap-6">
        {goals.length === 0 ? (
          <EmptyState
            icon={Target}
            title="Цілей поки немає"
            hint="Наприклад: 10 відгуків на тиждень або $3000 на руки за місяць."
          />
        ) : (
          <div className="stagger grid grid-cols-[repeat(auto-fill,minmax(260px,1fr))] gap-3">
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
        )}
        {inactive.length > 0 && (
          <section className="flex flex-col gap-2">
            <h2 className="text-caption font-semibold text-muted-foreground">На паузі</h2>
            {inactive.map((g) => (
              <Card key={g.id} className="flex-row items-center gap-3 px-5 py-3 opacity-70">
                <span className="flex-1 truncate text-body">{goalTitle(g)}</span>
                <span className="text-caption text-muted-foreground">
                  ціль {formatGoalValue(g.metric, g.target, platformCurrency(g.platformId))}
                </span>
                <Badge variant="soft">На паузі</Badge>
                <GoalMenu goal={g} />
              </Card>
            ))}
          </section>
        )}
      </PageBody>
    </Page>
  )
}
