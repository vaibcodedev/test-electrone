/**
 * «- [ ] …» lines of the weekly plan that can become cards. A line that already links to a card is done with:
 * that link is the only mark, so pressing «Створити картки» again makes no duplicates.
 * Both processes use it: the dialog lists the lines, main creates the cards and marks them.
 */
import { MAX } from './domain/limits'
import { findWikiLinks, replaceWikiLinks, wikiLink } from './wikilinks'

export interface PlanTask {
  /** Index of the line in the plan. */
  line: number
  /** The line's text after the checkbox, as written. */
  text: string
  /** The same text without Markdown: the card's title. */
  title: string
}

const TASK_RE = /^(\s*(?:[-*+]|\d+[.)])[ \t]+\[ \][ \t]+)(.*\S)[ \t]*$/
const FENCE_RE = /^ {0,3}(?:`{3,}|~{3,})/

function plainTitle(text: string): string {
  return replaceWikiLinks(text, (m) => m.label)
    .replace(/!?\[([^\]\n]*)\]\([^)\s]*\)/g, '$1')
    .replace(/\*\*|~~|`/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

export function planTasks(plan: string): PlanTask[] {
  const out: PlanTask[] = []
  let fenced = false
  plan.split('\n').forEach((raw, line) => {
    if (FENCE_RE.test(raw)) fenced = !fenced
    const text = fenced ? undefined : TASK_RE.exec(raw)?.[2]
    if (!text || findWikiLinks(text).some((l) => l.ref.type === 'card')) return
    const title = plainTitle(text).slice(0, MAX.title).trim()
    if (title) out.push({ line, text, title })
  })
  return out
}

/**
 * The plan with each of `created` lines linked to its card. A plain line becomes the link itself; a line with its
 * own Markdown (or one too long for a title) keeps its text and gets the link after it — links can't nest.
 */
export function linkPlanTasks(plan: string, created: { line: number; cardId: string }[]): string {
  const tasks = new Map(planTasks(plan).map((t) => [t.line, t]))
  const ids = new Map(created.map((c) => [c.line, c.cardId]))
  return plan
    .split('\n')
    .map((raw, line) => {
      const task = tasks.get(line)
      const id = ids.get(line)
      if (!task || !id) return raw
      const prefix = TASK_RE.exec(raw)![1]
      const link = wikiLink({ type: 'card', id }, task.title)
      const asIs = task.title === task.text && !/[[\]]/.test(task.text)
      return asIs ? `${prefix}${link}` : `${prefix}${task.text} → ${link}`
    })
    .join('\n')
}

/** How long the plan gets once these lines are linked (card ids are UUIDs): checked before creating anything. */
export function linkedPlanLength(plan: string, lines: number[]): number {
  const sample = '0'.repeat(36)
  return linkPlanTasks(
    plan,
    lines.map((line) => ({ line, cardId: sample }))
  ).length
}
