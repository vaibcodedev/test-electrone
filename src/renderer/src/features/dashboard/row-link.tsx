import type { ComponentProps, ReactElement } from 'react'
import { useNavigate } from 'react-router'
import { cn } from '@/lib/utils'
import { Item } from '@/components/ui/item'

/** Clickable Item row that navigates inside the app. Passes the rest to the button (a record menu around it). */
export function RowLink({
  to,
  className,
  children,
  ...props
}: { to: string } & Omit<ComponentProps<'button'>, 'type' | 'onClick'>): ReactElement {
  const navigate = useNavigate()
  return (
    <Item asChild size="xs" className={cn('cursor-pointer', className)}>
      <button {...props} type="button" className="w-full text-left" onClick={() => navigate(to)}>
        {children}
      </button>
    </Item>
  )
}
