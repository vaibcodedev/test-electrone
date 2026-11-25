import type { ReactElement, ReactNode } from 'react'
import { useNavigate } from 'react-router'
import { cn } from '@/lib/utils'
import { Item } from '@/components/ui/item'

/** Clickable Item row that navigates inside the app. */
export function RowLink({
  to,
  className,
  children
}: {
  to: string
  className?: string
  children: ReactNode
}): ReactElement {
  const navigate = useNavigate()
  return (
    <Item asChild size="xs" className={cn('cursor-pointer', className)}>
      <button type="button" className="w-full text-left" onClick={() => navigate(to)}>
        {children}
      </button>
    </Item>
  )
}
