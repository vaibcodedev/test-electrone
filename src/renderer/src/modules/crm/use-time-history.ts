import { useMemo, useState } from 'react'
import { addDays } from 'date-fns'
import type { RunningTimer, TimeEntry } from '@shared/domain/crm'
import { KEEP_PERIOD, useApi } from '@/lib/query'
import { dayKey } from '@/lib/format'
import { startOfDayMs } from './time-range'

/**
 * Time history of a project, bounded by date: the last 14 days first, `showEarlier` adds a week at a time.
 * Finished entries are grouped by local day (newest first); the running entry is the timer, not a row.
 */
export function useTimeHistory(projectId: string): {
  days: [string, TimeEntry[]][]
  /** Up to three latest distinct descriptions — quick-start chips. */
  recent: string[]
  running: RunningTimer | null | undefined
  /** The running timer when it belongs to this project. */
  mine: RunningTimer | null
  weeksBack: number
  showEarlier: () => void
  isPending: boolean
} {
  const [weeksBack, setWeeksBack] = useState(0)
  const [today] = useState(() => startOfDayMs(Date.now()))
  // Calendar step, not a fixed 24 h: a DST switch inside the range must not shift the start by an hour.
  const from = addDays(today, -(13 + weeksBack * 7)).getTime()
  const { data: entries = [], isPending } = useApi('time', 'list', { projectId, from }, KEEP_PERIOD)
  const { data: running } = useApi('time', 'running')
  const finished = useMemo(() => entries.filter((e) => e.endedAt !== null), [entries])
  const days = useMemo(() => {
    const map = new Map<string, TimeEntry[]>()
    for (const e of finished) {
      const key = dayKey(e.startedAt)
      map.set(key, [...(map.get(key) ?? []), e])
    }
    return [...map.entries()].sort((a, b) => b[0].localeCompare(a[0]))
  }, [finished])
  const recent = useMemo(
    () => [...new Set(finished.map((e) => e.description.trim()).filter(Boolean))].slice(0, 3),
    [finished]
  )
  return {
    days,
    recent,
    running,
    mine: running && running.projectId === projectId ? running : null,
    weeksBack,
    showEarlier: () => setWeeksBack((w) => w + 1),
    isPending
  }
}
