import { useId, type ReactElement } from 'react'
import { Settings2, Volume2 } from 'lucide-react'
import { ENGLISH_ACCENTS, type EnglishAccent } from '@shared/domain/english'
import { settingsSchema, type SettingsPatch } from '@shared/domain/system'
import { useApi, useApiMutation } from '@/lib/query'
import { rangesOf } from '@/lib/limits'
import { Field } from '@/components/common/page'
import { NumberInput } from '@/components/common/number-input'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select'
import { ACCENT_LABEL, NO_VOICE_REASON, usePronounce } from './use-pronounce'

const RANGES = rangesOf(settingsSchema)
const SAMPLE = 'Let’s ship the rollout tomorrow.'

/**
 * «Налаштування тренування» — the gear in the page header: the daily goal (Anki's «new / reviews per day»),
 * the voice and autoplay. Every change is saved at once, numbers on blur / Enter (NumberInput keeps a draft).
 */
export function TrainingSettings(): ReactElement {
  const id = useId()
  const { data: settings } = useApi('settings', 'get')
  const save = useApiMutation('settings', 'update', { successMessage: 'Збережено' })
  const set = (patch: SettingsPatch): void => save.mutate(patch)
  const p = usePronounce()

  return (
    <Popover>
      <Tooltip>
        <TooltipTrigger asChild>
          <PopoverTrigger asChild>
            <Button variant="soft" size="icon" aria-label="Налаштування тренування">
              <Settings2 />
            </Button>
          </PopoverTrigger>
        </TooltipTrigger>
        <TooltipContent>Налаштування тренування</TooltipContent>
      </Tooltip>
      <PopoverContent align="end" className="flex w-80 flex-col gap-4">
        <div className="text-heading font-display">Налаштування тренування</div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Нових слів на день" htmlFor={`${id}-new`}>
            <NumberInput
              id={`${id}-new`}
              integer
              {...RANGES.englishNewPerDay}
              value={settings?.englishNewPerDay ?? null}
              onChange={(v) => v !== null && set({ englishNewPerDay: v })}
            />
          </Field>
          <Field label="Повторень на день, не більше" htmlFor={`${id}-reviews`}>
            <NumberInput
              id={`${id}-reviews`}
              integer
              {...RANGES.englishReviewsPerDay}
              value={settings?.englishReviewsPerDay ?? null}
              onChange={(v) => v !== null && set({ englishReviewsPerDay: v })}
            />
          </Field>
        </div>
        <p className="-mt-2 text-caption text-muted-foreground">
          Тренування бере спершу повторення, потім нові слова — скільки лишилося до цілі.
        </p>
        <Field
          label="Вимова"
          htmlFor={`${id}-accent`}
          hint={p.canSpeak ? undefined : NO_VOICE_REASON}
        >
          <div className="flex items-center gap-2">
            <Select
              value={settings?.englishAccent ?? 'en-US'}
              onValueChange={(v) => set({ englishAccent: v as EnglishAccent })}
            >
              <SelectTrigger id={`${id}-accent`} className="flex-1">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  {ENGLISH_ACCENTS.map((a) => (
                    <SelectItem key={a} value={a}>
                      {ACCENT_LABEL[a]}
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
            <Button variant="soft" disabled={!p.canSpeak} onClick={() => p.say(SAMPLE)}>
              <Volume2 /> Прослухати
            </Button>
          </div>
        </Field>
        {p.canSpeak && !p.exact && (
          <p className="-mt-2 text-caption text-muted-foreground">
            Такого голосу в системі немає — звучить інший англійський.
          </p>
        )}
        <div className="flex items-center justify-between gap-3">
          <Label htmlFor={`${id}-auto`} className="text-body font-normal">
            Вимовляти слово, коли воно з’являється
          </Label>
          <Switch
            id={`${id}-auto`}
            checked={!!settings?.englishAutoplay}
            disabled={!p.canSpeak}
            onCheckedChange={(englishAutoplay) => set({ englishAutoplay })}
          />
        </div>
      </PopoverContent>
    </Popover>
  )
}
