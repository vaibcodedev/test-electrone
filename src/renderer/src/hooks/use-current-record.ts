import { createContext, useContext } from 'react'
import type { EntityRef } from '@shared/domain/common'

/**
 * The record whose pane or sheet a component sits in (`DetailPane`, the board card sheet): the «[[» menu leaves it
 * out — it was edited a moment ago, so it would always top «Нещодавні». Null outside a record.
 */
export const CurrentRecordContext = createContext<EntityRef | null>(null)

export function useCurrentRecord(): EntityRef | null {
  return useContext(CurrentRecordContext)
}
