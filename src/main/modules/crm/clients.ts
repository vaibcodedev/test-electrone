import { eq, isNull, sql } from 'drizzle-orm'
import type { ClientsApi } from '@shared/api'
import { pageSchema } from '@shared/domain/common'
import { clientInputSchema, clientListQuerySchema, clientPatchSchema, type ClientSummary } from '@shared/domain/crm'
import { clients, projects } from '../../db/schema'
import { idArg, splitTags, updateArgs } from '../context'
import type { Credentials } from './credentials'
import type { CrmSummaries } from './summaries'
import type { ClientRepo, ProjectRepo } from './shared'

/** Clients with their projects, money totals and logins. */
export class Clients {
  constructor(
    private readonly repo: ClientRepo,
    private readonly projectRepo: ProjectRepo,
    private readonly summaries: CrmSummaries,
    private readonly credentials: Credentials
  ) {}

  api(): ClientsApi {
    const repo = this.repo
    const one = (id: string): ClientSummary => {
      const c = this.summaries.clients([repo.getOrThrow(id)])[0]
      return c
    }
    return {
      list: async (query) => {
        const q = clientListQuerySchema.extend(pageSchema.shape).parse(query ?? {})
        return this.summaries.clients(
          repo.listWhere(
            [
              repo.matches(q.search, [clients.name, clients.company, clients.email, clients.country]),
              q.platformId === 'direct' ? isNull(clients.platformId) : q.platformId ? eq(clients.platformId, q.platformId) : undefined
            ],
            // Working clients first, «Не працювати» last; the status codes themselves sort in English.
            [
              sql`CASE ${clients.status} WHEN 'active' THEN 0 WHEN 'lead' THEN 1 WHEN 'paused' THEN 2 WHEN 'archived' THEN 3 ELSE 4 END`,
              sql`ulower(${clients.name})`
            ],
            q.limit,
            q.offset
          )
        )
      },
      get: async (id) => {
        const c = repo.get(idArg.parse(id))
        return c ? this.summaries.clients([c])[0] : null
      },
      create: async (input) => {
        const [data, tagIds] = splitTags(clientInputSchema.parse(input))
        return one(repo.insert(data, tagIds).id)
      },
      update: async (args) => {
        const { id, patch } = updateArgs(clientPatchSchema).parse(args)
        const [data, tagIds] = splitTags(patch)
        repo.patch(id, data, tagIds)
        return one(id)
      },
      remove: async (id) => repo.softDelete(idArg.parse(id)),
      details: async (id) => {
        const c = repo.get(idArg.parse(id))
        if (!c) return null
        const projectList = this.summaries.projects(
          this.projectRepo.listWhere([eq(projects.clientId, c.id)])
        )
        return {
          client: this.summaries.clients([c])[0],
          projects: projectList,
          credentials: this.credentials.forOwner({ clientId: c.id })
        }
      }
    }
  }
}
