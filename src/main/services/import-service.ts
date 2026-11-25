import { IMPORT_DEFS, importRunSchema, type ImportKind, type ImportResult } from '@shared/domain/import'
import type { DbContext } from '../db/client'
import { UserError } from '../core/util'

/** Creates records from an already validated payload (the shape of IMPORT_DEFS[kind].schema output). */
export type ImportHandler = (data: unknown) => Promise<ImportResult>

/**
 * Bulk import from JSON. Modules register one handler per kind (Open/Closed — no switch here).
 * The whole payload is validated first with the kind's shared schema, and the records are written inside one
 * savepoint: if a module rejects item 300, items 1–299 are rolled back too — all or nothing.
 */
export class ImportService {
  private readonly handlers = new Map<ImportKind, ImportHandler>()

  constructor(private readonly ctx: DbContext) {}

  register(kind: ImportKind, handler: ImportHandler): void {
    this.handlers.set(kind, handler)
  }

  async run(args: unknown): Promise<ImportResult> {
    const { kind, payload } = importRunSchema.parse(args)
    const handler = this.handlers.get(kind)
    if (!handler) throw new UserError(`Імпорт «${IMPORT_DEFS[kind].label}» поки не підтримується`)
    const data = IMPORT_DEFS[kind].schema.parse(payload)
    // Module creates are synchronous under the hood (better-sqlite3); their own transactions nest as savepoints.
    const db = this.ctx.sqlite
    db.exec('SAVEPOINT vault_import')
    try {
      const result = await handler(data)
      db.exec('RELEASE vault_import')
      return result
    } catch (e) {
      db.exec('ROLLBACK TO vault_import')
      db.exec('RELEASE vault_import')
      throw e
    }
  }
}

/** Handler for array kinds: creates each item through the module's own `create` (same validation as the UI). */
export function createEach<T>(create: (input: T) => Promise<{ id: string }>): ImportHandler {
  return async (data) => {
    const items = data as T[]
    let firstId: string | undefined
    for (const item of items) {
      const created = await create(item)
      firstId ??= created.id
    }
    return { created: items.length, firstId }
  }
}
