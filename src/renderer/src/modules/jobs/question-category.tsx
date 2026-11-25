import type { ReactElement } from 'react'
import { groupOf, NON_TECH_CATEGORIES, QUESTION_GROUPS, type QuestionCategory, type QuestionGroup } from '@shared/domain/jobs'
import { FilterChips, Segmented } from '@/components/common/page'
import { QUESTION_CATEGORY_LABEL, QUESTION_GROUP_LABEL } from './labels'

/**
 * Category of a question as the user thinks about it: «Технічні / Нетехнічні» first,
 * then (only for non-technical) what kind — stored as the existing category enum.
 */
export function QuestionCategoryPicker({ value, onChange }: { value: QuestionCategory; onChange: (c: QuestionCategory) => void }): ReactElement {
  const group = groupOf(value)
  return (
    <div className="flex flex-col gap-2">
      <Segmented
        className="w-fit!"
        value={group}
        onChange={(g) => onChange(g === 'technical' ? 'technical' : 'behavioral')}
        options={QUESTION_GROUPS.map((g) => ({ value: g, label: QUESTION_GROUP_LABEL[g] }))}
      />
      {group === 'nontechnical' && (
        // A record value, not a filter: a neutral segment (docs/design-system.md → Переключатели).
        <Segmented
          size="xs"
          className="w-fit data-[variant=segment]:flex-wrap"
          value={value}
          onChange={onChange}
          options={NON_TECH_CATEGORIES.map((c) => ({ value: c, label: QUESTION_CATEGORY_LABEL[c] }))}
        />
      )}
    </div>
  )
}

/** List / trainer filter: Усі · Технічні · Нетехнічні, plus sub-type chips for non-technical. */
export function QuestionCategoryFilter({
  group,
  category,
  onChange,
  counts,
  present,
  tone
}: {
  group: QuestionGroup | undefined
  category: QuestionCategory | undefined
  onChange: (next: { group: QuestionGroup | undefined; category: QuestionCategory | undefined }) => void
  /** Optional counters per stored category: a group or kind with none is hidden unless it is selected. */
  counts?: Partial<Record<QuestionCategory, number>>
  /** Without counts: whether a group has any question at all — an empty group is hidden unless selected. */
  present?: Partial<Record<QuestionGroup, boolean>>
  /** `neutral` on a focus screen whose one accent is elsewhere (the trainer's «Показати відповідь»). */
  tone?: 'accent' | 'neutral'
}): ReactElement {
  const nonTechCount = counts ? NON_TECH_CATEGORIES.reduce((n, c) => n + (counts[c] ?? 0), 0) : undefined
  const groups = [
    { value: 'technical' as const, label: QUESTION_GROUP_LABEL.technical, count: counts?.technical },
    { value: 'nontechnical' as const, label: QUESTION_GROUP_LABEL.nontechnical, count: nonTechCount }
  ].filter((o) => present?.[o.value] !== false || o.value === group)
  return (
    <div className="flex flex-wrap items-center gap-2">
      <FilterChips
        allLabel="Усі"
        tone={tone}
        value={group}
        onChange={(g) => onChange({ group: g, category: undefined })}
        options={groups}
      />
      {group === 'nontechnical' && (
        // Second group of the row: neutral, the same 32px height (docs/design-system.md → Ряд фильтров).
        <FilterChips
          tone="neutral"
          allLabel="Усі нетехнічні"
          value={category}
          onChange={(c) => onChange({ group, category: c })}
          options={NON_TECH_CATEGORIES.map((c) => ({ value: c, label: QUESTION_CATEGORY_LABEL[c], count: counts?.[c] }))}
        />
      )}
    </div>
  )
}
