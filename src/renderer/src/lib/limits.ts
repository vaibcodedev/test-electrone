import type { z } from 'zod'

type AnySchema = { def?: { innerType?: AnySchema }; maxLength?: number | null; minValue?: number | null; maxValue?: number | null }

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

/**
 * Number ranges of a zod object schema (zod 4 `.minValue` / `.maxValue`) for `min`/`max` on number inputs:
 * a 0–15% commission field can't silently take 4242.
 */
export function rangesOf<S extends z.ZodObject>(schema: S): Partial<Record<keyof z.infer<S>, { min?: number; max?: number }>> {
  const out: Record<string, { min?: number; max?: number }> = {}
  for (const [key, field] of Object.entries(schema.shape)) {
    let t = field as AnySchema
    while (t.def?.innerType) t = t.def.innerType
    const min = typeof t.minValue === 'number' && Number.isFinite(t.minValue) ? t.minValue : undefined
    const max = typeof t.maxValue === 'number' && Number.isFinite(t.maxValue) ? t.maxValue : undefined
    if (min !== undefined || max !== undefined) out[key] = { min, max }
  }
  return out as Partial<Record<keyof z.infer<S>, { min?: number; max?: number }>>
}

/** What a number field accepts while typing: an optional minus, digits, one decimal separator. */
export const NUMBER_TEXT_RE = /^-?\d*[.,]?\d*$/
/** The same for whole numbers. */
export const INTEGER_TEXT_RE = /^-?\d*$/

/** «1 234,5» → 1234.5; empty or half-typed text («-», «,») → null. */
export function parseNumberText(text: string): number | null {
  const s = text.replace(/\s/g, '').replace(',', '.')
  if (s === '') return null
  const n = Number(s)
  return Number.isNaN(n) ? null : n
}

/** Typed text for a number field, or null when it must be rejected (letters, «1.2.3», a minus where min ≥ 0). */
export function acceptNumberText(text: string, opts: { integer?: boolean; min?: number }): string | null {
  const t = text.replace(/\s/g, '')
  if (!(opts.integer ? INTEGER_TEXT_RE : NUMBER_TEXT_RE).test(t)) return null
  if (t.startsWith('-') && opts.min !== undefined && opts.min >= 0) return null
  // No leading zeros: «024» → «24», «-007» → «-7».
  return t.replace(/^(-?)0+(?=\d)/, '$1')
}

/** Loose "is this a link" check for URL fields: scheme or a domain-looking host, no spaces. */
export function isLikelyUrl(value: string): boolean {
  const v = value.trim()
  if (!v) return true
  if (/\s/.test(v)) return false
  if (/^mailto:[^@\s]+@[^@\s]+\.[^@\s]+$/i.test(v)) return true
  // A real host: a domain with a dot (and a 2+ letter TLD), localhost or an IPv4 — «http://lol» is not a link.
  const host = /^(?:(?:https?|ftp):\/\/)?([^/?#:\s]+)(?::\d+)?(?:[/?#].*)?$/i.exec(v)?.[1]
  if (!host) return false
  // Letters of any script: приклад.укр is a link too.
  return /^([\p{L}\p{N}_-]+\.)+\p{L}{2,}$/u.test(host) || host === 'localhost' || /^\d{1,3}(\.\d{1,3}){3}$/.test(host)
}

export const URL_ERROR = 'Не схоже на посилання — наприклад, https://example.com'
