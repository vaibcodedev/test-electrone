import * as React from 'react'
import { cn } from '@/lib/utils'
import { useReadOnly } from '@/components/common/detail-mode-context'
import { useFieldControl, useFieldCount } from '@/components/ui/field-control'

function Input({ className, type, readOnly, onInput, ...props }: React.ComponentProps<'input'>) {
  // In a record's view mode (DetailPane) inputs become read-only text; see components/common/detail-mode.
  const viewMode = useReadOnly()
  const empty = props.value === '' || props.value === undefined || props.value === null
  // Number outside min/max → invalid style right away (the server would reject it anyway).
  const num = type === 'number' && !empty ? Number(props.value) : NaN
  const outOfRange =
    !Number.isNaN(num) &&
    ((props.min !== undefined && num < Number(props.min)) ||
      (props.max !== undefined && num > Number(props.max)))
  const field = useFieldControl(props.id)
  // An uncontrolled field (defaultValue) is counted from what is typed.
  const [typed, setTyped] = React.useState<number | null>(null)
  const length =
    typeof props.value === 'string'
      ? props.value.length
      : (typed ?? String(props.defaultValue ?? '').length)
  useFieldCount(props.id, length, viewMode ? undefined : props.maxLength)
  return (
    <input
      type={type}
      onInput={(e) => {
        if (typeof props.value !== 'string') setTyped(e.currentTarget.value.length)
        onInput?.(e)
      }}
      readOnly={readOnly || viewMode}
      data-view={viewMode || undefined}
      data-empty={viewMode && empty ? true : undefined}
      data-slot="input"
      // Reading: a long value ends with «…», the whole of it on hover.
      title={viewMode && typeof props.value === 'string' && props.value ? props.value : undefined}
      aria-describedby={props['aria-describedby'] ?? field.describedBy}
      aria-invalid={props['aria-invalid'] ?? (outOfRange || field.invalid)}
      className={cn(
        // Visible on any background (card or surface): hairline border + faint tint. docs/design-system.md → Формы.
        'h-9 w-full min-w-0 rounded-xl border border-input bg-foreground/4 hover:border-foreground/40 px-3 py-1 text-body transition-[border-color,box-shadow,background-color] outline-none placeholder:text-muted-foreground file:inline-flex file:h-7 file:border-0 file:bg-transparent file:text-body file:font-medium disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50',
        'focus-visible:border-ring focus-visible:bg-card focus-visible:ring-[3px] focus-visible:ring-ring/25',
        'aria-invalid:border-destructive aria-invalid:ring-destructive/20',
        '[[type=datetime-local]]:pr-2 [[type=date]]:pr-2 dark:scheme-dark',
        // No native number spinners: they look foreign and invite typing nonsense with the mouse wheel.
        '[[type=number]]:[appearance:textfield] [&[type=number]::-webkit-inner-spin-button]:appearance-none [&[type=number]::-webkit-outer-spin-button]:appearance-none',
        className,
        // Reading: still a Tab stop (to select and copy the value), so the focus stays visible as an outline.
        viewMode &&
          'pointer-events-auto h-auto cursor-text text-ellipsis border-transparent bg-transparent px-0 aria-invalid:border-transparent aria-invalid:ring-0 hover:border-transparent py-0.5 focus-visible:bg-transparent focus-visible:border-transparent focus-visible:ring-0 focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-offset-2 focus-visible:outline-ring rounded-md placeholder:text-transparent'
      )}
      {...props}
    />
  )
}

export { Input }
