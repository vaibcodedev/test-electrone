import { useMemo, type ReactElement } from 'react'
import { Link } from 'react-router'
import { Plus } from 'lucide-react'
import type { Credential } from '@shared/domain/credentials'
import { ENTITY_META } from '@shared/entity-types'
import { useDetailMode } from '@/components/common/detail-mode-context'
import { SectionLabel } from '@/components/common/section-label'
import { Button } from '@/components/ui/button'
import { Section } from './parts'
import { useInlineForm } from './inline-form'
import { CredentialForm, type CredentialOwner, type OwnerChoice } from './credential-form'
import { CredentialCard } from './credential-card'

interface Group {
  key: string
  /** null — the client's own («Загальні»). */
  project: { id: string; title: string } | null
  items: Credential[]
}

/** «Загальні» first, then a group per project in the order of the client's project list; empty groups dropped. */
function groupByOwner(items: Credential[], projects: OwnerChoice['projects']): Group[] {
  const own = items.filter((c) => !c.projectId)
  const groups: Group[] = own.length ? [{ key: 'client', project: null, items: own }] : []
  for (const p of projects) {
    const list = items.filter((c) => c.projectId === p.id)
    if (list.length) groups.push({ key: p.id, project: p, items: list })
  }
  return groups
}

/**
 * Accesses of a client or project, by kind (сервер, база, API-ключ…). Secrets are revealed on demand and never
 * cached; «+ Доступ» asks for the kind first, then that kind's fields. On the client page (`projects`) the list also
 * holds the accesses of its projects — each stored once, with its owner — grouped «Загальні», then per project, and
 * «Для» picks or changes the owner.
 */
export function CredentialsSection({
  items,
  owner,
  projects
}: {
  items: Credential[]
  owner: CredentialOwner
  /** The client page: the client's live projects. */
  projects?: { id: string; title: string }[]
}): ReactElement {
  const mode = useDetailMode()
  const [adding, setAdding] = useInlineForm('доступ')
  const owners = useMemo<OwnerChoice | undefined>(
    () => ('clientId' in owner && projects ? { clientId: owner.clientId, projects } : undefined),
    [owner, projects]
  )
  const groups = owners ? groupByOwner(items, owners.projects) : null
  // One group (only the client's own, or only one project's) needs no heading… unless it is a project's.
  const headed = !!groups && (groups.length > 1 || groups.some((g) => g.project))
  const card = (c: Credential): ReactElement => (
    <CredentialCard key={c.id} item={c} owner={owner} owners={owners} />
  )
  return (
    <Section
      title="Доступи"
      action={
        !adding && (
          <Button variant="soft" size="sm" data-edit-only onClick={() => setAdding(true)}>
            <Plus /> Доступ
          </Button>
        )
      }
    >
      {adding && <CredentialForm owner={owner} owners={owners} onDone={() => setAdding(false)} />}
      {items.length > 0 &&
        (groups && headed ? (
          <div className="flex flex-col gap-4">
            {groups.map((g) => (
              <section
                key={g.key}
                className="flex flex-col gap-2"
                data-credential-group={g.project?.id ?? 'client'}
              >
                <SectionLabel>
                  {g.project ? (
                    <Button variant="link" className="text-caption font-semibold" asChild>
                      <Link to={ENTITY_META.project.route(g.project.id)}>
                        Проєкт: {g.project.title}
                      </Link>
                    </Button>
                  ) : (
                    'Загальні'
                  )}
                </SectionLabel>
                {g.items.map(card)}
              </section>
            ))}
          </div>
        ) : (
          <div className="flex flex-col gap-2">{items.map(card)}</div>
        ))}
      {!items.length && !adding && (
        <div className="flex flex-col items-start gap-3">
          <p className="text-body leading-relaxed text-muted-foreground">
            Доступів ще немає. Сервери, бази, API-ключі, адмінки й пошта — паролі й ключі шифруються
            ключем Windows.
          </p>
          {!mode.editing && (
            <Button
              variant="soft"
              size="sm"
              onClick={() => {
                mode.setEditing(true)
                setAdding(true)
              }}
            >
              <Plus /> Додати доступ
            </Button>
          )}
        </div>
      )}
    </Section>
  )
}
