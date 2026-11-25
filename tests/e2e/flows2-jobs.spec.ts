import type { Locator, Page } from '@playwright/test'
import { expect, test, uid } from './fixtures'

/**
 * Job search flows, round 2 (docs/quality-pass.md §6): a vacancy gets a company card from the picker and an
 * interview stage that lands in the calendar; company ↔ vacancy links both ways. UI first; RPC prepares/checks.
 */

const hashPath = (win: Page): Promise<string> =>
  win.evaluate(() => location.hash.slice(1).split('?')[0])
const openParam = (win: Page): Promise<string | null> =>
  win.evaluate(() => new URLSearchParams(location.hash.split('?')[1] ?? '').get('open'))
const sheetOf = (win: Page): Locator =>
  win.getByRole('dialog').filter({ has: win.locator('[data-detail-mode]') })
const modeOf = (sheet: Locator): Locator => sheet.locator('[data-detail-mode]').first()

function tomorrowAt(hour: number): number {
  const d = new Date()
  d.setDate(d.getDate() + 1)
  d.setHours(hour, 0, 0, 0)
  return d.getTime()
}

test.describe('вакансія: компанія й етапи', () => {
  test('компанія з пікера → етап «Запланувати» → подія в календарі → компанія показує вакансію', async ({
    vault
  }) => {
    test.setTimeout(90_000)
    const { win, rpc, go } = vault
    const token = `jb${uid()}`
    const company = `Acme ${token}`
    const app = await rpc('jobs.create', { title: `Frontend ${token}` })

    await go(`/jobs/applications?open=${app.id}`)
    const sheet = sheetOf(win)
    await expect(modeOf(sheet)).toHaveAttribute('data-detail-mode', 'view')
    // Reading: no stages yet, and the add button is an edit action.
    await expect(sheet.getByText('Етапів ще немає', { exact: false })).toBeVisible()
    await expect(sheet.getByRole('button', { name: 'Етап', exact: true })).toBeHidden()
    await sheet.locator('[data-edit-detail]').click()
    await expect(modeOf(sheet)).toHaveAttribute('data-detail-mode', 'edit')

    // Company: type a new name → «Створити картку …».
    await sheet.getByRole('button', { name: 'Компанія', exact: true }).click()
    const picker = win.locator('[data-slot="popover-content"]')
    await picker.getByPlaceholder('Знайти або створити…').fill(company)
    await picker.getByRole('option', { name: `Створити картку «${company}»` }).click()
    await expect(picker).toBeHidden()
    await expect(sheet.getByRole('button', { name: company })).toBeVisible()
    await expect.poll(async () => (await rpc('jobs.get', app.id)).companyName).toBe(company)
    const companyId: string = (await rpc('jobs.get', app.id)).companyId
    expect(companyId).toBeTruthy()

    // Stage: «Етап» → prefilled for tomorrow 11:00 → «Запланувати».
    await sheet.getByRole('button', { name: 'Етап', exact: true }).click()
    const dialog = win.getByRole('dialog', { name: 'Новий етап' })
    await expect(dialog).toBeVisible()
    await expect(
      dialog.getByText('Співбесіда з’явиться в календарі', { exact: false })
    ).toBeVisible()
    await dialog.getByRole('button', { name: 'Запланувати' }).click()
    await expect(win.getByText('Етап заплановано — подія вже в календарі').first()).toBeVisible()
    await expect(dialog).toBeHidden()

    await expect.poll(async () => (await rpc('jobs.get', app.id)).stages.length).toBe(1)
    const stage = (await rpc('jobs.get', app.id)).stages[0]
    expect(stage).toMatchObject({ kind: 'screening', status: 'planned', at: tomorrowAt(11) })
    expect(stage.eventId).toBeTruthy()
    const event = await rpc('events.get', stage.eventId)
    expect(event).toMatchObject({ title: `Скринінг: ${company}`, startAt: tomorrowAt(11) })
    expect(event.endAt).toBe(tomorrowAt(11) + 60 * 60_000)

    await sheet.locator('[data-save]').click()
    await expect(modeOf(sheet)).toHaveAttribute('data-detail-mode', 'view')
    await expect(sheet.getByText('Скринінг', { exact: true })).toBeVisible()

    // «у календарі» → the event opens in the calendar.
    await sheet.getByRole('button', { name: 'у календарі' }).click()
    await expect.poll(() => hashPath(win)).toBe('/calendar')
    await expect.poll(() => openParam(win)).toBe(stage.eventId)
    const eventDialog = win.getByRole('dialog', { name: 'Подія' })
    await expect(eventDialog.getByText(`Скринінг: ${company}`, { exact: true })).toBeVisible()
    await win.keyboard.press('Escape')
    await expect(eventDialog).toBeHidden()

    // Vacancy → company card (a link while reading) → its vacancies → back to the vacancy.
    await go(`/jobs/applications?open=${app.id}`)
    await expect(modeOf(sheet)).toHaveAttribute('data-detail-mode', 'view')
    await sheet.getByRole('button', { name: company, exact: true }).click()
    await expect.poll(() => hashPath(win)).toBe('/jobs/companies')
    await expect.poll(() => openParam(win)).toBe(companyId)
    const pane = win.locator('[data-detail-mode]').first()
    await expect(pane.getByText('Вакансії в компанії')).toBeVisible()
    const vacancy = pane.getByRole('button').filter({ hasText: app.title })
    await expect(vacancy).toBeVisible()
    await vacancy.click()
    await expect.poll(() => hashPath(win)).toBe('/jobs/applications')
    await expect.poll(() => openParam(win)).toBe(app.id)
    await expect(sheet.getByRole('heading', { name: app.title }).last()).toBeVisible()
  })

  test('«Підсумок: Скасовано» у правці прибирає подію з календаря', async ({ vault }) => {
    const { win, rpc, go } = vault
    const app = await rpc('jobs.create', { title: `Backend ${uid()}` })
    await rpc('jobs.addStage', {
      applicationId: app.id,
      kind: 'technical',
      at: tomorrowAt(15),
      deadlineAt: null,
      durationMin: 45,
      notes: ''
    })
    const stage = (await rpc('jobs.get', app.id)).stages[0]
    expect(stage.eventId).toBeTruthy()

    await go(`/jobs/applications?open=${app.id}`)
    const sheet = sheetOf(win)
    await expect(sheet.getByRole('button', { name: 'у календарі' })).toBeVisible()
    await sheet.locator('[data-edit-detail]').click()
    // Opened in view mode, the stage row stays collapsed: expand it.
    await sheet
      .getByRole('button', { name: /Технічна/ })
      .first()
      .click()
    const outcome = sheet.getByRole('group', { name: 'Підсумок' })
    await expect(outcome).toBeVisible()
    await outcome.getByRole('radio', { name: 'Скасовано' }).click()
    await expect.poll(async () => (await rpc('jobs.get', app.id)).stages[0].eventId).toBeNull()
    await expect(sheet.getByRole('button', { name: 'у календарі' })).toHaveCount(0)
    expect(await rpc('events.get', stage.eventId)).toBeFalsy()
    await sheet.locator('[data-save]').click()
    await expect(modeOf(sheet)).toHaveAttribute('data-detail-mode', 'view')
  })
})
