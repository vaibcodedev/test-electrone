import { useCallback, useState, type ReactElement } from 'react'
import { useNavigate } from 'react-router'
import { ArrowRight, Settings } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Page, PageHeader } from '@/components/common/page'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Item, ItemContent, ItemGroup, ItemTitle } from '@/components/ui/item'
import { FAQ } from './faq-data'
import { FaqList } from './faq'
import { SECTION_IDS, sections } from './sections'
import { useScrollSpy } from './use-scroll-spy'

const FAQ_IDS: ReadonlySet<string> = new Set(FAQ.map((f) => f.id))

/** Onboarding / help: everything in one page with a scroll-spy table of contents and an FAQ. */
export function GuidePage(): ReactElement {
  const navigate = useNavigate()
  const [openFaq, setOpenFaq] = useState<Set<string>>(() => new Set())

  const setFaqOpen = useCallback(
    (id: string, open: boolean): void =>
      setOpenFaq((prev) => {
        const next = new Set(prev)
        if (open) next.add(id)
        else next.delete(id)
        return next
      }),
    []
  )
  const openFaqById = useCallback((id: string) => setFaqOpen(id, true), [setFaqOpen])
  const { scroller, active, jump } = useScrollSpy({ sectionIds: SECTION_IDS, faqIds: FAQ_IDS, openFaq: openFaqById })

  const list = sections(<FaqList openIds={openFaq} setOpen={setFaqOpen} />)

  return (
    <Page>
      <PageHeader
        title="Гайд Vault"
        subtitle="Усе про розділи, гарячі клавіші, де лежать ваші дані, і відповіді на часті питання."
        actions={
          <Button variant="soft" onClick={() => navigate('/settings')}>
            <Settings /> Налаштування
          </Button>
        }
      />
      {/* No bottom padding here: the text scrolls to the panel's edge instead of being cut 32px above it. */}
      <div className="flex min-h-0 flex-1 gap-6 px-8">
        <nav className="w-56 shrink-0 overflow-y-auto pb-8" aria-label="Зміст">
          <ItemGroup className="gap-0.5">
            {list.map((s) => (
              <Item key={s.id} asChild size="xs" variant={active === s.id ? 'active' : 'default'} className="rounded-full px-3">
                <button type="button" className="w-full text-left" onClick={() => jump(s.id)} aria-current={active === s.id || undefined}>
                  <s.icon className={cn('size-4 shrink-0', active === s.id ? 'text-ink-accent' : 'text-muted-foreground')} />
                  <ItemContent className="min-w-0">
                    <ItemTitle className="w-full truncate font-normal">{s.title}</ItemTitle>
                  </ItemContent>
                </button>
              </Item>
            ))}
          </ItemGroup>
        </nav>
        <div ref={scroller} className="min-w-0 flex-1 overflow-y-auto scroll-smooth pr-2">
          <div className="flex flex-col gap-3 pb-[40vh]">
            {list.map((s) => (
              <Card key={s.id} id={s.id} className="scroll-mt-2">
                <CardContent className="flex flex-col gap-4">
                  <div className="flex items-center justify-between gap-4">
                    <h2 className="font-display flex items-center gap-3 text-headline leading-tight">
                      <span className="grid size-10 place-items-center rounded-full bg-card">
                        <s.icon className="size-5" />
                      </span>
                      {s.title}
                    </h2>
                    {s.route && (
                      <Button variant="subtle" size="xs" onClick={() => navigate(s.route!)}>
                        {s.route.startsWith('/settings') ? 'Відкрити налаштування' : 'Відкрити розділ'} <ArrowRight />
                      </Button>
                    )}
                  </div>
                  {s.body}
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </div>
    </Page>
  )
}
