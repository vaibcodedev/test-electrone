import { useCallback } from 'react'
import { useNavigate } from 'react-router'
import { format } from 'date-fns'
import { toast } from 'sonner'
import { ENTITY_META } from '@shared/entity-types'
import type { CardRepeat, CardRepeatOutcome, RepeatFreq } from '@shared/domain/boards'
import { fmtDay, fmtTitle, plural } from '@/lib/format'
import { hasTime } from './use-card-param'

export const REPEAT_LABEL: Record<RepeatFreq | 'none', string> = {
  none: 'Не повторюється',
  daily: 'Щодня',
  weekly: 'Щотижня',
  monthly: 'Щомісяця'
}

/** ISO weekday (1 = понеділок) → short and full names. */
export const WEEKDAY_SHORT = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Нд']
export const WEEKDAY_FULL = [
  'понеділок',
  'вівторок',
  'середа',
  'четвер',
  'п’ятниця',
  'субота',
  'неділя'
]

/** ISO weekday of a timestamp's local day. */
export const isoWeekday = (ts: number): number => ((new Date(ts).getDay() + 6) % 7) + 1

/** «Щодня», «Щотижня: пн, ср», «Щомісяця, 31-го» — the rule in words (tile tooltip, toast). */
export function repeatText(rule: CardRepeat): string {
  switch (rule.freq) {
    case 'daily':
      return REPEAT_LABEL.daily
    case 'weekly':
      return rule.days.length === 7
        ? `${REPEAT_LABEL.weekly}: щодня`
        : `${REPEAT_LABEL.weekly}: ${rule.days.map((d) => WEEKDAY_SHORT[d - 1].toLowerCase()).join(', ')}`
    case 'monthly':
      return rule.day ? `${REPEAT_LABEL.monthly}, ${rule.day}-го` : REPEAT_LABEL.monthly
  }
}

const dueText = (ts: number): string =>
  hasTime(ts) ? `${fmtDay(ts)} о ${format(ts, 'HH:mm')}` : fmtDay(ts)

/**
 * Tells about the next card of a repeating series after a move into «Готово»: its date and «Відкрити». The outcome
 * may be missing — an older main returned nothing from a move.
 */
export function useRepeatToast(): (outcome: CardRepeatOutcome | void | null | undefined) => void {
  const navigate = useNavigate()
  return useCallback(
    (outcome) => {
      const spawned = outcome?.spawned ?? []
      const blocked = outcome?.blocked ?? []
      if (spawned.length === 1) {
        const next = spawned[0]
        toast.success(`Наступна картка — ${dueText(next.dueAt)}`, {
          description: fmtTitle(next.title),
          action: { label: 'Відкрити', onClick: () => navigate(ENTITY_META.card.route(next.id)) }
        })
      } else if (spawned.length > 1) {
        toast.success(
          `Створено ${spawned.length} ${plural(spawned.length, ['наступну картку', 'наступні картки', 'наступних карток'])}`,
          {
            description: spawned
              .map((s) => `${fmtTitle(s.title)} — ${dueText(s.dueAt)}`)
              .join('; '),
            action: {
              label: 'Відкрити',
              onClick: () => navigate(ENTITY_META.card.route(spawned[0].id))
            }
          }
        )
      }
      if (blocked.length) {
        toast.warning('Наступну картку не створено', {
          description: `На дошці немає колонки для нових карток — усі позначені «Готово». Додайте колонку й перенесіть «${fmtTitle(blocked[0])}» у «Готово» ще раз.`,
          duration: 10_000
        })
      }
    },
    [navigate]
  )
}
