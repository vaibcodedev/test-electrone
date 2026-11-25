import {
  Facet,
  StateEffect,
  StateField,
  type EditorState,
  type Extension,
  type Range
} from '@codemirror/state'
import { syntaxTree } from '@codemirror/language'
import {
  Decoration,
  EditorView,
  ViewPlugin,
  WidgetType,
  type DecorationSet,
  type ViewUpdate
} from '@codemirror/view'
import type { ResolvedLink } from '@shared/domain/mentions'
import { ENTITY_META, type EntityType } from '@shared/entity-types'
import { findWikiLinks, refKey } from '@shared/wikilinks'
import { inCode } from './syntax'

/**
 * Record links in the Markdown editor. The text keeps `[Назва](vault:note/<id>)` exactly as stored (export, search
 * and «Згадки» parse it), but the editor shows each link as one chip: the type icon and the record's current
 * title, struck through while the record is in the trash, muted with a broken-link icon once it is gone for good.
 * The caret, the selection and Backspace treat a chip as one character (atomic ranges).
 */

export type ChipState = ResolvedLink['state']

export interface LinkChip {
  from: number
  to: number
  /** `type:id` */
  key: string
  type: EntityType
  title: string
  state: ChipState
}

/** The current titles and states of the linked records, from `mentions.resolve` (useWikiLinkTargets). */
export const setLinkTargets = StateEffect.define<ReadonlyMap<string, ResolvedLink>>()

const NO_TARGETS: ReadonlyMap<string, ResolvedLink> = new Map()

export const linkTargets = StateField.define<ReadonlyMap<string, ResolvedLink>>({
  create: () => NO_TARGETS,
  update(value, tr) {
    for (const e of tr.effects) if (e.is(setLinkTargets)) value = e.value
    return value
  }
})

/**
 * The icon of a chip: an SVG for an entity type, or for `missing`. The field hands in copies of lucide icons it
 * rendered itself (the type icons of the app), so a chip is built synchronously, without a React root of its own.
 */
export const chipIcons = Facet.define<
  (key: EntityType | 'missing') => Node | null,
  (key: EntityType | 'missing') => Node | null
>({
  combine: (values) => values[0] ?? (() => null)
})

/**
 * The chips in `from`…`to`: every record link outside code, with what to show — the current title (the label
 * written in the text until it arrives, and for a record gone for good).
 */
export function linkChips(state: EditorState, from = 0, to = state.doc.length): LinkChip[] {
  const text = state.sliceDoc(from, to)
  if (!text.includes('vault:')) return []
  const targets = state.field(linkTargets, false) ?? NO_TARGETS
  const out: LinkChip[] = []
  for (const m of findWikiLinks(text)) {
    const start = from + m.start
    if (inCode(state, start)) continue
    const key = refKey(m.ref)
    const resolved = targets.get(key)
    const chipState = resolved?.state ?? 'live'
    out.push({
      from: start,
      to: from + m.end,
      key,
      type: m.ref.type,
      title: (chipState !== 'missing' && resolved?.title) || m.label,
      state: chipState
    })
  }
  return out
}

/** Pill in the line of text: the state layer of a neutral chip (§5 «шари стану»), the text's own size. */
const CHIP_CLASS: Record<ChipState, string> = {
  live: 'cm-link-chip rounded-md bg-foreground/6 px-1 py-px font-medium text-foreground box-decoration-clone',
  trashed:
    'cm-link-chip rounded-md bg-foreground/6 px-1 py-px text-muted-foreground line-through box-decoration-clone',
  missing:
    'cm-link-chip rounded-md bg-foreground/6 px-1 py-px text-muted-foreground box-decoration-clone'
}

const CHIP_HINT: Record<ChipState, string> = {
  live: '',
  trashed: 'У кошику',
  missing: 'Запис не знайдено — його видалено назавжди'
}

class ChipWidget extends WidgetType {
  constructor(readonly chip: Omit<LinkChip, 'from' | 'to'>) {
    super()
  }

  eq(other: ChipWidget): boolean {
    const a = this.chip
    const b = other.chip
    return a.key === b.key && a.title === b.title && a.state === b.state
  }

  toDOM(view: EditorView): HTMLElement {
    const { type, title, state } = this.chip
    const el = document.createElement('span')
    el.className = CHIP_CLASS[state]
    el.dataset.wikilink = state
    el.dataset.entity = this.chip.key
    const icon = view.state.facet(chipIcons)(state === 'missing' ? 'missing' : type)
    if (icon) el.append(icon)
    el.append(title)
    if (state !== 'live') {
      const note = document.createElement('span')
      note.className = 'sr-only'
      note.textContent = state === 'trashed' ? ' (у кошику)' : ' (запис не знайдено)'
      el.append(note)
    }
    el.title = CHIP_HINT[state] || `${ENTITY_META[type].label}: ${title}`
    return el
  }

  /** The editor handles clicks on a chip itself: the caret lands before or after it, never inside. */
  ignoreEvent(): boolean {
    return false
  }
}

/** Whole lines around the visible parts of the text (a link never spans lines), merged. */
function visibleLines(view: EditorView): { from: number; to: number }[] {
  const out: { from: number; to: number }[] = []
  for (const r of view.visibleRanges) {
    const from = view.state.doc.lineAt(r.from).from
    const to = view.state.doc.lineAt(r.to).to
    const last = out[out.length - 1]
    if (last && from <= last.to + 1) last.to = Math.max(last.to, to)
    else out.push({ from, to })
  }
  return out
}

function buildChips(view: EditorView): DecorationSet {
  const ranges: Range<Decoration>[] = []
  for (const { from, to } of visibleLines(view)) {
    for (const chip of linkChips(view.state, from, to)) {
      const { from: start, to: end, ...rest } = chip
      ranges.push(Decoration.replace({ widget: new ChipWidget(rest) }).range(start, end))
    }
  }
  return Decoration.set(ranges)
}

const chipPlugin = ViewPlugin.fromClass(
  class {
    chips: DecorationSet
    constructor(view: EditorView) {
      this.chips = buildChips(view)
    }
    update(u: ViewUpdate): void {
      if (
        u.docChanged ||
        u.viewportChanged ||
        u.state.field(linkTargets) !== u.startState.field(linkTargets) ||
        // A longer text is parsed in steps: code found later takes its links back out of chips.
        syntaxTree(u.state) !== syntaxTree(u.startState)
      ) {
        this.chips = buildChips(u.view)
      }
    }
  },
  { decorations: (p) => p.chips }
)

/** Chips for record links, atomic for the caret and deletion. `icons` gives the SVG of a type icon. */
export function linkChipsExtension(icons: (key: EntityType | 'missing') => Node | null): Extension {
  return [
    linkTargets,
    chipIcons.of(icons),
    chipPlugin,
    EditorView.atomicRanges.of((view) => view.plugin(chipPlugin)?.chips ?? Decoration.none)
  ]
}
