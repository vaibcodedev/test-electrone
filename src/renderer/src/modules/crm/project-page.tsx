import { useId, type ReactElement } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import { ArrowLeft } from 'lucide-react'
import { PROJECT_STATUSES, projectInputSchema, type ProjectPatch } from '@shared/domain/crm'
import { useApi, useApiMutation } from '@/lib/query'
import { RecordMode, useRecordMode } from '@/components/common/detail-mode'
import { EditableScope } from '@/components/common/detail-mode-context'
import { limitsOf } from '@/lib/limits'
import { useAutosave } from '@/hooks/use-autosave'
import { EmptyState } from '@/components/common/page'
import { PageSkeleton } from '@/components/common/page-skeleton'
import { EntityAside, InlineTitle, RecordActions } from '@/components/common/master-detail'
import { Choice } from '@/components/common/choice'
import { MarkdownField } from '@/components/common/markdown'
import { Separator } from '@/components/ui/separator'
import { Label } from '@/components/ui/label'
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbSeparator
} from '@/components/ui/breadcrumb'
import { PROJECT_STATUS_LABEL } from './labels'
import { TimeSection } from './time-section'
import { PaymentsSection } from './payments-section'
import { CredentialsSection } from './credentials-section'
import { ClientCombobox } from './client-combobox'
import { MoneyHeader } from './project-money'
import { ProjectLinks, Terms } from './project-terms'
import { NetPaid, PlatformBadge } from './platform-fields'

const PROJECT_L = limitsOf(projectInputSchema)

export function ProjectPage(): ReactElement {
  const { id = '' } = useParams()
  const navigate = useNavigate()
  const { data, isLoading } = useApi('projects', 'details', id)
  const update = useApiMutation('projects', 'update')
  const remove = useApiMutation('projects', 'remove', {
    successMessage: 'Проєкт переміщено в кошик',
    onSuccess: () => navigate('/clients?tab=projects')
  })
  const p = data?.project
  const patch = (patchValue: ProjectPatch): void => update.mutate({ id, patch: patchValue })
  const mode = useRecordMode(id, 'project')
  const clientFieldId = useId()
  const [title, setTitle] = useAutosave(
    p?.title ?? '',
    (t) => t.trim() && patch({ title: t.trim() })
  )
  const [description, setDescription] = useAutosave(p?.description ?? '', (d) =>
    patch({ description: d })
  )

  if (isLoading) return <PageSkeleton kind="detail" />
  if (!data || !p) {
    return (
      <EmptyState
        title="Проєкт не знайдено"
        hint="Можливо, він у кошику."
        cta={{
          label: 'До проєктів',
          icon: ArrowLeft,
          onClick: () => navigate('/clients?tab=projects')
        }}
      />
    )
  }

  const hourly = p.billing === 'hourly'
  const time = (
    <TimeSection
      projectId={p.id}
      rate={p.rate}
      currency={p.currency}
      hourly={hourly}
      secondary={!hourly}
      unpaid={p.billing === 'none'}
      totalMinutes={p.trackedMinutes}
    />
  )

  return (
    <RecordMode mode={mode}>
      <div className="flex h-full min-h-0">
        <div className="min-w-0 flex-1 overflow-y-auto px-8 pt-6 pb-10" key={p.id}>
          {/* Actions get their own row in the DS §8 order (RecordActions); the page has no ✕ — the breadcrumb leads back. */}
          <div className="mb-4 flex items-center gap-4">
            <Breadcrumb className="min-w-0 max-w-1/2">
              <BreadcrumbList className="flex-nowrap text-caption">
                <BreadcrumbItem className="shrink-0">
                  <BreadcrumbLink asChild>
                    <Link to="/clients?tab=projects" className="flex items-center gap-1">
                      <ArrowLeft className="size-3.5" /> Проєкти
                    </Link>
                  </BreadcrumbLink>
                </BreadcrumbItem>
                {data.client && (
                  <>
                    <BreadcrumbSeparator />
                    {/* A long client name is cut with «…»: the actions keep their place on the right. */}
                    <BreadcrumbItem className="min-w-0">
                      <BreadcrumbLink asChild>
                        <Link
                          to={`/clients/${data.client.id}`}
                          className="truncate"
                          title={data.client.name}
                        >
                          {data.client.name}
                        </Link>
                      </BreadcrumbLink>
                    </BreadcrumbItem>
                  </>
                )}
              </BreadcrumbList>
            </Breadcrumb>
            <RecordActions
              className="flex-1"
              entity={{ type: 'project', id }}
              mode={mode}
              onDelete={() => remove.mutate(id)}
              deleteConfirm={{
                title: 'Видалити проєкт?',
                description: 'Проєкт піде в кошик на 30 днів разом із годинами й оплатами.'
              }}
            />
          </div>

          <InlineTitle value={title} onChange={setTitle} maxLength={PROJECT_L.title} />

          <div className="mt-3 flex flex-wrap items-center gap-2">
            {/* Status is a quick action (docs/design-system.md §8): it changes in view mode too. */}
            <EditableScope>
              <Choice
                aria-label="Статус проєкту"
                className="w-40"
                value={p.status}
                onChange={(v) => v && patch({ status: v })}
                options={PROJECT_STATUSES.map((s) => ({
                  value: s,
                  label: PROJECT_STATUS_LABEL[s]
                }))}
              />
            </EditableScope>
            {/* Reading: the client is already in the breadcrumbs. */}
            {mode.editing && (
              <>
                <Label htmlFor={clientFieldId} className="sr-only">
                  Клієнт
                </Label>
                <ClientCombobox
                  id={clientFieldId}
                  className="w-60"
                  value={p.clientId}
                  currentName={data.client?.name}
                  onChange={(c) => patch({ clientId: c?.id ?? null })}
                />
              </>
            )}
            <PlatformBadge platformId={p.platformId} name={p.platformName} />
            <NetPaid project={p} />
          </div>

          {p.billing !== 'none' && (
            <MoneyHeader p={p} overdue={data.payments.some((x) => x.overdue)} />
          )}

          <div className="mt-8 flex flex-col gap-10">
            {hourly && time}
            {p.billing !== 'none' && (
              <PaymentsSection
                projectId={p.id}
                currency={p.currency}
                payments={data.payments}
                billing={p.billing}
                price={p.fixedPrice}
              />
            )}
            {!hourly && time}
            <CredentialsSection items={data.credentials} owner={{ projectId: p.id }} />
            <MarkdownField
              label="Опис"
              value={description}
              onChange={setDescription}
              placeholder="Завдання, домовленості, контакти з боку клієнта…"
              maxLength={PROJECT_L.description}
            />
          </div>
        </div>

        <aside
          className="w-[300px] shrink-0 overflow-y-auto border-l border-border px-5 py-6"
          key={`aside-${p.id}`}
        >
          <div className="flex flex-col gap-6">
            <Terms project={p} patch={patch} />
            <Separator />
            <ProjectLinks project={p} patch={patch} />
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
    </RecordMode>
  )
}
