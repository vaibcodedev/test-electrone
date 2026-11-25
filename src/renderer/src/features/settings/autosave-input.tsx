import { useEffect, useRef, useState, type ReactElement } from 'react'
import { Check } from 'lucide-react'
import { useAutosave } from '@/hooks/use-autosave'
import { cn } from '@/lib/utils'
import { Input } from '@/components/ui/input'

/**
 * A text setting that saves while you type (as record fields do) and says so: «Збережено» with a tick for a
 * moment after each save. Saving only on blur, with no sign of it, left people asking whether it was kept.
 */
export function AutosaveInput({
  id,
  value,
  onSave,
  placeholder,
  maxLength,
  className
}: {
  id: string
  value: string
  onSave: (next: string) => void
  placeholder?: string
  maxLength?: number
  className?: string
}): ReactElement {
  const [saved, setSaved] = useState(false)
  const hide = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [draft, setDraft] = useAutosave(value, (next: string) => {
    onSave(next.trim())
    setSaved(true)
    if (hide.current) clearTimeout(hide.current)
    hide.current = setTimeout(() => setSaved(false), 2000)
  })
  useEffect(() => () => void (hide.current && clearTimeout(hide.current)), [])
  return (
    <div className="flex items-center gap-2">
      <span
        role="status"
        className={cn(
          'flex items-center gap-1 text-caption text-muted-foreground transition-opacity',
          saved ? 'opacity-100' : 'opacity-0'
        )}
      >
        <Check aria-hidden className="size-3.5 text-success" />
        {saved ? 'Збережено' : ''}
      </span>
      <Input
        id={id}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
        placeholder={placeholder}
        maxLength={maxLength}
        className={className}
      />
    </div>
  )
}
