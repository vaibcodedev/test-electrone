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
