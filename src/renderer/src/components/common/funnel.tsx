import type { ReactElement, ReactNode } from 'react'
import { fmtPercent } from '@/lib/format'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Progress } from '@/components/ui/progress'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'

export interface FunnelStep {
  label: string
  value: number
}

/**
 * Conversion funnel (sent → replied → interview → contract): one bar per step against the first
 * step, the count and its share of the first step on the right. Lives inside a `Card`, so the
 * track is `bg-card` (a `surface` track would vanish on the tile).
 */
export function Funnel({ steps }: { steps: FunnelStep[] }): ReactElement {
  const base = steps[0]?.value ?? 0
  const max = Math.max(1, base)
  return (
    <div className="flex flex-col gap-3">
      {steps.map((s, i) => (
        <div key={s.label} className="grid grid-cols-[130px_1fr_90px] items-center gap-3">
          <span className="text-body">{s.label}</span>
          <Progress
            value={(s.value / max) * 100}
            aria-label={s.label}
            className="h-3 bg-card [&>[data-slot=progress-indicator]]:rounded-full [&>[data-slot=progress-indicator]]:bg-chart-1"
          />
          <span className="text-right text-body tabular-nums">
            <span className="font-medium">{s.value}</span>
            {i > 0 && base > 0 && (
              <span className="ml-1.5 text-muted-foreground">{Math.round((s.value / base) * 100)}%</span>
            )}
          </span>
        </div>
      ))}
    </div>
  )
}

/** «12 · 33,3%»: a count with its conversion rate, for FunnelTable cells. */
export function WithRate({ value, rate }: { value: number; rate: number }): ReactElement {
  return (
    <>
      {value} <span className="text-muted-foreground">· {fmtPercent(rate)}</span>
    </>
  )
}

export interface FunnelColumn<R> {
  header: ReactNode
  cell: (row: R) => ReactNode
}

/**
 * Funnel split by a group (task type, template, job board, resume…): the group name, then the
 * given numeric columns aligned right.
 */
export function FunnelTable<R extends { key: string; label: string }>({
  title,
  description,
  rows,
  columns,
  groupHeader,
  empty = 'Поки немає даних за період.'
}: {
  title: string
  description: string
  rows: R[]
  columns: FunnelColumn<R>[]
  /** Header of the group column; empty by default — the card title already names it. */
  groupHeader?: string
  empty?: string
}): ReactElement {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent>
        {rows.length === 0 ? (
          <p className="text-body text-muted-foreground">{empty}</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead>{groupHeader}</TableHead>
                {columns.map((c, i) => (
                  <TableHead key={i} className="text-right">
                    {c.header}
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r) => (
                <TableRow key={r.key}>
                  <TableCell className="max-w-48 truncate font-medium">{r.label}</TableCell>
                  {columns.map((c, i) => (
                    <TableCell key={i} className="text-right tabular-nums">
                      {c.cell(r)}
                    </TableCell>
                  ))}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  )
}
