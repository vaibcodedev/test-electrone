import {
  keepPreviousData,
  MutationCache,
  QueryCache,
  QueryClient,
  useInfiniteQuery,
  useMutation,
  useQuery,
  type UseMutationOptions,
  type UseQueryOptions
} from '@tanstack/react-query'
import { useMemo } from 'react'
import { toast } from 'sonner'
import type { ApiNamespace } from '@shared/api'
import { call, type ArgOf, type MethodOf, type ResultOf } from './api'
import { useUi } from '@/stores/ui-store'
import { reportError } from './error-reporting'
import { flushAllAutosaves, isAutosaving } from '@/hooks/use-autosave'

/**
 * A failed read used to look like an empty list («Нічого немає»). Now every failed query says so once,
 * with «Повторити» (refetches everything that failed), and lands in the log — no per-page code needed.
 */
const queryCache = new QueryCache({
  onError: (error, query) => {
    reportError(error, `query:${String(query.queryKey[0])}.${String(query.queryKey[1])}`)
    // A query that shows its own error next to the control (the model list in Settings → ШІ) opts out with
    // `meta: { inlineError: true }`: a toast over it only repeated the same words.
    if (query.meta?.inlineError) return
    toast.error('Не вдалося завантажити дані', {
      id: 'query-error',
      // 12 s, paused while hovered: long enough to reach «Повторити». A toast that stayed until closed piled up
      // under later ones and needed sonner's corner ✕, which doesn't fit the design.
      duration: 12_000,
      description: error instanceof Error ? error.message : String(error),
      action: {
        label: 'Повторити',
        onClick: () =>
          void queryClient.refetchQueries({
            type: 'active',
            predicate: (q) => q.state.status === 'error'
          })
      }
    })
  }
})

/**
 * Mutations started by an autosave field. Only their failures stop «Зберегти»: a failed tag or link created
 * a second earlier is not an unsaved edit. The cache's onMutate runs synchronously inside mutate().
 */
const autosaves = new WeakSet<object>()
const mutationCache = new MutationCache({
  onMutate: (_variables, mutation) => {
    if (isAutosaving()) autosaves.add(mutation)
  }
})

export const queryClient = new QueryClient({
  queryCache,
  mutationCache,
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      retry: false,
      refetchOnWindowFocus: false
    },
    mutations: { retry: false }
  }
})

/**
 * Saves every pending autosave and waits until all mutations are really done. A mutation reaches IPC a
 * microtask after mutate(), so revert/changed sent right after a plain flush ran before the last save.
 */
export async function flushAndSettle(): Promise<{ failed: number }> {
  const started = Date.now()
  flushAllAutosaves()
  const cache = queryClient.getMutationCache()
  if (queryClient.isMutating() > 0) {
    await new Promise<void>((resolve) => {
      const unsubscribe = cache.subscribe(() => {
        if (queryClient.isMutating() > 0) return
        unsubscribe()
        resolve()
      })
    })
  }
  // Saves the server rejected since the flush (too long, out of range…): the caller must not report success.
  const failed = cache
    .getAll()
    .filter(
      (m) => autosaves.has(m) && m.state.status === 'error' && m.state.submittedAt >= started - 2000
    ).length
  return { failed }
}

let invalidateTimer: ReturnType<typeof setTimeout> | null = null

/**
 * IPC to a local SQLite is cheap, so after any write we simply refetch every *active* query.
 * This keeps cross-module views (dashboard, links, pins, search, calendar) correct without
 * hand-maintained dependency graphs. Debounced so bursts collapse into one refetch.
 */
export function invalidateAll(): void {
  if (invalidateTimer) clearTimeout(invalidateTimer)
  invalidateTimer = setTimeout(() => {
    void queryClient.invalidateQueries()
  }, 40)
}

/**
 * For queries keyed by a period (month, week, date range): keep showing the previous period until the
 * next one arrives, so cards don't collapse and jump on every switch. Do NOT use for record editors —
 * an editor could briefly receive another record's data and autosave it.
 */
export const KEEP_PERIOD = { placeholderData: keepPreviousData } as const

/** useQuery bound to an API method: `useApi('ideas', 'list', { status })`. */
export function useApi<N extends ApiNamespace, M extends MethodOf<N>>(
  ns: N,
  method: M,
  arg?: ArgOf<N, M>,
  options?: Omit<UseQueryOptions<ResultOf<N, M>>, 'queryKey' | 'queryFn'>
) {
  return useQuery<ResultOf<N, M>>({
    queryKey: [ns, method, arg ?? null],
    queryFn: () => call(ns, method, arg),
    ...options
  })
}

/** useMutation bound to an API method. Errors are toasted; success refreshes active queries. */
export function useApiMutation<N extends ApiNamespace, M extends MethodOf<N>>(
  ns: N,
  method: M,
  options?: Omit<UseMutationOptions<ResultOf<N, M>, Error, ArgOf<N, M>>, 'mutationFn'> & {
    successMessage?: string
    silent?: boolean
    /**
     * false — the record is complete already (a title typed into a quick field and Enter): it opens for reading,
     * not in «Редагувати» with «Зберегти / Скасувати», which made it look unsaved.
     */
    openInEdit?: boolean
  }
) {
  const { successMessage, silent, onSuccess, onError, openInEdit = true, ...rest } = options ?? {}
  return useMutation<ResultOf<N, M>, Error, ArgOf<N, M>>({
    mutationFn: (arg) => {
      // Pending edits of the open editor go first (IPC keeps order), so the new record is the newest one.
      if (String(method).startsWith('create')) flushAllAutosaves()
      return call(ns, method, arg)
    },
    onSuccess: (...args) => {
      invalidateAll()
      if (method === 'remove') useUi.getState().bumpTrash()
      const created = args[0] as { id?: unknown } | null
      if (
        openInEdit &&
        String(method).startsWith('create') &&
        created &&
        typeof created.id === 'string'
      )
        useUi.getState().markCreated(created.id)
      if (successMessage) toast.success(successMessage)
      return onSuccess?.(...args)
    },
    onError: (error, ...args) => {
      // Longer than Sonner's 4 s: an error has to be read to the end.
      if (!silent) toast.error(error.message, { duration: 8000 })
      return onError?.(error, ...args)
    },
    ...rest
  })
}

/**
 * Infinite (paged) list bound to an API list method that accepts { limit, offset }.
 * Pair with <VirtualList hasMore loadingMore onLoadMore …/>. Filters go in `query`.
 */
export function useInfiniteApi<N extends ApiNamespace, M extends MethodOf<N>>(
  ns: N,
  method: M,
  query: Record<string, unknown> = {},
  pageSize = 100
) {
  const result = useInfiniteQuery({
    queryKey: [ns, method, 'infinite', query, pageSize],
    initialPageParam: 0,
    queryFn: ({ pageParam }) =>
      call(ns, method, { ...query, limit: pageSize, offset: pageParam } as ArgOf<N, M>) as Promise<
        unknown[]
      >,
    getNextPageParam: (lastPage: unknown[], pages) =>
      lastPage.length === pageSize ? pages.length * pageSize : undefined,
    // Switching a filter/search keeps the current rows until the new ones arrive: no empty-state flash.
    // Safe here (lists, not editors).
    placeholderData: keepPreviousData
  })
  type Item = ResultOf<N, M> extends (infer I)[] ? I : never
  // Stable between renders: effects and memos keyed on list.items rerun only when the data changes.
  const items = useMemo(() => (result.data?.pages.flat() ?? []) as Item[], [result.data])
  return {
    ...result,
    items,
    hasMore: !!result.hasNextPage,
    loadingMore: result.isFetchingNextPage,
    /**
     * The list may show its EmptyState / NoResults. Not while the first page loads, not while a placeholder
     * (keepPreviousData: right after «Скинути фільтри» the old empty page flashed the empty-base state) and not
     * after a failed load: «Сніпетів поки немає» + «Додати» then invited duplicates (the error toast says it).
     */
    showEmpty: !result.isLoading && !result.isPlaceholderData && !result.isError,
    loadMore: () => void result.fetchNextPage()
  }
}
