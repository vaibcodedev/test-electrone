import { toast } from 'sonner'
import { useApi, useApiMutation } from '@/lib/query'
import { fmtBytes } from '@/lib/format'
import type { MethodOf } from '@/lib/api'

/** Below this the cache is effectively empty: a fresh session already writes a few index files. */
const EMPTY_CACHE_BYTES = 64 * 1024

type StorageMutation<M extends MethodOf<'storage'>> = ReturnType<
  typeof useApiMutation<'storage', M>
>

export interface StorageUsageState {
  usage: ReturnType<typeof useApi<'storage', 'usage'>>
  recount: StorageMutation<'recount'>
  openFolder: StorageMutation<'openFolder'>
  clearCache: { run: () => void; isPending: boolean }
  clearLogs: StorageMutation<'clearLogs'>
  pruneBackups: StorageMutation<'pruneBackups'>
}

/**
 * Data of «Сховище»: the sizes (one query, cached in main) and the cleanups. Every action goes through
 * useApiMutation: errors are toasted there, success refetches the sizes (main has dropped its cache).
 */
export function useStorageUsage(): StorageUsageState {
  const usage = useApi('storage', 'usage')
  const recount = useApiMutation('storage', 'recount')
  const openFolder = useApiMutation('storage', 'openFolder')
  const clearCacheMutation = useApiMutation('storage', 'clearCache')
  const clearLogs = useApiMutation('storage', 'clearLogs', {
    onSuccess: (r) => toast.success(`Старі журнали видалено — звільнено ${fmtBytes(r.freedBytes)}`)
  })
  const pruneBackups = useApiMutation('storage', 'pruneBackups', {
    onSuccess: (r) => toast.success(`Старі бекапи видалено — звільнено ${fmtBytes(r.freedBytes)}`)
  })

  /** The size shown before the click decides between «уже порожній» and «звільнено X». */
  const clearCache = (): void => {
    const before = usage.data?.cache.bytes ?? 0
    clearCacheMutation.mutate(undefined, {
      onSuccess: (r) => {
        if (before < EMPTY_CACHE_BYTES && r.freedBytes < EMPTY_CACHE_BYTES)
          toast.success('Кеш уже порожній')
        else if (r.freedBytes >= 1024)
          toast.success(`Кеш очищено — звільнено ${fmtBytes(r.freedBytes)}`)
        else toast.success('Кеш очищено')
      }
    })
  }

  return {
    usage,
    recount,
    openFolder,
    clearCache: { run: clearCache, isPending: clearCacheMutation.isPending },
    clearLogs,
    pruneBackups
  }
}
