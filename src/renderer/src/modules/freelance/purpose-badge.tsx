import type { ReactElement } from 'react'
import { PALETTE } from '@shared/colors'
import { PURPOSE_LABEL, type TemplatePurpose } from '@shared/domain/freelance'
import { Badge } from '@/components/ui/badge'
import { TagDot } from '@/components/common/tags'
import { cn } from '@/lib/utils'

/** «Для чого» colours: swatches of the shared palette, never lime (the screen's one accent). */
export const PURPOSE_COLOR: Record<TemplatePurpose, string> = {
  freelance: PALETTE[1],
  jobs: PALETTE[2],
  any: PALETTE[7]
}

/**
 * A template's «Для чого» as a label: a palette dot and the name, like a tag (TagChip). On the active ink row the
 * tint follows the ink (DS §5: no status colours on ink), the colour stays in the dot. No known value (a main from
 * before the field, until dev restarts) — no label at all, never an empty pill.
 */
export function PurposeBadge({
  purpose,
  onInk,
  className
}: {
  purpose: TemplatePurpose | undefined
  onInk?: boolean
  className?: string
}): ReactElement | null {
  if (!purpose || !(purpose in PURPOSE_LABEL)) return null
  return (
    <Badge
      variant="soft"
      data-purpose={purpose}
      className={cn('gap-1.5', onInk && 'bg-ink-foreground/12 text-ink-foreground', className)}
    >
      <TagDot color={PURPOSE_COLOR[purpose]} />
      {PURPOSE_LABEL[purpose]}
    </Badge>
  )
}
