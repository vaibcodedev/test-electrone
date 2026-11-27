/**
 * Freelance hub backend: platforms, proposals pipeline, bid credits ledger, message templates,
 * portfolio cases, red flags, goals and funnel statistics — each part in its own file; this module
 * owns the entity descriptors and the seeds. Contracts and clients are CRM projects/clients with a
 * platformId (no duplication).
 */
import type {
  CasesApi,
  CreditsApi,
  FreelanceApi,
  GoalsApi,
  PlatformsApi,
  ProposalsApi,
  RedFlagsApi,
  TemplatesApi
} from '@shared/api'
import type { Currency } from '@shared/domain/crm'
import {
  platformInputSchema,
  PROPOSAL_STATUS_LABEL,
  redFlagInputSchema,
  situationLabel,
  templateInputSchema,
  templateVersions,
  versionLabel,
  type BidType,
  type ProposalStatus,
  type TemplatePurpose,
  withPurpose
} from '@shared/domain/freelance'
import { messageTemplates, platforms, portfolioCases, proposals, redFlags } from '../../db/schema'
import type { Orm } from '../../db/client'
import { SoftRepository } from '../../core/soft-repository'
import { seedOnce, type SeedLedger } from '../../core/config-store'
import type { EntityDescriptor } from '../../core/registry'
import { newId, now } from '../../core/util'
import type { ModuleContext } from '../context'
import type { CrmModule } from '../crm'
import { FREELANCE_SEED } from '../freelance-seeds'
import { Credits } from './credits'
import { Goals } from './goals'
import { Platforms } from './platforms'
import { casesApi, redFlagsApi, type CaseRepo, type RedFlagRepo } from './portfolio'
import { Proposals } from './proposals'
import { ProposalStats } from './stats'
import { Templates } from './templates'
import { type ProposalRepo, type TemplateRepo, type TemplateRow } from './shared'

export class FreelanceModule {
  readonly descriptors: EntityDescriptor[]
  readonly proposalRepo: ProposalRepo
  private readonly caseRepo: CaseRepo
  private readonly flagRepo: RedFlagRepo
  private readonly platforms: Platforms
  private readonly templates: Templates
  private readonly proposals: Proposals
  private readonly credits: Credits
  private readonly stats: ProposalStats
  private readonly goals: Goals

  constructor(
    private readonly m: ModuleContext,
    crm: CrmModule
  ) {
    const proposal: EntityDescriptor = {
      type: 'proposal',
      table: proposals,
      searchDoc: (r) => ({
        title: r.jobTitle,
        body: `${r.niche}\n${r.clientName}\n${r.clientCountry}\n${r.coverLetter}\n${r.jobDescription}\n${r.notes}`
      }),
      summary: (r) => ({
        title: r.jobTitle,
        subtitle: PROPOSAL_STATUS_LABEL[r.status as ProposalStatus]
      })
    }
    const template: EntityDescriptor = {
      type: 'template',
      table: messageTemplates,
      // Every version is searchable; an old «Тип завдання» too (the column is kept, nothing edits it now).
      searchDoc: (r) => ({
        title: r.title,
        body: [r.trigger, r.body, ...r.versions.flatMap((v) => [v.name, v.body]), r.note, r.niche].join('\n')
      }),
      summary: (r) => ({
        title: r.title,
        subtitle: situationLabel(r.situation)
      }),
      // copyCount is a system field and copying bumps updatedAt: a used template never counts as a draft.
      draft: {
        titleField: 'title',
        contentFields: ['trigger', 'body', 'bodyName', 'versions', 'note', 'niche']
      },
      systemFields: ['copyCount'],
      // The versions as readable sections (the frontmatter keeps them as JSON for a re-import).
      exportBody: (r) =>
        (r as TemplateRow).versions.length
          ? templateVersions(r as TemplateRow).flatMap((v) => [`## Версія: ${versionLabel(v.name)}`, '', v.body, ''])
          : []
    }
    const portfolioCase: EntityDescriptor = {
      type: 'case',
      table: portfolioCases,
      draft: {
        titleField: 'title',
        contentFields: [
          'niche',
          'client',
          'problem',
          'whatDone',
          'result',
          'stack',
          'url',
          'textEn',
          'coverPath'
        ]
      },
      searchDoc: (r) => ({
        title: r.title,
        body: `${r.niche}\n${r.client}\n${r.problem}\n${r.whatDone}\n${r.result}\n${r.stack}\n${r.textEn}`
      }),
      summary: (r) => ({ title: r.title, subtitle: r.niche || undefined }),
      onPurge: (r) => m.files.remove(r.coverPath),
      fileFields: { coverPath: [] }
    }
    const flag: EntityDescriptor = {
      type: 'redflag',
      table: redFlags,
      draft: { titleField: 'title', contentFields: ['signs', 'action'] },
      searchDoc: (r) => ({ title: r.title, body: `${r.signs}\n${r.action}` }),
      summary: (r) => ({ title: r.title, subtitle: r.signs ? r.signs.slice(0, 80) : undefined })
    }
    this.descriptors = [proposal, template, portfolioCase, flag]
    this.proposalRepo = new SoftRepository(m.repo, proposal, (r, tags) => ({
      ...r,
      status: r.status as ProposalStatus,
      bidType: r.bidType as BidType,
      tags
    }))
    const templateRepo: TemplateRepo = new SoftRepository(m.repo, template, (r, tags) => ({
      ...r,
      purpose: r.purpose as TemplatePurpose,
      tags
    }))
    this.caseRepo = new SoftRepository(m.repo, portfolioCase, (r, tags) => ({ ...r, tags }))
    this.flagRepo = new SoftRepository(m.repo, flag, (r, tags) => ({ ...r, tags }))
    this.platforms = new Platforms(m)
    this.templates = new Templates(m, templateRepo)
    this.proposals = new Proposals(m, this.proposalRepo, this.platforms, this.templates, crm)
    this.credits = new Credits(m, this.platforms)
    this.stats = new ProposalStats(m)
    this.goals = new Goals(m, this.stats)
  }

  private get db(): Orm {
    return this.m.db.orm
  }

  /* ───────── seeds ───────── */

  /** First launch of the freelance hub: Upwork + direct orders, starter templates and red flags. */
  seedIfEmpty(ledger: SeedLedger): void {
    seedOnce(
      ledger,
      'freelance',
      () => this.platforms.hasAny(),
      () => this.seed()
    )
  }

  private seed(): void {
    const ts = now()
    this.m.db.tx(() => {
      FREELANCE_SEED.platforms.forEach((p, i) => {
        this.db
          .insert(platforms)
          .values({
            ...platformInputSchema.parse(p),
            id: newId(),
            position: i,
            createdAt: ts,
            updatedAt: ts
          })
          .run()
      })
      for (const t of FREELANCE_SEED.templates)
        this.templates.repo.insert({
          ...withPurpose(templateInputSchema.parse(t)),
          niche: '',
          copyCount: 0
        })
      for (const f of FREELANCE_SEED.redFlags) this.flagRepo.insert(redFlagInputSchema.parse(f))
    })
  }

  /** Purchases in range grouped by platform currency (finance report). */
  creditPurchases(from: number, to: number): { currency: Currency; cost: number }[] {
    return this.credits.purchases(from, to)
  }

  platformsApi(): PlatformsApi {
    return this.platforms.api()
  }

  proposalsApi(): ProposalsApi {
    return this.proposals.api()
  }

  creditsApi(): CreditsApi {
    return this.credits.api()
  }

  templatesApi(): TemplatesApi {
    return this.templates.api()
  }

  casesApi(): CasesApi {
    return casesApi(this.m, this.caseRepo)
  }

  redFlagsApi(): RedFlagsApi {
    return redFlagsApi(this.flagRepo)
  }

  freelanceApi(): FreelanceApi {
    return this.stats.api()
  }

  goalsApi(): GoalsApi {
    return this.goals.api()
  }
}
