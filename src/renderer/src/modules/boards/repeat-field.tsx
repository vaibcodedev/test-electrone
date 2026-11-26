import type { CardRepeat, RepeatFreq } from '@shared/domain/boards'
import { WEEKDAYS } from '@shared/domain/boards'
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { Field } from '@/components/common/page'
import { useReadOnly } from '@/components/common/detail-mode-context'
import { cn } from '@/lib/utils'
import { isoWeekday, REPEAT_LABEL, WEEKDAY_FULL, WEEKDAY_SHORT } from './repeat'

const FREQS: (RepeatFreq | 'none')[] = ['none', 'daily', 'weekly', 'monthly']

/** The rule a new choice in «Повторення» starts with: weekly on the deadline's (or today's) weekday. */
function ruleFor(freq: RepeatFreq, dueAt: number | null): CardRepeat {
  if (freq === 'weekly') return { freq, days: [isoWeekday(dueAt ?? Date.now())] }
  // The day of the month is the deadline's: main fills it in (and keeps «31-го» through лютий).
  return { freq }
}

/**
 * «Повторення» of a card: none / daily / weekly on chosen days (at least one) / monthly. Read-only in view mode like
 * every Select and ToggleGroup of a record (an empty rule hides the field there).
 */
export function RepeatField({
  value,
  dueAt,
  onChange
}: {
  value: CardRepeat | null
  dueAt: number | null
  onChange: (rule: CardRepeat | null) => void
}) {
  const readOnly = useReadOnly()
  // While reading, only what isn't visible from the value: the day of a monthly rule.
  const hint =
    value?.freq === 'monthly'
      ? `${value.day ?? new Date(dueAt ?? Date.now()).getDate()}-го числа; у коротший місяць — в останній день.`
      : value && !readOnly
        ? 'Коли картка потрапить у «Готово», у першій колонці з’явиться наступна з новим дедлайном.'
        : undefined
  return (
    <Field label="Повторення" className="col-span-2" hint={hint}>
      <div className="flex flex-wrap items-center gap-2">
        {/* «Не повторюється» is a placeholder, not a value: view mode hides the empty field (globals.css). */}
        <Select
          value={value?.freq ?? ''}
          onValueChange={(v) => onChange(v === 'none' ? null : ruleFor(v as RepeatFreq, dueAt))}
        >
          {/* As wide as its text while reading: the chosen days follow it, not a gap. */}
          <SelectTrigger className={cn(readOnly ? 'w-auto' : 'w-44')} aria-label="Повторення">
            <SelectValue placeholder={REPEAT_LABEL.none} />
          </SelectTrigger>
          <SelectContent>
            <SelectGroup>
              {FREQS.map((f) => (
                <SelectItem key={f} value={f}>
                  {REPEAT_LABEL[f]}
                </SelectItem>
              ))}
            </SelectGroup>
          </SelectContent>
        </Select>
        {value?.freq === 'weekly' && (
          <ToggleGroup
            type="multiple"
            variant="segment"
            size="xs"
            aria-label="Дні тижня"
            value={value.days.map(String)}
            // At least one day: the last one can't be switched off.
            onValueChange={(days) =>
              days.length &&
              onChange({ freq: 'weekly', days: days.map(Number).sort((a, b) => a - b) })
            }
          >
            {WEEKDAYS.map((d) => (
              <ToggleGroupItem key={d} value={String(d)} aria-label={WEEKDAY_FULL[d - 1]}>
                {WEEKDAY_SHORT[d - 1]}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
        )}
      </div>
    </Field>
  )
}
