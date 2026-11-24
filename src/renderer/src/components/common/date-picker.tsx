import { useState } from 'react'
import { format } from 'date-fns'
import { ru } from 'date-fns/locale'
import { CalendarDays, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { ButtonGroup } from '@/components/ui/button-group'
import { Calendar } from '@/components/ui/calendar'
import { Input } from '@/components/ui/input'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'

/**
 * Date (and optional time) picker — shadcn Calendar in a Popover, time via shadcn Input type="time"
 * (the official shadcn "date and time picker" pattern). Values are epoch ms or null.
 */
export function DatePicker({
  value,
  onChange,
  withTime = false,
  placeholder = 'Выбрать дату',
  clearable = true,
  className,
  size = 'default'
}: {
  value: number | null
  onChange: (value: number | null) => void
  withTime?: boolean
  placeholder?: string
  clearable?: boolean
  className?: string
  size?: 'default' | 'sm'
}) {
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

  const label = date ? format(date, withTime ? 'd MMM yyyy, HH:mm' : 'd MMM yyyy', { locale: ru }) : placeholder

  return (
    <ButtonGroup className={cn('w-full', className)}>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="soft"
            size={size}
            className={cn('flex-1 justify-start font-normal', !date && 'text-muted-foreground')}
          >
            <CalendarDays />
            {label}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto rounded-2xl p-0" align="start">
          <Calendar mode="single" selected={date} onSelect={setDay} defaultMonth={date} locale={ru} weekStartsOn={1} />
          {withTime && (
            <div className="flex items-center gap-2 border-t border-border p-3">
              <span className="text-[12.5px] text-muted-foreground">Время</span>
              <Input
                type="time"
                value={time}
                onChange={(e) => setTime(e.target.value)}
                className="h-8 flex-1 [&::-webkit-calendar-picker-indicator]:hidden"
              />
              <Button size="sm" variant="lime" onClick={() => setOpen(false)}>
                Готово
              </Button>
            </div>
          )}
        </PopoverContent>
      </Popover>
      {clearable && date && (
        <Button variant="soft" size={size === 'sm' ? 'icon-sm' : 'icon'} aria-label="Очистить дату" onClick={() => onChange(null)}>
          <X />
        </Button>
      )}
    </ButtonGroup>
  )
}
