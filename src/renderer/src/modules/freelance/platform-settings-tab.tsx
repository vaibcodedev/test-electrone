import type { ReactElement } from 'react'
import { toast } from 'sonner'
import { CURRENCIES } from '@shared/domain/crm'
import { platformInputSchema, type Platform, type PlatformPatch } from '@shared/domain/freelance'
import { useApiMutation } from '@/lib/query'
import { limitsOf, rangesOf } from '@/lib/limits'
import { useAutosave } from '@/hooks/use-autosave'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Switch } from '@/components/ui/switch'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Field } from '@/components/common/page'
import { NumberField } from '@/components/common/number-field'
import { Choice } from '@/components/common/choice'
import { ColorSwatches } from '@/components/common/color-swatches'
import { PLATFORM_COLOR_NAME, PLATFORM_COLORS } from './proposal-labels'
import { ChecklistEditor } from './checklist-editor'

const PLATFORM_L = limitsOf(platformInputSchema)
const PLATFORM_R = rangesOf(platformInputSchema)

/** «Налаштування» tab of a platform page: fields autosave; an empty name is never saved. */
export function PlatformSettingsTab({ platform }: { platform: Platform }): ReactElement {
  const update = useApiMutation('platforms', 'update')
  const patch = (p: PlatformPatch): void => update.mutate({ id: platform.id, patch: p })
  const [name, setName] = useAutosave(platform.name, (n) => n.trim() && patch({ name: n.trim() }))
  const [creditsName, setCreditsName] = useAutosave(platform.creditsName, (c) =>
    patch({ creditsName: c.trim() })
  )
  const [notes, setNotes] = useAutosave(platform.notes, (n) => patch({ notes: n }))
  const noName = !name.trim()

  return (
    <div className="grid max-w-5xl grid-cols-2 gap-3">
      <Card>
        <CardHeader>
          <CardTitle>Основне</CardTitle>
          <CardDescription>Назва, валюта й типова комісія для нових контрактів.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <Field label="Назва" error={noName ? 'Вкажіть назву — порожня не збережеться' : undefined}>
            <Input
              value={name}
              maxLength={PLATFORM_L.name}
              onChange={(e) => setName(e.target.value)}
              aria-invalid={noName || undefined}
            />
          </Field>
          <div className="grid grid-cols-2 items-start gap-4">
            <Field label="Валюта">
              <Choice
                value={platform.currency}
                onChange={(v) => v && patch({ currency: v })}
                options={CURRENCIES.map((c) => ({ value: c, label: c }))}
              />
            </Field>
            <NumberField
              label="Типова комісія"
              value={platform.defaultFeePercent}
              onCommit={(v) => patch({ defaultFeePercent: v ?? 0 })}
              unit="%"
              step={0.5}
              {...PLATFORM_R.defaultFeePercent}
            />
            <Field label="Платні відгуки називаються">
              <Input
                value={creditsName}
                maxLength={PLATFORM_L.creditsName}
                onChange={(e) => setCreditsName(e.target.value)}
                placeholder="Connects; порожньо — безкоштовні"
              />
            </Field>
            {/* Only for paid bids: appears as soon as their name is typed. */}
            {creditsName.trim() && (
              <NumberField
                label="Ціна одного при купівлі"
                value={platform.creditPrice}
                onCommit={(v) => patch({ creditPrice: v ?? 0 })}
                unit={platform.currency}
                step={0.01}
                {...PLATFORM_R.creditPrice}
              />
            )}
          </div>
          <Field label="Колір">
            <ColorSwatches
              colors={PLATFORM_COLORS}
              names={PLATFORM_COLOR_NAME}
              allowNone
              value={platform.color}
              onChange={(color) => patch({ color })}
            />
          </Field>
          <Field label="Нотатки про платформу">
            <Textarea
              value={notes}
              maxLength={PLATFORM_L.notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Правила, ліміти, особливості комісії"
              className="min-h-24"
            />
          </Field>
          <div className="flex items-center justify-between gap-4 rounded-2xl bg-card px-4 py-3">
            <Label
              htmlFor={`archive-${platform.id}`}
              className="flex flex-col items-start gap-1 text-foreground"
            >
              <span className="text-body font-normal">В архіві</span>
              <span className="text-caption font-normal text-muted-foreground">
                Сховати з меню. Відгуки й контракти збережуться.
              </span>
            </Label>
            <Switch
              id={`archive-${platform.id}`}
              checked={platform.archived}
              onCheckedChange={(archived) => {
                // Stay here: the page shows an «в архіві» banner with a way back.
                patch({ archived })
                if (archived)
                  toast.success(`${platform.name} в архіві`, {
                    action: { label: 'Скасувати', onClick: () => patch({ archived: false }) }
                  })
                else toast.success(`${platform.name} знову в меню`)
              }}
            />
          </div>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Чек-лист перед відгуком</CardTitle>
          <CardDescription>
            З’являється в кожному відгуку цієї платформи. Допомагає не витрачати{' '}
            {platform.creditsName || 'час'} на погані вакансії.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ChecklistEditor
            items={platform.preChecklist}
            onChange={(preChecklist) => patch({ preChecklist })}
          />
        </CardContent>
      </Card>
    </div>
  )
}
