import type { ComponentProps, ReactElement, ReactNode } from 'react'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'

/**
 * Icon-only action in a row or toolbar: `ghost` `icon-xs` button whose `label` is both the
 * aria-label and the tooltip (docs/design-system.md → Кнопки: у иконочной кнопки обязателен
 * `aria-label` и `Tooltip`). Other Button props (`disabled`, `data-*`, handlers) pass through.
 */
export function IconAction({
  label,
  children,
  ...props
}: {
  label: string
  children: ReactNode
} & Omit<ComponentProps<typeof Button>, 'variant' | 'size' | 'aria-label' | 'children'>): ReactElement {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button variant="ghost" size="icon-xs" aria-label={label} {...props}>
          {children}
        </Button>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  )
}
