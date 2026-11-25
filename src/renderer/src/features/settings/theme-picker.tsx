import type { ReactElement } from 'react'
import { Check, Monitor, Moon, Sun } from 'lucide-react'
import type { Theme } from '@shared/domain/system'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { Label } from '@/components/ui/label'
import { cn } from '@/lib/utils'

const THEMES: { value: Theme; label: string; icon: typeof Sun }[] = [
  { value: 'light', label: 'Світла', icon: Sun },
  { value: 'dark', label: 'Темна', icon: Moon },
  { value: 'system', label: 'Як у системі', icon: Monitor }
]

/** Three preview cards (radio group). The radio dot is visually hidden, so the card carries the focus ring. */
export function ThemePicker({ value, onChange }: { value: Theme; onChange: (theme: Theme) => void }): ReactElement {
  return (
    <RadioGroup value={value} onValueChange={(v) => onChange(v as Theme)} aria-label="Тема" className="grid grid-cols-3 gap-3">
      {THEMES.map((t) => {
        const active = value === t.value
        return (
          <Label
            key={t.value}
            htmlFor={`theme-${t.value}`}
            className={cn(
              // Neutral cards with a preview; the chosen one gets a clear ring + check (no inversion).
              // Keyboard focus sits on the hidden radio: outline (not ring) so it doesn't fight the chosen ring.
              'relative flex cursor-pointer flex-col items-stretch gap-2.5 rounded-2xl border bg-card p-2.5 text-body font-normal transition-[border-color,box-shadow] has-focus-visible:outline-2 has-focus-visible:outline-offset-2 has-focus-visible:outline-ring',
              active ? 'border-transparent ring-2 ring-chart-1' : 'border-border hover:border-foreground/40'
            )}
          >
            <ThemePreview theme={t.value} />
            <span className="flex items-center gap-2 px-1">
              <t.icon className="size-4 text-muted-foreground" />
              <span className={cn(active && 'font-semibold')}>{t.label}</span>
              {active && <Check className="ml-auto size-4 text-chart-1" />}
            </span>
            <RadioGroupItem value={t.value} id={`theme-${t.value}`} className="sr-only" />
          </Label>
        )
      })}
    </RadioGroup>
  )
}

/** Fixed palette swatches: the preview must show the OTHER theme too, so it can't use the live CSS vars. */
type Swatch = { frame: string; card: string; line: string; accent: string }
const PREVIEW: Record<'light' | 'dark', Swatch> = {
  light: { frame: '#d8dcd2', card: '#f7f8f4', line: '#14160f1f', accent: '#d4f542' },
  dark: { frame: '#0e0f11', card: '#18191c', line: '#ffffff1f', accent: '#d8f74a' }
}

function PreviewHalf({ p }: { p: Swatch }): ReactElement {
  return (
    <div className="flex h-full flex-1 gap-1 p-1.5" style={{ background: p.frame }}>
      <div className="flex w-1/4 flex-col gap-1">
        <div className="h-3 rounded-[4px]" style={{ background: p.accent }} />
        <div className="flex-1 rounded-[4px]" style={{ background: p.card }} />
      </div>
      <div className="flex flex-1 flex-col gap-1 rounded-[4px] p-1.5" style={{ background: p.card }}>
        <div className="h-1.5 w-3/5 rounded-full" style={{ background: p.line }} />
        <div className="h-1.5 w-2/5 rounded-full" style={{ background: p.line }} />
      </div>
    </div>
  )
}

function ThemePreview({ theme }: { theme: Theme }): ReactElement {
  return (
    <div aria-hidden className="flex h-16 w-full overflow-hidden rounded-xl ring-1 ring-foreground/10">
      {theme === 'light' && <PreviewHalf p={PREVIEW.light} />}
      {theme === 'dark' && <PreviewHalf p={PREVIEW.dark} />}
      {theme === 'system' && (
        <>
          <PreviewHalf p={PREVIEW.light} />
          <PreviewHalf p={PREVIEW.dark} />
        </>
      )}
    </div>
  )
}
