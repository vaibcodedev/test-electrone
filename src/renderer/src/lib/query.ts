import {
  QueryClient,
  useMutation,
  useQuery,
  type UseMutationOptions,
  type UseQueryOptions
} from '@tanstack/react-query'
import { toast } from 'sonner'
import type { ApiNamespace } from '@shared/api'
import { call, type ArgOf, type MethodOf, type ResultOf } from './api'

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
    mutationFn: (arg) => call(ns, method, arg),
    onSuccess: (...args) => {
      invalidateAll()
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
