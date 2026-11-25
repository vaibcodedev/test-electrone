import type { ReactElement } from 'react'
import { ChevronDown } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { FAQ, type Faq } from './faq-data'

/** One question: shadcn Collapsible with a full-width trigger; open state is controlled for deep links. */
function FaqItem({
  faq,
  open,
  onOpenChange
}: {
  faq: Faq
  open: boolean
  onOpenChange: (open: boolean) => void
}): ReactElement {
  return (
    <Collapsible open={open} onOpenChange={onOpenChange} id={`faq-${faq.id}`} className="scroll-mt-4 rounded-2xl bg-card">
      <CollapsibleTrigger asChild>
        <Button
          variant="ghost"
          className="h-auto w-full justify-between gap-4 rounded-2xl px-4 py-3 text-left text-body font-medium whitespace-normal"
        >
          {faq.q}
          <ChevronDown className={cn('shrink-0 text-muted-foreground transition-transform', open && 'rotate-180')} />
        </Button>
      </CollapsibleTrigger>
      <CollapsibleContent className="overflow-hidden data-[state=closed]:animate-collapsible-up data-[state=open]:animate-collapsible-down">
        <p className="max-w-[70ch] px-4 pb-4 text-body leading-relaxed text-foreground/85">{faq.a}</p>
      </CollapsibleContent>
    </Collapsible>
  )
}

export function FaqList({
  openIds,
  setOpen
}: {
  openIds: Set<string>
  setOpen: (id: string, open: boolean) => void
}): ReactElement {
  return (
    <div className="flex flex-col gap-1.5">
      {FAQ.map((f) => (
        <FaqItem key={f.id} faq={f} open={openIds.has(f.id)} onOpenChange={(o) => setOpen(f.id, o)} />
      ))}
    </div>
  )
}
