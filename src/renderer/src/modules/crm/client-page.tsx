import { useState } from 'react'
import { openUrl } from '@/lib/open-url'
import { MoneyValue } from '@/components/common/money-value'
import { Link, useNavigate, useParams } from 'react-router'
import { ArrowLeft, Copy, ExternalLink, Mail, Plus, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import {
  CLIENT_STATUSES,
  clientInputSchema,
  CURRENCIES,
  type BillingType,
  type ClientPatch
} from '@shared/domain/crm'
import { EMAIL_ERROR, isLikelyEmail } from '@shared/domain/common'
import { useApi, useApiMutation } from '@/lib/query'
import { NumberInput } from '@/components/common/number-input'
import { limitsOf, rangesOf } from '@/lib/limits'
import { fmtHours, fmtMoney } from '@/lib/format'
import { useAutosave } from '@/hooks/use-autosave'
import { EmptyState, Field } from '@/components/common/page'
import { EntityAside, InlineTitle } from '@/components/common/master-detail'
import { PinButtons } from '@/components/common/pin-buttons'
import { MarkdownField } from '@/components/common/markdown'
import { Confirm } from '@/components/common/confirm'
import { Button } from '@/components/ui/button'
import { ButtonGroup } from '@/components/ui/button-group'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { copyText } from '@/components/common/copy-button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { BILLING_INFO, CLIENT_STATUS_LABEL } from './labels'
import { BillingPicker, Choice, Section, StatTile } from './parts'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Separator } from '@/components/ui/separator'
import { ProjectRow } from './clients-page'
import { ProjectDialog } from './dialogs'
import { CredentialsSection } from './credentials-section'
import { AsideGroup, BillingView, ContactsView, SourceView } from './client-aside'
import { EditToggle, RecordMode, useRecordMode } from '@/components/common/detail-mode'
import { UrlField } from './project-page'
import { AvoidBadge, ClientPlatformFields, PlatformBadge, PlatformSelect } from './platform-fields'

const CLIENT_L = limitsOf(clientInputSchema)
const CLIENT_R = rangesOf(clientInputSchema)

/** "https://www.bloom.store/about" → "bloom.store" for tooltips. */
const hostOf = (url: string): string => {
  try {
    return new URL(/^[a-z]+:/i.test(url) ? url : `https://${url}`).hostname.replace(/^www\./, '')
  } catch {
    return url
  }
}

const CONTACT_FIELDS: {
  key: 'company' | 'email' | 'phone' | 'messenger' | 'website'
  label: string
  placeholder: string
}[] = [
  { key: 'company', label: 'Компанія', placeholder: 'Bloom Store' },
  { key: 'email', label: 'Email', placeholder: 'name@company.com' },
  { key: 'phone', label: 'Телефон', placeholder: '+380…' },
  { key: 'messenger', label: 'Месенджер', placeholder: 'Telegram @username' },
  { key: 'website', label: 'Сайт', placeholder: 'https://' }
]

/** Email saved on blur; a value that isn't an email stays in the field with an error and isn't saved. */
function EmailField({ value, placeholder, onSave }: { value: string; placeholder: string; onSave: (v: string) => void }) {
  const [bad, setBad] = useState(false)
  return (
    <Field label="Email" error={bad ? EMAIL_ERROR : undefined}>
      <Input
        type="email"
        defaultValue={value}
        placeholder={placeholder}
        maxLength={CLIENT_L.email}
        aria-invalid={bad || undefined}
        onChange={(e) => bad && setBad(!isLikelyEmail(e.target.value))}
        onBlur={(e) => {
          const v = e.target.value.trim()
          if (!isLikelyEmail(v)) return setBad(true)
          setBad(false)
          if (v !== value) onSave(v)
        }}
      />
    </Field>
  )
}

export function ClientPage() {
  const { id = '' } = useParams()
  const navigate = useNavigate()
  const { data, isLoading } = useApi('clients', 'details', id)
  const update = useApiMutation('clients', 'update')
  const remove = useApiMutation('clients', 'remove', {
    successMessage: 'Клієнта переміщено в кошик',
    onSuccess: () => navigate('/clients')
  })
  const [projectOpen, setProjectOpen] = useState(false)
  const c = data?.client
  const patch = (p: ClientPatch): void => update.mutate({ id, patch: p })
  const [name, setName] = useAutosave(c?.name ?? '', (v) => v.trim() && patch({ name: v.trim() }))
  const [notes, setNotes] = useAutosave(c?.notes ?? '', (v) => patch({ notes: v }))
  const [howTo, setHowTo] = useAutosave(c?.howToCommunicate ?? '', (v) =>
    patch({ howToCommunicate: v })
  )
  // Click opens the client for reading; «Редагувати» switches the whole record to editing.
  const mode = useRecordMode(id, 'client')

  if (isLoading) return null
  if (!data || !c) {
    return (
      <EmptyState
        title="Клієнта не знайдено"
        hint="Можливо, він у кошику."
        action={<Button onClick={() => navigate('/clients')}>До клієнтів</Button>}
      />
    )
  }

  const open = (url: string): void => {
    openUrl(url).catch((e: Error) => toast.error(e.message))
  }

  return (
    <RecordMode mode={mode}>
      <div className="flex h-full min-h-0">
        <div className="min-w-0 flex-1 overflow-y-auto px-8 pt-6 pb-10" key={c.id}>
          <Link
            to="/clients"
            className="mb-4 flex w-fit items-center gap-1 text-caption text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="size-3.5" /> Клієнти
          </Link>
          <div className="flex items-start gap-4">
            <Avatar className="size-14 shrink-0">
              <AvatarFallback className="bg-lime text-stat-sm font-semibold text-lime-foreground">
                {c.name.slice(0, 1).toUpperCase()}
              </AvatarFallback>
            </Avatar>
            <div className="min-w-0 flex-1">
              <InlineTitle
                value={name}
                onChange={setName}
                maxLength={CLIENT_L.name}
                className="text-title"
              />
              <div className="mt-2 flex flex-wrap gap-2">
                <Choice
                  className="w-44"
                  value={c.status}
                  onChange={(v) => v && patch({ status: v })}
                  options={CLIENT_STATUSES.map((s) => ({
                    value: s,
                    label: CLIENT_STATUS_LABEL[s]
                  }))}
                />
                {c.status === 'avoid' && <AvoidBadge className="h-9 px-3" />}
                <PlatformBadge platformId={c.platformId} />
                {c.platformId && c.paymentVerified === false && (
                  <Badge variant="warn">Оплату не верифіковано</Badge>
                )}
                {/* Contact buttons say where they lead: the address is on the button, details in the tooltip. */}
                {c.email && (
                  <ButtonGroup>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button variant="soft" size="sm" onClick={() => open(`mailto:${c.email}`)}>
                          <Mail /> Написати ·{' '}
                          <span className="max-w-[24ch] truncate font-normal">{c.email}</span>
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>Відкриє поштову програму: {c.email}</TooltipContent>
                    </Tooltip>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          variant="soft"
                          size="icon-sm"
                          aria-label="Скопіювати пошту"
                          onClick={() => void copyText(c.email, 'Пошту скопійовано')}
                        >
                          <Copy />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>Скопіювати пошту</TooltipContent>
                    </Tooltip>
                  </ButtonGroup>
                )}
                {c.website && (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button variant="soft" size="sm" onClick={() => open(c.website)}>
                        <ExternalLink /> Сайт
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>Відкрити {hostOf(c.website)}</TooltipContent>
                  </Tooltip>
                )}
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-2 pt-2">
              <EditToggle mode={mode} />
              <PinButtons entity={{ type: 'client', id }} />
              <Confirm
                title="Видалити клієнта?"
                description="Клієнт піде в кошик на 30 днів. Проєкти залишаться без клієнта."
                onConfirm={() => remove.mutate(id)}
              >
                <Button variant="ghost" size="icon-sm" aria-label="У кошик">
                  <Trash2 />
                </Button>
              </Confirm>
            </div>
          </div>

          <div className="stagger mt-6 grid grid-cols-4 gap-3">
            <StatTile
              tone="ink"
              label="Проєкти"
              value={`${c.activeProjectCount}/${c.projectCount}`}
              hint="активні / усього"
            />
            <StatTile label="Оплачено" value={<MoneyValue amount={c.paidTotal} currency={c.currency} />} />
            <StatTile
              label="Очікується"
              value={<MoneyValue amount={c.outstandingTotal} currency={c.currency} />}
              tone={c.outstandingTotal > 0 ? 'lime' : 'surface'}
            />
            {c.defaultBilling === 'hourly' ? (
              <StatTile
                label="Години"
                value={fmtHours(c.trackedMinutes)}
                hint={`${fmtMoney(c.defaultRate, c.currency)} / год`}
              />
            ) : (
              <StatTile
                label="Як працюєте"
                value={<span className="text-stat-sm">{BILLING_INFO[c.defaultBilling].title}</span>}
                hint={
                  BILLING_INFO[c.defaultBilling].amountLabel && c.defaultRate > 0
                    ? `${BILLING_INFO[c.defaultBilling].amountLabel}: ${fmtMoney(c.defaultRate, c.currency)}`
                    : `${fmtHours(c.trackedMinutes)} враховано`
                }
              />
            )}
          </div>

          <div className="mt-8 flex flex-col gap-10">
            <Section
              title="Проєкти"
              action={
                <Button variant="soft" size="sm" onClick={() => setProjectOpen(true)}>
                  <Plus /> Проєкт
                </Button>
              }
            >
              {data.projects.length ? (
                <div className="flex flex-col gap-2">
                  {data.projects.map((p) => (
                    <ProjectRow key={p.id} project={p} showClient={false} />
                  ))}
                </div>
              ) : (
                <p className="text-body text-muted-foreground">У клієнта поки немає проєктів.</p>
              )}
            </Section>
            <MarkdownField
              label="Як спілкуватися"
              value={howTo}
              onChange={setHowTo}
              placeholder="Тон, часовий пояс, коли відповідає, що дратує, як краще здавати роботу…"
              maxLength={CLIENT_L.howToCommunicate}
            />
            <CredentialsSection items={data.credentials} owner={{ clientId: c.id }} />
            <MarkdownField
              label="Нотатки"
              value={notes}
              onChange={setNotes}
              placeholder="Реквізити для рахунків, історія, домовленості…"
              maxLength={CLIENT_L.notes}
            />
          </div>
        </div>

        <aside
          className="w-[300px] shrink-0 overflow-y-auto border-l border-border px-5 py-6"
          key={`aside-${c.id}`}
        >
          <div className="flex flex-col gap-6">
            <AsideGroup title="Контакти">
              {!mode.editing ? (
                <ContactsView c={c} />
              ) : (
                CONTACT_FIELDS.map((f) =>
                  f.key === 'website' ? (
                    <UrlField
                      key={f.key}
                      label={f.label}
                      value={c.website}
                      placeholder={f.placeholder}
                      onSave={(website) => patch({ website })}
                    />
                  ) : f.key === 'email' ? (
                    <EmailField key={f.key} value={c.email} placeholder={f.placeholder} onSave={(email) => patch({ email })} />
                  ) : (
                    <Field key={f.key} label={f.label}>
                      <Input
                        defaultValue={c[f.key]}
                        placeholder={f.placeholder}
                        maxLength={CLIENT_L[f.key]}
                        onBlur={(e) =>
                          e.target.value !== c[f.key] && patch({ [f.key]: e.target.value.trim() })
                        }
                      />
                    </Field>
                  )
                )
              )}
            </AsideGroup>
            <Separator />
            <AsideGroup title="Звідки">
              {!mode.editing ? (
                <SourceView c={c} />
              ) : (
                <>
                  <PlatformSelect
                    value={c.platformId}
                    onChange={(platformId) => patch({ platformId })}
                  />
                  {c.platformId && (
                    <ClientPlatformFields
                      key={`pf-${c.platformId}`}
                      saveOnBlur
                      currency={c.currency}
                      value={c}
                      onChange={(p) => patch(p)}
                    />
                  )}
                </>
              )}
            </AsideGroup>
            <Separator />
            <AsideGroup title="Як зазвичай працюєте">
              {!mode.editing ? (
                <BillingView c={c} />
              ) : (
                <>
                  <BillingPicker
                    compact
                    value={c.defaultBilling}
                    onChange={(defaultBilling: BillingType) => patch({ defaultBilling })}
                  />
                  <div className="grid grid-cols-2 gap-2">
                    <Field label="Валюта">
                      <Choice
                        value={c.currency}
                        onChange={(v) => v && patch({ currency: v })}
                        options={CURRENCIES.map((x) => ({ value: x, label: x }))}
                      />
                    </Field>
                    {BILLING_INFO[c.defaultBilling].amountLabel && (
                      <Field
                        key={`rate-${c.defaultBilling}`}
                        label={
                          c.defaultBilling === 'fixed'
                            ? 'Звичайний бюджет'
                            : BILLING_INFO[c.defaultBilling].amountLabel!
                        }
                      >
                        <NumberInput
                          value={c.defaultRate || null}
                          allowEmpty
                          {...CLIENT_R.defaultRate}
                          onChange={(v) => patch({ defaultRate: v ?? 0 })}
                        />
                      </Field>
                    )}
                  </div>
                  <p className="text-meta text-muted-foreground">
                    Нові проєкти клієнта отримають ці умови.
                  </p>
                </>
              )}
            </AsideGroup>
            <Separator />
            <EntityAside
              entity={{ type: 'client', id: c.id }}
              tags={c.tags}
              onTagsChange={(tagIds) => patch({ tagIds })}
              createdAt={c.createdAt}
              updatedAt={c.updatedAt}
            />
          </div>
        </aside>
        <ProjectDialog open={projectOpen} onOpenChange={setProjectOpen} clientId={c.id} />
      </div>
    </RecordMode>
  )
}
