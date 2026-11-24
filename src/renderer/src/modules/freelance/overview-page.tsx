import { useState } from 'react'
import { useNavigate } from 'react-router'
import { AlertTriangle, ArrowRight, BellRing, Plus, Target } from 'lucide-react'
import type { Platform } from '@shared/domain/freelance'
import type { Currency } from '@shared/domain/crm'
import { useApi } from '@/lib/query'
import { fmtDay, fmtMoney, plural } from '@/lib/format'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle
} from '@/components/ui/card'
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemGroup,
  ItemTitle
} from '@/components/ui/item'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from '@/components/ui/table'
import { Page, PageBody, PageHeader } from '@/components/common/page'
import { GoalCard } from './goals-page'

const DAY = 86_400_000
const LOW_CREDITS = 30

function monthKey(d = new Date()): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

function CreditsRow({ platform }: { platform: Platform }) {
  const navigate = useNavigate()
  const { data: s } = useApi('credits', 'summary', { platformId: platform.id })
  if (!s) return null
  const low = s.balance < LOW_CREDITS
  return (
    <Item size="sm" variant="muted" className="gap-4 bg-card px-4 py-3">
      <ItemContent className="min-w-0 gap-1">
        <ItemTitle className="w-full truncate">{platform.name}</ItemTitle>
        <ItemDescription className="text-caption">
          {s.costPerContract !== null
            ? `один контракт стоил ${fmtMoney(s.costPerContract, platform.currency)}`
            : 'контрактов пока нет'}
        </ItemDescription>
      </ItemContent>
      <ItemActions className="gap-4">
        <div className={cn('flex flex-col items-end gap-0.5', low && 'text-warn')}>
          <span className="flex items-center gap-1 font-display text-stat-sm leading-none tabular-nums">
            {low && <AlertTriangle className="size-4" />}
            {s.balance}
          </span>
          <span className="text-meta text-muted-foreground">{platform.creditsName}</span>
        </div>
        <Button
          variant={low ? 'lime' : 'soft'}
          size="xs"
          onClick={() => navigate(`/freelance/p/${platform.id}?tab=credits`)}
        >
          {low ? 'Пополнить' : 'Открыть'} <ArrowRight />
        </Button>
      </ItemActions>
    </Item>
  )
}

export function FreelanceOverviewPage() {
  const navigate = useNavigate()
  const [from] = useState(() => new Date().setHours(0, 0, 0, 0) - 29 * DAY)
  const { data: platformList = [] } = useApi('platforms', 'list')
  const { data: goals = [] } = useApi('goals', 'progress')
  const { data: stats } = useApi('freelance', 'stats', { from })
  const { data: stale = [] } = useApi('proposals', 'stale', { days: 3 })
  const { data: active = [] } = useApi('projects', 'list', { status: 'active' })
  const { data: month } = useApi('finance', 'month', { month: monthKey() })

  const contracts = active.filter((p) => p.platformId)
  const platformName = (id: string | null): string | undefined =>
    platformList.find((p) => p.id === id)?.name
  const withCredits = platformList.filter((p) => p.creditsName)
  const netEntries = Object.entries(month?.net ?? {}) as [Currency, number][]
  const totals = stats?.totals

  return (
    <Page>
      <PageHeader
        title="Фриланс"
        subtitle="Цели, воронка за 30 дней и то, что требует внимания."
        actions={platformList.map((p) => (
          <Button
            key={p.id}
            variant="soft"
            onClick={() => navigate(`/freelance/p/${p.id}?tab=proposals&new=1`)}
          >
            <Plus /> Отклик: {p.name}
          </Button>
        ))}
      />
      <PageBody>
        <div className="stagger grid grid-cols-12 gap-3">
          {/* Money and contracts */}
          <Card className="col-span-4 bg-ink text-ink-foreground">
            <CardHeader>
              <CardTitle className="text-ink-muted">На руки в этом месяце</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-1">
              {netEntries.length ? (
                netEntries.map(([cur, v]) => (
                  <div key={cur} className="font-display text-stat leading-none tabular-nums">
                    {fmtMoney(v, cur)}
                  </div>
                ))
              ) : (
                <div className="font-display text-stat leading-none">—</div>
              )}
              <div className="mt-2 text-caption text-ink-muted">
                {contracts.length}{' '}
                {plural(contracts.length, [
                  'активный контракт',
                  'активных контракта',
                  'активных контрактов'
                ])}
              </div>
            </CardContent>
          </Card>

          <Card className="col-span-8">
            <CardHeader>
              <CardTitle>Воронка за 30 дней</CardTitle>
              {totals && totals.sent > 0 && (
                <CardDescription>
                  {totals.sent} откликов → {totals.replied} ответов ({totals.replyRate}%) →{' '}
                  {totals.hired} контрактов ({totals.hireRate}%)
                  {stats?.avgReplyHours !== null &&
                    stats?.avgReplyHours !== undefined &&
                    ` · отвечают в среднем за ${stats.avgReplyHours} ч`}
                </CardDescription>
              )}
            </CardHeader>
            <CardContent>
              {!stats || stats.byPlatform.length === 0 ? (
                <p className="text-body text-muted-foreground">
                  За последние 30 дней откликов не было.
                </p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Платформа</TableHead>
                      <TableHead className="text-right">Отклики</TableHead>
                      <TableHead className="text-right">Ответы</TableHead>
                      <TableHead className="text-right">Интервью</TableHead>
                      <TableHead className="text-right">Контракты</TableHead>
                      <TableHead className="text-right">Коннекты</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {stats.byPlatform.map((r) => (
                      <TableRow
                        key={r.key}
                        className="cursor-pointer"
                        onClick={() => navigate(`/freelance/p/${r.key}?tab=stats`)}
                      >
                        <TableCell className="font-medium">{r.label}</TableCell>
                        <TableCell className="text-right tabular-nums">{r.sent}</TableCell>
                        <TableCell className="text-right tabular-nums">
                          {r.replied}{' '}
                          <span className="text-muted-foreground">· {r.replyRate}%</span>
                        </TableCell>
                        <TableCell className="text-right tabular-nums">{r.interview}</TableCell>
                        <TableCell className="text-right tabular-nums">
                          {r.hired} <span className="text-muted-foreground">· {r.hireRate}%</span>
                        </TableCell>
                        <TableCell className="text-right tabular-nums">{r.credits}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>

          {/* Attention */}
          <Card className="col-span-6">
            <CardHeader>
              <CardTitle>Пора напомнить</CardTitle>
              <CardDescription>Отклики без ответа больше 3 дней.</CardDescription>
              <CardAction>
                <BellRing className="size-4 text-muted-foreground" />
              </CardAction>
            </CardHeader>
            <CardContent>
              {stale.length === 0 ? (
                <p className="text-body text-muted-foreground">Никого не нужно догонять.</p>
              ) : (
                <ItemGroup className="gap-1.5">
                  {stale.slice(0, 8).map((p) => (
                    <Item
                      key={p.id}
                      asChild
                      size="xs"
                      variant="muted"
                      className="cursor-pointer bg-card hover:ring-1 hover:ring-border"
                    >
                      <button
                        type="button"
                        className="w-full text-left"
                        onClick={() =>
                          navigate(`/freelance/p/${p.platformId}?tab=proposals&open=${p.id}`)
                        }
                      >
                        <ItemContent className="min-w-0">
                          <ItemTitle className="w-full truncate font-normal">
                            {p.jobTitle}
                          </ItemTitle>
                          <ItemDescription className="text-caption">
                            {platformName(p.platformId)} · отправлен {fmtDay(p.sentAt)}
                          </ItemDescription>
                        </ItemContent>
                      </button>
                    </Item>
                  ))}
                </ItemGroup>
              )}
            </CardContent>
          </Card>

          <Card className="col-span-6">
            <CardHeader>
              <CardTitle>Баланс коннектов</CardTitle>
              <CardDescription>
                Предупреждение, когда осталось меньше {LOW_CREDITS}.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {withCredits.length === 0 ? (
                <p className="text-body text-muted-foreground">
                  Ни на одной платформе нет платных откликов.
                </p>
              ) : (
                <ItemGroup className="gap-1.5">
                  {withCredits.map((p) => (
                    <CreditsRow key={p.id} platform={p} />
                  ))}
                </ItemGroup>
              )}
            </CardContent>
          </Card>

          {/* Goals */}
          <div className="col-span-12 flex items-center justify-between pt-2">
            <h2 className="text-body font-semibold">Цели</h2>
            <Button
              variant="subtle"
              size="xs"
              onClick={() => navigate('/freelance/goals')}
            >
              <Target /> Все цели
            </Button>
          </div>
          {goals.length === 0 ? (
            <Card className="col-span-12">
              <CardContent className="flex items-center justify-between gap-4">
                <p className="text-body text-muted-foreground">
                  Поставьте цель — например, 10 откликов в неделю.
                </p>
                <Button variant="lime" size="sm" onClick={() => navigate('/freelance/goals')}>
                  <Plus /> Цель
                </Button>
              </CardContent>
            </Card>
          ) : (
            goals.map((g) => (
              <div key={g.id} className={cn('col-span-4')}>
                <GoalCard g={g} platformName={platformName(g.platformId)} />
              </div>
            ))
          )}
        </div>
      </PageBody>
    </Page>
  )
}
