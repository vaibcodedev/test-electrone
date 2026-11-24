import { useCallback, useEffect, useRef, useState } from 'react'
import { useVirtualizer } from '@tanstack/react-virtual'
import type { LogChunk } from '@shared/domain/dev'
import { api } from '@/lib/api'
import { useMainEvent } from '@/hooks/use-main-events'
import { cn } from '@/lib/utils'

const MAX_ROWS = 3000
const ROW_HEIGHT = 18

interface Row {
  text: string
  stream: LogChunk['stream']
}

/** Splits streamed chunks into lines, continuing the last line if the previous chunk had no trailing newline. */
function appendChunks(rows: Row[], open: { current: boolean }, chunks: LogChunk[]): Row[] {
  const next = rows.slice()
  for (const c of chunks) {
    const parts = c.text.replace(/\r\n?/g, '\n').split('\n')
    parts.forEach((part, i) => {
      const isLast = i === parts.length - 1
      if (isLast && part === '') return
      if (i === 0 && open.current && next.length) {
        next[next.length - 1] = { text: next[next.length - 1].text + part, stream: next[next.length - 1].stream }
      } else next.push({ text: part, stream: c.stream })
    })
    open.current = !c.text.endsWith('\n')
  }
  return next.length > MAX_ROWS ? next.slice(next.length - MAX_ROWS) : next
}

/**
 * Live log of one script run. Virtualized with TanStack Virtual (fixed row height, no wrapping),
 * follows the tail unless the user scrolled up.
 */
export function LogView({ runId, className }: { runId: string; className?: string }) {
  const [rows, setRows] = useState<Row[]>([])
  const openLine = useRef(false)
  const stick = useRef(true)
  const parentRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    let cancelled = false
    openLine.current = false
    stick.current = true
    setRows([])
    void api.devProjects.logs(runId).then((chunks) => {
      if (!cancelled) setRows(appendChunks([], openLine, chunks))
    })
    return () => {
      cancelled = true
    }
  }, [runId])

  const onLog = useCallback(
    (batch: LogChunk[]) => {
      const mine = batch.filter((c) => c.runId === runId)
      if (mine.length) setRows((prev) => appendChunks(prev, openLine, mine))
    },
    [runId]
  )
  useMainEvent('dev:log', onLog)

  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: 20
  })

  useEffect(() => {
    if (stick.current && rows.length) virtualizer.scrollToIndex(rows.length - 1, { align: 'end' })
  }, [rows.length, virtualizer])

  return (
    <div
      ref={parentRef}
      onScroll={(e) => {
        const el = e.currentTarget
        stick.current = el.scrollTop + el.clientHeight >= el.scrollHeight - ROW_HEIGHT * 2
      }}
      className={cn('selectable min-h-0 overflow-auto rounded-xl bg-[var(--code-bg)] font-mono text-[12px] text-[var(--code-fg)]', className)}
    >
      {rows.length === 0 ? (
        <div className="p-3 text-[var(--code-muted)]">Лог пуст…</div>
      ) : (
        <div className="relative min-w-full" style={{ height: virtualizer.getTotalSize() }}>
          {virtualizer.getVirtualItems().map((v) => {
            const row = rows[v.index]
            return (
              <div
                key={v.key}
                className={cn(
                  'absolute top-0 left-0 w-full px-3 leading-[18px] whitespace-pre',
                  row.stream === 'err' && 'text-[#ff9a9a]',
                  row.stream === 'sys' && 'text-[var(--code-keyword)]'
                )}
                style={{ height: ROW_HEIGHT, transform: `translateY(${v.start}px)` }}
              >
                {row.text || ' '}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
