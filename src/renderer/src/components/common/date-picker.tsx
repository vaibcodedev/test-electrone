import { useState } from 'react'
import { format, startOfDay } from 'date-fns'
import { uk } from 'date-fns/locale'
import { CalendarDays, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { fmtDateTime, fmtDayFull } from '@/lib/format'
import { useReadOnly } from './detail-mode'
import { Button } from '@/components/ui/button'
import { ButtonGroup } from '@/components/ui/button-group'
import { Calendar } from '@/components/ui/calendar'
import { Input } from '@/components/ui/input'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'

/**
 * Date (and optional time) picker — shadcn Calendar in a Popover, time via shadcn Input type="time"
 * (the official shadcn "date and time picker" pattern). Values are epoch ms or null.
 */
export function DatePicker({
  id,
  value,
  onChange,
  withTime = false,
  placeholder = 'Вибрати дату',
  clearable = true,
  className,
  size = 'default',
  min,
  invalid
}: {
  /** Ties a Field label (htmlFor) to the trigger. */
  id?: string
  value: number | null
  onChange: (value: number | null) => void
  withTime?: boolean
  placeholder?: string
  clearable?: boolean
  className?: string
  size?: 'default' | 'sm'
  /** Days before this moment can't be picked (e.g. an end date before the start). */
  min?: number | null
  invalid?: boolean
}) {
  const viewMode = useReadOnly()
  const [open, setOpen] = useState(false)
  const date = value ? new Date(value) : undefined
  const time = date ? format(date, 'HH:mm') : '09:00'

  const setDay = (day: Date | undefined): void => {
    if (!day) return onChange(null)
    const [h, m] = (withTime ? time : '00:00').split(':').map(Number)
    const next = new Date(day)
    next.setHours(h, m, 0, 0)
    onChange(next.getTime())
    if (!withTime) setOpen(false)
  }

  const setTime = (t: string): void => {
    const base = date ? new Date(date) : new Date()
    const [h, m] = t.split(':').map(Number)
    if (Number.isNaN(h)) return
    base.setHours(h, m || 0, 0, 0)
    onChange(base.getTime())
  }

  // Full month, year only when it isn't this one: «24 листопада о 18:00», not «24 листоп. 2026, 18:00».
  const label = value ? (withTime ? fmtDateTime(value) : fmtDayFull(value)) : placeholder
  // Record view mode: just the date as text (nothing to open); without a date the field hides itself.
  if (viewMode)
    return value ? (
      <span data-view className="text-body">
        {label}
      </span>
    ) : (
      <span data-empty />
    )

  return (
    <ButtonGroup className={cn('w-full', className)}>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            id={id}
            variant="field"
            size={size}
            // The field variant turns the border destructive, like an invalid Input.
            aria-invalid={invalid || undefined}
            className={cn('flex-1', !date && 'text-muted-foreground')}
          >
            <CalendarDays />
            {label}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto rounded-2xl p-0" align="start">
          <Calendar
            mode="single"
            selected={date}
            onSelect={setDay}
            defaultMonth={date ?? (min ? new Date(min) : undefined)}
            disabled={min ? { before: startOfDay(new Date(min)) } : undefined}
            locale={uk}
            weekStartsOn={1}
          />
          {withTime && (
            <div className="flex items-center gap-2 border-t border-border p-3">
              <span className="text-caption text-muted-foreground">Час</span>
              <Input
                type="time"
                value={time}
                onChange={(e) => setTime(e.target.value)}
                className="h-8 flex-1 [&::-webkit-calendar-picker-indicator]:hidden"
              />
              <Button type="button" size="sm" variant="lime" onClick={() => setOpen(false)}>
                Готово
              </Button>
            </div>
          )}
        </PopoverContent>
      </Popover>
      {clearable && date && (
        <Tooltip>
          <TooltipTrigger asChild>
            {/* type=button: inside a FormDialog the ✕ would otherwise submit the form along with clearing the date.
                The same field variant as the trigger, so the group reads as one field. */}
            <Button
              type="button"
              variant="field"
              size={size === 'sm' ? 'icon-sm' : 'icon'}
              aria-label="Очистити дату"
              className="justify-center text-muted-foreground hover:text-foreground"
              onClick={() => onChange(null)}
            >
              <X />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Очистити дату</TooltipContent>
        </Tooltip>
      )}
    </ButtonGroup>
  )
}
