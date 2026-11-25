import { useMemo } from 'react'
import type { ResolvedLink } from '@shared/domain/mentions'
import { refKey, wikiRefs } from '@shared/wikilinks'
import { useApi } from '@/lib/query'

export type WikiLinkTargetMap = ReadonlyMap<string, ResolvedLink>

/**
 * The current title and state of every record a Markdown text links to («[[»): one request per text, not per
 * link. No links — no request.
 */
export function useWikiLinkTargets(source: string): WikiLinkTargetMap {
  const refs = useMemo(() => wikiRefs(source).slice(0, 200), [source])
  const { data } = useApi('mentions', 'resolve', refs, { enabled: refs.length > 0 })
  return useMemo(() => new Map((data ?? []).map((r) => [refKey(r), r])), [data])
}
