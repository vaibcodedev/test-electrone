import { useState, type ReactElement } from 'react'
import { Pencil } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Input } from '@/components/ui/input'

/**
 * A one-line text edited in place, like InlineTitle but committed once: no border at rest (it reads as the text
 * it is), a tint and a pencil under the pointer, the field focus ring while typing. Enter or leaving the field
 * commits the trimmed value when it changed; Esc puts the last saved one back. For headings that are renamed
 * as a whole — a checklist section, whose rename moves all its items.
 */
export function InlineText({
  value,
  onCommit,
  placeholder,
  maxLength,
  label,
  className
}: {
  value: string
  onCommit: (next: string) => void
  placeholder?: string
  maxLength?: number
  /** Accessible name («Назва розділу …»): the field has no visible label. */
  label: string
  className?: string
}): ReactElement {
  const [draft, setDraft] = useState(value)
  // A new saved value (renamed elsewhere, or the commit came back) replaces what is shown.
  const [saved, setSaved] = useState(value)
  if (value !== saved) {
    setSaved(value)
    setDraft(value)
  }
  return (
    <div className="group/inline relative -mx-2 min-w-0 max-w-md flex-1">
      <Input
        value={draft}
        placeholder={placeholder}
        maxLength={maxLength}
        aria-label={label}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => {
          const next = draft.trim()
          if (next !== value) onCommit(next)
          else setDraft(value)
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') e.currentTarget.blur()
          if (e.key === 'Escape') {
            setDraft(value)
            // After the state update the blur sees the old value and commits nothing.
            requestAnimationFrame(() => (e.target as HTMLInputElement).blur())
          }
        }}
        className={cn(
          'h-auto rounded-xl border-0 bg-transparent px-2 py-0.5 pr-8 shadow-none placeholder:text-muted-foreground/60 hover:bg-foreground/5 focus-visible:bg-foreground/5 focus-visible:inset-ring focus-visible:inset-ring-ring',
          className
        )}
      />
      <Pencil
        aria-hidden
        className="pointer-events-none absolute top-1/2 right-2.5 size-3.5 -translate-y-1/2 text-muted-foreground opacity-0 transition-opacity group-hover/inline:opacity-100 group-focus-within/inline:opacity-0"
      />
    </div>
  )
}
