import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import type { InterviewQuestion, QuestionCategory, QuestionGroup } from '@shared/domain/jobs'
import { useApi, useApiMutation } from '@/lib/query'

export type Grade = 0 | 1 | 2 | 3

export interface PracticeSession {
  loading: boolean
  /** No questions in this filter at all (not just nothing due). */
  bankEmpty: boolean
  queue: InterviewQuestion[] | null
  current: InterviewQuestion | undefined
  index: number
  total: number
  done: number
  finished: boolean
  revealed: boolean
  reveal: () => void
  grade: (g: Grade) => void
  grading: boolean
  /** «extra» = practising ahead of schedule: answers can't push reviews later. */
  mode: 'due' | 'extra'
  results: Record<Grade, number>
  uniqueTotal: number
  startExtra: (limit: number) => void
  loadingExtra: boolean
}

/**
 * One practice session over the question bank: the due queue (or extra questions ahead of schedule),
 * the current card, grading and the tally. «Не вдалося» puts the question back at the end of the session.
 * Reviews go through useApiMutation, so every open query (counters, the bank) refreshes after each grade.
 * A new filter is a new session: the caller remounts it (key), so no state has to be reset here.
 */
export function usePracticeSession({
  category,
  group,
  extraFirst
}: {
  category: QuestionCategory | undefined
  group: QuestionGroup | undefined
  /** Opened from «Тренування» with nothing due: start practising ahead right away. */
  extraFirst: boolean
}): PracticeSession {
  const { data: initial } = useApi(
    'jobs',
    'practiceQueue',
    { limit: 50, category, group },
    { staleTime: Infinity, refetchOnMount: 'always' }
  )
  // Is there anything in this filter at all? An empty bank isn't «все повторено».
  const { data: anyInFilter } = useApi('jobs', 'questions', {
    group,
    category,
    limit: 1,
    offset: 0
  })
  const review = useApiMutation('jobs', 'reviewQuestion')
  const extra = useApiMutation('jobs', 'practiceExtra')

  const [mode, setMode] = useState<'due' | 'extra'>('due')
  const [seen, setSeen] = useState<string[]>([])
  const [queue, setQueue] = useState<InterviewQuestion[] | null>(null)
  const [index, setIndex] = useState(0)
  const [revealed, setRevealed] = useState(false)
  const [results, setResults] = useState<Record<Grade, number>>({ 0: 0, 1: 0, 2: 0, 3: 0 })
  const [uniqueTotal, setUniqueTotal] = useState(0)

  const startExtra = (limit: number): void => {
    if (extra.isPending) return
    const exclude = [...seen, ...(queue ?? []).map((q) => q.id)]
    extra.mutate(
      { limit, category, group, excludeIds: exclude.slice(-1000) },
      {
        onSuccess: (list) => {
          if (!list.length) {
            toast.info('Більше питань немає — додайте нові в банк')
            setQueue((q) => q ?? [])
            return
          }
          setSeen(exclude)
          setMode('extra')
          setQueue(list)
          setIndex(0)
          setRevealed(false)
          setUniqueTotal((n) => n + list.length)
        }
      }
    )
  }

  useEffect(() => {
    if (initial && queue === null) {
      if (!initial.length && extraFirst && mode === 'due' && !seen.length) {
        toast.info('На сьогодні все повторено — тренуємо наперед')
        startExtra(10)
        return
      }
      setQueue(initial)
      setUniqueTotal(initial.length)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- runs once per loaded queue
  }, [initial, queue])

  const current = queue?.[index]
  const total = queue?.length ?? 0
  const done = Math.min(index, total)

  const grade = (g: Grade): void => {
    if (!current || !revealed || review.isPending) return
    review.mutate(
      { id: current.id, grade: g, extra: mode === 'extra' },
      {
        onSuccess: () => {
          setResults((r) => ({ ...r, [g]: r[g] + 1 }))
          if (g === 0) setQueue((q) => (q ? [...q, current] : q))
          setIndex((i) => i + 1)
          setRevealed(false)
        }
      }
    )
  }

  return {
    loading: queue === null || anyInFilter === undefined,
    bankEmpty: anyInFilter?.length === 0,
    queue,
    current,
    index,
    total,
    done,
    finished: queue !== null && queue.length > 0 && index >= queue.length,
    revealed,
    reveal: () => setRevealed(true),
    grade,
    grading: review.isPending,
    mode,
    results,
    uniqueTotal,
    startExtra,
    loadingExtra: extra.isPending
  }
}
