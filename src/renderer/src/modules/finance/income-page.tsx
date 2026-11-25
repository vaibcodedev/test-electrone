import type { ReactElement } from 'react'
import { Link, useNavigate } from 'react-router'
import { ArrowRight, TrendingUp } from 'lucide-react'
import { KEEP_PERIOD, useApi } from '@/lib/query'
import { fmtDate, fmtMoney, fmtPercent } from '@/lib/format'
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
import { FinanceNav, MoneyLines, MonthSwitcher } from './parts'
import { sumByCurrency } from './money'
import { monthRange, useMonth } from './month'

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
      <PageBody>
        {!rows ? (
          <Skeleton className="h-64 rounded-3xl" />
        ) : rows.length === 0 ? (
          <EmptyState
            icon={TrendingUp}
            title="Цього місяця оплат немає"
            hint="Оплати додаються в контракті: відкрийте його в «Клієнти й контракти» й позначте оплату — вона з’явиться тут з урахуванням комісії."
            action={
              <Button variant="soft" onClick={() => navigate('/clients')}>
                До контрактів
              </Button>
            }
          />
        ) : (
          <Card className="py-2">
            <CardContent className="px-2">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Дата</TableHead>
                    <TableHead>Контракт</TableHead>
                    <TableHead>Клієнт</TableHead>
                    <TableHead>Платформа</TableHead>
                    <TableHead className="text-right">Сума</TableHead>
                    <TableHead className="text-right">Комісія</TableHead>
                    <TableHead className="text-right">На руки</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((r) => (
                    <TableRow key={r.paymentId}>
                      <TableCell className="text-muted-foreground tabular-nums">
                        {fmtDate(r.paidAt, 'd MMM')}
                      </TableCell>
                      <TableCell className="w-full max-w-0">
                        <Button
                          asChild
                          variant="link"
                          className="h-auto max-w-full justify-start font-medium no-underline hover:underline"
                        >
                          <Link to={`/projects/${r.projectId}`} title={r.projectTitle}>
                            <span className="truncate">{r.projectTitle}</span>
                          </Link>
                        </Button>
                      </TableCell>
                      <TableCell className="max-w-[180px]">
                        <span className="block truncate" title={r.clientName ?? undefined}>
                          {r.clientName ?? '—'}
                        </span>
                      </TableCell>
                      <TableCell>
                        {r.platformName ? (
                          <Badge variant="soft">{r.platformName}</Badge>
                        ) : (
                          <Badge variant="outline">Напряму</Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {fmtMoney(r.gross, r.currency)}
                      </TableCell>
                      <TableCell className="text-right text-muted-foreground tabular-nums">
                        {r.fee
                          ? `${fmtMoney(r.fee, r.currency)} · ${fmtPercent(r.feePercent)}`
                          : '—'}
                      </TableCell>
                      <TableCell className="text-right font-medium tabular-nums">
                        {fmtMoney(r.net, r.currency)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
                <TableFooter>
                  <TableRow>
                    <TableCell colSpan={4}>Разом за місяць</TableCell>
                    <TableCell className="text-right">
                      <MoneyLines value={totals.gross} className="items-end" />
                    </TableCell>
                    <TableCell className="text-right text-muted-foreground">
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
