/** Row types, labels and the money/time helpers shared by the parts of the CRM module. */
import type { Client, Currency, Payment, PaymentStatus, Project, ProjectStatus, TimeEntry } from '@shared/domain/crm'
import { clients, credentials, payments, projects, timeEntries } from '../../db/schema'
import type { SoftRepository } from '../../core/soft-repository'
import { now } from '../../core/util'

export type ClientRow = typeof clients.$inferSelect
export type ProjectRow = typeof projects.$inferSelect
export type PaymentRow = typeof payments.$inferSelect
export type TimeRow = typeof timeEntries.$inferSelect
export type CredentialRow = typeof credentials.$inferSelect
export type ClientRepo = SoftRepository<ClientRow, Client>
export type ProjectRepo = SoftRepository<ProjectRow, Project>

export const PROJECT_STATUS_LABEL: Record<ProjectStatus, string> = {
  lead: 'Лід',
  active: 'У роботі',
  paused: 'На паузі',
  done: 'Завершено',
  cancelled: 'Скасовано'
}

export const round2 = (n: number): number => Math.round(n * 100) / 100

/** Months a retainer has been billed: every started calendar month from start until due/now. */
export function monthsBilled(
  start: number,
  due: number | null,
  status: string,
  at = Date.now()
): number {
  if (status === 'lead') return 0
  const end = Math.min(at, due ?? at)
  if (end < start) return 0
  const a = new Date(start)
  const b = new Date(end)
  return (b.getFullYear() - a.getFullYear()) * 12 + (b.getMonth() - a.getMonth()) + 1
}

export const minutesBetween = (a: number, b: number): number => Math.max(0, Math.round((b - a) / 60_000))

export function toPayment(r: PaymentRow): Payment {
  const open = r.status === 'expected' || r.status === 'invoiced'
  return {
    ...r,
    currency: r.currency as Currency,
    status: r.status as PaymentStatus,
    overdue: open && r.dueAt !== null && r.dueAt < now()
  }
}

export function toTime(r: TimeRow): TimeEntry {
  return { ...r, minutes: r.endedAt ? r.minutes : minutesBetween(r.startedAt, now()) }
}
