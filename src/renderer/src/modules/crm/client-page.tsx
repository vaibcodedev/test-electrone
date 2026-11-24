import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import { ArrowLeft, ExternalLink, Mail, Plus, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { CLIENT_STATUSES, CURRENCIES, type BillingType, type ClientPatch } from '@shared/domain/crm'
import { useApi, useApiMutation } from '@/lib/query'
import { api } from '@/lib/api'
import { fmtHours, fmtMoney } from '@/lib/format'
import { useAutosave } from '@/hooks/use-autosave'
import { EmptyState, Field } from '@/components/common/page'
import { EntityAside, InlineTitle } from '@/components/common/master-detail'
import { PinButtons } from '@/components/common/pin-buttons'
import { MarkdownField } from '@/components/common/markdown'
import { Confirm } from '@/components/common/confirm'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { BILLING_INFO, CLIENT_STATUS_LABEL } from './labels'
import { BillingPicker, Choice, Section, StatTile } from './parts'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Separator } from '@/components/ui/separator'
import { SectionLabel } from '@/components/common/master-detail'
import { numberOrZero } from './money'
import { ProjectRow } from './clients-page'
import { ProjectDialog } from './dialogs'
import { CredentialsSection } from './credentials-section'
import { AvoidBadge, ClientPlatformFields, PlatformBadge, PlatformSelect } from './platform-fields'

const CONTACT_FIELDS: {
  key: 'company' | 'email' | 'phone' | 'messenger' | 'website'
  label: string
  placeholder: string
}[] = [
  { key: 'company', label: 'Компания', placeholder: 'Bloom Store' },
  { key: 'email', label: 'Email', placeholder: 'name@company.com' },
  { key: 'phone', label: 'Телефон', placeholder: '+380…' },
  { key: 'messenger', label: 'Мессенджер', placeholder: 'Telegram @username' },
  { key: 'website', label: 'Сайт', placeholder: 'https://' }
]

export function ClientPage() {
  const { id = '' } = useParams()
  const navigate = useNavigate()
  const { data, isLoading } = useApi('clients', 'details', id)
  const update = useApiMutation('clients', 'update')
  const remove = useApiMutation('clients', 'remove', {
    successMessage: 'Клиент в корзине',
    onSuccess: () => navigate('/clients')
  })
  const [projectOpen, setProjectOpen] = useState(false)
  const c = data?.client
  const patch = (p: ClientPatch): void => update.mutate({ id, patch: p })
  const [name, setName] = useAutosave(c?.name ?? '', (v) => v.trim() && patch({ name: v.trim() }))
  const [notes, setNotes] = useAutosave(c?.notes ?? '', (v) => patch({ notes: v }))
  const [howTo, setHowTo] = useAutosave(c?.howToCommunicate ?? '', (v) => patch({ howToCommunicate: v }))

  if (isLoading) return null
  if (!data || !c) {
    return (
      <EmptyState
        title="Клиент не найден"
        hint="Возможно, он в корзине."
        action={<Button onClick={() => navigate('/clients')}>К клиентам</Button>}
      />
    )
  }

  const open = (url: string): void => {
    api.app.openExternal(url).catch((e: Error) => toast.error(e.message))
  }

  return (
    <div className="flex h-full min-h-0">
      <div className="min-w-0 flex-1 overflow-y-auto px-8 pt-6 pb-10" key={c.id}>
        <Link
          to="/clients"
          className="mb-4 flex w-fit items-center gap-1 text-[12.5px] text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-3.5" /> Клиенты
        </Link>
        <div className="flex items-start gap-4">
          <Avatar className="size-14 shrink-0">
            <AvatarFallback className="bg-lime text-[22px] font-semibold text-lime-foreground">
              {c.name.slice(0, 1).toUpperCase()}
            </AvatarFallback>
          </Avatar>
          <div className="min-w-0 flex-1">
            <InlineTitle value={name} onChange={setName} className="text-[36px]" />
            <div className="mt-2 flex flex-wrap gap-2">
              <Choice
                className="w-44"
                value={c.status}
                onChange={(v) => v && patch({ status: v })}
                options={CLIENT_STATUSES.map((s) => ({ value: s, label: CLIENT_STATUS_LABEL[s] }))}
              />
              {c.status === 'avoid' && <AvoidBadge className="h-9 px-3" />}
              <PlatformBadge platformId={c.platformId} />
              {c.platformId && c.paymentVerified === false && (
                <Badge variant="warn">Оплата не верифицирована</Badge>
              )}
              {c.email && (
                <Button variant="soft" size="sm" onClick={() => open(`mailto:${c.email}`)}>
                  <Mail /> Написать
                </Button>
              )}
              {c.website && (
                <Button variant="soft" size="sm" onClick={() => open(c.website)}>
                  <ExternalLink /> Сайт
                </Button>
              )}
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2 pt-2">
            <PinButtons entity={{ type: 'client', id }} />
            <Confirm
              title="Удалить клиента?"
              description="Клиент уйдёт в корзину на 30 дней. Проекты останутся без клиента."
              onConfirm={() => remove.mutate(id)}
            >
              <Button variant="ghost" size="icon-sm" aria-label="В корзину">
                <Trash2 />
              </Button>
            </Confirm>
          </div>
        </div>

        <div className="mt-6 grid grid-cols-4 gap-3">
          <StatTile
            tone="ink"
            label="Проекты"
            value={`${c.activeProjectCount}/${c.projectCount}`}
            hint="активные / всего"
          />
          <StatTile label="Оплачено" value={fmtMoney(c.paidTotal, c.currency)} />
          <StatTile
            label="Ожидается"
            value={fmtMoney(c.outstandingTotal, c.currency)}
            tone={c.outstandingTotal > 0 ? 'lime' : 'surface'}
          />
          {c.defaultBilling === 'hourly' ? (
            <StatTile
              label="Часы"
              value={fmtHours(c.trackedMinutes)}
              hint={`${fmtMoney(c.defaultRate, c.currency)} / ч`}
            />
          ) : (
            <StatTile
              label="Как работаете"
              value={<span className="text-[22px]">{BILLING_INFO[c.defaultBilling].title}</span>}
              hint={
                BILLING_INFO[c.defaultBilling].amountLabel && c.defaultRate > 0
                  ? `${BILLING_INFO[c.defaultBilling].amountLabel}: ${fmtMoney(c.defaultRate, c.currency)}`
                  : `${fmtHours(c.trackedMinutes)} учтено`
              }
            />
          )}
        </div>

        <div className="mt-8 flex flex-col gap-10">
          <Section
            title="Проекты"
            action={
              <Button variant="soft" size="sm" onClick={() => setProjectOpen(true)}>
                <Plus /> Проект
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
              <p className="text-[13px] text-muted-foreground">У клиента пока нет проектов.</p>
            )}
          </Section>
          <Section title="Как общаться">
            <MarkdownField
              value={howTo}
              onChange={setHowTo}
              placeholder="Тон, часовой пояс, когда отвечает, что раздражает, как лучше сдавать работу…"
            />
          </Section>
          <CredentialsSection items={data.credentials} owner={{ clientId: c.id }} />
          <Section title="Заметки">
            <MarkdownField
              value={notes}
              onChange={setNotes}
              placeholder="Реквизиты для счетов, история, договорённости…"
            />
          </Section>
        </div>
      </div>

      <aside
        className="w-[300px] shrink-0 overflow-y-auto border-l border-border px-5 py-6"
        key={`aside-${c.id}`}
      >
        <div className="flex flex-col gap-6">
          <section className="flex flex-col gap-3">
            <SectionLabel>Контакты</SectionLabel>
            {CONTACT_FIELDS.map((f) => (
              <Field key={f.key} label={f.label}>
                <Input
                  defaultValue={c[f.key]}
                  placeholder={f.placeholder}
                  onBlur={(e) =>
                    e.target.value !== c[f.key] && patch({ [f.key]: e.target.value.trim() })
                  }
                />
              </Field>
            ))}
          </section>
          <Separator />
          <section className="flex flex-col gap-3">
            <SectionLabel>Откуда</SectionLabel>
            <PlatformSelect value={c.platformId} onChange={(platformId) => patch({ platformId })} />
            {c.platformId && (
              <ClientPlatformFields
                key={`pf-${c.platformId}`}
                saveOnBlur
                currency={c.currency}
                value={c}
                onChange={(p) => patch(p)}
              />
            )}
          </section>
          <Separator />
          <section className="flex flex-col gap-3">
            <SectionLabel>Как обычно работаете</SectionLabel>
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
                      ? 'Обычный бюджет'
                      : BILLING_INFO[c.defaultBilling].amountLabel!
                  }
                >
                  <Input
                    inputMode="decimal"
                    defaultValue={c.defaultRate || ''}
                    onBlur={(e) => patch({ defaultRate: numberOrZero(e.target.value) })}
                  />
                </Field>
              )}
            </div>
            <p className="text-[11.5px] text-muted-foreground">
              Новые проекты клиента заполнятся этими условиями.
            </p>
          </section>
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
  )
}
