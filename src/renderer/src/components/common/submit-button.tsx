import type { ComponentProps, ReactElement } from 'react'
import { Button } from '@/components/ui/button'
import { DisabledHint } from './disabled-hint'

/**
 * The submit of a create / save form: off while the form says why (`reason` from useFormGate — «Заповніть: Назва»,
 * «Виправте поля з помилками», «Змін немає») with that reason in a tooltip on hover and keyboard focus
 * (DisabledHint), and off without one while the request is `pending`.
 */
export function SubmitButton({
  reason,
  pending,
  disabled,
  ...props
}: Omit<ComponentProps<typeof Button>, 'type'> & {
  reason?: string
  pending?: boolean
}): ReactElement {
  return (
    <DisabledHint reason={reason}>
      <Button type="submit" disabled={!!reason || pending || disabled} {...props} />
    </DisabledHint>
  )
}
