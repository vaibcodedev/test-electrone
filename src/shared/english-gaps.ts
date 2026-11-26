/**
 * Fill-the-gap cards of a grammar «Правило». Its examples are sentences, one per line; the part to type goes in
 * square brackets: `Yesterday I [went|go] home.` — after `|` an optional hint shown in the gap, `/` separates
 * accepted answers (`[don't/do not]`). Every bracket of every line is a card of its own; the other brackets of
 * the same line read as plain text.
 */

export interface GapCard {
  before: string
  after: string
  /** Accepted answers; the first one is shown as «the» answer. */
  answers: string[]
  hint: string
  /** The whole sentence with every gap filled: what pronunciation reads after the answer. */
  sentence: string
}

const GAP = /\[([^\]\n]+)\]/g

function parseGap(inner: string): { answers: string[]; hint: string } {
  const [answer, ...hint] = inner.split('|')
  const answers = answer
    .split('/')
    .map((a) => a.trim())
    .filter(Boolean)
  return { answers, hint: hint.join('|').trim() }
}

/** A line with every gap filled with its first answer. */
export function fillGaps(line: string): string {
  return line.replace(GAP, (_, inner: string) => parseGap(inner).answers[0] ?? '')
}

export function hasGaps(examples: string): boolean {
  return gapCards(examples).length > 0
}

export function gapCards(examples: string): GapCard[] {
  const cards: GapCard[] = []
  for (const raw of examples.split('\n')) {
    const line = raw.trim()
    if (!line) continue
    for (const m of line.matchAll(GAP)) {
      const { answers, hint } = parseGap(m[1])
      if (!answers.length) continue
      cards.push({
        before: fillGaps(line.slice(0, m.index)),
        after: fillGaps(line.slice(m.index + m[0].length)),
        answers,
        hint,
        sentence: fillGaps(line)
      })
    }
  }
  return cards
}

/**
 * The card of one showing. `turn` is the entry's answer count (`repetitions + lapses`): it moves on with every
 * graded answer, so the sentences take turns. (`dueAt` did not: after a pass it is a round hour, and with 2–6 or
 * 8–12 sentences only the first one ever showed.)
 */
export function pickGapCard(cards: GapCard[], turn: number): GapCard | undefined {
  if (!cards.length) return undefined
  return cards[Math.abs(Math.trunc(turn)) % cards.length]
}

/** Case, spacing, curly apostrophes and a final full stop don't make an answer wrong. */
function normalize(s: string): string {
  return s
    .toLowerCase()
    .replace(/[’‘ʼ`]/g, "'")
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/[.!?,;]+$/, '')
}

export function isGapAnswer(card: GapCard, typed: string): boolean {
  const t = normalize(typed)
  return !!t && card.answers.some((a) => normalize(a) === t)
}
