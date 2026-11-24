import { z } from 'zod'
import type { DbContext } from '../db/client'
import type { EntityRegistry } from '../core/registry'
import type { RepositoryDeps } from '../core/soft-repository'
import type { LinkService } from '../services/link-service'
import type { FileStorage } from '../services/file-storage'
import type { AttachmentService } from '../services/attachment-service'
import type { EventBus } from '../core/event-bus'
import type { SecretBox } from '../services/secret-box'

/** Everything a feature module may depend on. Passed explicitly (no globals) → easy to test and swap. */
export interface ModuleContext {
  db: DbContext
  registry: EntityRegistry
  repo: RepositoryDeps
  links: LinkService
  files: FileStorage
  attachments: AttachmentService
  bus: EventBus
  secrets: SecretBox
}

export const idArg = z.string().min(1).max(64)

/** Parses `{ id, patch }` update arguments with the module's patch schema. */
export function updateArgs<T extends z.ZodType>(patch: T) {
  return z.object({ id: idArg, patch })
}

/** Splits tagIds from the rest of a parsed input. */
export function splitTags<T extends { tagIds?: string[] }>(
  input: T
): [Omit<T, 'tagIds'>, string[] | undefined] {
  const { tagIds, ...rest } = input
  return [rest, tagIds]
}
