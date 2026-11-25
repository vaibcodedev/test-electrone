import { and, desc, eq, gte, isNotNull, isNull, lte } from 'drizzle-orm'
import { z } from 'zod'
import type { PaymentsApi } from '@shared/api'
import { paymentInputSchema, paymentPatchSchema, type Payment } from '@shared/domain/crm'
import { payments, projects } from '../../db/schema'
import type { Orm } from '../../db/client'
import { newId, now, NotFoundError, UserError } from '../../core/util'
import { idArg, updateArgs, type ModuleContext } from '../context'
import { toPayment, type ProjectRepo } from './shared'

/** Payments (stages) of projects; a fixed-price project's stages never add up past its price. */
export class Payments {
  constructor(
    private readonly m: ModuleContext,
    private readonly projectRepo: ProjectRepo
  ) {}

  private get db(): Orm {
    return this.m.db.orm
  }

  api(): PaymentsApi {
    return {
      list: async (args) => {
        const { projectId } = z.object({ projectId: idArg.optional() }).parse(args ?? {})
        return this.db
          .select({ pay: payments })
          .from(payments)
          .innerJoin(projects, eq(projects.id, payments.projectId))
          .where(
            and(
              isNull(projects.deletedAt),
              projectId ? eq(payments.projectId, projectId) : undefined
            )
          )
          .orderBy(desc(payments.createdAt))
          .all()
          .map((r) => toPayment(r.pay))
      },
      create: async (input) => {
        const data = paymentInputSchema.parse(input)
        const project = this.projectRepo.rowOrThrow(data.projectId)
        this.assertWithinPrice(project, data.amount, data.currency)
        const row = this.db
          .insert(payments)
          .values({
            ...data,
            id: newId(),
            paidAt: data.status === 'paid' ? (data.paidAt ?? now()) : data.paidAt,
            createdAt: now()
          })
          .returning()
          .get()
        return toPayment(row)
      },
      update: async (args) => {
        const { id, patch } = updateArgs(paymentPatchSchema).parse(args)
        const cur = this.db.select().from(payments).where(eq(payments.id, id)).get()
        if (!cur) throw new NotFoundError('Оплата', id)
        // Re-check the budget when the stage counts again too: un-cancelling it can push past the price.
        const status = patch.status ?? cur.status
        const backFromCancelled = patch.status !== undefined && cur.status === 'cancelled' && status !== 'cancelled'
        if (status !== 'cancelled' && (patch.amount !== undefined || patch.currency !== undefined || backFromCancelled)) {
          this.assertWithinPrice(
            this.projectRepo.rowOrThrow(cur.projectId),
            patch.amount ?? cur.amount,
            patch.currency ?? cur.currency,
            id
          )
        }
        const values = { ...patch }
        if (patch.status === 'paid' && !cur.paidAt && patch.paidAt === undefined)
          values.paidAt = now()
        if (patch.status && patch.status !== 'paid' && patch.paidAt === undefined)
          values.paidAt = null
        const row = this.db
          .update(payments)
          .set(values)
          .where(eq(payments.id, id))
          .returning()
          .get()
        return toPayment(row!)
      },
      remove: async (id) => {
        this.db
          .delete(payments)
          .where(eq(payments.id, idArg.parse(id)))
          .run()
      }
    }
  }

  /**
   * Fixed-price project: stages can't add up to more than the price (same currency).
   * Otherwise "left to receive" and income stats would be nonsense (5 000 $ project, 5 000 000 $ stage).
   */
  private assertWithinPrice(project: { billing: string; fixedPrice: number; currency: string }, amount: number, currency: string, exceptId?: string): void {
    if (project.billing !== 'fixed' || project.fixedPrice <= 0) return
    if (currency !== project.currency)
      throw new UserError(`Етапи фіксованого проєкту — у валюті проєкту (${project.currency}).`)
    const others = this.db
      .select({ id: payments.id, amount: payments.amount, currency: payments.currency, status: payments.status })
      .from(payments)
      .where(eq(payments.projectId, (project as { id?: string }).id ?? ''))
      .all()
      // Cancelled stages free their share (the UI counts «не розподілено» the same way).
      .filter((p) => p.id !== exceptId && p.currency === currency && p.status !== 'cancelled')
      .reduce((sum, p) => sum + p.amount, 0)
    const left = Math.round((project.fixedPrice - others) * 100) / 100
    if (amount > left + 0.005) {
      const fmt = (n: number): string => `${n.toLocaleString('uk-UA', { maximumFractionDigits: 2 })} ${currency}`
      throw new UserError(
        left > 0
          ? `Етапи перевищують вартість проєкту (${fmt(project.fixedPrice)}): можна додати щонайбільше ${fmt(left)}. Змініть суму або вартість проєкту.`
          : `Вартість проєкту (${fmt(project.fixedPrice)}) вже повністю розподілена між етапами. Збільште вартість проєкту, щоб додати етап.`
      )
    }
  }

  /** Payments with a due date in range (for the calendar). */
  due(from: number, to: number): (Payment & { projectTitle: string })[] {
    return this.db
      .select({ pay: payments, projectTitle: projects.title })
      .from(payments)
      .innerJoin(projects, eq(projects.id, payments.projectId))
      .where(
        and(
          isNull(projects.deletedAt),
          isNotNull(payments.dueAt),
          gte(payments.dueAt, from),
          lte(payments.dueAt, to)
        )
      )
      .all()
      .map((r) => ({ ...toPayment(r.pay), projectTitle: r.projectTitle }))
  }
}
