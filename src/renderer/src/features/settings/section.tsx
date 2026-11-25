import { useId, type ReactElement, type ReactNode } from 'react'
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle
} from '@/components/ui/card'
import { Item, ItemActions, ItemContent, ItemDescription, ItemTitle } from '@/components/ui/item'
import { Label } from '@/components/ui/label'

/** Settings section: shadcn Card with header and a column of rows. `id` is the /settings#… anchor. */
export function SettingsSection({
  id,
  title,
  hint,
  action,
  children
}: {
  id?: string
  title: string
  hint?: string
  /** Section-wide action in the header's right corner (shadcn CardAction), e.g. «Показати все». */
  action?: ReactNode
  children: ReactNode
}): ReactElement {
  return (
    <Card id={id} className="scroll-mt-4 gap-3">
      <CardHeader>
        <CardTitle className="text-lead text-foreground">{title}</CardTitle>
        {hint && <CardDescription className="text-caption">{hint}</CardDescription>}
        {action && <CardAction>{action}</CardAction>}
      </CardHeader>
      <CardContent className="flex flex-col gap-2">{children}</CardContent>
    </Card>
  )
}

/**
 * One setting: title/description on the left, control on the right (shadcn Item).
 * Pass the control as a function to get the id its label points to: the screen reader then names the
 * switch, and a click on the title toggles it.
 */
export function SettingsRow({
  label,
  hint,
  children
}: {
  label: string
  /** Usually text; a node for a path in mono or a skeleton while the value loads. */
  hint?: ReactNode
  children: ReactNode | ((id: string) => ReactNode)
}): ReactElement {
  const id = useId()
  const labelled = typeof children === 'function'
  return (
    <Item size="sm" className="bg-card">
      <ItemContent className="min-w-0">
        <ItemTitle className="w-full truncate text-body font-normal">
          {labelled ? (
            <Label htmlFor={id} className="block cursor-pointer truncate text-body leading-snug font-normal text-foreground">
              {label}
            </Label>
          ) : (
            label
          )}
        </ItemTitle>
        {hint && <ItemDescription className="text-caption">{hint}</ItemDescription>}
      </ItemContent>
      <ItemActions>{labelled ? children(id) : children}</ItemActions>
    </Item>
  )
}
