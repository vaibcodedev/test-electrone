import { Link, useNavigate } from 'react-router'
import { TrendingUp } from 'lucide-react'
import type { MoneyByCurrency } from '@shared/domain/finance'
import { useApi } from '@/lib/query'
import { fmtDate, fmtMoney } from '@/lib/format'
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
import { monthRange, useMonth } from './month'

export function IncomePage() {
  const [month, setMonth] = useMonth()
  const [from, to] = monthRange(month)
  const { data: rows } = useApi('finance', 'income', { from, to })
  const navigate = useNavigate()

  const totals = {
    gross: {} as MoneyByCurrency,
    fee: {} as MoneyByCurrency,
    net: {} as MoneyByCurrency
  }
  for (const r of rows ?? []) {
    totals.gross[r.currency] = (totals.gross[r.currency] ?? 0) + r.gross
    totals.fee[r.currency] = (totals.fee[r.currency] ?? 0) + r.fee
    totals.net[r.currency] = (totals.net[r.currency] ?? 0) + r.net
  }

  return (
    <Page>
      <PageHeader
        title="Доходы"
        subtitle="Каждая строка — оплата по контракту со статусом «оплачено». Комиссия берётся из контракта, а если её нет — из настроек платформы."
        actions={
          <>
            <MonthSwitcher month={month} onChange={setMonth} />
            <Button variant="lime" onClick={() => navigate('/clients')}>
              Добавить оплату
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
            title="В этом месяце оплат нет"
            hint="Откройте контракт в «Клиенты и контракты» и отметьте оплату — она появится здесь с учётом комиссии."
            action={
              <Button variant="soft" onClick={() => navigate('/clients')}>
                К контрактам
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
                    <TableHead>Клиент</TableHead>
                    <TableHead>Платформа</TableHead>
                    <TableHead className="text-right">Сумма</TableHead>
                    <TableHead className="text-right">Комиссия</TableHead>
                    <TableHead className="text-right">На руки</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((r) => (
                    <TableRow key={r.paymentId}>
                      <TableCell className="text-muted-foreground tabular-nums">
                        {fmtDate(r.paidAt, 'd MMM')}
                      </TableCell>
                      <TableCell className="max-w-[260px]">
                        <Button
                          asChild
                          variant="link"
                          className="h-auto max-w-full justify-start truncate font-medium"
                        >
                          <Link to={`/projects/${r.projectId}`}>{r.projectTitle}</Link>
                        </Button>
                      </TableCell>
                      <TableCell className="max-w-[180px] truncate">
                        {r.clientName ?? '—'}
                      </TableCell>
                      <TableCell>
                        {r.platformName ? (
                          <Badge variant="soft">{r.platformName}</Badge>
                        ) : (
                          <span className="text-muted-foreground">Напрямую</span>
                        )}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {fmtMoney(r.gross, r.currency)}
                      </TableCell>
                      <TableCell className="text-right text-muted-foreground tabular-nums">
                        {r.fee ? `${fmtMoney(r.fee, r.currency)} · ${r.feePercent}%` : '—'}
                      </TableCell>
                      <TableCell className="text-right font-medium tabular-nums">
                        {fmtMoney(r.net, r.currency)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
                <TableFooter>
                  <TableRow>
                    <TableCell colSpan={4}>Итого за месяц</TableCell>
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
