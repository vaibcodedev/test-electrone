import type { ReactElement } from 'react'
import { Check } from 'lucide-react'
import type { Platform, Proposal, ProposalPatch } from '@shared/domain/freelance'
import { cn } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'
import { Checkbox } from '@/components/ui/checkbox'
import { Label } from '@/components/ui/label'
import { SegmentBar } from '@/components/common/page'
import { SectionLabel } from '@/components/common/master-detail'

/** «Перед відгуком»: the platform's checklist, ticked per proposal (works while reading too). */
export function PreChecklist({
  platform,
  proposal,
  patch
}: {
  platform: Platform
  proposal: Proposal
  patch: (p: ProposalPatch) => void
}): ReactElement | null {
  if (!platform.preChecklist.length) return null
  const checked = new Set(proposal.checks)
  const done = platform.preChecklist.filter((c) => checked.has(c.id)).length
  const total = platform.preChecklist.length
  const toggle = (id: string, on: boolean): void => {
    const next = new Set(checked)
    if (on) next.add(id)
    else next.delete(id)
    patch({ checks: [...next] })
  }
  return (
    <section className="flex flex-col gap-2.5">
      <SectionLabel
        action={
          done === total && (
            <Badge variant="success">
              <Check /> Усе перевірено
            </Badge>
          )
        }
      >
        Перед відгуком
      </SectionLabel>
      <div className="flex flex-col gap-1.5">
        {/* One segment per item, filled where that item is done — not "first N". */}
        <SegmentBar
          value={done}
          total={total}
          states={platform.preChecklist.map((c) => checked.has(c.id))}
        />
        <p className="text-caption text-muted-foreground tabular-nums">
          Готово {done} з {total}
        </p>
      </div>
      <ul className="flex flex-col gap-1.5">
        {platform.preChecklist.map((c) => {
          const id = `check-${proposal.id}-${c.id}`
          return (
            <li key={c.id} className="flex items-start gap-2.5">
              <Checkbox
                id={id}
                checked={checked.has(c.id)}
                onCheckedChange={(v) => toggle(c.id, !!v)}
                className="mt-0.5"
              />
              <Label
                htmlFor={id}
                // block + wrap-anywhere: a long word with no spaces ran off the card instead of wrapping.
                className={cn(
                  'block min-w-0 text-body leading-snug font-normal text-foreground wrap-anywhere',
                  checked.has(c.id) && 'text-muted-foreground'
                )}
              >
                {c.label}
              </Label>
            </li>
          )
        })}
      </ul>
    </section>
  )
}
