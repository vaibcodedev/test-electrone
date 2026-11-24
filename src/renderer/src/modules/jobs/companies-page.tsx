import { useState } from 'react'
import { useNavigate } from 'react-router'
import { Building2, ExternalLink, Plus, Star } from 'lucide-react'
import { companyInputSchema, type Company, type CompanyPatch } from '@shared/domain/jobs'
import { limitsOf } from '@/lib/limits'

const LIMITS = limitsOf(companyInputSchema)
import { useApi, useApiMutation } from '@/lib/query'
import { api } from '@/lib/api'
import { useAutosave } from '@/hooks/use-autosave'
import { cn } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Separator } from '@/components/ui/separator'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { InputGroup, InputGroupAddon, InputGroupButton, InputGroupInput } from '@/components/ui/input-group'
import { Item, ItemActions, ItemContent, ItemDescription, ItemGroup, ItemTitle } from '@/components/ui/item'
import { EmptyState, Field, Page, PageHeader, SearchInput } from '@/components/common/page'
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
import { LinkInput, TextField } from './j1-fields'
import { APP_STATUS_LABEL, CLOSED_APP_STATUSES, salaryLabel } from './j1-labels'
import { AskedQuestions } from './application-questions'

function Stars({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  return (
    <ToggleGroup
      type="single"
      size="sm"
      value={value ? String(value) : ''}
      onValueChange={(v) => onChange(v ? Number(v) : 0)}
      aria-label="Моя оцінка"
      className="gap-0.5"
    >
      {[1, 2, 3, 4, 5].map((n) => (
        <ToggleGroupItem
          key={n}
          value={String(n)}
          aria-label={`${n} з 5`}
          className="size-8 min-w-8 px-0 on:bg-transparent"
        >
          <Star className={cn('size-4', n <= value ? 'fill-warn text-warn' : 'text-muted-foreground')} />
        </ToggleGroupItem>
      ))}
    </ToggleGroup>
  )
}

function CompanyApplications({ companyId }: { companyId: string }) {
  const navigate = useNavigate()
  const { data: list = [] } = useApi('jobs', 'list', { companyId })
  return (
    <section className="flex flex-col gap-3">
      <SectionLabel>Вакансії в компанії</SectionLabel>
      {list.length === 0 ? (
        <p className="text-caption text-muted-foreground">Відгуків у цю компанію поки не було.</p>
      ) : (
        <ItemGroup className="gap-1.5">
          {list.map((a) => {
            const salary = salaryLabel(a.salaryMin, a.salaryMax, a.currency)
            return (
              <Item key={a.id} asChild size="xs" variant="muted" className="cursor-pointer">
                <button type="button" className="w-full text-left" onClick={() => navigate(`/jobs/applications?open=${a.id}`)}>
                  <ItemContent className="min-w-0">
                    <ItemTitle className="w-full truncate">{a.title}</ItemTitle>
                    {salary && <ItemDescription className="text-meta">{salary}</ItemDescription>}
                  </ItemContent>
                  <ItemActions>
                    <Badge variant={a.status === 'offer' || a.status === 'accepted' ? 'lime' : CLOSED_APP_STATUSES.includes(a.status) ? 'outline' : 'soft'}>
                      {APP_STATUS_LABEL[a.status]}
                    </Badge>
                  </ItemActions>
                </button>
              </Item>
            )
          })}
        </ItemGroup>
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
  const open = (url: string): void => void api.app.openExternal(url)

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
              Відгуки <ExternalLink />
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
            <Stars value={c.rating} onChange={(rating) => patch({ rating })} />
          </Field>
        </EntityAside>
      }
    >
      <InlineTitle value={name} onChange={setName} placeholder="Назва компанії" maxLength={LIMITS.name} />
      <div className="mt-5 grid grid-cols-2 gap-4">
        <Field label="Сайт">
          <LinkInput value={c.website} onSave={(website) => patch({ website })} />
        </Field>
        <Field label="Відгуки (DOU, Glassdoor)">
          <LinkInput value={c.reviewsUrl} onSave={(reviewsUrl) => patch({ reviewsUrl })} placeholder="https://jobs.dou.ua/companies/…" />
        </Field>
        <TextField label="Стек" value={c.stack} onSave={(stack) => patch({ stack })} placeholder="React, Node.js, AWS" className="col-span-2" maxLength={LIMITS.stack} />
        <TextField label="Розмір" value={c.size} onSave={(size) => patch({ size })} placeholder="50–200 людей" maxLength={LIMITS.size} />
        <TextField label="Де" value={c.location} onSave={(location) => patch({ location })} placeholder="Київ, віддалено" maxLength={LIMITS.location} />
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
      <MarkdownField label="Нотатки: процес, враження, що питають" value={notes} onChange={setNotes} className="mt-4" minHeight="120px" />

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
  const { data: list = [], isLoading } = useApi('jobs', 'companies', { search: search.trim() || undefined })
  const { data: current } = useApi('jobs', 'company', openId ?? '', { enabled: !!openId })
  const create = useApiMutation('jobs', 'createCompany', {
    onSuccess: (c) => {
      setName('')
      setOpenId(c.id)
    }
  })
  const submit = (): void => {
    if (name.trim()) create.mutate({ name: name.trim() })
  }

  const listPane = (
    <div className="flex min-h-0 flex-1 flex-col gap-2">
      <InputGroup>
        <InputGroupInput
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && submit()}
          placeholder="Нова компанія…"
          maxLength={LIMITS.name}
        />
        <InputGroupAddon align="inline-end">
          <InputGroupButton size="icon-xs" variant="default" className="rounded-full" aria-label="Додати компанію" disabled={!name.trim()} onClick={submit}>
            <Plus />
          </InputGroupButton>
        </InputGroupAddon>
      </InputGroup>
      <div className="flex min-h-0 flex-1 flex-col gap-1.5 overflow-y-auto pb-4">
        {list.map((c) => (
          <ListItem key={c.id} active={c.id === openId} onClick={() => setOpenId(c.id)}>
            <div className="flex items-center gap-2">
              <span className="min-w-0 flex-1 truncate text-body font-medium">{c.name}</span>
              {c.rating > 0 && (
                <span className="flex items-center gap-0.5 text-caption opacity-70">
                  <Star className="size-3" />
                  {c.rating}
                </span>
              )}
            </div>
            <div className="mt-0.5 flex gap-2 text-caption opacity-65">
              <span className="truncate">{c.stack || c.location || 'Без опису'}</span>
              {c.applicationCount > 0 && (
                <span className="ml-auto shrink-0 tabular-nums">
                  {c.activeCount > 0 ? `${c.activeCount} активн.` : `${c.applicationCount} відг.`}
                </span>
              )}
            </div>
          </ListItem>
        ))}
        {!isLoading && list.length === 0 && (
          <EmptyState
            icon={Building2}
            title={search ? 'Нічого не знайдено' : 'Компаній поки немає'}
            hint={search ? undefined : 'Картка компанії збирає відгуки, контакти й усі співбесіди в одному місці.'}
            className="py-8"
          />
        )}
      </div>
    </div>
  )

  return (
    <Page>
      <PageHeader title="Компанії" subtitle="Відгуки, стек, контакти HR та історія відгуків щодо кожної компанії.">
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

