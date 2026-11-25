/** Pure helpers of the rpc layer (no Electron imports — covered by unit tests). */
import { ZodError } from 'zod'
import { describeZodError } from '@shared/zod-locale'
import type { Api } from '@shared/api'
import type { EntityType } from '@shared/entity-types'
import type { EntitySummary } from '@shared/domain/common'

export function formatError(e: unknown): { error: string; code?: string } {
  if (e instanceof ZodError) return { error: describeZodError(e), code: 'VALIDATION' }
  if (e instanceof Error) return { error: e.message, code: (e as { code?: string }).code }
  return { error: String(e) }
}

/**
 * Namespaces whose writes should notify other windows (e.g. quick-add → main).
 * `app.quickAdd` is handled in `changedTypes`: the type it creates is known only from its result.
 */
const NS_TYPES: Partial<Record<keyof Api, EntityType[]>> = {
  ideas: ['idea'],
  boards: ['board', 'card'],
  cards: ['card'],
  claude: ['claude'],
  libraries: ['library'],
  components: ['component'],
  designs: ['design'],
  moodboards: ['moodboard'],
  snippets: ['snippet'],
  clients: ['client'],
  projects: ['project'],
  checklists: ['checklist'],
  fixes: ['fix'],
  bookmarks: ['bookmark'],
  english: ['word'],
  events: ['event'],
  notes: ['note'],
  proposals: ['proposal'],
  templates: ['template'],
  cases: ['case'],
  redflags: ['redflag'],
  platforms: ['proposal'],
  credits: ['proposal'],
  goals: ['proposal'],
  finance: ['project'],
  jobs: ['application', 'company', 'question', 'event'],
  importer: ['checklist', 'question', 'word', 'snippet', 'template', 'redflag', 'idea', 'bookmark', 'library']
}
const READ_METHODS =
  /^(list|get|details|due|feed|queue|stats|palette|overview|running|reveal|state|query|recent|info|status|dashboard|niches|stale|summary|progress|folders|folderCounts|mostCopied|month|income|subscriptions|subscriptionMonth|expenses|withdrawals|boards|daily|followUps|upcoming|pastStages|companies|company|findCompany|counts|count|resumes|questions|question|topics|practiceQueue|practiceExtra|snapshot|changed|runs|logs|repos|issues|commits|pickFolder|scan)$/

/** Entity types a successful `ns.method` call changed (→ `data:changed` to every window), or undefined. */
export function changedTypes(ns: string, method: string, data: unknown): EntityType[] | undefined {
  if (READ_METHODS.test(method)) return undefined
  if (ns === 'app') {
    const type = method === 'quickAdd' ? (data as EntitySummary | undefined)?.type : undefined
    return type ? [type] : undefined
  }
  return NS_TYPES[ns as keyof Api]
}
