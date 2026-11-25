import { useEffect, useRef, type RefObject } from 'react'
import type { EntityRef } from '@shared/domain/common'
import { api } from '@/lib/api'
import { invalidateAll } from '@/lib/query'
import { reportError } from '@/lib/error-reporting'

/** Long enough for the last autosave to land first: the server re-checks, so a late save keeps the record. */
const DISCARD_DELAY_MS = 800

/**
 * Leaving an untouched empty draft (closing the pane, another record, another page) discards it. A remount of
 * the same record in between (StrictMode in dev) keeps it; switching to another record still discards this one.
 * Returns the id of the record while it is on screen (null after leaving), for callbacks that must not act late.
 */
export function useDiscardDraftOnLeave(
  type: EntityRef['type'],
  id: string,
  where: string
): RefObject<string | null> {
  const mounted = useRef<string | null>(null)
  useEffect(() => {
    mounted.current = id
    return () => {
      mounted.current = null
      setTimeout(() => {
        if (mounted.current === id) return
        api.trash
          .discardDraft({ type, id })
          .then((discarded) => discarded && invalidateAll())
          .catch((e) => reportError(e, `${where}:discardDraft`))
      }, DISCARD_DELAY_MS)
    }
  }, [type, id, where])
  return mounted
}
