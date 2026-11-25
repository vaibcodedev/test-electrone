'use client'

import * as React from 'react'
import { cn } from '@/lib/utils'
import { useReadOnly } from '@/components/common/detail-mode-context'
import { CircleIcon } from 'lucide-react'
import { RadioGroup as RadioGroupPrimitive } from 'radix-ui'

function RadioGroup({
  className,
  disabled,
  ...props
}: React.ComponentProps<typeof RadioGroupPrimitive.Root>) {
  // Read-only in a record's view mode, for the keyboard too (see SelectTrigger).
  const viewMode = useReadOnly()
  return (
    <RadioGroupPrimitive.Root
      data-slot="radio-group"
      disabled={disabled || viewMode}
      className={cn('grid gap-3', className)}
      {...props}
    />
  )
}

function RadioGroupItem({
  className,
  ...props
}: React.ComponentProps<typeof RadioGroupPrimitive.Item>) {
  return (
    <RadioGroupPrimitive.Item
      data-slot="radio-group-item"
      className={cn(
        // Border foreground/50 (≥3:1, same as Checkbox); focus — the global :focus-visible outline (globals.css).
        'aspect-square size-4 shrink-0 rounded-full border border-foreground/50 text-primary shadow-xs transition-colors disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-destructive',
        className
      )}
      {...props}
    >
      <RadioGroupPrimitive.Indicator
        data-slot="radio-group-indicator"
        className="relative flex items-center justify-center"
      >
        <CircleIcon className="absolute top-1/2 left-1/2 size-2 -translate-x-1/2 -translate-y-1/2 fill-primary" />
      </RadioGroupPrimitive.Indicator>
    </RadioGroupPrimitive.Item>
  )
}

export { RadioGroup, RadioGroupItem }
