import type { ComponentProps, ReactElement, ReactNode } from 'react'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'

/**
 * Icon-only action in a row or toolbar: `ghost` `icon-xs` button whose `label` is both the
 * aria-label and the tooltip (docs/design-system.md → Кнопки: у иконочной кнопки обязателен
 * `aria-label` и `Tooltip`). Other Button props (`disabled`, `data-*`, handlers) pass through.
 * `icon-sm` — record headers; `shortcut` is shown in the tooltip only, the spoken name stays the label.
 */
export function IconAction({
  label,
  children,
  size = 'icon-xs',
  shortcut,
  ...props
}: {
  label: string
  children: ReactNode
  size?: 'icon-xs' | 'icon-sm'
  shortcut?: string
} & Omit<ComponentProps<typeof Button>, 'variant' | 'size' | 'aria-label' | 'children'>): ReactElement {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button variant="ghost" size={size} aria-label={label} {...props}>
          {children}
        </Button>
      </TooltipTrigger>
      <TooltipContent>
        {label}
        {shortcut ? ` · ${shortcut}` : ''}
      </TooltipContent>
    </Tooltip>
  )
}
