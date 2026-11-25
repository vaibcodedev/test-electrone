import type { ComponentProps, ReactElement, ReactNode } from 'react'
import { fmtNumber, fmtPercent } from '@/lib/format'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Progress } from '@/components/ui/progress'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from '@/components/ui/table'

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
            className="h-3 bg-card *:data-[slot=progress-indicator]:rounded-full *:data-[slot=progress-indicator]:bg-chart-1"
          />
          {/* The same «12 · 33,3%» as the FunnelTable cells. */}
          <span className="text-right text-body tabular-nums">
            {i > 0 && base > 0 ? (
              <WithRate value={s.value} rate={(s.value / base) * 100} />
            ) : (
              fmtNumber(s.value)
            )}
          </span>
        </div>
      ))}
    </div>
  )
}

/** «12 · 33,3%»: a count with its conversion rate (Funnel, FunnelTable cells). A zero is just «0»: «0 · 0%» is noise. */
export function WithRate({ value, rate }: { value: number; rate: number }): ReactElement {
  if (value === 0) return <>0</>
  return (
    <>
      {fmtNumber(value)} <span className="text-muted-foreground">· {fmtPercent(rate)}</span>
    </>
  )
}

/**
 * A table row that opens something: focusable, Enter / Space like a click. Not role="button" (clickableProps):
 * the row must stay a row, or the table loses its cells for screen readers.
 */
const rowProps = (open: () => void): ComponentProps<'tr'> => ({
  tabIndex: 0,
  className: 'cursor-pointer',
  onClick: open,
  onKeyDown: (e) => {
    if (e.target !== e.currentTarget || (e.key !== 'Enter' && e.key !== ' ')) return
    e.preventDefault()
    open()
  }
})

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
  empty = 'Поки немає даних за період.',
  onRowClick
}: {
  title: string
  description: string
  rows: R[]
  columns: FunnelColumn<R>[]
  /** Header of the group column; empty by default — the card title already names it. */
  groupHeader?: string
  empty?: string
  /** Rows open something (the platform's stats): clickable and reachable with Tab, Enter / Space. */
  onRowClick?: (row: R) => void
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
                <TableRow key={r.key} {...(onRowClick && rowProps(() => onRowClick(r)))}>
                  <TableCell className="max-w-48 truncate font-medium" title={r.label}>
                    {r.label}
                  </TableCell>
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
