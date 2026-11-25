/**
 * Clients & projects: contacts, encrypted credentials, time tracking, payments and money math — each
 * part in its own file; this module owns the entity descriptors and wires the parts.
 * Money is always computed per project currency; overview groups by currency (no FX conversion).
 */
import { and, gte, isNull, lte } from 'drizzle-orm'
import type { ClientsApi, CredentialsApi, PaymentsApi, ProjectsApi, TimeApi } from '@shared/api'
import { FEED_COLOR, type CalendarItem } from '@shared/domain/calendar'
import {
  PROJECT_STATUS_LABEL,
  type BillingType,
  type ClientStatus,
  type Currency,
  type ProjectStatus,
  type RunningTimer
} from '@shared/domain/crm'
import { clients, projects } from '../../db/schema'
import type { Orm } from '../../db/client'
import { SoftRepository } from '../../core/soft-repository'
import type { EntityDescriptor } from '../../core/registry'
import type { ModuleContext } from '../context'
import { Clients } from './clients'
import { Credentials } from './credentials'
import { Payments } from './payments'
import { Projects } from './projects'
import { CrmSummaries } from './summaries'
import { TimeTracker } from './time'
import { type ClientRepo, type ProjectRepo } from './shared'

export class CrmModule {
  readonly descriptors: EntityDescriptor[]
  readonly clientRepo: ClientRepo
  readonly projectRepo: ProjectRepo
  private readonly summaries: CrmSummaries
  private readonly credentials: Credentials
  private readonly time: TimeTracker
  private readonly payments: Payments
  private readonly clients: Clients
  private readonly projects: Projects

  constructor(private readonly m: ModuleContext) {
    const client: EntityDescriptor = {
      type: 'client',
      table: clients,
      searchDoc: (r) => ({
        title: r.name,
        body: `${r.company}\n${r.email}\n${r.phone}\n${r.messenger}\n${r.website}\n${r.notes}`
      }),
      summary: (r) => ({ title: r.name, subtitle: r.company || undefined })
    }
    const project: EntityDescriptor = {
      type: 'project',
      table: projects,
      searchDoc: (r) => ({
        title: r.title,
        body: `${r.description}\n${r.repoUrl}\n${r.stagingUrl}\n${r.prodUrl}`
      }),
      summary: (r) => ({
        title: r.title,
        subtitle: PROJECT_STATUS_LABEL[r.status as ProjectStatus]
      })
    }
    this.descriptors = [client, project]
    this.clientRepo = new SoftRepository(m.repo, client, (r, tags) => ({
      ...r,
      status: r.status as ClientStatus,
      currency: r.currency as Currency,
      defaultBilling: r.defaultBilling as BillingType,
      tags
    }))
    this.projectRepo = new SoftRepository(m.repo, project, (r, tags) => ({
      ...r,
      status: r.status as ProjectStatus,
      billing: r.billing as BillingType,
      currency: r.currency as Currency,
      tags
    }))
    this.summaries = new CrmSummaries(m, this.projectRepo)
    this.credentials = new Credentials(m)
    this.time = new TimeTracker(m, this.projectRepo)
    this.payments = new Payments(m, this.projectRepo)
    this.clients = new Clients(this.clientRepo, this.projectRepo, this.summaries, this.credentials)
    this.projects = new Projects(
      m,
      this.projectRepo,
      this.clientRepo,
      this.summaries,
      this.credentials,
      this.time
    )
  }

  private get db(): Orm {
    return this.m.db.orm
  }

  /** Active projects, most recently touched first — the tray's «start timer» list. */
  recentActiveProjects(limit?: number): { id: string; title: string }[] {
    return this.time.recentActiveProjects(limit)
  }

  running(): RunningTimer | null {
    return this.time.running()
  }

  /** Minutes worked inside [from, to] (dashboard). */
  minutesInRange(from: number, to: number): number {
    return this.time.minutesInRange(from, to)
  }

  /** Calendar feed: payments due and project deadlines. */
  calendarFeed(from: number, to: number): CalendarItem[] {
    const items: CalendarItem[] = this.payments.due(from, to).map((p) => ({
      key: `payment:${p.id}`,
      source: 'payment',
      ref: { type: 'project', id: p.projectId },
      title: `Оплата ${p.amount} ${p.currency} · ${p.projectTitle}`,
      startAt: p.dueAt!,
      endAt: null,
      allDay: true,
      color: FEED_COLOR.payment,
      done: p.status === 'paid' || p.status === 'cancelled'
    }))
    const deadlines = this.db
      .select({
        id: projects.id,
        title: projects.title,
        dueAt: projects.dueAt,
        status: projects.status
      })
      .from(projects)
      .where(and(isNull(projects.deletedAt), gte(projects.dueAt, from), lte(projects.dueAt, to)))
      .all()
    for (const p of deadlines) {
      items.push({
        key: `project:${p.id}`,
        source: 'project',
        ref: { type: 'project', id: p.id },
        title: `Дедлайн: ${p.title}`,
        startAt: p.dueAt!,
        endAt: null,
        allDay: true,
        color: FEED_COLOR.project,
        done: p.status === 'done' || p.status === 'cancelled'
      })
    }
    return items
  }

  clientsApi(): ClientsApi {
    return this.clients.api()
  }

  projectsApi(): ProjectsApi {
    return this.projects.api()
  }

  credentialsApi(): CredentialsApi {
    return this.credentials.api()
  }

  timeApi(): TimeApi {
    return this.time.api()
  }

  paymentsApi(): PaymentsApi {
    return this.payments.api()
  }
}
