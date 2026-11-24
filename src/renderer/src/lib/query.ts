import {
  keepPreviousData,
  QueryClient,
  useInfiniteQuery,
  useMutation,
  useQuery,
  type UseMutationOptions,
  type UseQueryOptions
} from '@tanstack/react-query'
import { toast } from 'sonner'
import type { ApiNamespace } from '@shared/api'
import { call, type ArgOf, type MethodOf, type ResultOf } from './api'
import { useUi } from '@/stores/ui-store'
import { flushAllAutosaves } from '@/hooks/use-autosave'

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      retry: false,
      refetchOnWindowFocus: false
    },
    mutations: { retry: false }
  }
})

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
  }
) {
  const { successMessage, silent, onSuccess, onError, ...rest } = options ?? {}
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
      if (String(method).startsWith('create') && created && typeof created.id === 'string') useUi.getState().markCreated(created.id)
      if (successMessage) toast.success(successMessage)
      return onSuccess?.(...args)
    },
    onError: (error, ...args) => {
      if (!silent) toast.error(error.message)
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
      call(ns, method, { ...query, limit: pageSize, offset: pageParam } as ArgOf<N, M>) as Promise<unknown[]>,
    getNextPageParam: (lastPage: unknown[], pages) => (lastPage.length === pageSize ? pages.length * pageSize : undefined),
    // Switching a filter/search keeps the current rows until the new ones arrive: no empty-state flash.
    // Safe here (lists, not editors).
    placeholderData: keepPreviousData
  })
  type Item = ResultOf<N, M> extends (infer I)[] ? I : never
  const items = (result.data?.pages.flat() ?? []) as Item[]
  return {
    ...result,
    items,
    hasMore: !!result.hasNextPage,
    loadingMore: result.isFetchingNextPage,
    loadMore: () => void result.fetchNextPage()
  }
}
