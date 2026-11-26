import { useRef, useState, type ReactElement } from 'react'
import { useNavigate } from 'react-router'
import { Building2, Plus, Star } from 'lucide-react'
import {
  COMPANY_SIZE_LABEL,
  COMPANY_SIZES,
  companyInputSchema,
  companySizeOf,
  type Company,
  type CompanyPatch
} from '@shared/domain/jobs'
import { limitsOf } from '@/lib/limits'
import { useApi, useApiMutation, useInfiniteApi } from '@/lib/query'
import { countLabel, plural } from '@/lib/format'
import { cn } from '@/lib/utils'
import { useDebounced } from '@/hooks/use-debounced'
import { presenceProps, usePresenceList } from '@/hooks/use-presence-list'
import { VirtualList } from '@/components/common/virtual-list'
import { useAutosave } from '@/hooks/use-autosave'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Separator } from '@/components/ui/separator'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { InputGroup, InputGroupAddon, InputGroupButton, InputGroupInput } from '@/components/ui/input-group'
import { Item, ItemActions, ItemContent, ItemDescription, ItemGroup, ItemTitle } from '@/components/ui/item'
import { EmptyState, Field, FilterBar, NoResults, Page, PageHeader, SearchInput } from '@/components/common/page'
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
import { BucketField } from '@/components/common/bucket-field'
import { APP_STATUS_LABEL, appStatusVariant, salaryLabel } from './labels'
import { AskedQuestions } from './application-questions'
import { FavoriteMark } from '@/components/common/favorite-mark'

const LIMITS = limitsOf(companyInputSchema)
const appKey = (a: { id: string }): string => a.id

function CompanyApplications({ companyId }: { companyId: string }): ReactElement {
  const navigate = useNavigate()
  // A long history pages from the server, 30 at a time (docs/design-system.md → Длинные колонки и история).
  const list = useInfiniteApi('jobs', 'list', { companyId }, 30)
  // list.items is memoised: «Показати ще» unfolds the next page under the list instead of dropping it in.
  const rows = usePresenceList(list.items, appKey)
  return (
    <section className="flex flex-col gap-3">
      <SectionLabel>Вакансії в компанії</SectionLabel>
      {list.isLoading ? null : list.items.length === 0 ? (
        <p className="text-body leading-relaxed text-muted-foreground">Вакансій у цій компанії поки немає.</p>
      ) : (
        // The 6px between rows is inside each row (pb-1.5): a gap would stay while a row unfolds and then jump.
        <ItemGroup className="-mb-1.5">
          {rows.map((row) => {
            const a = row.item
            const salary = salaryLabel(a.salaryMin, a.salaryMax, a.currency)
            return (
              <div key={row.key} {...presenceProps(row)}>
                <div className="pb-1.5">
                  <Item asChild size="xs" variant="muted" className="cursor-pointer">
                    <button
                      type="button"
                      className="w-full text-left"
                      onClick={() => navigate(`/jobs/applications?open=${a.id}`)}
                    >
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
                </div>
              </div>
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

function CompanyEditor({ company: c, onClose }: { company: Company; onClose: () => void }): ReactElement {
  const update = useApiMutation('jobs', 'updateCompany')
  const remove = useApiMutation('jobs', 'removeCompany', { successMessage: 'Компанію переміщено в кошик', onSuccess: onClose })
  // Paged like «Вакансії в компанії»: a company can collect hundreds of questions.
  const questions = useInfiniteApi('jobs', 'questions', { companyId: c.id }, 30)
  const patch = (p: CompanyPatch): void => update.mutate({ id: c.id, patch: p })
  const [name, setName] = useAutosave(c.name, (v) => v.trim() && patch({ name: v.trim() }))
  const [contacts, setContacts] = useAutosave(c.contacts, (contacts) => patch({ contacts }))
  const [notes, setNotes] = useAutosave(c.notes, (notes) => patch({ notes }))

  return (
    <DetailPane
      entity={{ type: 'company', id: c.id }}
      onClose={onClose}
      onDelete={() => remove.mutate(c.id)}
      // Vacancies and questions go below the empty hint: it belongs right under the name.
      footer={
        <>
          <Separator className="my-6" />
          <CompanyApplications companyId={c.id} />
          <AskedQuestions questions={questions.items} more={questions} companyId={c.id} title="Питання, які тут ставили" />
        </>
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
          <LinkInput value={c.reviewsUrl} onSave={(reviewsUrl) => patch({ reviewsUrl })} placeholder="Сторінка на DOU або Glassdoor" />
        </Field>
        <TextField label="Стек" value={c.stack} onSave={(stack) => patch({ stack })} placeholder="Напр.: React, Node.js, AWS" className="col-span-2" maxLength={LIMITS.stack} />
        <BucketField
          id={`company-size-${c.id}`}
          label="Розмір"
          value={c.size}
          buckets={COMPANY_SIZES}
          labels={COMPANY_SIZE_LABEL}
          bucketOf={companySizeOf}
          placeholder="Скільки людей"
          onChange={(size) => patch({ size })}
        />
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
    </DetailPane>
  )
}

/** Companies: research notes, contacts and the history of applications/interviews per company. */
export function CompaniesPage(): ReactElement {
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
                hint="Картка компанії збирає вакансії, контакти й усі співбесіди в одному місці."
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
                ? `${c.applicationCount} ${plural(c.applicationCount, ['вакансія', 'вакансії', 'вакансій'])}`
                : ''
          const active = c.id === openId
          // Tokens, not opacity: a faded meta fell below 4.5:1 in the light theme.
          const metaTone = active ? 'text-ink-muted' : 'text-muted-foreground'
          return (
            <ListItem active={active} onClick={() => setOpenId(c.id)}>
              <div className="flex min-w-0 items-center gap-2">
                <span className="flex min-w-0 flex-1 items-center gap-1.5">
                  <span className="truncate text-body font-medium">{c.name}</span>
                  <FavoriteMark entity={{ type: 'company', id: c.id }} onInk={active} />
                </span>
                {c.rating > 0 && (
                  <span className={cn('flex shrink-0 items-center gap-0.5 text-caption', metaTone)}>
                    <Star className="size-3" />
                    {c.rating}
                  </span>
                )}
              </div>
              {(meta || apps) && (
                <div className={cn('mt-0.5 flex min-w-0 gap-2 text-caption', metaTone)}>
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
        <FilterBar emptyBase={!search && !debounced && list.showEmpty && !list.items.length} trailing={<SearchInput value={search} onChange={setSearch} placeholder="Назва, стек, нотатки" />} />
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

