import { useState } from 'react'
import { toast } from 'sonner'
import type { ReviewGrade, Word } from '@shared/domain/english'
import { api } from '@/lib/api'
import { useApi } from '@/lib/query'

export type GradeCounts = Record<ReviewGrade, number>

const NO_RESULTS: GradeCounts = { 0: 0, 1: 0, 2: 0, 3: 0 }

/** The session's own queue once it differs from the server's: a forgotten word appended, or extra practice. */
interface Session {
  words: Word[]
  unique: number
  /** Practice beyond the norm: grades don't push the schedule (see english.review `extra`). */
  extra: boolean
}

export interface ReviewSession {
  loading: boolean
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
}

/**
 * State of one flashcard session: the queue (words graded «Не згадав» come back at its end), the open card,
 * answers per grade, and practice beyond the norm.
 */
export function useReviewSession(): ReviewSession {
  const { data: initial, isLoading } = useApi('english', 'queue', 50, { staleTime: Infinity, refetchOnMount: 'always' })
  const [session, setSession] = useState<Session | null>(null)
  const [index, setIndex] = useState(0)
  const [revealed, setRevealed] = useState(false)
  const [busy, setBusy] = useState(false)
  const [results, setResults] = useState<GradeCounts>(NO_RESULTS)

  const queue = session?.words ?? initial ?? null
  const extra = session?.extra ?? false
  const current = queue?.[index]
  const total = queue?.length ?? 0
  const finished = queue !== null && index >= total

  const startExtra = async (limit: number): Promise<void> => {
    try {
      const words = await api.english.practiceExtra(limit)
      if (!words.length) {
        toast.info('Більше слів для тренування немає — додайте нові у словник')
        return
      }
      setSession({ words, unique: words.length, extra: true })
      setIndex(0)
      setRevealed(false)
      setResults(NO_RESULTS)
    } catch (e) {
      toast.error((e as Error).message)
    }
  }

  const grade = async (g: ReviewGrade): Promise<void> => {
    if (!current || !queue || !revealed || busy) return
    setBusy(true)
    try {
      await api.english.review({ id: current.id, grade: g, extra })
      setResults((r) => ({ ...r, [g]: r[g] + 1 }))
      if (g === 0) setSession({ words: [...queue, current], unique: session?.unique ?? queue.length, extra })
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
    startExtra
  }
}
