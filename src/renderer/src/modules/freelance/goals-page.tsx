import { useState, type ReactNode } from 'react'
import { Pencil, Plus, Target, Trash2 } from 'lucide-react'
import {
  GOAL_METRICS,
  GOAL_PERIODS,
  type Goal,
  type GoalInput,
  type GoalMetric,
  type GoalPeriod,
  type GoalProgress
} from '@shared/domain/freelance'
import { useApi, useApiMutation } from '@/lib/query'
import { fmtDate, fmtMoney } from '@/lib/format'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Card, CardAction, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Progress } from '@/components/ui/progress'
import { Switch } from '@/components/ui/switch'
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
import { Confirm } from '@/components/common/confirm'
import { GOAL_METRIC_LABEL, GOAL_PERIOD_LABEL } from './g2-labels'

const ALL = '__all__'
const selectCls = 'w-full rounded-xl border-transparent bg-surface shadow-none'

export function formatGoalValue(metric: GoalMetric, value: number): string {
  if (metric === 'net_income') return fmtMoney(value, 'USD')
  if (metric === 'reply_rate' || metric === 'hire_rate') return `${Math.round(value * 10) / 10}%`
  return String(Math.round(value))
}

export function goalTitle(g: Pick<Goal, 'title' | 'metric' | 'period'>): string {
  return (
    g.title.trim() ||
    `${GOAL_METRIC_LABEL[g.metric]} за ${g.period === 'week' ? 'неделю' : 'месяц'}`
  )
}

/** Create / edit dialog. */
function GoalDialog({ goal, trigger }: { goal?: Goal; trigger: ReactNode }) {
  const [open, setOpen] = useState(false)
  const { data: platformList = [] } = useApi('platforms', 'list')
  const create = useApiMutation('goals', 'create', { successMessage: 'Цель добавлена' })
  const update = useApiMutation('goals', 'update', { successMessage: 'Цель сохранена' })
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

  const submit = async (): Promise<void> => {
    const input: GoalInput = {
      title: form.title,
      metric: form.metric,
      period: form.period,
      target: Math.max(0, Number(form.target) || 0),
      platformId: form.platformId
    }
    if (goal) await update.mutateAsync({ id: goal.id, patch: input })
    else await create.mutateAsync(input)
    setOpen(false)
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o)
        if (o) reset()
      }}
    >
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{goal ? 'Изменить цель' : 'Новая цель'}</DialogTitle>
          <DialogDescription>
            Прогресс считается автоматически по откликам и оплатам.
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-4">
          <Field className="gap-2">
            <FieldLabel>Что считаем</FieldLabel>
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
              <FieldLabel>Период</FieldLabel>
              <Segmented
                value={form.period}
                onChange={(period) => setForm((f) => ({ ...f, period }))}
                options={GOAL_PERIODS.map((p) => ({ value: p, label: GOAL_PERIOD_LABEL[p] }))}
              />
            </Field>
            <Field className="gap-2">
              <FieldLabel htmlFor="goal-target">
                Цель
                {form.metric === 'net_income' ? ', $' : form.metric.endsWith('rate') ? ', %' : ''}
              </FieldLabel>
              <Input
                id="goal-target"
                type="number"
                min={0}
                value={form.target}
                onChange={(e) => setForm((f) => ({ ...f, target: e.target.value }))}
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
                <SelectItem value={ALL}>Все платформы</SelectItem>
                {platformList.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field className="gap-2">
            <FieldLabel htmlFor="goal-title">Название (необязательно)</FieldLabel>
            <Input
              id="goal-title"
              value={form.title}
              placeholder={goalTitle(form)}
              onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
            />
          </Field>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)}>
            Отмена
          </Button>
          <Button
            variant="lime"
            onClick={() => void submit()}
            disabled={!(Number(form.target) > 0)}
          >
            {goal ? 'Сохранить' : 'Добавить цель'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/** Progress card, reused on the freelance overview. */
export function GoalCard({
  g,
  platformName,
  actions
}: {
  g: GoalProgress
  platformName?: string
  actions?: ReactNode
}) {
  const done = g.ratio >= 1
  return (
    <Card className={cn(done && 'bg-lime text-lime-foreground')}>
      <CardHeader>
        <CardTitle className={cn(done && 'text-lime-foreground')}>{goalTitle(g)}</CardTitle>
        {actions && <CardAction>{actions}</CardAction>}
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <div className="flex items-baseline gap-2">
          <span className="font-display text-[30px] leading-none tabular-nums">
            {formatGoalValue(g.metric, g.current)}
          </span>
          <span className={cn('text-body', done ? 'opacity-70' : 'text-muted-foreground')}>
            из {formatGoalValue(g.metric, g.target)}
          </span>
        </div>
        <Progress
          value={g.ratio * 100}
          className={cn(
            'h-2',
            done
              ? 'bg-lime-foreground/15 [&>[data-slot=progress-indicator]]:bg-lime-foreground'
              : 'bg-card [&>[data-slot=progress-indicator]]:bg-chart-1'
          )}
        />
        <div
          className={cn(
            'flex flex-wrap items-center gap-1.5 text-meta',
            done ? 'opacity-70' : 'text-muted-foreground'
          )}
        >
          <span>
            {GOAL_PERIOD_LABEL[g.period]}: {fmtDate(g.periodStart, 'd MMM')} —{' '}
            {fmtDate(g.periodEnd, 'd MMM')}
          </span>
          {platformName && <Badge variant={done ? 'ink' : 'soft'}>{platformName}</Badge>}
        </div>
      </CardContent>
    </Card>
  )
}

export function GoalsPage() {
  const { data: progress = [] } = useApi('goals', 'progress')
  const { data: goals = [] } = useApi('goals', 'list')
  const { data: platformList = [] } = useApi('platforms', 'list')
  const update = useApiMutation('goals', 'update')
  const remove = useApiMutation('goals', 'remove', { successMessage: 'Цель удалена' })
  const platformName = (id: string | null): string | undefined =>
    platformList.find((p) => p.id === id)?.name
  const inactive = goals.filter((g) => !g.active)

  return (
    <Page>
      <PageHeader
        title="Цели"
        subtitle="Недельные и месячные цели по откликам, ответам, контрактам и доходу."
        actions={
          <GoalDialog
            trigger={
              <Button variant="lime">
                <Plus /> Цель
              </Button>
            }
          />
        }
      />
      <PageBody className="flex flex-col gap-6">
        {goals.length === 0 ? (
          <EmptyState
            icon={Target}
            title="Целей пока нет"
            hint="Например: 10 откликов в неделю или $3000 на руки в месяц."
          />
        ) : (
          <div className="grid grid-cols-[repeat(auto-fill,minmax(260px,1fr))] gap-3">
            {progress.map((g) => {
              const goal = goals.find((x) => x.id === g.id)
              return (
                <GoalCard
                  key={g.id}
                  g={g}
                  platformName={platformName(g.platformId)}
                  actions={
                    goal && (
                      <div className="flex items-center gap-0.5">
                        <GoalDialog
                          goal={goal}
                          trigger={
                            <Button variant="ghost" size="icon-xs" aria-label="Изменить">
                              <Pencil />
                            </Button>
                          }
                        />
                        <Confirm title="Удалить цель?" onConfirm={() => remove.mutate(g.id)}>
                          <Button variant="ghost" size="icon-xs" aria-label="Удалить">
                            <Trash2 />
                          </Button>
                        </Confirm>
                        <Switch
                          checked
                          aria-label="Активна"
                          onCheckedChange={(active) =>
                            update.mutate({ id: g.id, patch: { active } })
                          }
                        />
                      </div>
                    )
                  }
                />
              )
            })}
          </div>
        )}
        {inactive.length > 0 && (
          <section className="flex flex-col gap-2">
            <h2 className="text-caption font-semibold text-muted-foreground">На паузе</h2>
            {inactive.map((g) => (
              <Card key={g.id} className="flex-row items-center gap-3 px-5 py-3">
                <span className="flex-1 text-body">{goalTitle(g)}</span>
                <span className="text-caption text-muted-foreground">
                  цель {formatGoalValue(g.metric, g.target)}
                </span>
                <Switch
                  checked={false}
                  aria-label="Активна"
                  onCheckedChange={(active) => update.mutate({ id: g.id, patch: { active } })}
                />
              </Card>
            ))}
          </section>
        )}
      </PageBody>
    </Page>
  )
}
