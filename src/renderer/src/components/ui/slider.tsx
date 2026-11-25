import * as React from 'react'
import { cn } from '@/lib/utils'
import { useReadOnly } from '@/components/common/detail-mode-context'
import { Slider as SliderPrimitive } from 'radix-ui'

function Slider({
  className,
  defaultValue,
  value,
  min = 0,
  max = 100,
  disabled,
  'aria-label': ariaLabel,
  'aria-labelledby': ariaLabelledBy,
  'aria-valuetext': ariaValueText,
  ...props
}: React.ComponentProps<typeof SliderPrimitive.Root>) {
  // Read-only in a record's view mode, for the keyboard too (see SelectTrigger).
  const viewMode = useReadOnly()
  const _values = React.useMemo(
    () => (Array.isArray(value) ? value : Array.isArray(defaultValue) ? defaultValue : [min, max]),
    [value, defaultValue, min, max]
  )

  return (
    <SliderPrimitive.Root
      data-slot="slider"
      defaultValue={defaultValue}
      value={value}
      min={min}
      max={max}
      disabled={disabled || viewMode}
      className={cn(
        'relative flex w-full touch-none items-center select-none data-[disabled]:opacity-50 data-[orientation=vertical]:h-full data-[orientation=vertical]:min-h-44 data-[orientation=vertical]:w-auto data-[orientation=vertical]:flex-col',
        className
      )}
      {...props}
    >
      <SliderPrimitive.Track
        data-slot="slider-track"
        className={cn(
          'relative grow overflow-hidden rounded-full bg-foreground/15 data-[orientation=horizontal]:h-1.5 data-[orientation=horizontal]:w-full data-[orientation=vertical]:h-full data-[orientation=vertical]:w-1.5'
        )}
      >
        <SliderPrimitive.Range
          data-slot="slider-range"
          className={cn(
            'absolute bg-primary data-[orientation=horizontal]:h-full data-[orientation=vertical]:w-full'
          )}
        />
      </SliderPrimitive.Track>
      {Array.from({ length: _values.length }, (_, index) => (
        <SliderPrimitive.Thumb
          data-slot="slider-thumb"
          key={index}
          // Radix puts role="slider" on the thumb, so the name goes there, not on the root span.
          aria-label={
            ariaLabel && _values.length === 2
              ? `${ariaLabel} — ${index === 0 ? 'від' : 'до'}`
              : ariaLabel
          }
          aria-labelledby={ariaLabelledBy}
          aria-valuetext={ariaValueText}
          className="block size-4 shrink-0 rounded-full border-2 border-primary bg-card shadow-sm ring-ring/50 transition-[color,box-shadow] hover:ring-4 disabled:pointer-events-none disabled:opacity-50"
        />
      ))}
    </SliderPrimitive.Root>
  )
}

export { Slider }
