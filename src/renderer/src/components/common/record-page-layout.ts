/**
 * A record's own page (checklist, client, project): the body and an aside (contacts, links, files, tags).
 * Wide (container ≥ 56rem) — side by side, each scrolling on its own; narrow (the chat ШІ open next to it, a small
 * window) — the aside goes under the body in one scroll. A fixed 300px aside squeezed the body to ~350px and its
 * header buttons stacked into a column. Like DetailPane's own @2xl rule, measured on the page, not the window.
 */
export const RECORD_PAGE = {
  /** The query container: wraps the row. */
  container: '@container h-full min-h-0',
  row: 'flex h-full min-h-0 flex-col overflow-y-auto @4xl:flex-row @4xl:overflow-visible',
  body: 'min-w-0 shrink-0 px-8 pt-6 pb-10 @4xl:flex-1 @4xl:shrink @4xl:overflow-y-auto',
  aside:
    'w-full shrink-0 border-t border-border px-8 py-6 @4xl:w-75 @4xl:overflow-y-auto @4xl:border-t-0 @4xl:border-l @4xl:px-5'
} as const
