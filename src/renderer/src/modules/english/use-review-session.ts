import { useState } from 'react'
import { toast } from 'sonner'
import type { ReviewGrade, Word } from '@shared/domain/english'
import { api } from '@/lib/api'
import { useApi } from '@/lib/query'

export type GradeCounts = Record<ReviewGrade, number>

const NO_RESULTS: GradeCounts = { 0: 0, 1: 0, 2: 0, 3: 0 }

/** The session's own queue: a copy of the server's, plus forgotten words appended at its end, or extra practice. */
interface Session {
  words: Word[]
  unique: number
  /** Practice beyond the norm: grades don't push the schedule (see english.review `extra`). */
  extra: boolean
}

export interface ReviewSession {
  loading: boolean
  /** This visit's queue didn't load (a failed refetch once the session has started doesn't end it). */
  error: Error | null
  retry: () => void
  index: number
  current: Word | undefined
  total: number
  done: number
  finished: boolean
  revealed: boolean
  reveal: () => void
  busy: boolean
  results: GradeCounts
  uniqueTotal: number
  extra: boolean
  grade: (g: ReviewGrade) => Promise<void>
  startExtra: (limit: number) => Promise<void>
  /** New entries beyond today's goal: an ordinary session (it moves the schedule, unlike `startExtra`). */
  startMoreNew: (limit: number) => Promise<void>
}

/**
 * State of one flashcard session: the queue (words graded «Не згадали» come back at its end), the open card,
 * answers per grade, and practice beyond the norm.
 */
export function useReviewSession(): ReviewSession {
  const {
    data: initial,
    isLoading,
    isFetchedAfterMount,
    error,
    refetch
  } = useApi('english', 'queue', undefined, {
    staleTime: Infinity,
    refetchOnMount: 'always'
  })
  const [session, setSession] = useState<Session | null>(null)
  const [index, setIndex] = useState(0)
  const [revealed, setRevealed] = useState(false)
  const [busy, setBusy] = useState(false)
  const [results, setResults] = useState<GradeCounts>(NO_RESULTS)

  // The queue is copied once, from this visit's own fetch (not a cached one from the last visit). Every answer is
  // a write and refetches all queries: read live, the queue shrank to the words still due under the index and
  // skipped every other word. A failed fetch counts as fetched too: then the cached queue of the last visit is
  // stale, and the page shows the error instead of starting on it.
  if (session === null && initial && isFetchedAfterMount && !error) {
    setSession({ words: initial, unique: initial.length, extra: false })
  }

  const queue = session?.words ?? null
  const extra = session?.extra ?? false
  const current = queue?.[index]
  const total = queue?.length ?? 0
  const finished = queue !== null && index >= total

  const start = async (
    load: () => Promise<Word[]>,
    extra: boolean,
    none: string
  ): Promise<void> => {
    try {
      const words = await load()
      if (!words.length) {
        toast.info(none)
        return
      }
      setSession({ words, unique: words.length, extra })
      setIndex(0)
      setRevealed(false)
      setResults(NO_RESULTS)
    } catch (e) {
      toast.error((e as Error).message)
    }
  }
  const startExtra = (limit: number): Promise<void> =>
    start(
      () => api.english.practiceExtra(limit),
      true,
      'Більше слів для тренування немає — додайте нові у словник'
    )
  const startMoreNew = (limit: number): Promise<void> =>
    start(() => api.english.moreNew(limit), false, 'Нових слів більше немає — додайте їх у словник')

  const grade = async (g: ReviewGrade): Promise<void> => {
    if (!current || !queue || !revealed || busy) return
    setBusy(true)
    try {
      await api.english.review({ id: current.id, grade: g, extra })
      setResults((r) => ({ ...r, [g]: r[g] + 1 }))
      if (g === 0)
        setSession({ words: [...queue, current], unique: session?.unique ?? queue.length, extra })
      setIndex((i) => i + 1)
      setRevealed(false)
    } catch (e) {
      toast.error((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return {
    loading: isLoading || queue === null,
    error: session === null ? error : null,
    retry: () => void refetch(),
    index,
    current,
    total,
    done: Math.min(index, total),
    finished,
    revealed,
    reveal: () => setRevealed(true),
    busy,
    results,
    uniqueTotal: session?.unique ?? queue?.length ?? 0,
    extra,
    grade,
    startExtra,
    startMoreNew
  }
}
