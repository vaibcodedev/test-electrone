import { useRef, useState } from 'react'
import { openUrl } from '@/lib/open-url'
import { useNavigate } from 'react-router'
import { Building2, ExternalLink, Plus, Star } from 'lucide-react'
import { companyInputSchema, type Company, type CompanyPatch } from '@shared/domain/jobs'
import { limitsOf } from '@/lib/limits'
import { useApi, useApiMutation, useInfiniteApi } from '@/lib/query'
import { countLabel, plural } from '@/lib/format'
import { useDebounced } from '@/hooks/use-debounced'
import { VirtualList } from '@/components/common/virtual-list'
import { useAutosave } from '@/hooks/use-autosave'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Separator } from '@/components/ui/separator'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { InputGroup, InputGroupAddon, InputGroupButton, InputGroupInput } from '@/components/ui/input-group'
import { Item, ItemActions, ItemContent, ItemDescription, ItemGroup, ItemTitle } from '@/components/ui/item'
import { EmptyState, Field, NoResults, Page, PageHeader, SearchInput } from '@/components/common/page'
import {
  DetailPane,
  EntityAside,
  InlineTitle,
  ListItem,
  MasterDetail,
  SectionLabel,
  useOpenParam
} from '@/components/common/master-detail'
import { MarkdownField } from '@/components/common/markdown'
import { LinkInput, TextField } from '@/components/common/text-field'
import { StarRating } from '@/components/common/star-rating'
import { APP_STATUS_LABEL, appStatusVariant, salaryLabel } from './labels'
import { AskedQuestions } from './application-questions'

const LIMITS = limitsOf(companyInputSchema)

function CompanyApplications({ companyId }: { companyId: string }) {
  const navigate = useNavigate()
  // A long history pages from the server, 30 at a time (docs/design-system.md → Длинные колонки и история).
  const list = useInfiniteApi('jobs', 'list', { companyId }, 30)
  return (
    <section className="flex flex-col gap-3">
      <SectionLabel>Вакансії в компанії</SectionLabel>
      {list.isLoading ? null : list.items.length === 0 ? (
        <p className="text-body leading-relaxed text-muted-foreground">Відгуків у цю компанію поки не було.</p>
      ) : (
        <ItemGroup className="gap-1.5">
          {list.items.map((a) => {
            const salary = salaryLabel(a.salaryMin, a.salaryMax, a.currency)
            return (
              <Item key={a.id} asChild size="xs" variant="muted" className="cursor-pointer">
                <button type="button" className="w-full text-left" onClick={() => navigate(`/jobs/applications?open=${a.id}`)}>
                  <ItemContent className="min-w-0">
                    <ItemTitle className="w-full truncate">{a.title}</ItemTitle>
                    {salary && <ItemDescription className="text-meta">{salary}</ItemDescription>}
                  </ItemContent>
                  <ItemActions>
                    <Badge variant={appStatusVariant(a.status)}>
                      {APP_STATUS_LABEL[a.status]}
                    </Badge>
                  </ItemActions>
                </button>
              </Item>
            )
          })}
        </ItemGroup>
      )}
      {list.hasMore && (
        <Button variant="soft" size="xs" className="self-start" disabled={list.loadingMore} onClick={list.loadMore}>
          Показати ще
        </Button>
      )}
    </section>
  )
}

function CompanyEditor({ company: c, onClose }: { company: Company; onClose: () => void }) {
  const update = useApiMutation('jobs', 'updateCompany')
  const remove = useApiMutation('jobs', 'removeCompany', { successMessage: 'Компанію переміщено в кошик', onSuccess: onClose })
  const { data: questions = [] } = useApi('jobs', 'questions', { companyId: c.id })
  const patch = (p: CompanyPatch): void => update.mutate({ id: c.id, patch: p })
  const [name, setName] = useAutosave(c.name, (v) => v.trim() && patch({ name: v.trim() }))
  const [contacts, setContacts] = useAutosave(c.contacts, (contacts) => patch({ contacts }))
  const [notes, setNotes] = useAutosave(c.notes, (notes) => patch({ notes }))
  const open = (url: string): void => void openUrl(url)

  return (
    <DetailPane
      entity={{ type: 'company', id: c.id }}
      onClose={onClose}
      onDelete={() => remove.mutate(c.id)}
      headerExtra={
        <div className="flex gap-1.5">
          {/^https?:\/\//i.test(c.website) && (
            <Button variant="soft" size="sm" onClick={() => open(c.website)}>
              Сайт <ExternalLink />
            </Button>
          )}
          {/^https?:\/\//i.test(c.reviewsUrl) && (
            <Button variant="soft" size="sm" onClick={() => open(c.reviewsUrl)}>
              Думки працівників <ExternalLink />
            </Button>
          )}
        </div>
      }
      aside={
        <EntityAside
          entity={{ type: 'company', id: c.id }}
          tags={c.tags}
          onTagsChange={(tagIds) => patch({ tagIds })}
          createdAt={c.createdAt}
          updatedAt={c.updatedAt}
        >
          <Field label="Моє враження">
            <StarRating value={c.rating} onChange={(rating) => patch({ rating })} label="Моє враження" />
          </Field>
        </EntityAside>
      }
    >
      <InlineTitle value={name} onChange={setName} placeholder="Назва компанії" maxLength={LIMITS.name} />
      <div className="mt-5 grid grid-cols-2 items-start gap-4">
        <Field label="Сайт">
          <LinkInput value={c.website} onSave={(website) => patch({ website })} />
        </Field>
        <Field label="Думки працівників">
          <LinkInput value={c.reviewsUrl} onSave={(reviewsUrl) => patch({ reviewsUrl })} placeholder="https://jobs.dou.ua/companies/… або Glassdoor" />
        </Field>
        <TextField label="Стек" value={c.stack} onSave={(stack) => patch({ stack })} placeholder="Напр.: React, Node.js, AWS" className="col-span-2" maxLength={LIMITS.stack} />
        <TextField label="Розмір" value={c.size} onSave={(size) => patch({ size })} placeholder="Напр.: 50–200 людей" maxLength={LIMITS.size} />
        <TextField label="Де" value={c.location} onSave={(location) => patch({ location })} placeholder="Напр.: Київ, віддалено" maxLength={LIMITS.location} />
      </div>
      <Field label="Контакти HR і команди" className="mt-4" count={{ length: contacts.length, max: LIMITS.contacts }}>
        <Textarea
          value={contacts}
          onChange={(e) => setContacts(e.target.value)}
          placeholder="Ім’я рекрутера, Telegram, LinkedIn"
          className="min-h-16"
          maxLength={LIMITS.contacts}
        />
      </Field>
      <MarkdownField
        label="Нотатки"
        value={notes}
        onChange={setNotes}
        placeholder="Процес найму, враження, що питають…"
        className="mt-4"
        minHeight="120px"
        maxLength={LIMITS.notes}
      />

      <Separator className="my-6" />
      <CompanyApplications companyId={c.id} />
      <Separator className="my-6" />
      <AskedQuestions questions={questions} companyId={c.id} title="Питання, які тут ставили" />
    </DetailPane>
  )
}

/** Companies: research notes, contacts and the history of applications/interviews per company. */
export function CompaniesPage() {
  const [search, setSearch] = useState('')
  const [name, setName] = useState('')
  const [openId, setOpenId] = useOpenParam()
  const nameInputRef = useRef<HTMLInputElement>(null)
  const focusNew = (): void => nameInputRef.current?.focus()
  const debounced = useDebounced(search.trim())
  // Paged on the server (100 per page) + virtualized; search runs on the server too.
  const list = useInfiniteApi('jobs', 'companies', { search: debounced || undefined })
  const { data: current } = useApi('jobs', 'company', openId ?? '', { enabled: !!openId })
  // Same name already exists → offer to open it instead of creating a duplicate (server dedupes too).
  const typed = useDebounced(name.trim(), 200)
  const { data: existing } = useApi('jobs', 'findCompany', typed, { enabled: typed.length > 0 })
  const create = useApiMutation('jobs', 'createCompany', {
    onSuccess: (c) => {
      setName('')
      setOpenId(c.id)
    }
  })
  const submit = (): void => {
    if (!name.trim() || create.isPending) return
    if (existing) {
      setName('')
      setOpenId(existing.id)
      return
    }
    create.mutate({ name: name.trim() })
  }

  const listPane = (
    <div className="flex min-h-0 flex-1 flex-col gap-2">
      {/* pr-2 = the list's scrollbar lane: the field lines up with the rows under it. */}
      <div className="flex flex-col gap-1 pr-2">
        <InputGroup>
          <InputGroupInput
            ref={nameInputRef}
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && submit()}
            placeholder="Нова компанія…"
            maxLength={LIMITS.name}
            aria-label="Назва нової компанії"
          />
          <InputGroupAddon align="inline-end">
            {/* ghost: the lime «+ Компанія» in the header is the screen's one accent. */}
            <Tooltip>
              <TooltipTrigger asChild>
                <InputGroupButton
                  size="icon-xs"
                  variant="ghost"
                  className="rounded-full"
                  aria-label="Додати компанію"
                  disabled={!name.trim() || create.isPending}
                  onClick={submit}
                >
                  <Plus />
                </InputGroupButton>
              </TooltipTrigger>
              <TooltipContent>Додати компанію · Enter</TooltipContent>
            </Tooltip>
          </InputGroupAddon>
        </InputGroup>
        {existing && name.trim() && (
          <p className="flex items-center gap-2 px-3 text-caption text-muted-foreground">
            Вже є: <span className="font-medium text-foreground">{existing.name}</span>
            <Button
              variant="link"
              size="xs"
              className="text-caption"
              onClick={() => {
                setName('')
                setOpenId(existing.id)
              }}
            >
              Відкрити
            </Button>
          </p>
        )}
      </div>
      <VirtualList
        className="pb-4"
        items={list.items}
        loading={list.isLoading}
        getKey={(c) => c.id}
        estimateSize={64}
        hasMore={list.hasMore}
        loadingMore={list.loadingMore}
        onLoadMore={list.loadMore}
        empty={
          !list.isLoading && (
            search.trim() ? (
              <NoResults icon={Building2} hint={`За запитом «${search.trim()}» компаній немає.`} onReset={() => setSearch('')} className="py-8" />
            ) : (
              <EmptyState
                icon={Building2}
                title="Компаній поки немає"
                hint="Картка компанії збирає відгуки, контакти й усі співбесіди в одному місці."
                cta={{ label: 'Додати компанію', icon: Plus, onClick: focusNew }}
                className="py-8"
              />
            )
          )
        }
        renderItem={(c) => {
          // Meta only when there is something real to say — no «Без опису» filler.
          const meta = [c.stack, c.location].filter(Boolean).join(' · ')
          const apps =
            c.activeCount > 0
              ? `${c.activeCount} ${plural(c.activeCount, ['активна вакансія', 'активні вакансії', 'активних вакансій'])}`
              : c.applicationCount > 0
                ? `${c.applicationCount} ${plural(c.applicationCount, ['відгук', 'відгуки', 'відгуків'])}`
                : ''
          return (
            <ListItem active={c.id === openId} onClick={() => setOpenId(c.id)}>
              <div className="flex min-w-0 items-center gap-2">
                <span className="min-w-0 flex-1 truncate text-body font-medium">{c.name}</span>
                {c.rating > 0 && (
                  <span className="flex shrink-0 items-center gap-0.5 text-caption opacity-70">
                    <Star className="size-3" />
                    {c.rating}
                  </span>
                )}
              </div>
              {(meta || apps) && (
                <div className="mt-0.5 flex min-w-0 gap-2 text-caption opacity-65">
                  <span className="min-w-0 truncate">{meta}</span>
                  {apps && <span className="ml-auto shrink-0 tabular-nums">{apps}</span>}
                </div>
              )}
            </ListItem>
          )
        }}
      />
    </div>
  )

  return (
    <Page>
      <PageHeader
        title="Компанії"
        subtitle={
          list.items.length
            ? `${countLabel(list.items.length, list.hasMore, ['компанія', 'компанії', 'компаній'])}. Стек, контакти HR, думки працівників та історія ваших відгуків.`
            : 'Стек, контакти HR, думки працівників та історія ваших відгуків у кожну компанію.'
        }
        actions={
          // Lime = the N key: «N» puts the cursor into «Нова компанія…».
          <Button variant="lime" onClick={focusNew}>
            <Plus /> Компанія
          </Button>
        }
      >
        <SearchInput value={search} onChange={setSearch} placeholder="Назва, стек, нотатки" className="w-72" />
      </PageHeader>
      <div className="flex min-h-0 flex-1 px-8 pb-6">
        <MasterDetail
          list={listPane}
          detail={current && current.id === openId ? <CompanyEditor key={current.id} company={current} onClose={() => setOpenId(null)} /> : null}
        />
      </div>
    </Page>
  )
}

