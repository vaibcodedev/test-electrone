import type { z } from 'zod'

type AnySchema = { def?: { innerType?: AnySchema }; maxLength?: number | null }

/**
 * Max string lengths of a zod object schema, read from the schema itself (zod 4 `.maxLength`).
 * Forms pass them to `maxLength` and to `Field count`, so the UI stops exactly where the server
 * validation would reject — one source of truth (docs/design-system.md → Ограничения ввода).
 */
export function limitsOf<S extends z.ZodObject>(schema: S): Partial<Record<keyof z.infer<S>, number>> {
  const out: Record<string, number> = {}
  for (const [key, field] of Object.entries(schema.shape)) {
    let t = field as AnySchema
    // default / optional / nullable / catch wrap the real string schema
    while (t.def?.innerType) t = t.def.innerType
    if (typeof t.maxLength === 'number') out[key] = t.maxLength
  }
  return out as Partial<Record<keyof z.infer<S>, number>>
}

/** Loose "is this a link" check for URL fields: scheme or a domain-looking host, no spaces. */
export function isLikelyUrl(value: string): boolean {
  const v = value.trim()
  if (!v) return true
  if (/\s/.test(v)) return false
  if (/^(https?|mailto|ftp):/i.test(v)) return true
  return /^[\w-]+(\.[\w-]+)+(:\d+)?([/?#].*)?$/.test(v) || /^localhost(:\d+)?/.test(v)
}

export const URL_ERROR = 'Не похоже на ссылку — например, https://example.com'
