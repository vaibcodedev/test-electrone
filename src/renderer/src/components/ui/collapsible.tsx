import { Collapsible as CollapsiblePrimitive } from "radix-ui"
import { cn } from "@/lib/utils"

function Collapsible({
  ...props
}: React.ComponentProps<typeof CollapsiblePrimitive.Root>) {
  return <CollapsiblePrimitive.Root data-slot="collapsible" {...props} />
}

function CollapsibleTrigger({
  ...props
}: React.ComponentProps<typeof CollapsiblePrimitive.CollapsibleTrigger>) {
  return (
    <CollapsiblePrimitive.CollapsibleTrigger
      data-slot="collapsible-trigger"
      {...props}
    />
  )
}

/**
 * Folds by height (tw-animate-css, the --radix-collapsible-content-height Radix measures) on the soft curve,
 * closing a little faster. Clipped so nothing spills out mid-fold: spacing between the trigger and the content
 * belongs inside the content (a gap on the root stayed for the whole fold and jumped at the end). `overflow-clip`
 * with a 6px margin, not `overflow-hidden`: a focus ring of a button at the content's edge (the chat's action
 * card) was cut in half.
 */
function CollapsibleContent({
  className,
  ...props
}: React.ComponentProps<typeof CollapsiblePrimitive.CollapsibleContent>) {
  return (
    <CollapsiblePrimitive.CollapsibleContent
      data-slot="collapsible-content"
      className={cn(
        "overflow-clip [overflow-clip-margin:6px] ease-soft data-[state=closed]:animate-collapsible-up data-[state=closed]:duration-150 data-[state=open]:animate-collapsible-down",
        className
      )}
      {...props}
    />
  )
}

export { Collapsible, CollapsibleTrigger, CollapsibleContent }
