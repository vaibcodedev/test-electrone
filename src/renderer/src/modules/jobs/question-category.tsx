import { groupOf, NON_TECH_CATEGORIES, QUESTION_GROUPS, type QuestionCategory, type QuestionGroup } from '@shared/domain/jobs'
import { FilterChips, Segmented } from '@/components/common/page'
import { QUESTION_CATEGORY_LABEL, QUESTION_GROUP_LABEL } from './labels'

/**
 * Category of a question as the user thinks about it: «Технічні / Нетехнічні» first,
 * then (only for non-technical) what kind — stored as the existing category enum.
 */
export function QuestionCategoryPicker({ value, onChange }: { value: QuestionCategory; onChange: (c: QuestionCategory) => void }) {
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
        <FilterChips
          size="xs"
          value={value}
          onChange={(c) => c && onChange(c)}
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
  size = 'sm'
}: {
  group: QuestionGroup | undefined
  category: QuestionCategory | undefined
  onChange: (next: { group: QuestionGroup | undefined; category: QuestionCategory | undefined }) => void
  /** Optional counters per stored category. */
  counts?: Partial<Record<QuestionCategory, number>>
  size?: 'sm' | 'xs'
}) {
  const nonTechCount = counts ? NON_TECH_CATEGORIES.reduce((n, c) => n + (counts[c] ?? 0), 0) : undefined
  return (
    <div className="flex flex-wrap items-center gap-2">
      <FilterChips
        size={size}
        allLabel="Усі"
        value={group}
        onChange={(g) => onChange({ group: g, category: undefined })}
        options={[
          { value: 'technical' as const, label: QUESTION_GROUP_LABEL.technical, count: counts?.technical },
          { value: 'nontechnical' as const, label: QUESTION_GROUP_LABEL.nontechnical, count: nonTechCount }
        ]}
      />
      {group === 'nontechnical' && (
        <FilterChips
          size="xs"
          allLabel="Усі нетехнічні"
          value={category}
          onChange={(c) => onChange({ group, category: c })}
          options={NON_TECH_CATEGORIES.map((c) => ({ value: c, label: QUESTION_CATEGORY_LABEL[c], count: counts?.[c] }))}
        />
      )}
    </div>
  )
}
