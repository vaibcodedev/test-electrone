/**
 * One place for text limits (zod schemas read them; the UI gets them back through limitsOf()).
 * A field takes the tier of its purpose, not one huge number everywhere (docs/design-system.md → Ліміти полів).
 * Every record title shares MAX.title, so moving a record between sections (idea → board,
 * proposal → template, a page title from the extension) can never fail on length.
 *
 * Lowering a tier is safe for stored data: updates are per-field patches (patchOf), so a record whose text is
 * already longer still opens and saves its other fields; only that text must be shortened before it is saved
 * again (the field says so under itself). Nothing is ever cut in the database.
 */
export const MAX = {
  /** Title of any record: idea, board, card, project, note, bookmark, vacancy… A long headline is ~120. */
  title: 200,
  /** Names of people, companies, libraries, credential labels. */
  name: 200,
  /** Short labels: board columns, platforms, job boards, niches, topics, folders. */
  label: 100,
  /** One line of free text: a stack, interviewers, a login, an install command, a check-in note. */
  line: 500,
  /** A short paragraph: a summary, a hint, «для чого», a payment or time-entry note, an example sentence. */
  short: 2_000,
  /** Notes and descriptions of a record (client, proposal, vacancy, event, board, red flag…): about a page. */
  note: 5_000,
  /** A letter to a client or employer (cover letter, message template): Upwork caps a cover letter at 5 000. */
  letter: 5_000,
  /** A job post copied from a platform: the longest real ones (LinkedIn, Djinni, Upwork) are 8–15 thousand. */
  jobPost: 20_000,
  /** Your own long Markdown text: an idea, a task card, an interview answer, a portfolio case, a fix. */
  article: 20_000,
  /** A record that is the text itself: a note, a snippet's or component's code (~1 500 lines), a Claude prompt. */
  document: 50_000,
  /** A password, token or private key (an RSA-4096 key in PEM is ~3 300 characters). */
  secret: 10_000
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
