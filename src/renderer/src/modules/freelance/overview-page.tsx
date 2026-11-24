import { useEffect, useState } from 'react'
import { useLocation, useNavigate } from 'react-router'
import { AlertTriangle, ArchiveRestore, ArrowRight, BellRing, Plus, Target } from 'lucide-react'
import type { Platform } from '@shared/domain/freelance'
import type { Currency } from '@shared/domain/crm'
import { useApi, useApiMutation } from '@/lib/query'
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
            ? `один контракт коштував ${fmtMoney(s.costPerContract, platform.currency)}`
            : 'контрактів поки немає'}
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
          {low ? 'Поповнити' : 'Відкрити'} <ArrowRight />
        </Button>
      </ItemActions>
    </Item>
  )
}

export function FreelanceOverviewPage() {
  const navigate = useNavigate()
  const [from] = useState(() => new Date().setHours(0, 0, 0, 0) - 29 * DAY)
  const { data: platformList = [] } = useApi('platforms', 'list')
  const { data: allPlatforms = [] } = useApi('platforms', 'list', { includeArchived: true })
  const archived = allPlatforms.filter((p) => p.archived)
  const unarchive = useApiMutation('platforms', 'update', {
    successMessage: 'Платформа знову в меню'
  })
  // Sidebar «Архів · N» links to /freelance#archived.
  const { hash } = useLocation()
  useEffect(() => {
    if (hash === '#archived' && archived.length)
      document.getElementById('archived')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }, [hash, archived.length])
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
        subtitle="Цілі, воронка за 30 днів і те, що потребує уваги."
        actions={platformList.map((p) => (
          <Button
            key={p.id}
            variant="soft"
            onClick={() => navigate(`/freelance/p/${p.id}?tab=proposals&new=1`)}
          >
            <Plus /> Відгук: {p.name}
          </Button>
        ))}
      />
      <PageBody>
        <div className="stagger grid grid-cols-12 gap-3">
          {/* Money and contracts */}
          <Card className="col-span-4 bg-ink text-ink-foreground">
            <CardHeader>
              <CardTitle className="text-ink-muted">На руки цього місяця</CardTitle>
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
                  'активний контракт',
                  'активні контракти',
                  'активних контрактів'
                ])}
              </div>
            </CardContent>
          </Card>

          <Card className="col-span-8">
            <CardHeader>
              <CardTitle>Воронка за 30 днів</CardTitle>
              {totals && totals.sent > 0 && (
                <CardDescription>
                  {totals.sent} відгуків → {totals.replied} відповідей ({totals.replyRate}%) →{' '}
                  {totals.hired} контрактів ({totals.hireRate}%)
                  {stats?.avgReplyHours !== null &&
                    stats?.avgReplyHours !== undefined &&
                    ` · відповідають у середньому за ${stats.avgReplyHours} год`}
                </CardDescription>
              )}
            </CardHeader>
            <CardContent>
              {!stats || stats.byPlatform.length === 0 ? (
                <p className="text-body text-muted-foreground">
                  За останні 30 днів відгуків не було.
                </p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Платформа</TableHead>
                      <TableHead className="text-right">Відгуки</TableHead>
                      <TableHead className="text-right">Відповіді</TableHead>
                      <TableHead className="text-right">Інтерв’ю</TableHead>
                      <TableHead className="text-right">Контракти</TableHead>
                      <TableHead className="text-right">Конекти</TableHead>
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
              <CardTitle>Час нагадати</CardTitle>
              <CardDescription>Відгуки без відповіді понад 3 дні.</CardDescription>
              <CardAction>
                <BellRing className="size-4 text-muted-foreground" />
              </CardAction>
            </CardHeader>
            <CardContent>
              {stale.length === 0 ? (
                <p className="text-body text-muted-foreground">Нікого не треба наздоганяти.</p>
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
                            {platformName(p.platformId)} · надіслано {fmtDay(p.sentAt)}
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
              <CardTitle>Баланс конектів</CardTitle>
              <CardDescription>Попередження, коли лишилося менше {LOW_CREDITS}.</CardDescription>
            </CardHeader>
            <CardContent>
              {withCredits.length === 0 ? (
                <p className="text-body text-muted-foreground">
                  На жодній платформі немає платних відгуків.
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
            <h2 className="text-body font-semibold">Цілі</h2>
            <Button variant="subtle" size="xs" onClick={() => navigate('/freelance/goals')}>
              <Target /> Усі цілі
            </Button>
          </div>
          {goals.length === 0 ? (
            <Card className="col-span-12">
              <CardContent className="flex items-center justify-between gap-4">
                <p className="text-body text-muted-foreground">
                  Поставте ціль — наприклад, 10 відгуків на тиждень.
                </p>
                <Button variant="lime" size="sm" onClick={() => navigate('/freelance/goals')}>
                  <Plus /> Ціль
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

          {archived.length > 0 && (
            <section id="archived" className="col-span-12 flex scroll-mt-4 flex-col gap-2 pt-2">
              <h2 className="text-body font-semibold">Архівні платформи</h2>
              <ItemGroup className="gap-1.5">
                {archived.map((p) => (
                  <Item key={p.id} variant="muted" size="sm">
                    <ItemContent className="min-w-0">
                      <ItemTitle className="flex items-center gap-2">
                        <span
                          className="size-2 rounded-full"
                          style={{ background: p.color ?? 'var(--muted-foreground)' }}
                        />
                        {p.name}
                      </ItemTitle>
                    </ItemContent>
                    <ItemActions>
                      <Button
                        variant="subtle"
                        size="xs"
                        onClick={() => navigate(`/freelance/p/${p.id}`)}
                      >
                        Відкрити
                      </Button>
                      <Button
                        variant="subtle"
                        size="xs"
                        onClick={() => unarchive.mutate({ id: p.id, patch: { archived: false } })}
                      >
                        <ArchiveRestore /> Повернути
                      </Button>
                    </ItemActions>
                  </Item>
                ))}
              </ItemGroup>
            </section>
          )}
        </div>
      </PageBody>
    </Page>
  )
}
