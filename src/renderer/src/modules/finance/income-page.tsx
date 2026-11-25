import type { ReactElement } from 'react'
import { Link, useNavigate } from 'react-router'
import { ArrowRight, TrendingUp } from 'lucide-react'
import { KEEP_PERIOD, useApi } from '@/lib/query'
import { fmtDayFull, fmtMoney, fmtPercent } from '@/lib/format'
import { cn } from '@/lib/utils'
import { EmptyState, Page, PageBody, PageHeader } from '@/components/common/page'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow
} from '@/components/ui/table'
import { MoneyLines } from '@/components/common/money-value'
import { FinanceNav, MonthSwitcher } from './parts'
import { sumByCurrency } from './money'
import { monthRange, noneInMonth, useMonth } from './month'

/**
 * Secondary columns, hidden in a narrow card so «На руки» never scrolls away; client and platform move
 * under the contract at the same threshold (no duplicate). Body, header and footer use the same classes.
 */
const CLIENT_COL = 'hidden @5xl:table-cell'
const PLATFORM_COL = 'hidden @5xl:table-cell'
const FEE_COL = 'hidden @2xl:table-cell'

/** Under the contract while the client and platform columns are hidden: «Acme · Upwork». */
const sourceOf = (r: { clientName: string | null; platformName: string | null }): string =>
  [r.clientName, r.platformName ?? 'напряму'].filter(Boolean).join(' · ')

export function IncomePage(): ReactElement {
  const [month, setMonth] = useMonth()
  const [from, to] = monthRange(month)
  const { data: rows } = useApi('finance', 'income', { from, to }, KEEP_PERIOD)
  const navigate = useNavigate()

  const totals = {
    gross: sumByCurrency(rows, (r) => [r.currency, r.gross]),
    fee: sumByCurrency(rows, (r) => [r.currency, r.fee]),
    net: sumByCurrency(rows, (r) => [r.currency, r.net])
  }

  return (
    <Page>
      <PageHeader
        title="Доходи"
        subtitle="Оплати за контрактами за вирахуванням комісії платформи."
        actions={
          <>
            <MonthSwitcher month={month} onChange={setMonth} />
            {/* Payments live in the contract (stages, remainder): no second form here, so no lime and no N. */}
            <Button variant="soft" onClick={() => navigate('/clients')}>
              До контрактів <ArrowRight />
            </Button>
          </>
        }
      >
        <FinanceNav />
      </PageHeader>
      {/* Tabs of the finance hub share the shell key (handle.hub), so only the body fades in on a tab switch. */}
      <PageBody className="animate-page">
        {!rows ? (
          <Skeleton className="h-64 rounded-3xl" />
        ) : rows.length === 0 ? (
          <EmptyState
            icon={TrendingUp}
            title={noneInMonth(month, 'оплат')}
            hint="Оплати позначаються в контракті. Позначте оплату там — вона з’явиться тут разом із комісією."
          />
        ) : (
          <Card className="@container py-2">
            <CardContent className="px-2">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Дата</TableHead>
                    <TableHead>Контракт</TableHead>
                    <TableHead className={CLIENT_COL}>Клієнт</TableHead>
                    <TableHead className={PLATFORM_COL}>Платформа</TableHead>
                    <TableHead className="text-right">Сума</TableHead>
                    <TableHead className={cn('text-right', FEE_COL)}>Комісія</TableHead>
                    <TableHead className="text-right">На руки</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((r) => (
                    <TableRow key={r.paymentId}>
                      <TableCell className="whitespace-nowrap text-muted-foreground tabular-nums">
                        {fmtDayFull(r.paidAt)}
                      </TableCell>
                      <TableCell className="w-full max-w-0 min-w-24">
                        <Button
                          asChild
                          variant="link"
                          className="h-auto max-w-full justify-start font-medium no-underline hover:underline"
                        >
                          <Link to={`/projects/${r.projectId}`} title={r.projectTitle}>
                            <span className="truncate">{r.projectTitle}</span>
                          </Link>
                        </Button>
                        <span
                          className="block truncate text-caption text-muted-foreground @5xl:hidden"
                          title={sourceOf(r)}
                        >
                          {sourceOf(r)}
                        </span>
                      </TableCell>
                      <TableCell className={cn('max-w-[180px]', CLIENT_COL)}>
                        <span className="block truncate" title={r.clientName ?? undefined}>
                          {r.clientName ?? '—'}
                        </span>
                      </TableCell>
                      <TableCell className={PLATFORM_COL}>
                        {r.platformName ? (
                          <Badge variant="soft">{r.platformName}</Badge>
                        ) : (
                          <Badge variant="outline">Напряму</Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-right whitespace-nowrap tabular-nums">
                        {fmtMoney(r.gross, r.currency)}
                      </TableCell>
                      <TableCell
                        className={cn(
                          'text-right whitespace-nowrap text-muted-foreground tabular-nums',
                          FEE_COL
                        )}
                      >
                        {r.fee ? (
                          <>
                            <div>{fmtMoney(r.fee, r.currency)}</div>
                            <div className="text-caption">{fmtPercent(r.feePercent)}</div>
                          </>
                        ) : (
                          '—'
                        )}
                      </TableCell>
                      <TableCell className="text-right font-medium whitespace-nowrap tabular-nums">
                        {fmtMoney(r.net, r.currency)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
                <TableFooter>
                  <TableRow>
                    {/* Hidden columns get their own hidden cells: a colSpan over them shifts the sums. */}
                    <TableCell colSpan={2}>Разом за місяць</TableCell>
                    <TableCell className={CLIENT_COL} />
                    <TableCell className={PLATFORM_COL} />
                    <TableCell className="text-right">
                      <MoneyLines value={totals.gross} className="items-end" />
                    </TableCell>
                    <TableCell className={cn('text-right text-muted-foreground', FEE_COL)}>
                      <MoneyLines value={totals.fee} className="items-end" />
                    </TableCell>
                    <TableCell className="text-right font-semibold">
                      <MoneyLines value={totals.net} className="items-end" />
                    </TableCell>
                  </TableRow>
                </TableFooter>
              </Table>
            </CardContent>
          </Card>
        )}
      </PageBody>
    </Page>
  )
}
