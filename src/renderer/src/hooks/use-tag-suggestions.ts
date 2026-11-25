import { useEffect, useRef, useState } from 'react'
import { aiPreset, type AiTagSuggestion } from '@shared/domain/ai'
import type { EntityRef, Tag } from '@shared/domain/common'
import { PALETTE } from '@shared/colors'
import { api } from '@/lib/api'
import { useApi, useApiMutation } from '@/lib/query'

interface Result {
  key: string
  list: AiTagSuggestion[]
  error: string | null
}
const EMPTY: Result = { key: '', list: [], error: null }

export interface TagSuggestionsState {
  /** AI is on and set up, the record is being edited: the button is shown. */
  available: boolean
  pending: boolean
  suggestions: AiTagSuggestion[]
  error: string | null
  ask: () => void
  add: (s: AiTagSuggestion) => void
  dismiss: () => void
  consent: {
    open: boolean
    setOpen: (open: boolean) => void
    provider: string
    privacy: string
    confirm: () => void
  }
}

/**
 * «Запропонувати мітки» of one record: asks main for up to five tags, adds a chosen one (creating a new tag
 * on the way). A cloud provider gets the record text only after the person agreed once; closing the record
 * cancels a request still in flight.
 */
export function useTagSuggestions(
  entity: EntityRef | undefined,
  value: Tag[],
  onChange: (tagIds: string[]) => void,
  editing: boolean
): TagSuggestionsState {
  const { data: status } = useApi('ai', 'status', undefined, { enabled: !!entity && editing })
  const { data: allTags = [] } = useApi('tags', 'list', undefined, { enabled: !!entity && editing })
  // Chips and the error belong to one record: another record in the same panel starts clean.
  const key = entity ? `${entity.type}:${entity.id}` : ''
  const [result, setResult] = useState<Result>(EMPTY)
  const own = result.key === key ? result : EMPTY
  const [asking, setAsking] = useState(false)
  const suggest = useApiMutation('ai', 'suggestTags', { silent: true })
  const createTag = useApiMutation('tags', 'create')
  const pendingRef = useRef(false)
  useEffect(() => {
    pendingRef.current = suggest.isPending
  })
  useEffect(
    () => () => {
      if (pendingRef.current) void api.ai.cancel()
    },
    []
  )

  const run = (consent: boolean): void => {
    if (!entity || suggest.isPending) return
    setResult({ key, list: [], error: null })
    suggest.mutate(
      { ref: entity, consent },
      {
        onSuccess: (list) => setResult({ key, list, error: null }),
        onError: (e) => setResult({ key, list: [], error: e.message })
      }
    )
  }

  const preset = aiPreset(status?.settings.preset ?? 'gemini')
  return {
    available: !!entity && editing && !!status?.ready,
    pending: suggest.isPending,
    suggestions: own.list,
    error: own.error,
    ask: () => (status?.consented ? run(false) : setAsking(true)),
    add: (s) => {
      const ids = value.map((t) => t.id)
      const drop = (): void =>
        setResult((r) => ({ ...r, list: r.list.filter((x) => x.name !== s.name) }))
      if (s.tagId) {
        onChange([...ids, s.tagId])
        drop()
        return
      }
      createTag.mutate(
        { name: s.name, color: PALETTE[allTags.length % PALETTE.length] },
        {
          onSuccess: (tag) => {
            onChange([...ids, tag.id])
            drop()
          }
        }
      )
    },
    dismiss: () => setResult(EMPTY),
    consent: {
      open: asking,
      setOpen: setAsking,
      provider: preset.short,
      privacy: preset.privacy,
      confirm: () => run(true)
    }
  }
}
