/**
 * One place for text limits (zod schemas read them; the UI gets them back through limitsOf()).
 * Every record title shares MAX.title, so moving a record between sections (idea → board,
 * proposal → template, a page title from the extension) can never fail on length.
 * Only raise these: lowering would reject edits of records that already hold longer text.
 */
export const MAX = {
  /** Title of any record: idea, board, card, project, note, bookmark, vacancy… */
  title: 500,
  /** Names of people, companies, libraries, credential labels. */
  name: 200,
  /** Short labels: board columns, platforms, job boards. */
  label: 100
} as const

type Wrapped = { def?: { innerType?: Wrapped }; maxLength?: number | null; maxValue?: number | null }

/**
 * The max length (string) or max value (number) of one schema field, read through default/optional
 * wrappers. Internal writes (idea → board, hire → client) clip to it, so a value that is valid in its
 * own record can never fail validation in the record it is copied into.
 */
export function fieldMax(field: unknown): number {
  let t = field as Wrapped
  while (t.def?.innerType) t = t.def.innerType
  const max = t.maxLength ?? t.maxValue
  if (typeof max !== 'number' || !Number.isFinite(max)) throw new Error('fieldMax: the field has no upper bound')
  return max
}
