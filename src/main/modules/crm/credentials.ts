import { asc, eq, inArray, or } from 'drizzle-orm'
import { z } from 'zod'
import type { CredentialsApi } from '@shared/api'
import { credentialInputSchema, credentialPatchSchema, type Credential } from '@shared/domain/crm'
import { credentials } from '../../db/schema'
import type { Orm } from '../../db/client'
import { newId, now, NotFoundError, UserError } from '../../core/util'
import { idArg, updateArgs, type ModuleContext } from '../context'
import type { CredentialRow } from './shared'

/** Logins of a client or project; the secret is encrypted (SecretBox) and revealed only on request. */
export class Credentials {
  constructor(private readonly m: ModuleContext) {}

  private get db(): Orm {
    return this.m.db.orm
  }

  private toCredential(r: CredentialRow): Credential {
    return {
      id: r.id,
      projectId: r.projectId,
      clientId: r.clientId,
      label: r.label,
      url: r.url,
      login: r.login,
      hasSecret: !!r.secret,
      notes: r.notes,
      createdAt: r.createdAt,
      updatedAt: r.updatedAt
    }
  }

  forOwner(where: { projectIds?: string[]; clientId?: string }): Credential[] {
    const conds = [
      where.projectIds?.length ? inArray(credentials.projectId, where.projectIds) : undefined,
      where.clientId ? eq(credentials.clientId, where.clientId) : undefined
    ].filter(Boolean)
    if (!conds.length) return []
    return this.db
      .select()
      .from(credentials)
      .where(or(...conds))
      .orderBy(asc(credentials.label))
      .all()
      .map((r) => this.toCredential(r))
  }

  api(): CredentialsApi {
    const find = (id: string): CredentialRow => {
      const row = this.db.select().from(credentials).where(eq(credentials.id, id)).get()
      if (!row) throw new NotFoundError('Доступ', id)
      return row
    }
    return {
      list: async (args) => {
        const { projectId, clientId } = z
          .object({ projectId: idArg.optional(), clientId: idArg.optional() })
          .parse(args ?? {})
        return this.forOwner({ projectIds: projectId ? [projectId] : undefined, clientId })
      },
      create: async (input) => {
        const data = credentialInputSchema.parse(input)
        if (!data.projectId && !data.clientId)
          throw new UserError('Доступ має належати клієнту або проєкту')
        const ts = now()
        const row = this.db
          .insert(credentials)
          .values({
            ...data,
            id: newId(),
            secret: this.m.secrets.encrypt(data.secret),
            createdAt: ts,
            updatedAt: ts
          })
          .returning()
          .get()
        return this.toCredential(row)
      },
      update: async (args) => {
        const { id, patch } = updateArgs(credentialPatchSchema).parse(args)
        find(id)
        const values = {
          ...patch,
          ...(patch.secret !== undefined ? { secret: this.m.secrets.encrypt(patch.secret) } : {}),
          updatedAt: now()
        }
        const row = this.db
          .update(credentials)
          .set(values)
          .where(eq(credentials.id, id))
          .returning()
          .get()
        return this.toCredential(row!)
      },
      remove: async (id) => {
        this.db
          .delete(credentials)
          .where(eq(credentials.id, idArg.parse(id)))
          .run()
      },
      reveal: async (id) => this.m.secrets.decrypt(find(idArg.parse(id)).secret)
    }
  }
}
