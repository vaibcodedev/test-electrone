import { useState, type ReactElement } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import { ArrowLeft, Plus } from 'lucide-react'
import { clientInputSchema, type ClientPatch } from '@shared/domain/crm'
import { useApi, useApiMutation } from '@/lib/query'
import { limitsOf } from '@/lib/limits'
import { useAutosave } from '@/hooks/use-autosave'
import { EmptyState } from '@/components/common/page'
import { PageSkeleton } from '@/components/common/page-skeleton'
import { EntityAside } from '@/components/common/master-detail'
import { MarkdownField } from '@/components/common/markdown'
import { RecordMode, useRecordMode } from '@/components/common/detail-mode'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import { Section } from './parts'
import { ProjectRow } from './project-row'
import { ProjectDialog } from './dialogs'
import { CredentialsSection } from './credentials-section'
import { ClientHeader, ClientStats } from './client-header'
import {
  AsideGroup,
  BillingEdit,
  BillingView,
  ContactsEdit,
  ContactsView,
  SourceEdit,
  SourceView
} from './client-aside'

const CLIENT_L = limitsOf(clientInputSchema)

export function ClientPage(): ReactElement {
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
  const mode = useRecordMode(id, 'client')

  if (isLoading) return <PageSkeleton kind="detail" />
  if (!data || !c) {
    return (
      <EmptyState
        title="Клієнта не знайдено"
        hint="Можливо, він у кошику."
        cta={{ label: 'До клієнтів', icon: ArrowLeft, onClick: () => navigate('/clients') }}
      />
    )
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
          <ClientHeader
            c={c}
            name={name}
            onNameChange={setName}
            mode={mode}
            patch={patch}
            onRemove={() => remove.mutate(id)}
          />
          <ClientStats c={c} editing={mode.editing} />

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
              {mode.editing ? <ContactsEdit c={c} patch={patch} /> : <ContactsView c={c} />}
            </AsideGroup>
            <Separator />
            <AsideGroup title="Платформа">
              {mode.editing ? <SourceEdit c={c} patch={patch} /> : <SourceView c={c} />}
            </AsideGroup>
            <Separator />
            <AsideGroup title="Типова оплата">
              {mode.editing ? <BillingEdit c={c} patch={patch} /> : <BillingView c={c} />}
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
