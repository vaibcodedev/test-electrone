import { IMPORT_DEFS, importRunSchema, type ImportKind, type ImportResult } from '@shared/domain/import'

/** Creates records from an already validated payload (the shape of IMPORT_DEFS[kind].schema output). */
export type ImportHandler = (data: unknown) => Promise<ImportResult>

/**
 * Bulk import from JSON. Modules register one handler per kind (Open/Closed — no switch here).
 * The whole payload is validated first with the kind's shared schema: all-or-nothing on validation.
 */
export class ImportService {
  private readonly handlers = new Map<ImportKind, ImportHandler>()

  register(kind: ImportKind, handler: ImportHandler): void {
    this.handlers.set(kind, handler)
  }

  async run(args: unknown): Promise<ImportResult> {
    const { kind, payload } = importRunSchema.parse(args)
    const handler = this.handlers.get(kind)
    if (!handler) throw new Error(`Імпорт «${IMPORT_DEFS[kind].label}» поки не підтримується`)
    const data = IMPORT_DEFS[kind].schema.parse(payload)
    return handler(data)
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
