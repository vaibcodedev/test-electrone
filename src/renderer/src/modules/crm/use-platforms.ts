import type { Platform } from '@shared/domain/freelance'
import { useApi } from '@/lib/query'

/** Freelance platforms (Upwork…) for selects, chips and the colour dot of a record. */
export function usePlatforms(): Platform[] {
  const { data = [] } = useApi('platforms', 'list')
  return data
}
