import type { ReactNode } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import { ArrowLeft, ExternalLink, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import {
  BILLING_TYPES,
  CURRENCIES,
  PROJECT_STATUSES,
  type ProjectPatch,
  type ProjectSummary
} from '@shared/domain/crm'
import { useApi, useApiMutation } from '@/lib/query'
import { api } from '@/lib/api'
import { fmtHours, fmtMoney, fromLocalInput, toLocalInput } from '@/lib/format'
import { useAutosave } from '@/hooks/use-autosave'
import { EmptyState, Field } from '@/components/common/page'
import { EntityAside, InlineTitle } from '@/components/common/master-detail'
import { PinButtons } from '@/components/common/pin-buttons'
import { MarkdownField } from '@/components/common/markdown'
import { Confirm } from '@/components/common/confirm'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { BILLING_LABEL, PROJECT_STATUS_LABEL } from './labels'
import { Choice, Meter, Section } from './parts'
import { numberOrZero } from './money'
import { TimeSection } from './time-section'
import { PaymentsSection } from './payments-section'
import { CredentialsSection } from './credentials-section'

function Money({
  label,
  value,
  tone
}: {
  label: string
  value: ReactNode
  tone?: 'lime' | 'warn'
}) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-[12px] text-muted-foreground">{label}</span>
      <span
        className={
          tone === 'lime'
            ? 'font-display w-fit rounded-xl bg-lime px-2 text-[28px] leading-tight text-lime-foreground tabular-nums'
            : tone === 'warn'
              ? 'font-display text-[28px] leading-tight text-warn tabular-nums'
              : 'font-display text-[28px] leading-tight tabular-nums'
        }
      >
        {value}
      </span>
    </div>
  )
}

const LINK_FIELDS: {
  key: 'repoUrl' | 'stagingUrl' | 'prodUrl' | 'adminUrl'
  label: string
  placeholder: string
}[] = [
  { key: 'prodUrl', label: 'Прод', placeholder: 'https://store.com' },
  { key: 'stagingUrl', label: 'Стейджинг', placeholder: 'https://staging…' },
  { key: 'adminUrl', label: 'Админка', placeholder: 'https://admin.shopify.com/…' },
  { key: 'repoUrl', label: 'Репозиторий', placeholder: 'https://github.com/…' }
]

function UrlField({
  label,
  value,
  placeholder,
  onSave
}: {
  label: string
  value: string
  placeholder: string
  onSave: (v: string) => void
}) {
  return (
    <Field label={label}>
      <div className="flex gap-1">
        <Input
          defaultValue={value}
          placeholder={placeholder}
          onBlur={(e) => e.target.value !== value && onSave(e.target.value.trim())}
        />
        {value && (
          <Button
            variant="soft"
            size="icon"
            title={`Открыть ${value}`}
            onClick={() => api.app.openExternal(value).catch((e: Error) => toast.error(e.message))}
          >
            <ExternalLink />
          </Button>
        )}
      </div>
    </Field>
  )
}

function Settings({
  project,
  patch
}: {
  project: ProjectSummary
  patch: (p: ProjectPatch) => void
}) {
  return (
    <section className="flex flex-col gap-3">
      <h3 className="text-[12px] text-muted-foreground">Условия</h3>
      <Field label="Оплата">
        <Choice
          value={project.billing}
          onChange={(v) => v && patch({ billing: v })}
          options={BILLING_TYPES.map((b) => ({ value: b, label: BILLING_LABEL[b] }))}
        />
      </Field>
      <div className="grid grid-cols-2 gap-2">
        {project.billing === 'fixed' ? (
          <Field label="Стоимость">
            <Input
              inputMode="decimal"
              defaultValue={project.fixedPrice || ''}
              onBlur={(e) => patch({ fixedPrice: numberOrZero(e.target.value) })}
            />
          </Field>
        ) : (
          <Field label="Ставка/час">
            <Input
              inputMode="decimal"
              defaultValue={project.rate || ''}
              onBlur={(e) => patch({ rate: numberOrZero(e.target.value) })}
            />
          </Field>
        )}
        <Field label="Валюта">
          <Choice
            value={project.currency}
            onChange={(v) => v && patch({ currency: v })}
            options={CURRENCIES.map((c) => ({ value: c, label: c }))}
          />
        </Field>
        <Field label="Бюджет, ч">
          <Input
            inputMode="decimal"
            defaultValue={project.budgetHours || ''}
            placeholder="—"
            onBlur={(e) => patch({ budgetHours: numberOrZero(e.target.value) })}
          />
        </Field>
        <Field label="Начало">
          <Input
            type="date"
            defaultValue={toLocalInput(project.startAt, false)}
            onBlur={(e) => patch({ startAt: fromLocalInput(e.target.value) })}
          />
        </Field>
        <Field label="Дедлайн" className="col-span-2">
          <Input
            type="date"
            defaultValue={toLocalInput(project.dueAt, false)}
            onBlur={(e) => patch({ dueAt: fromLocalInput(e.target.value) })}
          />
        </Field>
      </div>
    </section>
  )
}

export function ProjectPage() {
  const { id = '' } = useParams()
  const navigate = useNavigate()
  const { data, isLoading } = useApi('projects', 'details', id)
  const { data: clients = [] } = useApi('clients', 'list')
  const update = useApiMutation('projects', 'update')
  const remove = useApiMutation('projects', 'remove', {
    successMessage: 'Проект в корзине',
    onSuccess: () => navigate('/clients?tab=projects')
  })
  const p = data?.project
  const patch = (patchValue: ProjectPatch): void => update.mutate({ id, patch: patchValue })
  const [title, setTitle] = useAutosave(
    p?.title ?? '',
    (t) => t.trim() && patch({ title: t.trim() })
  )
  const [description, setDescription] = useAutosave(p?.description ?? '', (d) =>
    patch({ description: d })
  )

  if (isLoading) return null
  if (!data || !p) {
    return (
      <EmptyState
        title="Проект не найден"
        hint="Возможно, он в корзине."
        action={<Button onClick={() => navigate('/clients?tab=projects')}>К проектам</Button>}
      />
    )
  }

  return (
    <div className="flex h-full min-h-0">
      <div className="min-w-0 flex-1 overflow-y-auto px-8 pt-6 pb-10" key={p.id}>
        <div className="mb-4 flex items-center gap-3 text-[12.5px] text-muted-foreground">
          <Link
            to="/clients?tab=projects"
            className="flex items-center gap-1 hover:text-foreground"
          >
            <ArrowLeft className="size-3.5" /> Проекты
          </Link>
          {data.client && (
            <>
              <span>/</span>
              <Link to={`/clients/${data.client.id}`} className="hover:text-foreground">
                {data.client.name}
              </Link>
            </>
          )}
        </div>

        <div className="flex items-start gap-4">
          <InlineTitle value={title} onChange={setTitle} className="text-[40px]" />
          <div className="flex shrink-0 items-center gap-2 pt-2">
            <PinButtons entity={{ type: 'project', id }} />
            <Confirm
              title="Удалить проект?"
              description="Проект уйдёт в корзину на 30 дней вместе с часами и оплатами."
              onConfirm={() => remove.mutate(id)}
            >
              <Button variant="ghost" size="icon-sm" title="В корзину">
                <Trash2 />
              </Button>
            </Confirm>
          </div>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-2">
          <Choice
            className="w-40"
            value={p.status}
            onChange={(v) => v && patch({ status: v })}
            options={PROJECT_STATUSES.map((s) => ({ value: s, label: PROJECT_STATUS_LABEL[s] }))}
          />
          <Choice
            className="w-60"
            value={p.clientId}
            none="Без клиента"
            onChange={(v) => patch({ clientId: v })}
            options={clients.map((c) => ({ value: c.id, label: c.name }))}
          />
        </div>

        <div className="mt-6 grid grid-cols-4 gap-6 rounded-3xl bg-surface p-6">
          <Money label="Заработано" value={fmtMoney(p.earnedAmount, p.currency)} />
          <Money label="Оплачено" value={fmtMoney(p.paidAmount, p.currency)} tone="lime" />
          <Money
            label="Ожидается"
            value={fmtMoney(p.outstandingAmount, p.currency)}
            tone={p.outstandingAmount > 0 ? 'warn' : undefined}
          />
          <div className="flex flex-col gap-1">
            <span className="text-[12px] text-muted-foreground">Часы</span>
            <span className="font-display text-[28px] leading-tight tabular-nums">
              {fmtHours(p.trackedMinutes)}
              {p.budgetHours > 0 && (
                <span className="text-[16px] text-muted-foreground"> / {p.budgetHours} ч</span>
              )}
            </span>
            {p.budgetHours > 0 && <Meter value={p.trackedMinutes / 60} max={p.budgetHours} />}
          </div>
        </div>

        <div className="mt-8 flex flex-col gap-10">
          <TimeSection
            projectId={p.id}
            entries={data.timeEntries}
            rate={p.rate}
            currency={p.currency}
            hourly={p.billing === 'hourly'}
          />
          <PaymentsSection projectId={p.id} currency={p.currency} payments={data.payments} />
          <CredentialsSection items={data.credentials} owner={{ projectId: p.id }} />
          <Section title="Описание">
            <MarkdownField
              value={description}
              onChange={setDescription}
              placeholder="Задачи, договорённости, контакты на стороне клиента…"
            />
          </Section>
        </div>
      </div>

      <aside
        className="w-[300px] shrink-0 overflow-y-auto border-l border-border px-5 py-6"
        key={`aside-${p.id}`}
      >
        <div className="flex flex-col gap-6">
          <Settings project={p} patch={patch} />
          <section className="flex flex-col gap-3">
            <h3 className="text-[12px] text-muted-foreground">Ссылки</h3>
            {LINK_FIELDS.map((f) => (
              <UrlField
                key={f.key}
                label={f.label}
                value={p[f.key]}
                placeholder={f.placeholder}
                onSave={(v) => patch({ [f.key]: v })}
              />
            ))}
          </section>
          <EntityAside
            entity={{ type: 'project', id: p.id }}
            tags={p.tags}
            onTagsChange={(tagIds) => patch({ tagIds })}
            createdAt={p.createdAt}
            updatedAt={p.updatedAt}
          />
        </div>
      </aside>
    </div>
  )
}
